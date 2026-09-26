import { timingSafeEqual } from 'node:crypto';
import { VERSION, canonical, type Snapshot } from './core.ts';
import { collect } from './collector.ts';
import { verifyObservation, verifiedPayload } from './storage.ts';
import { ACTIVE_MODEL } from './model.ts';
import { currentProposal, proposalHistory } from './proposals.ts';
import { dashboard } from './dashboard.ts';
import type { Model } from './selector.ts';
import { editionHistory, editionRange } from './editions.ts';

const secureHeaders = {
  'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY',
  'Strict-Transport-Security':'max-age=31536000',
};
function json(value: unknown, status=200): Response {
  return new Response(JSON.stringify(value),{status,headers:{...secureHeaders,'Content-Type':'application/json; charset=utf-8'}});
}
export async function authenticated(request: Request, expected: string | undefined): Promise<boolean> {
  if (!expected || expected.length < 32) return false;
  const header = request.headers.get('authorization') ?? ''; let provided = '';
  if (header.startsWith('Bearer ')) provided = header.slice(7);
  else if (header.startsWith('Basic ')) {
    try { const decoded=atob(header.slice(6)); if(decoded.startsWith('elite:')) provided=decoded.slice(6); } catch { return false; }
  }
  if (provided.length > 256) return false;
  const encode = new TextEncoder();
  const [a,b] = await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(provided)),crypto.subtle.digest('SHA-256',encode.encode(expected))]);
  return timingSafeEqual(new Uint8Array(a),new Uint8Array(b));
}
async function overview(db: D1Database, model:Model|undefined): Promise<unknown> {
  const [totals,runs,latest] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS observations, SUM(eligible) AS eligible, COUNT(DISTINCT CASE WHEN eligible=1 THEN race_id END) AS qualified_races FROM observations`).first(),
    db.prepare('SELECT started_at,finished_at,status,details_json FROM runs ORDER BY started_at DESC LIMIT 12').all(),
    db.prepare(`SELECT o.id,o.payload_hash,o.payload_json FROM observations o WHERE o.id=(SELECT x.id FROM observations x WHERE x.race_id=o.race_id ORDER BY x.observed_at DESC,x.id DESC LIMIT 1) ORDER BY o.observed_at DESC LIMIT 20`).all<{id:string;payload_hash:string;payload_json:string}>(),
  ]);
  const snapshots = await Promise.all(latest.results.map(verifyObservation));
  const now=new Date().toISOString();
  const [prospective,editions]=await Promise.all([proposalHistory(db,now),editionHistory(db,now)]);
  return {version:VERSION,mode:model?'EXPERIMENTAL':'COLLECT_ONLY',radar:'NOT_CONNECTED',model:model??null,totals,
    editions:{...editions,rows:editions.rows.slice(0,40),total_references:editions.rows.length},
    prospective,runs:runs.results,latest:snapshots.map((s,i) => ({race_id:s.race_id,edition:s.edition,observed_at:s.observed_at,
      start_at:s.start_at,selection8:s.selection8,eligible:s.eligible,reasons:s.reasons,
      proposal:currentProposal(model?prospective.history.find(h=>h.race_id===s.race_id)?.latest:undefined,s,latest.results[i].id,now)}))};
}

export default {
  async fetch(request,env): Promise<Response> {
    const url = new URL(request.url),model=String(env.SERVICE_MODE)==='EXPERIMENTAL'?ACTIVE_MODEL:undefined;
    if (url.pathname === '/health' && request.method === 'GET') return json({service:'elite-turf-bases-independent',version:VERSION,mode:model?'EXPERIMENTAL':'COLLECT_ONLY'});
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return json({error:'PRIVATE_ACCESS_NOT_CONFIGURED'},503);
    if (!await authenticated(request,env.ADMIN_TOKEN)) return new Response('Accès privé. Identifiant : elite.',{
      status:401,headers:{...secureHeaders,'WWW-Authenticate':'Basic realm="Elite Turf Bases", charset="UTF-8"'}});
    try {
      if (request.method === 'GET' && url.pathname === '/') return dashboard(secureHeaders);
      if (request.method === 'GET' && url.pathname === '/api/status') return json(await overview(env.DB,model));
      if (request.method === 'GET' && url.pathname === '/api/editions') {
        const now=new Date().toISOString();let range;
        try{range=editionRange(url.searchParams.get('from'),url.searchParams.get('to'),now);}
        catch{return json({error:'INVALID_EDITION_RANGE',hint:'Dates YYYY-MM-DD, chronological, maximum 366 days.'},400);}
        return json(await editionHistory(env.DB,now,range));
      }
      if (request.method === 'POST' && url.pathname === '/api/collect') {
        const origin=request.headers.get('origin');
        if (origin && origin !== url.origin) return json({error:'ORIGIN_REFUSED'},403);
        return json(await collect(env.DB,String(env.COLLECTION_ENABLED)==='true',fetch,()=>new Date(),model));
      }
      if (request.method === 'GET' && url.pathname === '/api/export') {
        const date=url.searchParams.get('date') ?? new Date().toISOString().slice(0,10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({error:'INVALID_DATE'},400);
        const rows=await env.DB.prepare('SELECT payload_hash,payload_json FROM observations WHERE race_date=? ORDER BY observed_at LIMIT 1001').bind(date).all<{payload_hash:string;payload_json:string}>();
        if(rows.results.length>1000) return json({error:'EXPORT_LIMIT_REQUIRES_OFFLINE_BACKUP'},413);
        const observations:Snapshot[]=await Promise.all(rows.results.map(verifyObservation));
        const results=await env.DB.prepare(`SELECT observed_at,status,payload_hash,payload_json FROM results WHERE race_id IN (SELECT DISTINCT race_id FROM observations WHERE race_date=?) ORDER BY observed_at`).bind(date).all();
        const stored=await env.DB.prepare('SELECT payload_hash,payload_json FROM proposals WHERE observation_id IN (SELECT id FROM observations WHERE race_date=?) ORDER BY created_at').bind(date).all<{payload_hash:string;payload_json:string}>();
        const proposals=await Promise.all(stored.results.map(r=>verifiedPayload(r)));
        const refs=await env.DB.prepare(`SELECT ref.* FROM edition_references ref JOIN proposals p ON p.id=ref.proposal_id
          JOIN observations o ON o.id=p.observation_id WHERE o.race_date=? ORDER BY p.created_at`).bind(date).all();
        const modelRows=await env.DB.prepare(`SELECT payload_hash,payload_json FROM models WHERE id IN
          (SELECT DISTINCT p.model_id FROM proposals p JOIN observations o ON o.id=p.observation_id WHERE o.race_date=?)`)
          .bind(date).all<{payload_hash:string;payload_json:string}>();
        const models=await Promise.all(modelRows.results.map(r=>verifiedPayload<Model>(r)));
        return json({proposals,edition_references:refs.results,models,active_model:model??null,schema:'elite-bases-export-v1',date,observations,results:results.results,
          warning:'Observations chronologiques, pas un jeu entrainement valide. Une course ne doit pas etre dupliquee entre apprentissage et validation.'});
      }
      return json({error:'NOT_FOUND'},404);
    } catch {
      console.error(canonical({event:'request_failed',path:url.pathname}));
      return json({error:'SERVICE_ERROR'},500);
    }
  },
  async scheduled(_controller,env,ctx): Promise<void> {
    const model=String(env.SERVICE_MODE)==='EXPERIMENTAL'?ACTIVE_MODEL:undefined;
    ctx.waitUntil(collect(env.DB,String(env.COLLECTION_ENABLED)==='true',fetch,()=>new Date(),model).then(report=>{
      if(report.status==='ERROR') throw new Error('COLLECTION_FAILED');
    }));
  },
} satisfies ExportedHandler<Env>;
