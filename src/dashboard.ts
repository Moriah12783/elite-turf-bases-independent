export function dashboard(secureHeaders:Record<string,string>):Response {
  const nonce=crypto.randomUUID();
  const html=String.raw`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Elite Turf — Atelier des bases</title><style nonce="${nonce}">
:root {
  color-scheme: dark;
  --bg: #09080f;
  --card: #13111d;
  --card-hover: #1b172a;
  --border: #262038;
  --line: #262038;
  --text: #f5f3ff;
  --muted: #9e95bd;
  --violet: #a855f7;
  --violet-glow: rgba(168, 85, 247, 0.2);
  --fuchsia: #f43f5e;
  --pink: #ec4899;
  --cyan: #06b6d4;
  --emerald: #10b981;
  --amber: #fbbf24;
}
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
body { background: var(--bg); color: var(--text); line-height: 1.5; padding: 32px 18px; max-width: 1140px; margin: 0 auto; }

/* En-tête */
header { border-bottom: 1px solid var(--border); padding-bottom: 24px; margin-bottom: 24px; }
.badge-tag {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(168, 85, 247, 0.12); color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 9999px;
  padding: 3px 12px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--fuchsia); box-shadow: 0 0 8px var(--fuchsia); }
header h1 {
  font-size: 2.2rem; font-weight: 800; letter-spacing: -0.5px;
  background: linear-gradient(135deg, #c084fc, #f43f5e);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  margin: 10px 0 6px;
}
header p { color: var(--text); font-size: 0.95rem; }
.muted { color: var(--muted); font-size: 0.88rem; }
.warn { color: var(--amber); font-size: 0.88rem; }

/* Grille KPI */
main { display: grid; gap: 24px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.card {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 18px 20px; transition: transform 0.15s, border-color 0.15s;
}
.card:hover { transform: translateY(-2px); border-color: rgba(168, 85, 247, 0.4); }
.card .label { font-size: 0.8rem; text-transform: uppercase; color: var(--muted); font-weight: 600; letter-spacing: 0.4px; }
.card .value { font-size: 1.9rem; font-weight: 800; color: #fff; margin-top: 4px; }

/* Sections */
section {
  background: var(--card); border: 1px solid var(--border); border-radius: 14px;
  padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);
}
section h2 { font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
section h3 { font-size: 1.05rem; font-weight: 600; color: #e9d5ff; margin: 20px 0 10px; }

/* Bases du moment */
.hero-bases { border-left: 4px solid var(--violet); }
.proposal {
  background: #181524; border: 1px solid #312a47; border-radius: 10px;
  padding: 16px; margin: 16px 0;
}
.proposal .race-name { font-size: 1.15rem; font-weight: 700; color: #fff; margin-bottom: 8px; }
.bases-highlight { font-size: 1.3rem; font-weight: 800; color: #e9d5ff; margin: 6px 0; letter-spacing: 0.05em; }

/* Boutons & Liens */
.btn-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; align-items: center; }
button {
  background: linear-gradient(135deg, #7c3aed, #9333ea);
  border: 1px solid rgba(168, 85, 247, 0.5); color: #fff;
  font-weight: 600; font-size: 0.88rem; padding: 10px 18px; border-radius: 8px;
  cursor: pointer; transition: all 0.15s ease;
}
button:hover { background: linear-gradient(135deg, #8b5cf6, #a855f7); transform: translateY(-1px); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
a { color: #c084fc; text-decoration: none; font-size: 0.88rem; transition: color 0.15s; }
a:hover { color: #f43f5e; text-decoration: underline; }

/* Onglets d'Historique */
.tabs-bar {
  display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border);
  padding-bottom: 12px; margin-bottom: 20px;
}
.tab-btn {
  background: #181524; border: 1px solid var(--border); color: var(--muted);
  padding: 8px 16px; border-radius: 8px; font-size: 0.86rem; font-weight: 600; cursor: pointer;
}
.tab-btn.active {
  background: rgba(168, 85, 247, 0.18); border-color: var(--violet); color: #f5f3ff;
}
.tab-pane { display: none; }
.tab-pane.active { display: block; }

/* Recherche & Filtres */
.filter-bar { margin: 14px 0 16px; }
.search-input {
  width: 100%; background: #0c0a14; border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); padding: 10px 14px; font-size: 0.9rem;
  outline: none; transition: border-color 0.15s;
}
.search-input:focus { border-color: var(--violet); box-shadow: 0 0 0 2px var(--violet-glow); }

/* Tableaux */
.wide { overflow-x: auto; }
table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.88rem; margin-top: 12px; }
th {
  background: #181524; color: var(--muted); font-weight: 600; font-size: 0.78rem;
  text-transform: uppercase; letter-spacing: 0.4px; padding: 10px 12px; border-bottom: 1px solid var(--border);
  text-align: left;
}
td {
  padding: 12px; border-bottom: 1px solid rgba(38, 32, 56, 0.6);
  color: var(--text); background: var(--card);
}
tr:hover td { background: var(--card-hover); }

/* Badges */
.badge {
  display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 6px;
  font-size: 0.78rem; font-weight: 700; white-space: nowrap; margin: 2px 0;
}
.badge-ok { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
.badge-ko { background: rgba(244, 63, 94, 0.15); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.3); }
.badge-warn { background: rgba(251, 191, 36, 0.15); color: #fcd34d; border: 1px solid rgba(251, 191, 36, 0.3); }
.badge-pending { background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3); }
.badge-muted { background: rgba(158, 149, 189, 0.15); color: var(--muted); border: 1px solid rgba(158, 149, 189, 0.3); }

/* Pastilles numéros */
.num-pill {
  display: inline-block; background: #1c182c; border: 1px solid #3d335a;
  border-radius: 6px; padding: 2px 7px; font-weight: 700; color: #fff;
  font-family: monospace; font-size: 0.9rem; margin: 1px;
}
pre {
  background: #0c0a14; border: 1px solid var(--border); border-radius: 8px;
  padding: 14px; white-space: pre-wrap; font-size: 0.82rem; color: #cbd5e1;
}

@media(max-width: 650px) {
  body { padding: 20px 12px; }
  header h1 { font-size: 1.8rem; }
  .cards { grid-template-columns: 1fr; }
}
</style></head>
<body>

<header>
  <div class="badge-tag"><span class="dot"></span> Espace Privé · R&D</div>
  <h1>Atelier des bases Quinté+</h1>
  <p>Phase 2 — Sélecteur expérimental</p>
  <p class="muted">Moteur et Marché observés en lecture seule. Radar : branchement ultérieur.</p>
</header>

<main>
  <!-- KPI Cartes -->
  <div class="cards">
    <div class="card"><div class="label">Photographies conservées</div><div id="observations" class="value">—</div></div>
    <div class="card"><div class="label">Photographies admissibles</div><div id="eligible" class="value">—</div></div>
    <div class="card"><div class="label">Courses distinctes admissibles</div><div id="courses" class="value">—</div></div>
  </div>

  <!-- Course du jour -->
  <section class="hero-bases">
    <h2>🎯 Les bases du moment</h2>
    <p class="warn">Essai privé : performances encore à confirmer. Ces bases ne sont pas validées pour les abonnés.</p>
    <p id="model" class="muted" style="margin-top:6px"></p>
    <div id="proposals" style="margin:12px 0">Chargement…</div>
    <p class="muted">Trois chevaux parmi les huit du Moteur. Une quatrième base apparaît seulement si les critères supplémentaires sont réunis.</p>
    <div class="btn-group">
      <button id="collect">Actualiser la collecte</button>
      <button id="refresh">Recharger l’état</button>
      <a id="export">Télécharger les observations et bases du jour</a>
    </div>
    <p id="message" role="status" style="margin-top:10px;font-size:0.88rem;color:#c084fc"></p>
  </section>

  <!-- Onglets d'Historique et de Bilans -->
  <section>
    <h2>📊 Historique & Bilans Analytiques</h2>
    
    <div class="tabs-bar">
      <button class="tab-btn active" data-tab="tab-ref">Références récentes (40)</button>
      <button class="tab-btn" data-tab="tab-editions">Bilan par édition</button>
      <button class="tab-btn" data-tab="tab-t5">Bilan à T−5</button>
      <button class="tab-btn" data-tab="tab-collector">Journal du collecteur</button>
    </div>

    <!-- Onglet 1 : Références récentes (40) -->
    <div id="tab-ref" class="tab-pane active wide">
      <p class="muted">Les 40 références les plus récentes. Une arrivée définitive et des non-partants vérifiés sont nécessaires pour compter un résultat.</p>
      <div class="filter-bar">
        <input type="search" id="history-filter" class="search-input" placeholder="Filtrer par course, réunion, hippodrome (ex: R1, Vincennes, 2026-09)...">
      </div>
      <table>
        <thead>
          <tr>
            <th>Course / Édition</th>
            <th>Premier calcul UTC</th>
            <th>Bases 3 / 4</th>
            <th>Arrivée</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody id="edition-history"></tbody>
      </table>
    </div>

    <!-- Onglet 2 : Bilan par édition -->
    <div id="tab-editions" class="tab-pane wide">
      <p class="muted">Pour ce bilan, la première décision enregistrée par course et par édition est figée, même en cas d’abstention.</p>
      <p id="edition-counts" style="margin:10px 0;font-weight:600;color:#c084fc"></p>
      <table>
        <thead>
          <tr>
            <th>Édition</th>
            <th>Références</th>
            <th>Trios complets</th>
            <th>Quatuors complets</th>
            <th>Abstentions</th>
            <th>En attente / exclues</th>
          </tr>
        </thead>
        <tbody id="edition-summary"></tbody>
      </table>

      <h3>Comparaison sur les mêmes courses</h3>
      <p id="edition-common" class="muted"></p>
      <table>
        <thead>
          <tr>
            <th>Édition</th>
            <th>Trios sur courses communes</th>
            <th>Quatuors sur courses communes</th>
          </tr>
        </thead>
        <tbody id="edition-comparison"></tbody>
      </table>
      <div style="margin-top:14px">
        <a href="/api/editions">Exporter le bilan des éditions (JSON)</a>
      </div>
    </div>

    <!-- Onglet 3 : Bilan à T−5 -->
    <div id="tab-t5" class="tab-pane wide">
      <p id="scorecard" style="margin-bottom:8px;font-weight:600;color:#c084fc"></p>
      <p class="muted">Dernière proposition disponible à 5 minutes du départ (observation &lt; 12 min).</p>
      <table>
        <thead>
          <tr>
            <th>Course</th>
            <th>Bases de référence</th>
            <th>Arrivée</th>
            <th>Résultat</th>
          </tr>
        </thead>
        <tbody id="history"></tbody>
      </table>
    </div>

    <!-- Onglet 4 : Collecteur & Observations -->
    <div id="tab-collector" class="tab-pane wide">
      <h3>Dernière observation par course</h3>
      <table>
        <thead>
          <tr>
            <th>Course</th>
            <th>Édition / réception UTC</th>
            <th>Les huit du Moteur</th>
            <th>Qualification</th>
          </tr>
        </thead>
        <tbody id="races"></tbody>
      </table>

      <h3 style="margin-top:24px">Passages récents du collecteur</h3>
      <pre id="runs">Chargement…</pre>
      <p class="muted" style="margin-top:8px">Modèle figé pour mesurer les prochaines courses ; aucun apprentissage automatique en arrière-plan.</p>
    </div>
  </section>
</main>

<script nonce="${nonce}">
const byId=id=>document.getElementById(id);
const labels={CANCELLED:'Course annulée : non comptée',NO_PROPOSAL:'Pas encore de proposition',EXPIRED:'Observation trop ancienne',SOURCE_REPLACED:'Nouvelle observation en attente de calcul',INPUT_NOT_ELIGIBLE:'Données non admissibles',RACE_STARTED_OR_CLOSING:'Course commencée ou départ imminent',NO_REFERENCE:'Pas de proposition admissible à T−5',ABSTAIN:'Abstention',AWAITING_DEFINITIVE_RESULT:'Arrivée définitive attendue',NON_STARTERS_UNVERIFIED:'Non-partants à vérifier',SELECTED_NON_STARTER:'Base non partante : course non comptée',REFERENCE_NOT_FROZEN:'Référence fixée à T−5',TRAINING_LEAKAGE:'Course exclue de la validation'};
const label=x=>labels[x]||x;

function makeBadge(text, cls){
  const span=document.createElement('span');
  span.className='badge '+cls;
  span.textContent=text;
  return span;
}

function formatOutcome(status, all3, all4){
  if(status!=='SCORED'){
    const cls=status==='AWAITING_DEFINITIVE_RESULT'?'badge-pending':(status==='ABSTAIN'?'badge-warn':'badge-muted');
    return makeBadge(label(status), cls);
  }
  const frag=document.createElement('span');
  frag.appendChild(makeBadge(all3?'3/3 réussi ✓':'3/3 incomplet', all3?'badge-ok':'badge-ko'));
  if(all4!==null && all4!==undefined){
    frag.appendChild(document.createTextNode(' '));
    frag.appendChild(makeBadge(all4?'4/4 réussi ✓':'4/4 incomplet', all4?'badge-ok':'badge-ko'));
  }
  return frag;
}

function row(id,values){
  const tr=document.createElement('tr');
  for(const v of values){
    const td=document.createElement('td');
    if(v instanceof Node){ td.appendChild(v); }
    else { td.textContent=v; }
    tr.append(td);
  }
  byId(id).append(tr);
}

function paragraph(parent,text,cls){
  const p=document.createElement('p');
  p.textContent=text;
  if(cls)p.className=cls;
  parent.append(p);
}

const editionName=x=>x==='T_MATIN'?'Matin':x;
const ratio=x=>x.scored?x.success+' / '+x.scored+' ('+Math.round(100*x.success/x.scored)+' %)':'— (0 course évaluée)';

function renderEditions(d){
  for(const id of ['edition-summary','edition-history','edition-comparison'])byId(id).replaceChildren();
  if(!d){byId('edition-counts').textContent='Bilan des éditions indisponible.';return}
  byId('edition-counts').textContent='Du '+d.range.from+' au '+d.range.to+' : '+d.archive.reduce((n,r)=>n+r.decisions,0)+' décisions archivées ; '+d.total_references+' références. '+(d.by_model.length>1?'Plusieurs modèles : consulter leur détail séparé dans l’export.':'');
  for(const s of d.summary)row('edition-summary',[editionName(s.edition),s.references,ratio(s.triples),ratio(s.quartets),s.abstentions,s.pending+' / '+s.excluded]);
  byId('edition-common').textContent=d.common.triples.race_ids.length+' course(s) avec un trio évaluable dans chacune des quatre éditions ; '+d.common.quartets.race_ids.length+' avec un quatuor dans chacune. Les éditions manquantes ne sont pas des échecs.';
  for(const s of d.common.triples.summary){
    const q=d.common.quartets.summary.find(x=>x.edition===s.edition);
    row('edition-comparison',[editionName(s.edition),ratio(s.triples),ratio(q.quartets)]);
  }
  for(const r of d.rows){
    row('edition-history',[
      r.race_id+' / '+editionName(r.edition),
      r.recorded_at+' (T−'+r.minutes_before_start+' min)',
      (r.bases3.join(' · ')||'Abstention')+' / '+(r.bases4.join(' · ')||'—'),
      r.arrival.length?r.arrival.slice(0,5).map(g=>g.join('=')).join(' · '):'En attente',
      formatOutcome(r.outcome.status, r.outcome.all3, r.outcome.all4)
    ]);
  }
}

async function refresh(){try{
  const r=await fetch('/api/status');if(!r.ok)throw Error('Accès indisponible');const d=await r.json();
  for(const [id,key]of [['observations','observations'],['eligible','eligible'],['courses','qualified_races']])byId(id).textContent=d.totals[key]||0;
  byId('model').textContent=d.model?'Modèle pilote entraîné sur '+d.model.training_races+' courses. Version '+d.model.id+'.':'Sélecteur désactivé.';
  renderEditions(d.editions);
  byId('races').replaceChildren();byId('proposals').replaceChildren();let future=0;
  for(const s of d.latest){
    row('races',[s.race_id,s.edition+' / '+s.observed_at,s.selection8.join(' · '),s.eligible?'Admissible':s.reasons.join(', ')]);
    if(Date.parse(s.start_at)>Date.now()){
      future++;const box=document.createElement('div');box.className='proposal';
      const rId=document.createElement('div');rId.className='race-name';rId.textContent=s.race_id;box.append(rId);
      const p=s.proposal;
      if(p.status==='EXPERIMENTAL'){
        paragraph(box,'3 bases : '+p.bases3.join(' · '),'bases-highlight');
        paragraph(box,p.bases4.length?'4 bases : '+p.bases4.join(' · '):'Quatrième base non retenue.','muted');
        paragraph(box,'Calcul : '+p.created_at+' · valable jusqu’à '+p.valid_until+' (UTC)','muted');
      } else paragraph(box,label(p.reason),'warn');
      byId('proposals').append(box);
    }
  }
  if(!future)paragraph(byId('proposals'),'Aucune course à venir dans les dernières observations.');
  const card=d.prospective.summary;
  byId('scorecard').textContent='Sur les 30 derniers jours : '+card.triples_success+' / '+card.triples_scored+' trios complets ; '+card.quartets_success+' / '+card.quartets_scored+' quatuors complets. '+card.abstentions+' abstention(s) à T−5. Comparatifs : Moteur '+(card.moteur3_success||0)+' / '+(card.moteur3_scored||0)+' ; Marché '+(card.market3_success||0)+' / '+(card.market3_scored||0)+'.';
  byId('history').replaceChildren();
  for(const h of d.prospective.history){
    const p=h.reference;
    row('history',[
      h.race_id,
      p&&p.bases3.length?p.bases3.join(' · ')+(p.bases4.length?' / 4 : '+p.bases4.join(' · '):''):'—',
      h.result?h.result.ranking.slice(0,5).map(g=>g.join('=')).join(' · '):'En attente',
      formatOutcome(h.outcome.status, h.outcome.all3, h.outcome.all4)
    ]);
  }
  byId('runs').textContent=d.runs.map(r=>{const x=JSON.parse(r.details_json);return r.started_at+' '+r.status+' — '+(x.observations||0)+' observation(s), '+(x.proposals||0)+' décision(s), '+(x.results||0)+' arrivée(s)'+(x.errors&&x.errors.length?' · '+x.errors.join(', '):'')}).join('\n');
  byId('export').href='/api/export?date='+new Date().toISOString().slice(0,10);
}catch(e){
  byId('message').textContent=e.message;
  byId('proposals').replaceChildren();
  paragraph(byId('proposals'),'État indisponible : recharger avant utilisation.','warn');
}}

// Gestion des onglets
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    const target=byId(btn.dataset.tab);
    if(target)target.classList.add('active');
  });
});

// Filtre instantané sur l'historique
const filterInput=byId('history-filter');
if(filterInput){
  filterInput.addEventListener('input',()=>{
    const q=filterInput.value.toLowerCase().trim();
    document.querySelectorAll('#edition-history tr').forEach(tr=>{
      tr.style.display=(!q||tr.textContent.toLowerCase().includes(q))?'':'none';
    });
  });
}

byId('collect').onclick=async()=>{
  byId('collect').disabled=true;byId('message').textContent='Lecture des sources et calcul…';
  try{
    const r=await fetch('/api/collect',{method:'POST'});const d=await r.json();
    byId('message').textContent=d.status==='COOLDOWN'?'Une collecte a eu lieu récemment ; la prochaine est automatique.':'État : '+(d.status||d.error);
    await refresh();
  }catch{byId('message').textContent='Collecte indisponible'}
  finally{byId('collect').disabled=false}
};
byId('refresh').onclick=refresh;
void refresh();
setInterval(refresh,60000);
</script></body></html>`;
  return new Response(html,{headers:{...secureHeaders,'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`}});
}
