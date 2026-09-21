import { PRONO_URL, PMU_ROOT, MAX_BYTES, apiDate, array, buildSnapshot, object, officialResult,
  parseProno, quinteCourses, sha256, canonical, type Receipt, type ObjectData } from './core.ts';
import { lock, unlock, sourcesToStore, saveObservation, saveResult } from './storage.ts';

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export interface CollectedSource { text: string; receipt: Receipt }
export async function readSource(url: string, fetcher: Fetcher = fetch, clock: () => Date = () => new Date()): Promise<CollectedSource> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
      !['prono.elite-turf.fr','online.turfinfo.api.pmu.fr'].includes(parsed.hostname)) throw new Error('SOURCE_NOT_ALLOWED');
  // Workers supports manual/follow only. Manual + !ok rejects every redirect.
  const response = await fetcher(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'EliteTurfBasesIndependent/0.1', 'Accept': 'application/json,text/html' } });
  if (!response.ok || !response.body) throw new Error(`SOURCE_HTTP_${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('SOURCE_TOO_LARGE');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new Error('SOURCE_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes);
  return { text, receipt: { url, received_at: clock().toISOString(), response_sha256: await sha256(text), http_date: response.headers.get('date') } };
}
function parseProgramme(source: CollectedSource): unknown {
  const value: unknown = JSON.parse(source.text);
  if (!Array.isArray(object(object(value).programme).reunions)) throw new Error('PMU_SCHEMA_CHANGED');
  return value;
}
function errorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  return /^[A-Z][A-Z0-9_]{1,70}$/.test(code) ? code : 'SOURCE_OR_STORAGE_ERROR';
}
export interface CollectionReport {
  status: string; mode: 'COLLECT_ONLY'; radar: 'NOT_CONNECTED';
  courses: number; observations: number; eligible: number; results: number; errors: string[];
}
export async function collect(db: D1Database, enabled: boolean, fetcher: Fetcher = fetch, clock: () => Date = () => new Date()): Promise<CollectionReport> {
  const report: CollectionReport = {status:'DISABLED',mode:'COLLECT_ONLY',radar:'NOT_CONNECTED',courses:0,observations:0,eligible:0,results:0,errors:[]};
  if (!enabled) return report;
  const began = clock(), token = crypto.randomUUID();
  if (!await lock(db,token,began.getTime())) return {...report,status:'ALREADY_RUNNING'};
  let attempted = false, stage = 'CONTROL';
  try {
    const last = await db.prepare("SELECT value FROM control WHERE key='last_attempt'").first<{value:string}>();
    if (last && began.getTime() - Date.parse(last.value) < 300_000) return {...report,status:'COOLDOWN'};
    attempted = true;
    await db.prepare("INSERT INTO control(key,value) VALUES('last_attempt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(began.toISOString()).run();
    const date = began.toISOString().slice(0,10);
    // Only GET on existing public endpoints. No producer credentials or database bindings.
    stage = 'READ_PUBLIC_SOURCES';
    const [pronoSource, programmeSource] = await Promise.all([
      readSource(PRONO_URL,fetcher,clock), readSource(`${PMU_ROOT}/${apiDate(date)}`,fetcher,clock)]);
    stage = 'PARSE_PUBLIC_SOURCES';
    const prono = parseProno(pronoSource.text);
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
        if (course.start_at && Date.parse(course.start_at) > clock().getTime()) {
          participantsSource = await readSource(`${PMU_ROOT}/${apiDate(date)}/R${course.meeting}/C${course.number}/participants`,fetcher,clock);
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
        const receipts = [pronoSource.receipt,programmeSource.receipt,...(participantsSource ? [participantsSource.receipt] : [])];
        const snapshot = buildSnapshot(course,row,participants,receipts,clock().toISOString(),Object.fromEntries(sources.map(s => [s.kind,s.hash])));
        await saveObservation(db,snapshot,sources);
        report.observations++; report.eligible += Number(snapshot.eligible);
      } catch (error) { report.errors.push(errorCode(error)); }
    }
    // Recheck the preceding seven days once per UTC day to capture official corrections.
    const refreshed = await db.prepare("SELECT value FROM control WHERE key='results_refreshed_day'").first<{value:string}>();
    if (refreshed?.value !== date) {
      let complete = true;
      for (let days=1; days<=7; days++) {
        if (clock().getTime()-began.getTime() > 150_000) { complete=false; report.errors.push('COLLECTION_DEADLINE'); break; }
        try {
          const previous = new Date(began.getTime()-days*86400_000).toISOString().slice(0,10);
          const source = await readSource(`${PMU_ROOT}/${apiDate(previous)}`,fetcher,clock);
          for (const course of quinteCourses(parseProgramme(source),previous)) {
            const result = officialResult(course);
            if (result) report.results += Number(await saveResult(db,result,clock().toISOString(),{course:course.raw,programme_url:source.receipt.url}));
          }
        } catch (error) { complete=false; report.errors.push('RESULT_REFRESH_'+errorCode(error)); }
      }
      if (complete) await db.prepare("INSERT INTO control(key,value) VALUES('results_refreshed_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(date).run();
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
