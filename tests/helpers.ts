import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildSnapshot, quinteCourses, PMU_ROOT, PRONO_URL } from '../src/core.ts';
export const NOW='2026-09-21T12:00:00.000Z', START='2026-09-21T13:00:00.000Z';
export const RID='R1C1_21092026_TESTVILLE';
export const TOKEN='test-token-only-012345678901234567890123456789';
export function fixtures() {
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
export function snapshot() {const f=fixtures();return buildSnapshot(f.course,f.row,f.parts,f.receipts,NOW,{});}

/** SQLite-backed minimal implementation of the D1 methods used by the service. */
export class LocalD1 {
  sqlite=new DatabaseSync(':memory:');
  constructor(){for(const file of ['0001_independent.sql','0002_proposals.sql'])this.sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));}
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
export function liveFake(f=fixtures()){
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
