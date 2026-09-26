import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { canonical, officialResult, sha256, PRONO_URL } from '../src/core.ts';
import { collect } from '../src/collector.ts';
import { readSource } from '../src/source.ts';
import { FEATURES, PRIOR, topFiveDistribution, jointScore, combinations, selectBases, musicFeatures } from '../src/selector.ts';
import { fit, usable, lossGradient, walkForward } from '../src/learning.ts';
import { saveObservation, saveProposal, saveModel, saveResult } from '../src/storage.ts';
import { currentProposal, referenceProposal, scoreProposal, proposalHistory } from '../src/proposals.ts';
import { NOW, START, RID, fixtures, snapshot, LocalD1, liveFake } from './helpers.ts';

const model=()=>({schema:'elite-bases-model-v1',id:'synthetic-model',trained_at:'2026-09-20T20:00:00.000Z',
  training_cutoff:'2026-09-20T19:00:00.000Z',feature_names:FEATURES,coefficients:[...PRIOR],training_races:2,
  training_ids:['previous-1','previous-2'],dataset_sha256:'synthetic',validation:'EXPERIMENTAL_SMALL_SAMPLE',
  method:'RIDGE_PLACKETT_LUCE',regularization:1.5});
function example(day:number){const s=snapshot();s.race_id='race-'+day;s.race_date='2026-09-'+day;
 s.observed_at=`2026-09-${day}T12:50:00.000Z`;s.start_at=`2026-09-${day}T13:00:00.000Z`;
 s.source_receipts=s.source_receipts.map(r=>({...r,received_at:s.observed_at}));
 return {snapshot:s,observation_id:'observation-'+day,result_observed_at:`2026-09-${day}T14:00:00.000Z`,
 result:{schema:'result',race_id:s.race_id,status:'DEFINITIVE',ranking:[[1],[2],[3],[4],[5]],non_partants:[],non_partants_known:true,finality:'PMU_VERIFIED'}};}

test('FIN_COURSE needs an explicit uncontradicted definitive flag',()=>{
 const f=fixtures();Object.assign(f.course.raw,{statut:'FIN_COURSE',ordreArrivee:[[1],[2],[3],[4],[5]]});
 assert.equal(officialResult(f.course)!.status,'PROVISIONAL');
 f.course.raw.isArriveeDefinitive=true;assert.equal(officialResult(f.course,f.parts)!.status,'DEFINITIVE');
 assert.equal(officialResult(f.course,f.parts)!.non_partants_known,true);
 f.course.raw.arriveeDefinitive=false;assert.equal(officialResult(f.course)!.status,'PROVISIONAL');
});
test('retry transient timeout, timestamp complete receipt, bound failures and avoid redirect retries',async()=>{
 let n=0,t=Date.parse(NOW);const sleeps=[];
 const r=await readSource(PRONO_URL,async()=>{n++;t+=1000;if(n===1)throw new DOMException('timeout','TimeoutError');return new Response('ok');},()=>new Date(t),{sleep:async ms=>{sleeps.push(ms);}});
 assert.equal(n,2);assert.deepEqual(sleeps,[500]);assert.equal(r.receipt.received_at,new Date(t).toISOString());
 n=0;await assert.rejects(()=>readSource(PRONO_URL,async()=>{n++;return new Response('unavailable',{status:503});},()=>new Date(NOW),{sleep:async()=>{}}),/PRONO_HTTP_503/);assert.equal(n,3);
 n=0;await assert.rejects(()=>readSource(PRONO_URL,async()=>{n++;return new Response('',{status:302});}),/HTTP_302/);assert.equal(n,1);
 await assert.rejects(()=>readSource(PRONO_URL,async()=>{throw Error('must not call');},()=>new Date(NOW),{deadline:Date.parse(NOW)+999}),/DEADLINE/);
});
test('exact PL distribution agrees with uniform combinatorics and conserves mass',()=>{
 const d=topFiveDistribution(Array(10).fill(1));assert.ok(Math.abs([...d.values()].reduce((a,b)=>a+b,0)-1)<1e-12);
 assert.equal(d.size,252);assert.equal(combinations(Array.from({length:8},(_,i)=>i),3).length,56);
 assert.equal(combinations(Array.from({length:8},(_,i)=>i),4).length,70);
 assert.ok(Math.abs(jointScore(d,[0,1,2])-10/120)<1e-12);
 assert.ok(Math.abs(jointScore(d,[0,1,2,3])-5/210)<1e-12);
 assert.equal(jointScore(topFiveDistribution([1,2,3,4,5]),[0,1,2,3]),1);
 assert.throws(()=>topFiveDistribution([1,0,1,1,1]),/INVALID_WEIGHTS/);
});
test('selector chooses candidates outside the first three of the Moteur and returns unique original candidates',()=>{
 const s=snapshot(),p=selectBases(s,'obs',model(),NOW);
 assert.equal(p.status,'EXPERIMENTAL');assert.ok(p.bases3.includes(1));assert.ok(!p.bases3.includes(8));
 assert.equal(new Set(p.bases3).size,3);assert.ok(p.bases3.every(n=>s.selection8.includes(n)));
 assert.deepEqual(p.bases4,[]);assert.equal(p.score_kind,'UNCALIBRATED_MODEL_PROBABILITIES');
});
test('four dominant stable horses can qualify; fourth is never forced',()=>{
 const s=snapshot();s.runners.forEach((r,i)=>{r.market_odds=i<4?1.1:1000;r.producer_win_probability_pct=i<4?24:1/3;});
 const p=selectBases(s,'obs',model(),NOW);assert.equal(p.bases4.length,4);assert.ok(p.conditional4>=.75);
 assert.ok(p.bases3.every(n=>p.bases4.includes(n)));
 assert.equal(selectBases(snapshot(),'obs',model(),NOW).bases4.length,0);
});
test('missing scores, non-starters, stale, future, post-start and invalid models fail closed',()=>{
 for(const mutate of [
 s=>{s.eligible=false;s.reasons=['NO_BET'];},s=>{s.runners[0].is_non_partant=true;},
 s=>{s.runners[9].market_odds=null;},s=>{s.runners[0].producer_win_probability_pct=null;},
 s=>{s.start_at='';},s=>{s.observed_at='2026-09-21T11:47:00.000Z';},
 s=>{s.observed_at=START;},s=>{s.source_receipts[0].received_at=START;}
 ]){const s=snapshot();mutate(s);const p=selectBases(s,'obs',model(),NOW);assert.equal(p.status,'ABSTAIN');assert.deepEqual(p.bases3,[]);}
 for(const mutate of [m=>{m.training_ids[0]=RID;},m=>{m.coefficients[0]=NaN;},m=>{m.trained_at=START;},m=>{m.training_cutoff=m.trained_at;}]){
 const m=model();mutate(m);assert.equal(selectBases(snapshot(),'obs',m,NOW).status,'ABSTAIN');}
 assert.equal(selectBases(snapshot(),'obs',model(),START).status,'ABSTAIN');
});
test('music handles incidents and year annotations without reading result fields',()=>{
 assert.deepEqual(musicFeatures(''),{placed:0,incidentFree:0});
 assert.equal(musicFeatures('1a(25)2a3a').placed,.5);
 assert.equal(musicFeatures('DaTa').incidentFree,-.8);
});
test('analytic training gradient matches finite differences',()=>{
 const e=[example(19),example(20)],beta=[.9,.4,.2,.3,.15],g=lossGradient(e,beta);
 beta.forEach((_,i)=>{const plus=[...beta],minus=[...beta];plus[i]+=1e-5;minus[i]-=1e-5;
 assert.ok(Math.abs((lossGradient(e,plus).loss-lossGradient(e,minus).loss)/2e-5-g.gradient[i])<1e-7);});
});
test('training reduces regularized loss and rejects duplicate races, invalid labels and future arrivals',async()=>{
 const e=[example(19),example(20)],m=await fit(e,NOW);
 assert.ok(lossGradient(e,m.coefficients).loss<lossGradient(e,PRIOR).loss);
 assert.ok(Math.hypot(...lossGradient(e,m.coefficients).gradient)<1e-6);
 await assert.rejects(()=>fit([e[0],e[0]],NOW),/DUPLICATE/);
 await assert.rejects(()=>fit(e,'2026-09-20T13:30:00.000Z'),/FUTURE/);
 for(const mutate of [x=>{x.result.status='PROVISIONAL';},x=>{x.result.ranking[0]=[1,2];},x=>{x.result.ranking[1]=[1];},x=>{x.result_observed_at=x.snapshot.observed_at;}]){
 const x=example(19);mutate(x);assert.equal(usable(x),false);}
});
test('walk-forward excludes future labels and held-out race from each fitted model',async()=>{
 const report=await walkForward([example(19),example(20),example(21),example(22)]);
 assert.equal(report.rows.length,2);assert.deepEqual(report.rows.map(r=>r.training_races),[2,3]);
 for(const row of report.rows)assert.equal(row.training_ids.includes(row.race_id),false);
 const e=[example(19),example(20),example(21)];e[1].result_observed_at='2026-09-22T15:00:00.000Z';
 assert.equal((await walkForward(e)).rows.length,0);
});
test('model and decisions are immutable; result corrections cannot rewrite emitted bases',async()=>{
 const db=new LocalD1(),s=snapshot(),m=model();const oid=await saveObservation(db,s,[]);await saveModel(db,m);
 const p=selectBases(s,oid,m,NOW);assert.equal(await saveProposal(db,p),true);assert.equal(await saveProposal(db,p),false);
 for(const table of ['models','proposals'])for(const sql of [`DELETE FROM ${table}`,`UPDATE ${table} SET payload_hash='x'`,`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`])assert.throws(()=>db.sqlite.exec(sql),/IMMUTABLE/);
 await assert.rejects(()=>saveModel(db,{...m,coefficients:[...m.coefficients].reverse()}),/COLLISION/);
 const before=db.sqlite.prepare('SELECT payload_json FROM proposals').get().payload_json;
 const r=example(21).result;r.race_id=RID;await saveResult(db,r,'2026-09-21T14:00:00.000Z',{});
 assert.equal(db.sqlite.prepare('SELECT payload_json FROM proposals').get().payload_json,before);
 assert.equal(await sha256(before),db.sqlite.prepare('SELECT payload_hash FROM proposals').get().payload_hash);
});
test('display never falls back to a stale or replaced successful proposal',()=>{
 const s=snapshot(),p=selectBases(s,'obs',model(),NOW);
 assert.equal(currentProposal(p,s,'obs',NOW).status,'EXPERIMENTAL');
 for(const view of [currentProposal(p,s,'new',NOW),currentProposal(p,s,'obs',START),currentProposal({...p,status:'ABSTAIN',reasons:['BAD']},s,'obs',NOW)])assert.deepEqual(view.bases3,[]);
});
test('evaluation fixes the latest reference at T-5, counts once and excludes unverified NP and provisional arrivals',async()=>{
 const db=new LocalD1(),m=model();await saveModel(db,m);
 for(const minute of [48,54,57]) {const s=snapshot();s.observed_at=`2026-09-21T12:${minute}:00.000Z`;s.source_receipts[0].received_at=s.observed_at;
 const id=await saveObservation(db,s,[]);await saveProposal(db,selectBases(s,id,m,s.observed_at));}
 const rows=db.sqlite.prepare('SELECT payload_json FROM proposals ORDER BY created_at').all().map(r=>JSON.parse(r.payload_json));
 const p=referenceProposal(rows,START)!;assert.equal(p.created_at,'2026-09-21T12:54:00.000Z');
 const r=example(21).result;r.race_id=RID;await saveResult(db,r,'2026-09-21T14:00:00.000Z',{});
 const h=await proposalHistory(db,'2026-09-21T14:05:00.000Z');assert.equal(h.summary.triples_scored,1);assert.equal(h.summary.races,1);
 assert.equal(scoreProposal(p,{...r,status:'PROVISIONAL'},'2026-09-21T12:55:00Z').all3,null);
 assert.equal(scoreProposal(p,{...r,non_partants_known:false},'2026-09-21T12:55:00Z').all3,null);
 assert.equal(scoreProposal(p,{...r,non_partants:[p.bases3[0]]},'2026-09-21T12:55:00Z').all3,null);
 const abstain={...p,status:'ABSTAIN',created_at:'2026-09-21T12:54:30.000Z',bases3:[],bases4:[]};
 assert.equal(referenceProposal([...rows,abstain],START)?.status,'ABSTAIN');
 assert.equal(scoreProposal(abstain,r,'2026-09-21T12:55:00Z').status,'ABSTAIN');
});
test('enabled collector stores real-time proposals but never retroactive ones',async()=>{
 const db=new LocalD1(),fake=liveFake();const r=await collect(db,true,fake.fetcher,()=>new Date(NOW),model());
 assert.equal(r.status,'OK');assert.equal(r.proposals,1);assert.equal(db.sqlite.prepare('SELECT status FROM proposals').get().status,'EXPERIMENTAL');
 const f=fixtures();f.c.heureDepart=Date.parse(NOW)-1000;const past=new LocalD1();
 const finished=await collect(past,true,liveFake(f).fetcher,()=>new Date(NOW),model());assert.equal(finished.proposals,0);
});
test('24-runner distribution remains normalized within a bounded local computation',()=>{
 const t=performance.now(),d=topFiveDistribution(Array.from({length:24},(_,i)=>1/(i+1)));
 assert.equal(d.size,42504);assert.ok(Math.abs([...d.values()].reduce((a,b)=>a+b,0)-1)<1e-10);
 assert.ok(performance.now()-t<5000,'Distribution should not monopolize the collector');
});

test('a prono outage still permits official result collection and cannot generate bases',async()=>{
 const db=new LocalD1(),f=fixtures();Object.assign(f.c,{heureDepart:Date.parse(NOW)-1000,statut:'FIN_COURSE',arriveeDefinitive:true,ordreArrivee:[[1],[2],[3],[4],[5]]});
 const fake=liveFake(f);const report=await collect(db,true,async(url,init)=>url===PRONO_URL?new Response('down',{status:503}):fake.fetcher(url,init),()=>new Date(NOW),model());
 assert.equal(report.status,'DEGRADED');assert.equal(report.results,1);assert.equal(report.proposals,0);
 assert.ok(report.errors.includes('PRONO_HTTP_503'));
});
