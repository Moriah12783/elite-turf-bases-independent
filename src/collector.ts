import { PRONO_URL, PMU_ROOT, apiDate, array, buildSnapshot, object, officialResult,
  parseProno, quinteCourses, canonical } from './core.ts';
import { lock, unlock, sourcesToStore, saveObservation, saveResult, saveModel, saveProposal } from './storage.ts';
import { selectBases, type Model } from './selector.ts';

export { readSource } from './source.ts';
import { readSource, SourceError, type Fetcher, type CollectedSource } from './source.ts';
function parseProgramme(source: CollectedSource): unknown {
  const value: unknown = JSON.parse(source.text);
  if (!Array.isArray(object(object(value).programme).reunions)) throw new Error('PMU_SCHEMA_CHANGED');
  return value;
}
function errorCode(error: unknown): string {
  if (error instanceof SourceError) return error.message;
  const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  return /^[A-Z][A-Z0-9_]{1,70}$/.test(code) ? code : 'SOURCE_OR_STORAGE_ERROR';
}
export interface CollectionReport {
  status: string; mode: 'COLLECT_ONLY'|'EXPERIMENTAL'; radar: 'NOT_CONNECTED';
  courses: number; observations: number; eligible: number; results: number; proposals:number; errors: string[];
}
export async function collect(db: D1Database, enabled: boolean, fetcher: Fetcher = fetch, clock: () => Date = () => new Date(),model?:Model): Promise<CollectionReport> {
  const report: CollectionReport = {status:'DISABLED',mode:model?'EXPERIMENTAL':'COLLECT_ONLY',radar:'NOT_CONNECTED',courses:0,observations:0,eligible:0,results:0,proposals:0,errors:[]};
  if (!enabled) return report;
  const deadline=clock().getTime()+150_000;
  const read=(url:string)=>readSource(url,fetcher,clock,{deadline});
  const began = clock(), token = crypto.randomUUID();
  if (!await lock(db,token,began.getTime())) return {...report,status:'ALREADY_RUNNING'};
  let attempted = false, stage = 'CONTROL';
  try {
    const last = await db.prepare("SELECT value FROM control WHERE key='last_attempt'").first<{value:string}>();
    if (last && began.getTime() - Date.parse(last.value) < 300_000) return {...report,status:'COOLDOWN'};
    attempted = true;
    if(model)await saveModel(db,model);
    await db.prepare("INSERT INTO control(key,value) VALUES('last_attempt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(began.toISOString()).run();
    const date = began.toISOString().slice(0,10);
    // Only GET on existing public endpoints. No producer credentials or database bindings.
    stage = 'READ_PUBLIC_SOURCES';
    const [pronoRead, programmeRead] = await Promise.allSettled([
      read(PRONO_URL), read(`${PMU_ROOT}/${apiDate(date)}`)]);
    if(programmeRead.status==='rejected')throw programmeRead.reason;
    const programmeSource=programmeRead.value;
    const pronoSource=pronoRead.status==='fulfilled'?pronoRead.value:null;
    if(pronoRead.status==='rejected')report.errors.push(errorCode(pronoRead.reason));
    stage = 'PARSE_PUBLIC_SOURCES';
    const prono = pronoSource?parseProno(pronoSource.text):[];
    const courses = quinteCourses(parseProgramme(programmeSource),date);
    if (courses.length > 8) throw new Error('UNEXPECTED_QUINTE_COUNT');
    report.courses = courses.length;
    for (const course of courses) {
      if (clock().getTime()-began.getTime() > 150_000) throw new Error('COLLECTION_DEADLINE');
      try {
        const matches = prono.filter(r => r.race_id === course.race_id && r.date === date);
        if (matches.length > 1) throw new Error('DUPLICATE_RACE_IDENTITY');
        const row = matches[0] ?? null;
        let participants: unknown = null, participantsSource: CollectedSource | null = null;
        if (course.start_at) {
          participantsSource = await read(`${PMU_ROOT}/${apiDate(date)}/R${course.meeting}/C${course.number}/participants`);
          participants = JSON.parse(participantsSource.text);
        }
        const official = officialResult(course,participants);
        if (official) {
          const added = await saveResult(db,official,clock().toISOString(),{course:course.raw,programme_url:programmeSource.receipt.url});
          report.results += Number(added);
        }
        // After departure, only labels are read; no retrospective observations are created.
        if (course.start_at && Date.parse(course.start_at) <= clock().getTime()) continue;
        const sources = await sourcesToStore([
          {kind:'PRONO_COURSE',value:row},{kind:'PMU_COURSE',value:{course:course.raw,meeting:course.meeting_raw}},
          {kind:'PMU_PARTICIPANTS',value:participants}]);
        const receipts = [...(pronoSource?[pronoSource.receipt]:[]),programmeSource.receipt,...(participantsSource ? [participantsSource.receipt] : [])];
        const snapshot = buildSnapshot(course,row,participants,receipts,clock().toISOString(),Object.fromEntries(sources.map(s => [s.kind,s.hash])));
        const observationId=await saveObservation(db,snapshot,sources);
        report.observations++; report.eligible += Number(snapshot.eligible);
        if(model) {
          // Computation and persistence happen now; an old observation is never backdated.
          const proposal=selectBases(snapshot,observationId,model,clock().toISOString());
          if(Date.parse(proposal.valid_until)<=clock().getTime() && proposal.status==='EXPERIMENTAL') {
            proposal.status='ABSTAIN';proposal.bases3=[];proposal.bases4=[];proposal.reasons.push('EXPIRED_DURING_COMPUTATION');
          }
          report.proposals+=Number(await saveProposal(db,proposal));
        }
      } catch (error) { report.errors.push(errorCode(error)); }
    }
    // Recheck the preceding seven days once per UTC day to capture official corrections.
    const refreshed = await db.prepare("SELECT value FROM control WHERE key='results_refreshed_day'").first<{value:string}>();
    if (refreshed?.value !== date+'-finality-v2') {
      let complete = true;
      for (let days=1; days<=7; days++) {
        if (clock().getTime()-began.getTime() > 150_000) { complete=false; report.errors.push('COLLECTION_DEADLINE'); break; }
        try {
          const previous = new Date(began.getTime()-days*86400_000).toISOString().slice(0,10);
          const source = await read(`${PMU_ROOT}/${apiDate(previous)}`);
          for (const course of quinteCourses(parseProgramme(source),previous)) {
            if(!officialResult(course))continue;
            const participants=await read(`${PMU_ROOT}/${apiDate(previous)}/R${course.meeting}/C${course.number}/participants`);
            const result = officialResult(course,JSON.parse(participants.text));
            if (result) report.results += Number(await saveResult(db,result,clock().toISOString(),{course:course.raw,programme_url:source.receipt.url}));
          }
        } catch (error) { complete=false; report.errors.push('RESULT_REFRESH_'+errorCode(error)); }
      }
      if (complete) await db.prepare("INSERT INTO control(key,value) VALUES('results_refreshed_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(date+'-finality-v2').run();
    }
    report.status = report.errors.length ? 'DEGRADED' : 'OK';
  } catch (error) {
    report.status='ERROR'; report.errors.push(errorCode(error));
    // This path only handles public-source/storage errors; never log requests or secrets.
    console.error(JSON.stringify({event:'collection_failed',stage,
      message:error instanceof Error ? error.message.slice(0,500) : 'UNKNOWN_ERROR'}));
  }
  finally {
    try {
      if (attempted) await db.prepare('INSERT INTO runs(id,started_at,finished_at,status,details_json) VALUES(?,?,?,?,?)')
        .bind(token,began.toISOString(),clock().toISOString(),report.status,canonical(report)).run();
    } finally { await unlock(db,token); }
  }
  console.log(JSON.stringify({event:'collection',...report}));
  return report;
}
