export function dashboard(secureHeaders:Record<string,string>):Response {
  const nonce=crypto.randomUUID();
  const html=String.raw`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Elite Turf — Atelier des bases</title><style nonce="${nonce}">
:root {
  color-scheme: light;
  --bg: #f8fafc;
  --card: #ffffff;
  --card-hover: #f1f5f9;
  --border: #e2e8f0;
  --line: #e2e8f0;
  --text: #0f172a;
  --muted: #64748b;
  --primary: #4f46e5;
  --primary-hover: #4338ca;
  --emerald: #059669;
  --emerald-bg: #ecfdf5;
  --emerald-border: #a7f3d0;
  --amber: #d97706;
  --amber-bg: #fffbeb;
  --amber-border: #fde68a;
  --rose: #e11d48;
  --rose-bg: #fff1f2;
  --rose-border: #fecdd3;
  --cyan: #0284c7;
  --cyan-bg: #f0f9ff;
  --cyan-border: #bae6fd;
}
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; }
body { background: var(--bg); color: var(--text); line-height: 1.5; padding: 32px 18px; max-width: 1160px; margin: 0 auto; }

/* En-tête */
header { border-bottom: 1px solid var(--border); padding-bottom: 24px; margin-bottom: 24px; }
.badge-tag {
  display: inline-flex; align-items: center; gap: 6px;
  background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;
  border-radius: 9999px; padding: 3px 12px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--primary); }
header h1 {
  font-size: 2.2rem; font-weight: 800; letter-spacing: -0.5px;
  background: linear-gradient(135deg, #1e1b4b, #4338ca);
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
  padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.card:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: 0 4px 12px rgba(79, 70, 229, 0.08); }
.card .label { font-size: 0.78rem; text-transform: uppercase; color: var(--muted); font-weight: 700; letter-spacing: 0.5px; }
.card .value { font-size: 2rem; font-weight: 800; color: #0f172a; margin-top: 4px; }

/* Sections */
section {
  background: var(--card); border: 1px solid var(--border); border-radius: 14px;
  padding: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
section h2 { font-size: 1.25rem; font-weight: 700; color: #0f172a; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
section h3 { font-size: 1.05rem; font-weight: 600; color: #1e293b; margin: 20px 0 10px; }

/* Course du moment */
.hero-bases { border-left: 4px solid var(--primary); }
.proposal {
  background: #f8fafc; border: 1px solid var(--border); border-radius: 10px;
  padding: 18px; margin: 16px 0;
}
.proposal .race-name { font-size: 1.2rem; font-weight: 800; color: #0f172a; margin-bottom: 10px; }
.bases-highlight { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
.tag-label { font-size: 0.88rem; font-weight: 700; color: var(--muted); text-transform: uppercase; }

/* Boutons */
.btn-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; align-items: center; }
button {
  background: var(--primary); border: 1px solid var(--primary-hover); color: #fff;
  font-weight: 600; font-size: 0.88rem; padding: 10px 18px; border-radius: 8px;
  cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.15s ease;
}
button:hover { background: var(--primary-hover); transform: translateY(-1px); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
a { color: var(--primary); text-decoration: none; font-size: 0.88rem; font-weight: 600; transition: color 0.15s; }
a:hover { color: var(--primary-hover); text-decoration: underline; }

/* Onglets */
.tabs-bar {
  display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border);
  padding-bottom: 12px; margin-bottom: 20px;
}
.tab-btn {
  background: #f8fafc; border: 1px solid var(--border); color: var(--muted);
  padding: 8px 16px; border-radius: 8px; font-size: 0.86rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.tab-btn:hover { background: #f1f5f9; color: #0f172a; }
.tab-btn.active {
  background: var(--primary); border-color: var(--primary-hover); color: #fff;
  box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);
}
.tab-pane { display: none; }
.tab-pane.active { display: block; }

/* Barre d'outils et recherche */
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin: 14px 0 16px; }
.search-input {
  flex: 1; min-width: 250px; background: #fff; border: 1px solid #cbd5e1;
  border-radius: 8px; color: var(--text); padding: 10px 14px; font-size: 0.9rem;
  outline: none; transition: border-color 0.15s, box-shadow 0.15s;
}
.search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15); }
.view-switch { display: flex; gap: 6px; }
.view-btn {
  background: #f8fafc; border: 1px solid var(--border); color: var(--muted);
  font-size: 0.78rem; font-weight: 600; padding: 6px 12px; border-radius: 6px; cursor: pointer;
}
.view-btn.active { background: #eef2ff; border-color: var(--primary); color: var(--primary); }

/* CARTES PAR COURSE (TIMELINE SYNTHÉTIQUE) */
.race-group-card {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  margin-bottom: 18px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.race-group-header {
  padding: 14px 18px; background: #f8fafc; border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;
}
.race-title-box { display: flex; flex-direction: column; gap: 3px; }
.race-title-text { font-size: 1.15rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px; }
.race-date-pill {
  font-size: 0.75rem; font-weight: 600; color: #4338ca;
  background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 2px 8px;
}
.arrival-row {
  display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--muted); margin-top: 4px;
}
.timeline-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;
  padding: 16px 18px; background: #fcfcfd;
}
.edition-box {
  background: #fff; border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}
.edition-box-header { display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; }
.edition-badge { font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; }
.time-tag { color: var(--muted); font-size: 0.78rem; font-family: monospace; }
.bases-pills-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0; }

/* Pastilles numéros */
.num-pill {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 28px; height: 28px; padding: 0 6px; border-radius: 6px;
  font-weight: 800; font-family: monospace; font-size: 0.88rem;
  background: #f8fafc; border: 1px solid #cbd5e1; color: #0f172a;
}
.num-pill.hit {
  background: var(--emerald-bg); border-color: #10b981; color: var(--emerald);
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.2);
}
.num-pill.miss { background: #f1f5f9; border-color: var(--border); color: #94a3b8; }
.arrival-pill {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 4px; font-weight: 700; font-family: monospace; font-size: 0.8rem;
  background: #eef2ff; border: 1px solid #c7d2fe; color: #3730a3;
}

/* Badges de verdict */
.badge {
  display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 6px;
  font-size: 0.78rem; font-weight: 700; white-space: nowrap; margin: 1px 0;
}
.badge-ok { background: var(--emerald-bg); color: var(--emerald); border: 1px solid var(--emerald-border); }
.badge-placed { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-border); }
.badge-ko { background: var(--rose-bg); color: var(--rose); border: 1px solid var(--rose-border); }
.badge-pending { background: var(--cyan-bg); color: var(--cyan); border: 1px solid var(--cyan-border); }
.badge-warn { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-border); }
.badge-muted { background: #f1f5f9; color: #475569; border: 1px solid var(--border); }

/* Tableaux */
.wide { overflow-x: auto; }
table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.88rem; margin-top: 12px; }
th {
  background: #f8fafc; color: #475569; font-weight: 700; font-size: 0.78rem;
  text-transform: uppercase; letter-spacing: 0.4px; padding: 10px 12px; border-bottom: 1px solid var(--border);
  text-align: left;
}
td {
  padding: 12px; border-bottom: 1px solid #f1f5f9;
  color: #0f172a; background: var(--card);
}
tr:hover td { background: var(--card-hover); }

pre {
  background: #0f172a; border: 1px solid #1e293b; border-radius: 8px;
  padding: 14px; white-space: pre-wrap; font-size: 0.82rem; color: #e2e8f0;
}

@media(max-width: 650px) {
  body { padding: 20px 12px; }
  header h1 { font-size: 1.8rem; }
  .cards { grid-template-columns: 1fr; }
  .timeline-grid { grid-template-columns: 1fr; }
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
    <p id="message" role="status" style="margin-top:10px;font-size:0.88rem;color:var(--primary);font-weight:600"></p>
  </section>

  <!-- Historique & Bilans Analytiques -->
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
      <p class="muted">Historique des 40 dernières références. Une arrivée définitive et des non-partants vérifiés sont nécessaires pour compter un résultat.</p>
      
      <div class="toolbar">
        <input type="search" id="history-filter" class="search-input" placeholder="Filtrer par hippodrome, réunion ou date (ex: Vincennes, R1, 26/09)...">
        <div class="view-switch">
          <button id="btn-view-cards" class="view-btn active">Vue par Course (Timeline)</button>
          <button id="btn-view-table" class="view-btn">Vue Tableau (40 lignes)</button>
        </div>
      </div>

      <!-- Conteneur Vue Cartes (Regroupement par course) -->
      <div id="grouped-races"></div>

      <!-- Conteneur Vue Tableau -->
      <div id="table-view-container" style="display:none">
        <table>
          <thead>
            <tr>
              <th>Course / Date</th>
              <th>Édition & Heure</th>
              <th>Bases retenues</th>
              <th>Arrivée Quinté+</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody id="edition-history"></tbody>
        </table>
      </div>
    </div>

    <!-- Onglet 2 : Bilan par édition -->
    <div id="tab-editions" class="tab-pane wide">
      <p class="muted">Pour ce bilan, la première décision enregistrée par course et par édition est figée, même en cas d’abstention.</p>
      <p id="edition-counts" style="margin:10px 0;font-weight:700;color:var(--primary)"></p>
      <table>
        <thead>
          <tr>
            <th>Édition</th>
            <th>Références</th>
            <th>Trios complets (3/3)</th>
            <th>Quatuors complets (4/4)</th>
            <th>Abstentions</th>
            <th>En cours / exclues</th>
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
      <p id="scorecard" style="margin-bottom:8px;font-weight:700;color:var(--primary)"></p>
      <p class="muted">Dernière proposition disponible à 5 minutes du départ (observation &lt; 12 min).</p>
      <table>
        <thead>
          <tr>
            <th>Course</th>
            <th>Bases de référence</th>
            <th>Arrivée Quinté+</th>
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
            <th>Édition / Réception</th>
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

function parseRaceId(raceId) {
  const parts = (raceId || '').split('_');
  if (parts.length >= 3) {
    const rc = parts[0];
    const dStr = parts;
    const dateFormatted = dStr.length === 8 ? dStr.slice(0, 2) + '/' + dStr.slice(2, 4) + '/' + dStr.slice(4) : dStr;
    const hippoRaw = parts.slice(2).join(' ');
    const hippo = hippoRaw.charAt(0).toUpperCase() + hippoRaw.slice(1).toLowerCase();
    return { title: hippo + ' · ' + rc, date: dateFormatted, full: raceId };
  }
  return { title: raceId || '—', date: '', full: raceId || '' };
}

function formatMinutes(min) {
  if (min === null || min === undefined || isNaN(min)) return '';
  const m = Math.round(Number(min));
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return 'T − ' + h + 'h' + (rem < 10 ? '0' : '') + rem;
  }
  return 'T − ' + m + ' min';
}

function getTop5Arrival(arrival) {
  if (!arrival || !arrival.length) return [];
  const out = [];
  for (let i = 0; i < Math.min(arrival.length, 5); i++) {
    const group = arrival[i];
    if (Array.isArray(group)) { for (const h of group) out.push(Number(h)); }
    else { out.push(Number(group)); }
  }
  return out;
}

function makeBadge(text, cls) {
  const s = document.createElement('span');
  s.className = 'badge ' + (cls || '');
  s.textContent = text;
  return s;
}

function renderPills(bases, top5, hasArrived) {
  const wrap = document.createElement('div');
  wrap.className = 'bases-pills-row';
  if (!bases || !bases.length) {
    wrap.textContent = 'Abstention';
    wrap.className += ' muted';
    return wrap;
  }
  for (const b of bases) {
    const num = Number(b);
    const pill = document.createElement('span');
    pill.className = 'num-pill';
    if (!hasArrived) {
      pill.textContent = num;
    } else if (top5.includes(num)) {
      pill.className += ' hit';
      pill.textContent = num + ' ✓';
    } else {
      pill.className += ' miss';
      pill.textContent = num;
    }
    wrap.appendChild(pill);
  }
  return wrap;
}

function formatOutcome(status, bases3, top5, hasArrived) {
  if (!hasArrived || status !== 'SCORED') {
    const cls = status === 'AWAITING_DEFINITIVE_RESULT' ? 'badge-pending' : (status === 'ABSTAIN' ? 'badge-warn' : 'badge-muted');
    return makeBadge(label(status), cls);
  }
  const hits = (bases3 || []).filter(b => top5.includes(Number(b)));
  const n = hits.length;
  if (n === 3) return makeBadge('3/3 Réussi 🎯', 'badge-ok');
  if (n === 2) return makeBadge('2/3 à l’arrivée (67%)', 'badge-placed');
  if (n === 1) return makeBadge('1/3 à l’arrivée', 'badge-ko');
  return makeBadge('0/3 manqué', 'badge-ko');
}

function row(id, values) {
  const tr = document.createElement('tr');
  for (const v of values) {
    const td = document.createElement('td');
    if (v instanceof Node) { td.appendChild(v); }
    else { td.textContent = v; }
    tr.append(td);
  }
  byId(id).append(tr);
}

function paragraph(parent, text, cls) {
  const p = document.createElement('p');
  p.textContent = text;
  if (cls) p.className = cls;
  parent.append(p);
}

const editionName = x => x === 'T_MATIN' ? 'Matin' : x;
const ratio = x => x.scored ? x.success + ' / ' + x.scored + ' (' + Math.round(100 * x.success / x.scored) + ' %)' : '— (0 course)';

function renderGroupedRaces(rows) {
  const container = byId('grouped-races');
  container.replaceChildren();
  if (!rows || !rows.length) {
    container.innerHTML = '<p class="muted">Aucune course enregistrée.</p>';
    return;
  }

  const byRace = new Map();
  for (const r of rows) {
    if (!byRace.has(r.race_id)) byRace.set(r.race_id, []);
    byRace.get(r.race_id).push(r);
  }

  for (const [raceId, editions] of byRace.entries()) {
    const info = parseRaceId(raceId);
    const top5 = getTop5Arrival(editions[0].arrival);
    const hasArrived = top5.length > 0;

    const card = document.createElement('div');
    card.className = 'race-group-card';
    card.dataset.search = (info.title + ' ' + info.date + ' ' + raceId).toLowerCase();

    // En-tête de la course
    const head = document.createElement('div');
    head.className = 'race-group-header';

    const titleBox = document.createElement('div');
    titleBox.className = 'race-title-box';
    titleBox.innerHTML = '<div class="race-title-text">' + info.title + ' <span class="race-date-pill">' + (info.date || 'Aujourd’hui') + '</span></div>';

    const arrRow = document.createElement('div');
    arrRow.className = 'arrival-row';
    if (hasArrived) {
      arrRow.innerHTML = '<span>Arrivée officielle Top 5 :</span> ' + top5.map(h => '<span class="arrival-pill">' + h + '</span>').join(' ');
    } else {
      arrRow.innerHTML = '<span class="badge badge-pending">Arrivée en attente</span>';
    }
    titleBox.appendChild(arrRow);
    head.appendChild(titleBox);

    // Meilleur score
    let bestHits = 0;
    if (hasArrived) {
      for (const ed of editions) {
        const hits = (ed.bases3 || []).filter(b => top5.includes(Number(b))).length;
        if (hits > bestHits) bestHits = hits;
      }
      const overallBadge = bestHits === 3 ? makeBadge('3/3 Réussi 🎯', 'badge-ok') :
                          bestHits === 2 ? makeBadge('2/3 à l’arrivée (67%)', 'badge-placed') :
                          makeBadge(bestHits + '/3', 'badge-ko');
      head.appendChild(overallBadge);
    }
    card.appendChild(head);

    // Timeline des éditions
    const grid = document.createElement('div');
    grid.className = 'timeline-grid';

    for (const ed of editions) {
      const edBox = document.createElement('div');
      edBox.className = 'edition-box';

      const timeStr = formatMinutes(ed.minutes_before_start);
      edBox.innerHTML = '<div class="edition-box-header"><span class="edition-badge">' + editionName(ed.edition) + '</span><span class="time-tag">' + timeStr + '</span></div>';

      edBox.appendChild(renderPills(ed.bases3, top5, hasArrived));

      const verdict = formatOutcome(ed.outcome.status, ed.bases3, top5, hasArrived);
      edBox.appendChild(verdict);

      grid.appendChild(edBox);
    }

    card.appendChild(grid);
    container.appendChild(card);
  }
}

function renderEditions(d) {
  for (const id of ['edition-summary', 'edition-history', 'edition-comparison']) byId(id).replaceChildren();
  if (!d) { byId('edition-counts').textContent = 'Bilan des éditions indisponible.'; return; }

  byId('edition-counts').textContent = 'Du ' + d.range.from + ' au ' + d.range.to + ' : ' + d.archive.reduce((n, r) => n + r.decisions, 0) + ' décisions archivées ; ' + d.total_references + ' références.';

  for (const s of d.summary) {
    row('edition-summary', [editionName(s.edition), s.references, ratio(s.triples), ratio(s.quartets), s.abstentions, s.pending + ' / ' + s.excluded]);
  }

  byId('edition-common').textContent = d.common.triples.race_ids.length + ' course(s) avec un trio évaluable dans chacune des quatre éditions.';
  for (const s of d.common.triples.summary) {
    const q = d.common.quartets.summary.find(x => x.edition === s.edition);
    row('edition-comparison', [editionName(s.edition), ratio(s.triples), ratio(q.quartets)]);
  }

  renderGroupedRaces(d.rows);

  for (const r of d.rows) {
    const info = parseRaceId(r.race_id);
    const top5 = getTop5Arrival(r.arrival);
    const hasArrived = top5.length > 0;

    const timeLabel = (r.recorded_at ? r.recorded_at.slice(11, 16) + ' UTC' : '') + ' (' + formatMinutes(r.minutes_before_start) + ')';

    row('edition-history', [
      info.title + (info.date ? ' · ' + info.date : ''),
      editionName(r.edition) + ' · ' + timeLabel,
      renderPills(r.bases3, top5, hasArrived),
      hasArrived ? top5.join(' · ') : 'En attente',
      formatOutcome(r.outcome.status, r.bases3, top5, hasArrived)
    ]);
  }
}

async function refresh() {
  try {
    const r = await fetch('/api/status');
    if (!r.ok) throw Error('Accès indisponible');
    const d = await r.json();

    for (const [id, key] of [['observations', 'observations'], ['eligible', 'eligible'], ['courses', 'qualified_races']]) {
      byId(id).textContent = d.totals[key] || 0;
    }
    byId('model').textContent = d.model ? 'Modèle pilote entraîné sur ' + d.model.training_races + ' courses. Version ' + d.model.id + '.' : 'Sélecteur désactivé.';
    renderEditions(d.editions);

    byId('races').replaceChildren();
    byId('proposals').replaceChildren();
    let future = 0;

    for (const s of d.latest) {
      const info = parseRaceId(s.race_id);
      row('races', [info.title + (info.date ? ' (' + info.date + ')' : ''), s.edition + ' / ' + s.observed_at.slice(11, 19), s.selection8.join(' · '), s.eligible ? 'Admissible' : s.reasons.join(', ')]);

      if (Date.parse(s.start_at) > Date.now()) {
        future++;
        const box = document.createElement('div');
        box.className = 'proposal';
        box.innerHTML = '<div class="race-name">' + info.title + ' <span class="race-date-pill">' + (info.date || 'Aujourd’hui') + '</span></div>';
        
        const p = s.proposal;
        if (p.status === 'EXPERIMENTAL') {
          const bRow = document.createElement('div');
          bRow.className = 'bases-highlight';
          bRow.innerHTML = '<span class="tag-label">3 bases retenues :</span> ' + p.bases3.map(n => '<span class="num-pill hit">' + n + '</span>').join(' ');
          box.appendChild(bRow);

          if (p.bases4 && p.bases4.length) {
            const b4 = document.createElement('div');
            b4.className = 'bases-highlight';
            b4.innerHTML = '<span class="tag-label">4 bases :</span> ' + p.bases4.map(n => '<span class="num-pill">' + n + '</span>').join(' ');
            box.appendChild(b4);
          } else {
            paragraph(box, 'Quatrième base non retenue.', 'muted');
          }
          paragraph(box, 'Calcul : ' + p.created_at.slice(11, 19) + ' UTC · valable jusqu’à ' + p.valid_until.slice(11, 19) + ' UTC', 'muted');
        } else {
          paragraph(box, label(p.reason), 'warn');
        }
        byId('proposals').append(box);
      }
    }
    if (!future) paragraph(byId('proposals'), 'Aucune course à venir dans les dernières observations.');

    const card = d.prospective.summary;
    byId('scorecard').textContent = 'Sur les 30 derniers jours : ' + card.triples_success + ' / ' + card.triples_scored + ' trios complets. ' + card.abstentions + ' abstention(s) à T−5. Comparatifs : Moteur ' + (card.moteur3_success || 0) + ' / ' + (card.moteur3_scored || 0) + ' ; Marché ' + (card.market3_success || 0) + ' / ' + (card.market3_scored || 0) + '.';

    byId('history').replaceChildren();
    for (const h of d.prospective.history) {
      const p = h.reference;
      const info = parseRaceId(h.race_id);
      const top5 = h.result ? (h.result.ranking || []).slice(0, 5).map(g => Array.isArray(g) ? g[0] : g) : [];
      const hasArrived = top5.length > 0;
      const bases = p && p.bases3 ? p.bases3 : [];

      row('history', [
        info.title + (info.date ? ' (' + info.date + ')' : ''),
        renderPills(bases, top5, hasArrived),
        hasArrived ? top5.join(' · ') : 'En attente',
        formatOutcome(h.outcome.status, bases, top5, hasArrived)
      ]);
    }

    byId('runs').textContent = d.runs.map(r => {
      const x = JSON.parse(r.details_json);
      return r.started_at + ' ' + r.status + ' — ' + (x.observations || 0) + ' obs, ' + (x.proposals || 0) + ' déc, ' + (x.results || 0) + ' arrivées' + (x.errors && x.errors.length ? ' · ' + x.errors.join(', ') : '');
    }).join('\n');

    byId('export').href = '/api/export?date=' + new Date().toISOString().slice(0, 10);
  } catch (e) {
    byId('message').textContent = e.message;
    byId('proposals').replaceChildren();
    paragraph(byId('proposals'), 'État indisponible : recharger avant utilisation.', 'warn');
  }
}

// Gestion des onglets
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = byId(btn.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// Bascule vue Cartes / vue Tableau
byId('btn-view-cards').onclick = () => {
  byId('btn-view-cards').classList.add('active');
  byId('btn-view-table').classList.remove('active');
  byId('grouped-races').style.display = 'block';
  byId('table-view-container').style.display = 'none';
};
byId('btn-view-table').onclick = () => {
  byId('btn-view-table').classList.add('active');
  byId('btn-view-cards').classList.remove('active');
  byId('grouped-races').style.display = 'none';
  byId('table-view-container').style.display = 'block';
};

// Filtre instantané
const filterInput = byId('history-filter');
if (filterInput) {
  filterInput.addEventListener('input', () => {
    const q = filterInput.value.toLowerCase().trim();
    document.querySelectorAll('.race-group-card').forEach(c => {
      c.style.display = (!q || (c.dataset.search || '').includes(q)) ? '' : 'none';
    });
    document.querySelectorAll('#edition-history tr').forEach(tr => {
      tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  });
}

byId('collect').onclick = async () => {
  byId('collect').disabled = true; byId('message').textContent = 'Lecture des sources et calcul…';
  try {
    const r = await fetch('/api/collect', { method: 'POST' });
    const d = await r.json();
    byId('message').textContent = d.status === 'COOLDOWN' ? 'Une collecte a eu lieu récemment ; la prochaine est automatique.' : 'État : ' + (d.status || d.error);
    await refresh();
  } catch { byId('message').textContent = 'Collecte indisponible'; }
  finally { byId('collect').disabled = false; }
};
byId('refresh').onclick = refresh;
void refresh();
setInterval(refresh, 60000);
</script></body></html>`;
  return new Response(html,{headers:{...secureHeaders,'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`}});
}
