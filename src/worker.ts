import { timingSafeEqual } from 'node:crypto';
import { VERSION, canonical, proposalState, type Snapshot } from './core.ts';
import { collect } from './collector.ts';
import { verifyObservation } from './storage.ts';

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
async function overview(db: D1Database): Promise<unknown> {
  const [totals,runs,latest] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS observations, SUM(eligible) AS eligible, COUNT(DISTINCT CASE WHEN eligible=1 THEN race_id END) AS qualified_races FROM observations`).first(),
    db.prepare('SELECT started_at,finished_at,status,details_json FROM runs ORDER BY started_at DESC LIMIT 12').all(),
    db.prepare(`SELECT o.payload_hash,o.payload_json FROM observations o WHERE o.id=(SELECT x.id FROM observations x WHERE x.race_id=o.race_id ORDER BY x.observed_at DESC,x.id DESC LIMIT 1) ORDER BY o.observed_at DESC LIMIT 20`).all<{payload_hash:string;payload_json:string}>(),
  ]);
  const snapshots = await Promise.all(latest.results.map(verifyObservation));
  return {version:VERSION,mode:'COLLECT_ONLY',radar:'NOT_CONNECTED',model:'NOT_TRAINED',totals,
    runs:runs.results,latest:snapshots.map(s => ({race_id:s.race_id,edition:s.edition,observed_at:s.observed_at,
      start_at:s.start_at,selection8:s.selection8,eligible:s.eligible,reasons:s.reasons,proposal:proposalState(s,new Date().toISOString())}))};
}
function dashboard(): Response {
  const nonce = crypto.randomUUID();
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Elite Turf — Atelier des bases</title><style nonce="${nonce}">
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101b21;color:#e9f2ef}body{max-width:1080px;margin:40px auto;padding:0 20px}h1{font-size:32px;margin-bottom:8px}.muted{color:#a9bcb5}header{border-bottom:1px solid #31443e;padding-bottom:24px}main{display:grid;gap:20px;margin-top:24px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card,section{background:#192a30;border:1px solid #31443e;border-radius:12px;padding:20px}.value{font-size:30px;color:#9bd8b1}button,a{color:#b7e9c6}button{background:#244e3b;border:1px solid #4e805e;padding:12px;border-radius:6px;cursor:pointer}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:12px 6px;border-bottom:1px solid #31443e}pre{white-space:pre-wrap;font-size:13px}.good{color:#9bd8b1}.warn{color:#f1c887}@media(max-width:650px){.cards{grid-template-columns:1fr}.wide{overflow-x:auto}}
</style><header><p class="muted">ELITE TURF · ESPACE PRIVÉ</p><h1>Atelier des bases Quinté+</h1><p>Phase 1 — Collecte indépendante</p><p class="muted">Moteur et Marché observés en lecture seule. Radar : branchement ultérieur.</p></header>
<main><div class="cards"><div class="card">Photographies conservées<div id="observations" class="value">—</div></div><div class="card">Photographies admissibles<div id="eligible" class="value">—</div></div><div class="card">Courses distinctes admissibles<div id="courses" class="value">—</div></div></div>
<section><h2>Sélection des bases</h2><p class="warn">Aucun modèle validé : aucune base n’est encore recommandée.</p><p class="muted">Les observations serviront à apprendre puis à évaluer la présence simultanée de trois ou quatre chevaux parmi les cinq premiers.</p><button id="collect">Actualiser la collecte</button> <button id="refresh">Recharger l’état</button><p id="message" role="status"></p><a id="export">Télécharger les observations du jour</a></section>
<section class="wide"><h2>Dernière observation par course</h2><table><thead><tr><th>Course</th><th>Édition / réception UTC</th><th>Les huit du Moteur</th><th>Qualification</th></tr></thead><tbody id="races"></tbody></table></section>
<section><h2>Passages du collecteur</h2><pre id="runs">Chargement…</pre><p class="muted">Ce service possède son stockage et son exécution. Il ne pilote pas les moteurs existants.</p></section></main>
<script nonce="${nonce}">
const byId=id=>document.getElementById(id);
async function refresh(){try{const r=await fetch('/api/status');if(!r.ok)throw Error('Accès indisponible');const d=await r.json();for(const [id,key]of [['observations','observations'],['eligible','eligible'],['courses','qualified_races']])byId(id).textContent=d.totals[key]||0;byId('races').replaceChildren();for(const s of d.latest){const tr=document.createElement('tr');for(const text of [s.race_id,s.edition+' / '+s.observed_at,s.selection8.join(' · '),s.eligible?'Admissible':s.reasons.join(', ')]){const td=document.createElement('td');td.textContent=text;tr.append(td)}byId('races').append(tr)}byId('runs').textContent=d.runs.map(r=>r.started_at+' '+r.status+' '+r.details_json).join('\n');byId('export').href='/api/export?date='+new Date().toISOString().slice(0,10)}catch(e){byId('message').textContent=e.message}}
byId('collect').onclick=async()=>{byId('collect').disabled=true;byId('message').textContent='Lecture des sources…';try{const r=await fetch('/api/collect',{method:'POST'});const d=await r.json();byId('message').textContent='État : '+(d.status||d.error);await refresh()}catch{byId('message').textContent='Collecte indisponible'}finally{byId('collect').disabled=false}};byId('refresh').onclick=refresh;void refresh();
</script></html>`;
  return new Response(html,{headers:{...secureHeaders,'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`}});
}

export default {
  async fetch(request,env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({service:'elite-turf-bases-independent',version:VERSION,mode:'COLLECT_ONLY'});
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return json({error:'PRIVATE_ACCESS_NOT_CONFIGURED'},503);
    if (!await authenticated(request,env.ADMIN_TOKEN)) return new Response('Accès privé. Identifiant : elite.',{
      status:401,headers:{...secureHeaders,'WWW-Authenticate':'Basic realm="Elite Turf Bases", charset="UTF-8"'}});
    try {
      if (request.method === 'GET' && url.pathname === '/') return dashboard();
      if (request.method === 'GET' && url.pathname === '/api/status') return json(await overview(env.DB));
      if (request.method === 'POST' && url.pathname === '/api/collect') {
        const origin=request.headers.get('origin');
        if (origin && origin !== url.origin) return json({error:'ORIGIN_REFUSED'},403);
        return json(await collect(env.DB,String(env.COLLECTION_ENABLED)==='true'));
      }
      if (request.method === 'GET' && url.pathname === '/api/export') {
        const date=url.searchParams.get('date') ?? new Date().toISOString().slice(0,10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({error:'INVALID_DATE'},400);
        const rows=await env.DB.prepare('SELECT payload_hash,payload_json FROM observations WHERE race_date=? ORDER BY observed_at LIMIT 1001').bind(date).all<{payload_hash:string;payload_json:string}>();
        if(rows.results.length>1000) return json({error:'EXPORT_LIMIT_REQUIRES_OFFLINE_BACKUP'},413);
        const observations:Snapshot[]=await Promise.all(rows.results.map(verifyObservation));
        const results=await env.DB.prepare(`SELECT observed_at,status,payload_hash,payload_json FROM results WHERE race_id IN (SELECT DISTINCT race_id FROM observations WHERE race_date=?) ORDER BY observed_at`).bind(date).all();
        return json({schema:'elite-bases-export-v1',date,observations,results:results.results,
          warning:'Observations chronologiques, pas un jeu entrainement valide. Une course ne doit pas etre dupliquee entre apprentissage et validation.'});
      }
      return json({error:'NOT_FOUND'},404);
    } catch {
      console.error(canonical({event:'request_failed',path:url.pathname}));
      return json({error:'SERVICE_ERROR'},500);
    }
  },
  async scheduled(_controller,env,ctx): Promise<void> {
    ctx.waitUntil(collect(env.DB,String(env.COLLECTION_ENABLED)==='true').then(report=>{
      if(report.status==='ERROR') throw new Error('COLLECTION_FAILED');
    }));
  },
} satisfies ExportedHandler<Env>;
