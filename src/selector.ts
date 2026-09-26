import { canonical, instant, number, str, type Snapshot } from './core.ts';

export const FEATURES=['log_market','moteur_correction','recent_top5','incident_free','odds_shortening'];
export const PRIOR=[1,0.5,0.3,0.25,0.1];
export const POLICY={maxAgeMs:12*60_000,minBeforeStartMs:60_000,minJoint3:0.10,minConditional4:0.75,minFourthMargin:0.1};
export interface Model {
  schema:'elite-bases-model-v1'; id:string; trained_at:string; training_cutoff:string;
  feature_names:string[]; coefficients:number[]; training_races:number;
  training_ids:string[]; dataset_sha256:string; validation:'EXPERIMENTAL_SMALL_SAMPLE';
  method:'RIDGE_PLACKETT_LUCE'; regularization:number;
}
export interface Entrant { num:number; x:number[]; odds:number; producer_rank:number|null }
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
export function musicFeatures(music:string): {placed:number;incidentFree:number} {
  const tokens=[...music.replace(/\([^)]*\)/g,'').matchAll(/([0-9]|[DTAGJ])[apmhs]/gi)].slice(0,6);
  if(!tokens.length)return {placed:0,incidentFree:0};
  let total=0,placed=0,incidents=0;
  tokens.forEach((t,i)=>{const w=0.8**i;total+=w;placed+=w*Number(/[1-5]/.test(t[1]));incidents+=w*Number(/[DTAGJ]/i.test(t[1]));});
  return {placed:placed/total-0.5,incidentFree:0.2-incidents/total};
}
export function entrants(s:Snapshot): Entrant[] {
  const active=s.runners.filter(r=>r.is_non_partant===false);
  if(active.length<8 || active.length>24)throw Error('FIELD_SIZE_UNSUPPORTED');
  const seen=new Set<number>();
  for(const r of active) {
    const n=number(r.num),odds=number(r.market_odds);
    if(n===null || !Number.isInteger(n) || n<=0 || seen.has(n))throw Error('RUNNER_IDENTITIES_INVALID');
    if(odds===null || odds<=1)throw Error('FULL_MARKET_REQUIRED');seen.add(n);
  }
  if(s.selection8.length!==8 || new Set(s.selection8).size!==8 || s.selection8.some(n=>!seen.has(n)))throw Error('CANDIDATES_INVALID');
  const marketTotal=active.reduce((sum,r)=>sum+1/Number(r.market_odds),0);
  const producerTotal=active.reduce((sum,r)=>sum+Math.max(0,number(r.producer_win_probability_pct)??0),0);
  return active.map(r=>{
    const odds=Number(r.market_odds),p=number(r.producer_win_probability_pct);
    const market=1/odds/marketTotal;
    if(s.selection8.includes(Number(r.num)) && (p===null || p<=0 || p>100))throw Error('CANDIDATE_MOTEUR_SCORE_MISSING');
    const correction=p!==null && p>0 && producerTotal>0 ? clamp(Math.log((p/producerTotal)/market),-2,2) : 0;
    const music=musicFeatures(str(r.music)),ref=number(r.reference_odds);
    return {num:Number(r.num),odds,producer_rank:number(r.producer_rank),
      x:[clamp(-Math.log(odds),-6,0),correction,music.placed,music.incidentFree,
        ref!==null && ref>1 ? clamp(Math.log(ref/odds),-1.5,1.5) : 0]};
  });
}
export function strengths(field:Entrant[],coefficients:number[]): number[] {
  const logs=field.map(r=>r.x.reduce((sum,x,j)=>sum+x*coefficients[j],0));
  const max=Math.max(...logs);
  return logs.map(x=>Math.exp(clamp(x-max,-20,0)));
}
/** Exact distribution of unordered top-five sets under the fitted PL model.
 * Competition between all runners is included; probabilities are NOT calibrated evidence.
 */
export function topFiveDistribution(weights:number[]): Map<number,number> {
  if(weights.length<5 || weights.length>24 || weights.some(w=>!Number.isFinite(w)||w<=0))throw Error('INVALID_WEIGHTS');
  const total=weights.reduce((a,b)=>a+b,0);
  let states=new Map<number,{p:number;sum:number}>([[0,{p:1,sum:0}]]);
  for(let position=0;position<5;position++) {
    const next=new Map<number,{p:number;sum:number}>();
    for(const [mask,state] of states)for(let i=0;i<weights.length;i++) {
      const bit=1<<i;if(mask&bit)continue;
      const key=mask|bit,p=state.p*weights[i]/(total-state.sum),prior=next.get(key);
      if(prior)prior.p+=p;else next.set(key,{p,sum:state.sum+weights[i]});
    }
    states=next;
  }
  return new Map([...states].map(([mask,s])=>[mask,s.p]));
}
export function combinations<T>(items:T[],k:number):T[][] {
  if(k===0)return [[]];
  return items.flatMap((x,i)=>combinations(items.slice(i+1),k-1).map(t=>[x,...t]));
}
export function jointScore(distribution:Map<number,number>,indices:number[]):number {
  const mask=indices.reduce((m,i)=>m|(1<<i),0);let p=0;
  for(const [set,weight] of distribution)if((set&mask)===mask)p+=weight;
  return clamp(p,0,1);
}
export interface Proposal {
  schema:'elite-bases-proposal-v1'; mode:'EXPERIMENTAL'; status:'EXPERIMENTAL'|'ABSTAIN';
  race_id:string; edition:string; created_at:string; source_observed_at:string; start_at:string;
  valid_until:string; observation_id:string; model_id:string; training_races:number;
  selection8:number[]; bases3:number[]; bases4:number[]; fourth_candidate:number|null;
  reasons:string[]; score_kind:'UNCALIBRATED_MODEL_PROBABILITIES';
  joint3:number|null; joint4:number|null; conditional4:number|null;
  candidate_ranking:{num:number;producer_rank:number|null;market_odds:number;top5_model_score:number}[];
}
function modelValid(m:Model):boolean {
  return m.schema==='elite-bases-model-v1' && m.validation==='EXPERIMENTAL_SMALL_SAMPLE' &&
    canonical(m.feature_names)===canonical(FEATURES) && m.coefficients.length===FEATURES.length &&
    m.coefficients.every(x=>Number.isFinite(x)&&Math.abs(x)<=4) &&
    m.training_races>=2 && m.training_ids.length===m.training_races &&
    new Set(m.training_ids).size===m.training_races && instant(m.trained_at)!==null && instant(m.training_cutoff)!==null &&
    instant(m.training_cutoff)!<instant(m.trained_at)!;
}
export function selectBases(s:Snapshot,observationId:string,model:Model,now:string):Proposal {
  const when=instant(now),start=instant(s.start_at),observed=instant(s.observed_at);
  const out:Proposal={schema:'elite-bases-proposal-v1',mode:'EXPERIMENTAL',status:'ABSTAIN',race_id:s.race_id,
    edition:s.edition,created_at:now,source_observed_at:s.observed_at,start_at:s.start_at,valid_until:now,
    observation_id:observationId,model_id:model.id,training_races:model.training_races,selection8:[...s.selection8],
    bases3:[],bases4:[],fourth_candidate:null,reasons:[],score_kind:'UNCALIBRATED_MODEL_PROBABILITIES',
    joint3:null,joint4:null,conditional4:null,candidate_ranking:[]};
  if(!s.eligible)out.reasons.push(...s.reasons,'INPUT_NOT_ELIGIBLE');
  if(when===null || start===null || observed===null || observed>when || when>=start-POLICY.minBeforeStartMs)out.reasons.push('RACE_STARTED_OR_TIME_INVALID');
  if(when!==null && observed!==null && when-observed>POLICY.maxAgeMs)out.reasons.push('STALE_INPUT');
  if(!s.source_receipts.length || s.source_receipts.some(r=>instant(r.received_at)===null || instant(r.received_at)!>observed!))out.reasons.push('RECEIPT_INVALID');
  if(!modelValid(model))out.reasons.push('MODEL_INVALID');
  else if(instant(model.trained_at)!>when! || instant(model.training_cutoff)!>=when! || model.training_ids.includes(s.race_id))out.reasons.push('TRAINING_LEAKAGE');
  if(out.reasons.length)return out;
  let field:Entrant[];
  try{field=entrants(s);}catch(e){out.reasons.push(e instanceof Error ? e.message : 'INVALID_FEATURES');return out;}
  const weights=strengths(field,model.coefficients),distribution=topFiveDistribution(weights);
  const candidates=s.selection8.map(num=>field.findIndex(r=>r.num===num));
  const scores=(k:number)=>combinations(candidates,k).map(indices=>({indices,p:jointScore(distribution,indices)}))
    .sort((a,b)=>b.p-a.p || a.indices.join(',').localeCompare(b.indices.join(',')));
  const best3=scores(3)[0],best4=scores(4)[0];
  const byStrength=(a:number,b:number)=>weights[b]-weights[a] || field[a].num-field[b].num;
  const three=best3.indices.sort(byStrength),four=best4.indices.sort(byStrength);
  out.joint3=best3.p;out.joint4=best4.p;out.conditional4=best4.p/best3.p;
  out.candidate_ranking=candidates.sort(byStrength).map(i=>({num:field[i].num,producer_rank:field[i].producer_rank,
    market_odds:field[i].odds,top5_model_score:jointScore(distribution,[i])}));
  if(best3.p<POLICY.minJoint3){out.reasons.push('JOINT_SUPPORT_LOW');return out;}
  // Sensitivity check to the non-market corrections, not a confidence interval.
  const variants=[0.5,1.5].map(factor=>strengths(field,model.coefficients.map((v,i)=>i===0?v:v*factor)));
  const variantRanks=variants.map(w=>[...candidates].sort((a,b)=>w[b]-w[a] || field[a].num-field[b].num));
  if(variantRanks.some(rank=>rank.slice(0,3).filter(i=>three.includes(i)).length<2)) {
    out.reasons.push('UNSTABLE_TRIPLE');return out;
  }
  out.status='EXPERIMENTAL';out.bases3=three.map(i=>field[i].num);
  out.valid_until=new Date(Math.min(start!-POLICY.minBeforeStartMs,observed!+POLICY.maxAgeMs)).toISOString();
  out.fourth_candidate=field[four.find(i=>!three.includes(i))!]?.num ?? null;
  const rank=[...candidates].sort(byStrength),margin=Math.log(weights[rank[3]]/weights[rank[4]]);
  const fourStable=variantRanks.every(r=>r.slice(0,4).every(i=>four.includes(i)));
  if(three.every(i=>four.includes(i)) && out.conditional4>=POLICY.minConditional4 && margin>=POLICY.minFourthMargin && fourStable)out.bases4=four.map(i=>field[i].num);
  else out.reasons.push('FOURTH_NOT_CONFIRMED');
  return out;
}
