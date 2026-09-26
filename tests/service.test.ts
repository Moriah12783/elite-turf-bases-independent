import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { buildSnapshot, canonical, containsAllBases, officialResult, parseProno, proposalState,
  quinteCourses, sha256, PMU_ROOT, PRONO_URL } from '../src/core.ts';
import { collect, readSource } from '../src/collector.ts';
import { gzip, gunzip, lock, saveObservation, saveResult, sourcesToStore, verifyObservation } from '../src/storage.ts';
import worker, {authenticated} from '../src/worker.ts';

import { NOW, START, RID, TOKEN, fixtures, snapshot, LocalD1, liveFake } from './helpers.ts';

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
  assert.equal(report.observations,0);assert.equal(report.results,1);assert.equal(fake.calls.some(u=>u.endsWith('/participants')),true);
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

test('delivered dashboard script executes and renders counters, races and multiline run history',async()=>{
  const page=await worker.fetch(new Request('https://bases.example/',{headers:{Authorization:'Bearer '+TOKEN}}),{ADMIN_TOKEN:TOKEN},{});
  const html=await page.text();
  const script=html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const element=()=>({textContent:'',href:'',children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);}});
  const ids=['observations','eligible','courses','races','runs','export','collect','refresh','message','model','proposals','scorecard','history','edition-counts','edition-common','edition-summary','edition-comparison','edition-history'];
  const elements=Object.fromEntries(ids.map(id=>[id,element()]));
  const payload={model:null,prospective:{summary:{triples_success:0,triples_scored:0,quartets_success:0,quartets_scored:0,abstentions:0},history:[]},totals:{observations:3,eligible:2,qualified_races:1},latest:[{race_id:RID,edition:'T_MATIN',observed_at:NOW,selection8:[8,2,3,4,5,6,7,1],eligible:true,reasons:[]}],
    runs:[{started_at:NOW,status:'OK',details_json:'{}'},{started_at:START,status:'OK',details_json:'{}'}]};
  let requests=0;
  const context=createContext({setInterval(){},document:{getElementById:id=>elements[id],createElement:element},fetch:async url=>{
    assert.equal(url,'/api/status');requests++;return {ok:true,json:async()=>payload};
  }});
  new Script(script).runInContext(context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(elements.observations.textContent,3);assert.equal(elements.eligible.textContent,2);assert.equal(elements.courses.textContent,1);
  assert.equal(elements.races.children.length,1);assert.equal(elements.races.children[0].children[0].textContent,RID);
  assert.equal(elements.runs.textContent,`${NOW} OK \u2014 0 observation(s), 0 d\u00e9cision(s), 0 arriv\u00e9e(s)\n${START} OK \u2014 0 observation(s), 0 d\u00e9cision(s), 0 arriv\u00e9e(s)`);
  assert.match(elements.export.href,/^\/api\/export\?date=\d{4}-\d{2}-\d{2}$/);
  await elements.refresh.onclick();assert.equal(requests,2);
  assert.equal(elements.message.textContent,'');
});
