import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildSnapshot, canonical, containsAllBases, officialResult, parseProno, proposalState,
  quinteCourses, sha256, PMU_ROOT, PRONO_URL } from '../src/core.ts';
import { collect, readSource } from '../src/collector.ts';
import { gzip, gunzip, lock, saveObservation, saveResult, sourcesToStore, verifyObservation } from '../src/storage.ts';
import worker, {authenticated} from '../src/worker.ts';

const NOW='2026-09-21T12:00:00.000Z', START='2026-09-21T13:00:00.000Z';
const RID='R1C1_21092026_TESTVILLE';
const TOKEN='test-token-only-012345678901234567890123456789';
function fixtures() {
  const c={numOrdre:1,heureDepart:Date.parse(START),statut:'PROGRAMMEE',discipline:'TROT_ATTELE',distance:2700,
    paris:[{codePari:'QUINTE_PLUS'}],corde:'GAUCHE'};
  const programme={programme:{reunions:[{numOfficiel:1,hippodrome:{libelleCourt:'TESTVILLE'},pays:{code:'FRA'},courses:[c]}]}};
  const row={race_id:RID,date:'2026-09-21',display_horizon:'T_MATIN',sel_moteur_list:[8,2,3,4,5,6,7,1],
    editions_moteur:{T_MATIN:{sel:'8-2-3-4-5-6-7-1',lock:'08:30',odds_real:true,priced_ratio:1}},
    editions_marche:{T_MATIN:{sel:'1-2-3-4-5-6-7-8'}},publishable:true,is_no_bet:false,
    contract_recorded:true,np_nums:[],runners:Array.from({length:10},(_,i)=>({num:i+1,prob_pct:10,value_index:1}))};
  const parts={participants:Array.from({length:10},(_,i)=>({numPmu:i+1,nom:'Cheval '+(i+1),statut:'PARTANT',
    musique:'1a2a3a',driver:'DRIVER',entraineur:'TRAINER',dernierRapportDirect:{rapport:3+i},dernierRapportReference:{rapport:4+i}}))};
  const receipts=[{url:PRONO_URL,received_at:NOW,response_sha256:'test',http_date:null}];
  const course=quinteCourses(programme,'2026-09-21')[0];
  return {c,programme,row,parts,receipts,course};
}
function snapshot() {const f=fixtures();return buildSnapshot(f.course,f.row,f.parts,f.receipts,NOW,{});}

/** SQLite-backed minimal implementation of the D1 methods used by the service. */
class LocalD1 {
  sqlite=new DatabaseSync(':memory:');
  constructor(){this.sqlite.exec(readFileSync(new URL('../migrations/0001_independent.sql',import.meta.url),'utf8'));}
  prepare(sql:string){return new Statement(this,sql,[]);}
  async batch(statements:Statement[]){
    this.sqlite.exec('BEGIN');
    try{const out=[];for(const s of statements)out.push(await s.run());this.sqlite.exec('COMMIT');return out;}
    catch(e){this.sqlite.exec('ROLLBACK');throw e;}
  }
}
class Statement {
  db:LocalD1; sql:string; args:unknown[];
  constructor(db:LocalD1,sql:string,args:unknown[]){this.db=db;this.sql=sql;this.args=args;}
  bind(...args:unknown[]){return new Statement(this.db,this.sql,args);}
  values(){return this.args.map(a=>a instanceof ArrayBuffer?new Uint8Array(a):a);}
  async run(){const v=this.db.sqlite.prepare(this.sql).run(...this.values());return {success:true,meta:{changes:Number(v.changes)},results:[]};}
  async first(){return this.db.sqlite.prepare(this.sql).get(...this.values())??null;}
  async all(){return {success:true,results:this.db.sqlite.prepare(this.sql).all(...this.values())};}
}
function liveFake(f=fixtures()){
  const calls:string[]=[];
  const fetcher=async(url:string,init:RequestInit)=>{
    calls.push(url);assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');
    if(url===PRONO_URL)return new Response('<script>let allLogs = '+JSON.stringify([f.row])+';</script>');
    if(url.endsWith('/participants'))return Response.json(f.parts);
    if(url===PMU_ROOT+'/21092026')return Response.json(f.programme);
    return Response.json({programme:{reunions:[]}});
  };
  return {calls,fetcher};
}

test('safe JSON extraction never executes received scripts and handles brackets in strings',()=>{
  const row={name:'a ] } \\" text'};
  assert.deepEqual(parseProno('<script>let allLogs = '+JSON.stringify([row])+'; throw new Error("EXECUTED");</script>'),[row]);
  assert.throws(()=>parseProno('let allLogs = fetch("/secret")'),/SCHEMA_CHANGED/);
  assert.throws(()=>parseProno('let allLogs = [{'),/SCHEMA_CHANGED/);
});
test('Quinte identity comes from official bet codes; no inferred eligibility',()=>{
  const f=fixtures();assert.equal(f.course.race_id,RID);
  f.c.paris=[];assert.deepEqual(quinteCourses(f.programme,'2026-09-21'),[]);
});
test('all eight original candidates and full field are preserved, no automatic base recommendation',()=>{
  const s=snapshot();assert.equal(s.eligible,true);assert.deepEqual(s.selection8,[8,2,3,4,5,6,7,1]);
  assert.equal(s.runners.length,10);assert.equal(s.radar.status,'NOT_CONNECTED');
  assert.deepEqual(proposalState(s,NOW),{status:'COLLECT_ONLY',bases:[],reason:'NO_VALIDATED_MODEL'});
});
test('arrival and future assessment fields cannot become runner features',()=>{
  const f=fixtures();Object.assign(f.row.runners[0],{arrival:1,couverture:5,winner:true,secret:'forbidden'});
  Object.assign(f.parts.participants[0],{arrival:1,final_result:{winner:true}});
  const s=buildSnapshot(f.course,f.row,f.parts,f.receipts,NOW,{});
  assert.equal(s.eligible,true);
  const text=JSON.stringify(s.runners);for(const key of ['arrival','couverture','winner','secret','final_result'])assert.equal(text.includes(key),false);
});
test('after-start observations and already-present arrivals are rejected',()=>{
  const f=fixtures();let s=buildSnapshot(f.course,f.row,f.parts,f.receipts,START,{});
  assert.equal(s.eligible,false);assert.ok(s.reasons.includes('RECEIVED_AFTER_START'));
  Object.assign(f.row,{arrival_list:[1,2,3,4,5]});s=buildSnapshot(f.course,f.row,f.parts,f.receipts,NOW,{});
  assert.ok(s.reasons.includes('RACE_STARTED_OR_CLOSED'));
});
test('missing timestamps, future receipts, unknown no-bet and ambiguous editions fail closed',()=>{
  for(const mutation of [
    f=>{f.course.start_at='';},f=>{f.receipts[0].received_at=START;},
    f=>{delete f.row.is_no_bet;},f=>{f.row.editions_moteur.T_MATIN.sel='1-2-3-4-5-6-7-8';},
    f=>{f.row.sel_moteur_list=[1,1,2,3,4,5,6,7];},f=>{f.row.race_id='WRONG';}
  ]){const f=fixtures();mutation(f);assert.equal(buildSnapshot(f.course,f.row,f.parts,f.receipts,NOW,{}).eligible,false);}
});
test('selected non-starter and incomplete market invalidate the observation',()=>{
  const f=fixtures();f.parts.participants[0].statut='NON_PARTANT';
  assert.ok(buildSnapshot(f.course,f.row,f.parts,f.receipts,NOW,{}).reasons.includes('SELECTED_NON_STARTER'));
  f.parts.participants[0].statut='PARTANT';f.parts.participants[0].dernierRapportDirect.rapport=0;f.parts.participants[1].dernierRapportDirect.rapport=0;
  assert.ok(buildSnapshot(f.course,f.row,f.parts,f.receipts,NOW,{}).reasons.includes('MARKET_COVERAGE_LOW'));
});
test('unknown or stale observations never yield bases after departure',()=>{
  assert.deepEqual(proposalState(snapshot(),START),{status:'ABSTAIN',bases:[],reason:'RACE_STARTED'});
});
test('only a verified official final result can score bases; dead heats use competition rank',()=>{
  const f=fixtures();Object.assign(f.course.raw,{statut:'ARRIVEE_DEFINITIVE_COMPLETE',ordreArrivee:[[1],[2],[3],[4],[5,6]],arriveeDefinitive:true});
  const r=officialResult(f.course)!;assert.equal(r.status,'DEFINITIVE');
  assert.equal(containsAllBases(r,[1,2,6]),true);assert.equal(containsAllBases(r,[1,2,7]),false);
  f.course.raw.arriveeDefinitive=false;assert.equal(containsAllBases(officialResult(f.course)!,[1,2,6]),null);
  f.course.raw.ordreArrivee=[[1],[1],[2],[3],[4]];assert.equal(officialResult(f.course),null);
});
test('GET source allowlist and streamed size limits cannot be bypassed',async()=>{
  for(const url of ['http://prono.elite-turf.fr/','https://attacker.test/','https://user:pass@prono.elite-turf.fr/']){
    await assert.rejects(()=>readSource(url,async()=>{throw Error('SHOULD_NOT_FETCH');}),/NOT_ALLOWED/);
  }
  await assert.rejects(()=>readSource(PRONO_URL,async()=>new Response('x',{headers:{'Content-Length':'99999999'}})),/TOO_LARGE/);
  await assert.rejects(()=>readSource(PRONO_URL,async()=>new Response('bad',{status:503})),/HTTP_503/);
  await assert.rejects(()=>readSource(PRONO_URL,async(_url,init)=>{
    assert.equal(init.redirect,'manual');
    return new Response(null,{status:302,headers:{Location:'https://attacker.test/'}});
  }),/HTTP_302/);
});
test('content hashing is canonical and compressed contents roundtrip',async()=>{
  assert.equal(await sha256(canonical({b:2,a:1})),await sha256(canonical({a:1,b:2})));
  assert.throws(()=>canonical({v:NaN}),/INVALID_JSON/);
  assert.equal(await gunzip(await gzip('évidence')), 'évidence');
});
test('observation and source blobs are atomic, deduplicated and protected against replacement',async()=>{
  const db=new LocalD1(),s=snapshot(),sources=await sourcesToStore([{kind:'TEST',value:{a:1}}]);
  await saveObservation(db,s,sources);await saveObservation(db,s,sources);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM observations').get().n,1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM source_blobs').get().n,1);
  for(const table of ['source_blobs','observations']){
    assert.throws(()=>db.sqlite.exec(`DELETE FROM ${table}`),/IMMUTABLE/);
    assert.throws(()=>db.sqlite.exec(`UPDATE ${table} SET ${table==='observations'?'eligible=0':'kind=kind'}`),/IMMUTABLE/);
    assert.throws(()=>db.sqlite.exec(`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`),/IMMUTABLE/);
  }
  const archived=db.sqlite.prepare('SELECT payload_hash,payload_json FROM observations').get();
  assert.deepEqual(await verifyObservation(archived),s);
  await assert.rejects(()=>verifyObservation({...archived,payload_hash:'corrupted'}),/HASH_MISMATCH/);
});
test('failed observation insertion rolls back newly written raw inputs',async()=>{
  const db=new LocalD1();db.sqlite.exec("CREATE TRIGGER fail_test BEFORE INSERT ON observations BEGIN SELECT RAISE(ABORT,'INJECTED'); END;");
  await assert.rejects(async()=>saveObservation(db,snapshot(),await sourcesToStore([{kind:'TEST',value:1}])),/INJECTED/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM source_blobs').get().n,0);
});
test('official corrections append versions without touching observations',async()=>{
  const db=new LocalD1(),s=snapshot();await saveObservation(db,s,[]);
  const r={schema:'test',race_id:RID,status:'DEFINITIVE',ranking:[[1],[2],[3],[4],[5]],non_partants:[],finality:'PMU_VERIFIED'};
  assert.equal(await saveResult(db,r,NOW,{}),true);assert.equal(await saveResult(db,r,NOW,{}),false);
  r.ranking=[[2],[1],[3],[4],[5]];assert.equal(await saveResult(db,r,START,{}),true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM results').get().n,2);
  assert.deepEqual(await verifyObservation(db.sqlite.prepare('SELECT payload_hash,payload_json FROM observations').get()),s);
});
test('lease prevents concurrent ingestion and permits recovery after expiry',async()=>{
  const db=new LocalD1();assert.equal(await lock(db,'a',100),true);assert.equal(await lock(db,'b',100),false);assert.equal(await lock(db,'b',300_000),true);
});
test('full collection uses only existing GET sources and an isolated database',async()=>{
  const db=new LocalD1(),fake=liveFake();const report=await collect(db,true,fake.fetcher,()=>new Date(NOW));
  assert.equal(report.status,'OK');assert.equal(report.observations,1);assert.equal(report.eligible,1);assert.equal(report.radar,'NOT_CONNECTED');
  assert.equal(fake.calls.length,10); // prono + programme + participants + seven result rechecks
  assert.equal((await collect(db,true,fake.fetcher,()=>new Date(NOW))).status,'COOLDOWN');assert.equal(fake.calls.length,10);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM observations').get().n,1);
});
test('already finished races collect labels only, never manufactured historical features',async()=>{
  const f=fixtures();Object.assign(f.c,{heureDepart:Date.parse(NOW)-60_000,statut:'ARRIVEE_DEFINITIVE_COMPLETE',arriveeDefinitive:true,ordreArrivee:[[1],[2],[3],[4],[5]]});
  const db=new LocalD1(),fake=liveFake(f),report=await collect(db,true,fake.fetcher,()=>new Date(NOW));
  assert.equal(report.observations,0);assert.equal(report.results,1);assert.equal(fake.calls.some(u=>u.endsWith('/participants')),false);
});
test('upstream failure remains inside this service, is logged and releases the lease',async()=>{
  const db=new LocalD1();const report=await collect(db,true,async()=>new Response('bad',{status:503}),()=>new Date(NOW));
  assert.equal(report.status,'ERROR');assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM leases').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM observations').get().n,0);
  assert.equal(db.sqlite.prepare('SELECT status FROM runs').get().status,'ERROR');
});
test('disabled collector does not fetch or change storage',async()=>{
  const db=new LocalD1();assert.equal((await collect(db,false,async()=>{throw Error('NO');})).status,'DISABLED');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM runs').get().n,0);
});
test('private routes fail closed, health reveals no records and cross-origin POST is denied',async()=>{
  const env={DB:new LocalD1(),ADMIN_TOKEN:TOKEN,COLLECTION_ENABLED:'true',SERVICE_MODE:'COLLECT_ONLY'},ctx={waitUntil(){}};
  const req=(path,headers={},method='GET')=>new Request('https://bases.example'+path,{method,headers});
  assert.equal((await worker.fetch(req('/'),env,ctx)).status,401);
  assert.equal((await worker.fetch(req('/api/status'),{...env,ADMIN_TOKEN:''},ctx)).status,503);
  assert.equal((await worker.fetch(req('/health'),env,ctx)).status,200);
  assert.equal(await authenticated(req('/',{Authorization:'Bearer '+TOKEN}),TOKEN),true);
  assert.equal(await authenticated(req('/',{Authorization:'Basic '+btoa('elite:'+TOKEN)}),TOKEN),true);
  assert.equal(await authenticated(req('/',{Authorization:'Bearer wrong'}),TOKEN),false);
  const cross=await worker.fetch(req('/api/collect',{Authorization:'Bearer '+TOKEN,Origin:'https://evil.example'},'POST'),env,ctx);
  assert.equal(cross.status,403);
  const page=await worker.fetch(req('/',{Authorization:'Bearer '+TOKEN}),env,ctx);
  assert.equal(page.status,200);assert.equal(page.headers.get('Cache-Control'),'no-store');
  assert.ok(page.headers.get('Content-Security-Policy')?.includes("default-src 'none'"));
});
