import { canonical, containsAllBases, type Snapshot, type OfficialResult } from './core.ts';
import { entrants, type Model, type Proposal } from './selector.ts';
import { verifiedPayload } from './storage.ts';
import { scoreProposal } from './proposals.ts';

export const EDITIONS=['T_MATIN','T90','T30','T15'] as const;
export const EDITION_POLICY='FIRST_RECORDED_EDITION_V1';
export function editionRange(from:string|null,to:string|null,now:string) {
  const today=now.slice(0,10),end=to??today;
  const start=from??new Date(Date.parse(today)-364*86400_000).toISOString().slice(0,10);
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(!valid(start)||!valid(end)||start>end||Date.parse(end)-Date.parse(start)>365*86400_000)throw Error('INVALID_EDITION_RANGE');
  return {from:start,to:end};
}
export interface EditionRow {
  race_id:string; race_date:string; edition:string; proposal_id:string; model_id:string;
  policy:string; recorded_at:string; observed_at:string; start_at:string; minutes_before_start:number;
  selection8:number[]; bases3:number[]; bases4:number[]; decision_status:string; reasons:string[];
  result_status:string|null; arrival:number[][]; non_partants:number[]; result_observed_at:string|null;
  outcome:{status:string;all3:boolean|null;all4:boolean|null};
  baseline:{moteur3:boolean|null;market3:boolean|null};
}
type ArchiveRow={
  race_id:string;edition:string;proposal_id:string;policy:string;
  p_hash:string;p_json:string;o_hash:string;o_json:string;m_hash:string;m_json:string;
  result_hash:string|null;result_json:string|null;result_observed_at:string|null;
};

export function editionSummaries(rows:EditionRow[]) {
  return EDITIONS.map(edition=>{
    const group=rows.filter(r=>r.edition===edition),scored=group.filter(r=>r.outcome.status==='SCORED');
    const count=(key:'all3'|'all4')=>{const valid=scored.filter(r=>r.outcome[key]!==null),success=valid.filter(r=>r.outcome[key]===true).length;
      return {success,scored:valid.length,rate:valid.length?success/valid.length:null};};
    const baseline=(key:'moteur3'|'market3')=>({success:scored.filter(r=>r.baseline[key]===true).length,scored:scored.filter(r=>r.baseline[key]!==null).length});
    return {edition,references:group.length,triples:count('all3'),quartets:count('all4'),
      abstentions:group.filter(r=>r.outcome.status==='ABSTAIN').length,
      pending:group.filter(r=>['AWAITING_DEFINITIVE_RESULT','NON_STARTERS_UNVERIFIED'].includes(r.outcome.status)).length,
      excluded:group.filter(r=>!['SCORED','ABSTAIN','AWAITING_DEFINITIVE_RESULT','NON_STARTERS_UNVERIFIED'].includes(r.outcome.status)).length,
      modele_ids:[...new Set(group.map(r=>r.model_id))],moteur3:baseline('moteur3'),market3:baseline('market3')};
  });
}
export function editionComparison(rows:EditionRow[]) {
  // Compare only identical race sets; abstentions and missing editions remain visible separately.
  const races=[...new Set(rows.map(r=>r.race_id))];
  const common=(size:3|4)=>races.filter(race=>EDITIONS.every(edition=>rows.some(r=>r.race_id===race&&r.edition===edition&&
    r.outcome.status==='SCORED'&&(size===3?r.outcome.all3:r.outcome.all4)!==null)));
  const three=common(3),four=common(4);
  return {triples:{race_ids:three,summary:editionSummaries(rows.filter(r=>three.includes(r.race_id)))},
    quartets:{race_ids:four,summary:editionSummaries(rows.filter(r=>four.includes(r.race_id)))}};
}

export async function editionHistory(db:D1Database,now:string,range=editionRange(null,null,now)) {
  const found=await db.prepare(`SELECT ref.race_id,ref.edition,ref.proposal_id,ref.policy,
    p.payload_hash AS p_hash,p.payload_json AS p_json,o.payload_hash AS o_hash,o.payload_json AS o_json,
    m.payload_hash AS m_hash,m.payload_json AS m_json,
    res.payload_hash AS result_hash,res.payload_json AS result_json,res.observed_at AS result_observed_at
    FROM edition_references ref JOIN proposals p ON p.id=ref.proposal_id
    JOIN observations o ON o.id=p.observation_id JOIN models m ON m.id=p.model_id
    LEFT JOIN results res ON res.id=(SELECT x.id FROM results x WHERE x.race_id=ref.race_id AND x.observed_at<=?
      ORDER BY x.observed_at DESC,x.rowid DESC LIMIT 1)
    WHERE o.race_date BETWEEN ? AND ? AND p.created_at<=?
    ORDER BY o.race_date DESC,p.created_at,ref.proposal_id LIMIT 2001`).bind(now,range.from,range.to,now).all<ArchiveRow>();
  if(found.results.length>2000)throw Error('EDITION_EXPORT_LIMIT');
  const rows:EditionRow[]=[];
  for(const row of found.results) {
    const [p,s,m]=await Promise.all([
      verifiedPayload<Proposal>({payload_hash:row.p_hash,payload_json:row.p_json}),
      verifiedPayload<Snapshot>({payload_hash:row.o_hash,payload_json:row.o_json}),
      verifiedPayload<Model>({payload_hash:row.m_hash,payload_json:row.m_json})]);
    if(p.race_id!==row.race_id||p.edition!==row.edition||s.race_id!==row.race_id||s.edition!==row.edition||
      p.model_id!==m.id||p.observation_id!==row.o_hash||canonical(p.selection8)!==canonical(s.selection8))throw Error('EDITION_REFERENCE_MISMATCH');
    const result=row.result_json&&row.result_hash?(await verifiedPayload<{result:OfficialResult}>({payload_hash:row.result_hash,payload_json:row.result_json})).result:undefined;
    if(result&&result.race_id!==p.race_id)throw Error('RESULT_IDENTITY_MISMATCH');
    let outcome=scoreProposal(p,result,p.created_at);
    if(m.training_ids.includes(p.race_id)||m.trained_at>p.created_at||m.training_cutoff>=p.created_at)outcome={status:'TRAINING_LEAKAGE',all3:null,all4:null};
    if(Date.parse(p.created_at)>=Date.parse(p.start_at)||Date.parse(s.observed_at)>Date.parse(p.created_at))outcome={status:'INVALID_TIME',all3:null,all4:null};
    const baseline:{moteur3:boolean|null;market3:boolean|null}={moteur3:null,market3:null};
    if(outcome.status==='SCORED'&&result) {
      const market=entrants(s).filter(r=>s.selection8.includes(r.num)).sort((a,b)=>a.odds-b.odds||a.num-b.num).slice(0,3).map(r=>r.num);
      const score=(nums:number[])=>nums.some(n=>result.non_partants.includes(n))?null:containsAllBases(result,nums);
      baseline.moteur3=score(s.selection8.slice(0,3));baseline.market3=score(market);
    }
    rows.push({race_id:p.race_id,race_date:s.race_date,edition:p.edition,proposal_id:row.proposal_id,model_id:p.model_id,
      policy:row.policy,recorded_at:p.created_at,observed_at:s.observed_at,start_at:p.start_at,
      minutes_before_start:Math.round((Date.parse(p.start_at)-Date.parse(p.created_at))/6000)/10,
      selection8:p.selection8,bases3:p.bases3,bases4:p.bases4,decision_status:p.status,reasons:p.reasons,
      result_status:result?.status??null,arrival:result?.ranking??[],non_partants:result?.non_partants??[],result_observed_at:row.result_observed_at,
      outcome,baseline});
  }
  const archive=await db.prepare(`SELECT o.edition,COUNT(*) AS decisions,COUNT(DISTINCT p.race_id) AS races FROM proposals p
    JOIN observations o ON o.id=p.observation_id WHERE o.race_date BETWEEN ? AND ? AND p.created_at<=? GROUP BY o.edition`)
    .bind(range.from,range.to,now).all<{edition:string;decisions:number;races:number}>();
  const modelIds=[...new Set(rows.map(r=>r.model_id))];
  return {schema:'elite-bases-editions-v1',policy:EDITION_POLICY,range,generated_at:now,
    scope:'FIRST_DECISION_RECORDED_UNDER_EACH_PRODUCER_EDITION_NOT_EXACT_HORIZON',
    archive:archive.results,rows,summary:editionSummaries(rows),common:editionComparison(rows),
    by_model:modelIds.map(model_id=>({model_id,summary:editionSummaries(rows.filter(r=>r.model_id===model_id)),common:editionComparison(rows.filter(r=>r.model_id===model_id))}))};
}
