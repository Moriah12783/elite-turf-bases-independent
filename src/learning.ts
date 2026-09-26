import { canonical, containsAllBases, instant, sha256, type OfficialResult, type Snapshot } from './core.ts';
import { entrants, strengths, FEATURES, PRIOR, selectBases, type Model } from './selector.ts';
export interface Example { snapshot:Snapshot; observation_id:string; result:OfficialResult; result_observed_at:string }
export const REGULARIZATION=1.5; // Fixed before testing; strong shrinkage for the pilot's tiny sample.
export function usable(example:Example):boolean {
  const {snapshot:s,result:r}=example;
  if(!s.eligible || r.status!=='DEFINITIVE' || r.race_id!==s.race_id || r.ranking.slice(0,5).length!==5 ||
    r.ranking.slice(0,5).some(g=>g.length!==1) || new Set(r.ranking.slice(0,5).flat()).size!==5 || instant(s.observed_at)===null || instant(s.start_at)===null ||
    instant(example.result_observed_at)===null || instant(s.observed_at)!>=instant(s.start_at)! ||
    instant(example.result_observed_at)!<instant(s.start_at)!) return false;
  try {const nums=entrants(s).map(x=>x.num);return r.ranking.slice(0,5).every(g=>nums.includes(g[0]));}catch{return false;}
}
export function lossGradient(examples:Example[],beta:number[]):{loss:number;gradient:number[]} {
  let loss=0;const grad=beta.map(()=>0);
  for(const e of examples) {
    const field=entrants(e.snapshot),w=strengths(field,beta),remaining=new Set(field.map((_,i)=>i));
    for(const group of e.result.ranking.slice(0,5)) {
      const winner=field.findIndex(r=>r.num===group[0]),sum=[...remaining].reduce((a,i)=>a+w[i],0);
      loss-=Math.log(w[winner]/sum)/5/examples.length;
      for(let j=0;j<beta.length;j++)grad[j]+=([...remaining].reduce((a,i)=>a+w[i]*field[i].x[j],0)/sum-field[winner].x[j])/5/examples.length;
      remaining.delete(winner);
    }
  }
  beta.forEach((b,j)=>{loss+=REGULARIZATION*(b-PRIOR[j])**2/2;grad[j]+=REGULARIZATION*(b-PRIOR[j]);});
  return {loss,gradient:grad};
}
export async function fit(examples:Example[],trainedAt:string):Promise<Model> {
  if(examples.length<2 || examples.some(e=>!usable(e)))throw Error('TRAINING_DATA_INVALID');
  const ids=examples.map(e=>e.snapshot.race_id);
  if(new Set(ids).size!==ids.length)throw Error('DUPLICATE_TRAINING_RACE');
  const cutoff=Math.max(...examples.map(e=>instant(e.result_observed_at)!));
  if(instant(trainedAt)===null || cutoff>=instant(trainedAt)!)throw Error('TRAINING_LABEL_FROM_FUTURE');
  let beta=[...PRIOR],objective=lossGradient(examples,beta);
  for(let iteration=0;iteration<500;iteration++) {
    if(Math.hypot(...objective.gradient)<1e-8)break;
    let rate=0.2,accepted=false;
    for(let backtrack=0;backtrack<15;backtrack++) {
      const candidate=beta.map((b,j)=>Math.max(j===0?0.3:-2,Math.min(j===0?2:2,b-rate*objective.gradient[j])));
      const trial=lossGradient(examples,candidate);
      if(trial.loss<objective.loss){beta=candidate;objective=trial;accepted=true;break;}rate/=2;
    }
    if(!accepted)break;
  }
  const digest=await sha256(canonical(examples.map(e=>({observation_id:e.observation_id,result:e.result,result_observed_at:e.result_observed_at}))));
  const base={schema:'elite-bases-model-v1' as const,trained_at:trainedAt,training_cutoff:new Date(cutoff).toISOString(),feature_names:FEATURES,
    coefficients:beta,training_races:examples.length,training_ids:ids,dataset_sha256:digest,
    validation:'EXPERIMENTAL_SMALL_SAMPLE' as const,method:'RIDGE_PLACKETT_LUCE' as const,regularization:REGULARIZATION};
  return {...base,id:'pl-v1-'+(await sha256(canonical(base))).slice(0,20)};
}
export async function walkForward(examples:Example[]) {
  const ordered=[...examples].sort((a,b)=>a.snapshot.observed_at.localeCompare(b.snapshot.observed_at));
  const rows=[];
  for(let i=2;i<ordered.length;i++) {
    const e=ordered[i],decision=e.snapshot.observed_at;
    const past=ordered.slice(0,i).filter(p=>p.result_observed_at<decision);
    if(past.length<2)continue;
    const model=await fit(past,decision),proposal=selectBases(e.snapshot,e.observation_id,model,decision);
    const market=entrants(e.snapshot).filter(r=>e.snapshot.selection8.includes(r.num)).sort((a,b)=>a.odds-b.odds||a.num-b.num).map(r=>r.num);
    rows.push({race_id:e.snapshot.race_id,decision_at:decision,training_races:past.length,training_ids:model.training_ids,
      proposal,status:proposal.status,
      all3:proposal.bases3.length?containsAllBases(e.result,proposal.bases3):null,
      all4:proposal.bases4.length?containsAllBases(e.result,proposal.bases4):null,
      moteur3:containsAllBases(e.result,e.snapshot.selection8.slice(0,3)),moteur4:containsAllBases(e.result,e.snapshot.selection8.slice(0,4)),
      market3:containsAllBases(e.result,market.slice(0,3)),market4:containsAllBases(e.result,market.slice(0,4)),
      result_top5:e.result.ranking.slice(0,5).flat()});
  }
  return {protocol:'CHRONOLOGICAL_EXPANDING_WINDOW',warmup_races:2,quality:'EXPLORATORY_NOT_VALIDATION',rows};
}
