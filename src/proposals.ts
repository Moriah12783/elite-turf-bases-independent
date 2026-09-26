import { containsAllBases, type OfficialResult, type Snapshot } from './core.ts';
import { POLICY, entrants, type Model, type Proposal } from './selector.ts';
import { verifiedPayload } from './storage.ts';

export function currentProposal(proposal:Proposal|undefined,snapshot:Snapshot,observationId:string,now:string) {
  let reason='NO_PROPOSAL';
  if(proposal) {
    reason=proposal.status==='ABSTAIN'?proposal.reasons.join(', '):'';
    if(proposal.observation_id!==observationId)reason='SOURCE_REPLACED';
    if(!snapshot.eligible)reason='INPUT_NOT_ELIGIBLE';
    if(Date.parse(now)>=Date.parse(proposal.valid_until))reason=reason||'EXPIRED';
    if(Date.parse(now)>=Date.parse(snapshot.start_at)-POLICY.minBeforeStartMs)reason='RACE_STARTED_OR_CLOSING';
  }
  return {status:reason?'UNAVAILABLE':'EXPERIMENTAL',reason,bases3:reason?[]:proposal!.bases3,
    bases4:reason?[]:proposal!.bases4,created_at:proposal?.created_at??null,valid_until:proposal?.valid_until??null,
    model_id:proposal?.model_id??null,fourth_confirmed:!reason&&proposal!.bases4.length===4};
}

/** A single reference per race at T-5. Later updates cannot select a more flattering result. */
export function referenceProposal(items:Proposal[],startAt:string):Proposal|undefined {
  const cutoff=Date.parse(startAt)-5*60_000;
  return items.filter(p=>Date.parse(p.created_at)<=cutoff&&Date.parse(p.created_at)>=cutoff-POLICY.maxAgeMs)
    .sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.observation_id.localeCompare(a.observation_id))[0];
}
export function scoreProposal(proposal:Proposal|undefined,result:OfficialResult|undefined,cutoff:string) {
  if(!proposal)return {status:'NO_REFERENCE',all3:null,all4:null};
  if(proposal.status!=='EXPERIMENTAL'||Date.parse(proposal.valid_until)<Date.parse(cutoff))return {status:'ABSTAIN',all3:null,all4:null};
  if(result?.status==='CANCELLED')return {status:'CANCELLED',all3:null,all4:null};
  if(!result||result.status!=='DEFINITIVE')return {status:'AWAITING_DEFINITIVE_RESULT',all3:null,all4:null};
  if(!result.non_partants_known)return {status:'NON_STARTERS_UNVERIFIED',all3:null,all4:null};
  if([...proposal.bases3,...proposal.bases4].some(n=>result.non_partants.includes(n)))return {status:'SELECTED_NON_STARTER',all3:null,all4:null};
  return {status:'SCORED',all3:containsAllBases(result,proposal.bases3),
    all4:proposal.bases4.length===4?containsAllBases(result,proposal.bases4):null};
}

export async function proposalHistory(db:D1Database,now:string) {
  const since=new Date(Date.parse(now)-30*86400_000).toISOString();
  const rows=await db.prepare('SELECT payload_hash,payload_json FROM proposals WHERE created_at>=? ORDER BY created_at DESC LIMIT 10001')
    .bind(since).all<{payload_hash:string;payload_json:string}>();
  if(rows.results.length>10000)throw Error('HISTORY_LIMIT');
  const all=await Promise.all(rows.results.map(r=>verifiedPayload<Proposal>(r)));
  const grouped=new Map<string,Proposal[]>();
  for(const p of all)grouped.set(p.race_id,[...(grouped.get(p.race_id)??[]),p]);
  const history=[];
  for(const [race_id,items] of grouped) {
    const start=await db.prepare('SELECT MIN(start_at) AS start_at FROM observations WHERE race_id=? AND start_at<>?').bind(race_id,'').first<{start_at:string}>();
    const startAt=start?.start_at||items[0].start_at,cutoff=new Date(Date.parse(startAt)-5*60_000).toISOString();
    const reference=referenceProposal(items,startAt);
    const resultRow=await db.prepare('SELECT payload_hash,payload_json FROM results WHERE race_id=? ORDER BY observed_at DESC,rowid DESC LIMIT 1')
      .bind(race_id).first<{payload_hash:string;payload_json:string}>();
    const result=resultRow?(await verifiedPayload<{result:OfficialResult}>(resultRow)).result:undefined;
    let outcome=scoreProposal(reference,result,cutoff);
    if(now<cutoff)outcome={status:'REFERENCE_NOT_FROZEN',all3:null,all4:null};
    if(reference) {
      const modelRow=await db.prepare('SELECT payload_hash,payload_json FROM models WHERE id=?').bind(reference.model_id).first<{payload_hash:string;payload_json:string}>();
      if(!modelRow)throw Error('MODEL_MISSING');
      const model=await verifiedPayload<Model>(modelRow);
      if(model.training_ids.includes(race_id)||model.trained_at>reference.created_at)outcome={status:'TRAINING_LEAKAGE',all3:null,all4:null};
    }
    const baseline:{moteur3:boolean|null;market3:boolean|null}={moteur3:null,market3:null};
    if(reference&&outcome.status==='SCORED'&&result) {
      const row=await db.prepare('SELECT payload_hash,payload_json FROM observations WHERE id=?').bind(reference.observation_id).first<{payload_hash:string;payload_json:string}>();
      if(!row)throw Error('REFERENCE_SOURCE_MISSING');
      const s=await verifiedPayload<Snapshot>(row);
      const market=entrants(s).filter(r=>s.selection8.includes(r.num)).sort((a,b)=>a.odds-b.odds||a.num-b.num).slice(0,3).map(r=>r.num);
      const score=(nums:number[])=>nums.some(n=>result.non_partants.includes(n))?null:containsAllBases(result,nums);
      baseline.moteur3=score(s.selection8.slice(0,3));baseline.market3=score(market);
    }
    history.push({race_id,start_at:startAt,cutoff,latest:items[0],reference:reference??null,
      result:result?{status:result.status,ranking:result.ranking,non_partants_known:result.non_partants_known}:null,outcome,baseline});
  }
  const scored=history.filter(h=>h.outcome.status==='SCORED');
  return {history,summary:{window_days:30,protocol:'LAST_PROPOSAL_AT_T_MINUS_5',races:history.length,
    triples_scored:scored.filter(h=>h.outcome.all3!==null).length,triples_success:scored.filter(h=>h.outcome.all3===true).length,
    quartets_scored:scored.filter(h=>h.outcome.all4!==null).length,quartets_success:scored.filter(h=>h.outcome.all4===true).length,
    moteur3_scored:scored.filter(h=>h.baseline.moteur3!==null).length,moteur3_success:scored.filter(h=>h.baseline.moteur3===true).length,
    market3_scored:scored.filter(h=>h.baseline.market3!==null).length,market3_success:scored.filter(h=>h.baseline.market3===true).length,
    abstentions:history.filter(h=>h.outcome.status==='ABSTAIN').length}};
}
