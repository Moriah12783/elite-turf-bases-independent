import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script,createContext } from 'node:vm';
import { FEATURES,PRIOR,selectBases } from '../src/selector.ts';
import { saveModel,saveObservation,saveProposal,saveResult } from '../src/storage.ts';
import { EDITIONS,editionHistory,editionRange } from '../src/editions.ts';
import worker from '../src/worker.ts';
import { LocalD1,snapshot,RID,NOW,TOKEN } from './helpers.ts';

const now='2026-09-22T12:00:00.000Z',range={from:'2026-09-21',to:'2026-09-21'};
const model={schema:'elite-bases-model-v1',id:'editions-model',trained_at:'2026-09-20T20:00:00.000Z',
 training_cutoff:'2026-09-20T19:00:00.000Z',feature_names:FEATURES,coefficients:PRIOR,training_races:2,
 training_ids:['previous-1','previous-2'],dataset_sha256:'synthetic',validation:'EXPERIMENTAL_SMALL_SAMPLE',method:'RIDGE_PLACKETT_LUCE',regularization:1.5};
async function emit(db,edition='T_MATIN',time=NOW,options={}){
 const s=snapshot();s.edition=edition;s.observed_at=time;s.source_receipts[0].received_at=time;
 if(options.race)s.race_id=options.race;if(options.selection)s.selection8=options.selection;
 if(options.abstain){s.eligible=false;s.reasons=['TEST_ABSTAIN'];}
 const m=options.model??model;await saveModel(db,m);
 const id=await saveObservation(db,s,[]),p=selectBases(s,id,m,time);
 await saveProposal(db,p);return {snapshot:s,proposal:p};
}
async function result(db,race=RID,ranking=[[1],[2],[3],[4],[5]],status='DEFINITIVE',at='2026-09-21T14:00:00.000Z'){
 await saveResult(db,{schema:'result',race_id:race,status,ranking,non_partants:[],non_partants_known:true,finality:'PMU_VERIFIED'},at,{});
}
test('all variants stay archived, while one reference per edition is immutable',async()=>{
 const db=new LocalD1();await emit(db);const first=db.sqlite.prepare('SELECT * FROM edition_references').get();
 await emit(db,'T_MATIN','2026-09-21T12:10:00.000Z',{selection:[8,2,3,4,5,6,7,9]});
 await emit(db,'T90','2026-09-21T12:20:00.000Z');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM proposals').get().n,3);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM edition_references').get().n,2);
 assert.deepEqual(db.sqlite.prepare("SELECT * FROM edition_references WHERE edition='T_MATIN'").get(),first);
 for(const sql of ['DELETE FROM edition_references',"UPDATE edition_references SET policy=policy",'INSERT OR REPLACE INTO edition_references SELECT * FROM edition_references'])assert.throws(()=>db.sqlite.exec(sql),/IMMUTABLE/);
});
test('first abstention stays the reference even if a later decision succeeds',async()=>{
 const db=new LocalD1();await emit(db,'T_MATIN',NOW,{abstain:true});await emit(db,'T_MATIN','2026-09-21T12:10:00.000Z');await result(db);
 const r=await editionHistory(db,now,range);assert.equal(r.rows.length,1);assert.equal(r.rows[0].outcome.status,'ABSTAIN');
 assert.equal(r.summary[0].abstentions,1);assert.equal(r.summary[0].triples.scored,0);assert.equal(r.archive[0].decisions,2);
});
test('migration uses only existing emitted decisions; observations alone create no references',async()=>{
 const db=new LocalD1(false);await saveObservation(db,snapshot(),[]);await emit(db);
 await emit(db,'T_MATIN','2026-09-21T12:10:00.000Z');
 const before=db.sqlite.prepare('SELECT id,payload_hash FROM proposals ORDER BY id').all();
 db.sqlite.exec(readFileSync(new URL('../migrations/0003_edition_references.sql',import.meta.url),'utf8'));
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM edition_references').get().n,1);
 assert.deepEqual(db.sqlite.prepare('SELECT id,payload_hash FROM proposals ORDER BY id').all(),before);
 assert.equal((await editionHistory(db,now,range)).rows[0].recorded_at,NOW);
 const empty=new LocalD1(false);await saveObservation(empty,snapshot(),[]);
 empty.sqlite.exec(readFileSync(new URL('../migrations/0003_edition_references.sql',import.meta.url),'utf8'));
 assert.equal(empty.sqlite.prepare('SELECT COUNT(*) n FROM edition_references').get().n,0);
});
test('reference capture is atomic with proposal insertion, including rollback on failure',async()=>{
 const db=new LocalD1();db.sqlite.exec("CREATE TRIGGER test_failure BEFORE INSERT ON edition_references BEGIN SELECT RAISE(ABORT,'INJECTED'); END;");
 await assert.rejects(()=>emit(db),/INJECTED/);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM proposals').get().n,0);
});
test('post-departure and unsupported editions do not become historical reference bases',async()=>{
 const db=new LocalD1();await emit(db,'T_MATIN','2026-09-21T13:01:00.000Z');await emit(db,'UNKNOWN');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM edition_references').get().n,0);
});
test('definitive arrivals evaluate each original edition even after its live expiry',async()=>{
 const db=new LocalD1();for(const [i,edition]of EDITIONS.entries())await emit(db,edition,`2026-09-21T12:${String(i*10).padStart(2,'0')}:00.000Z`);
 await result(db);const r=await editionHistory(db,now,range);
 assert.equal(r.rows.length,4);assert.equal(r.common.triples.race_ids.length,1);
 for(const s of r.summary){assert.equal(s.triples.scored,1);assert.equal(s.triples.success,1);assert.equal(s.quartets.scored,0);assert.equal(s.quartets.rate,null);}
 assert.equal(r.rows[0].minutes_before_start,60);assert.equal(r.rows[0].outcome.status,'SCORED');
});
test('common cohort omits missing editions and keeps models separate',async()=>{
 const db=new LocalD1();for(const [i,e]of EDITIONS.entries())await emit(db,e,`2026-09-21T12:${String(i*10).padStart(2,'0')}:00.000Z`);
 await result(db);const second={...model,id:'second-model'};
 await emit(db,'T_MATIN',NOW,{race:'second-race',model:second});await result(db,'second-race');
 const r=await editionHistory(db,now,range);assert.equal(r.summary[0].triples.scored,2);assert.equal(r.summary[1].triples.scored,1);
 assert.deepEqual(r.common.triples.race_ids,[RID]);assert.equal(r.by_model.length,2);
 assert.equal(r.by_model.find(x=>x.model_id==='second-model').common.triples.race_ids.length,0);
});
test('corrections change outcomes without changing the immutable reference or historical predictions',async()=>{
 const db=new LocalD1();await emit(db);await result(db, RID,[[1],[2],[3],[4],[5]],'PROVISIONAL');
 const before=db.sqlite.prepare('SELECT * FROM edition_references').get();
 assert.equal((await editionHistory(db,now,range)).summary[0].pending,1);
 await result(db,RID,[[8],[7],[6],[5],[4]],'DEFINITIVE','2026-09-21T14:10:00.000Z');
 const r=await editionHistory(db,now,range);assert.equal(r.summary[0].triples.scored,1);assert.equal(r.summary[0].triples.success,0);
 assert.deepEqual(db.sqlite.prepare('SELECT * FROM edition_references').get(),before);
});
test('cancelled races, non-starters and training races never inflate edition success',async()=>{
 for(const kind of ['cancelled','np','training']) {
 const db=new LocalD1();const m=kind==='training'?{...model,training_ids:[RID,'previous-2']}:model;
 const {proposal}=await emit(db,'T_MATIN',NOW,{model:m});
 await saveResult(db,{schema:'result',race_id:RID,status:kind==='cancelled'?'CANCELLED':'DEFINITIVE',ranking:[[1],[2],[3],[4],[5]],
 non_partants:kind==='np'?[proposal.bases3[0]]:[],non_partants_known:true,finality:'PMU_VERIFIED'},'2026-09-21T14:00:00Z',{});
 const r=await editionHistory(db,now,range);assert.equal(r.summary[0].triples.scored,0);assert.equal(r.summary[0].excluded,1);
 }
});
test('edition API is protected and date ranges are validated',async()=>{
 assert.throws(()=>editionRange('2026-02-30','2026-03-01',now),/INVALID/);
 assert.throws(()=>editionRange('2026-09-22','2026-09-21',now),/INVALID/);
 assert.throws(()=>editionRange('2024-01-01','2026-01-01',now),/INVALID/);
 const db=new LocalD1();await emit(db);const env={DB:db,ADMIN_TOKEN:TOKEN,SERVICE_MODE:'EXPERIMENTAL'};
 const request=(path,auth=true)=>new Request('https://bases.example'+path,{headers:auth?{Authorization:'Bearer '+TOKEN}:{}});
 assert.equal((await worker.fetch(request('/api/editions',false),env,{})).status,401);
 assert.equal((await worker.fetch(request('/api/editions?from=bad'),env,{})).status,400);
 const r=await worker.fetch(request('/api/editions?from=2026-09-21&to=2026-09-21'),env,{});assert.equal(r.status,200);
 assert.equal((await r.json()).rows[0].recorded_at,NOW);
 const exported=await (await worker.fetch(request('/api/export?date=2026-09-21'),env,{})).json();
 assert.equal(exported.proposals.length,1);assert.equal(exported.edition_references.length,1);assert.equal(exported.models[0].id,model.id);
});
test('delivered dashboard renders edition history and rates without treating missing data as zero percent',async()=>{
 const db=new LocalD1();await emit(db);const editions=await editionHistory(db,now,range);
 const page=await worker.fetch(new Request('https://bases.example/',{headers:{Authorization:'Bearer '+TOKEN}}),{ADMIN_TOKEN:TOKEN},{});
 const html=await page.text(),script=html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
 const el=()=>({textContent:'',children:[],replaceChildren(){this.children=[];},append(x){this.children.push(x);}});
 const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(x=>[x[1],el()]));
 const data={totals:{},latest:[],runs:[],model:null,prospective:{summary:{},history:[]},editions:{...editions,total_references:editions.rows.length}};
 new Script(script).runInContext(createContext({setInterval(){},document:{getElementById:id=>elements[id],createElement:el},fetch:async()=>({ok:true,json:async()=>data})}));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(elements.message.textContent,'');
 assert.equal(elements['edition-summary'].children.length,4);assert.equal(elements['edition-history'].children.length,1);
 assert.match(elements['edition-summary'].children[0].children[2].textContent,/0 course/);
 assert.equal(elements['edition-history'].children[0].children[0].textContent,RID+' / Matin');
});
