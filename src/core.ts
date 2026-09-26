/** Pure external-source adapters. Never import or run a producer's code. */
export type ObjectData = Record<string, unknown>;
export const VERSION = '0.3.0';
export const PRONO_URL = 'https://prono.elite-turf.fr/';
export const PMU_ROOT = 'https://online.turfinfo.api.pmu.fr/rest/client/7/programme';
export const MAX_BYTES = 12 * 1024 * 1024;
export function object(value: unknown): ObjectData {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectData : {};
}
export function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function str(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const row = object(value);
    return '{' + Object.keys(row).sort().map(k => JSON.stringify(k) + ':' + canonical(row[k])).join(',') + '}';
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('INVALID_JSON_VALUE');
  return encoded;
}
export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
export function instant(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
export function numbers(value: unknown): number[] {
  const vals = typeof value === 'string' ? value.split('-').map(x => Number(x)) : array(value);
  if (!vals.length || vals.some(x => typeof x !== 'number' || !Number.isInteger(x) || x <= 0)) return [];
  return vals as number[];
}
export function apiDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('INVALID_DATE');
  return iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4);
}

export function parseProno(text: string): ObjectData[] {
  if (text.length > MAX_BYTES) throw new Error('SOURCE_TOO_LARGE');
  if (text.trimStart().startsWith('{')) {
    const rows = object(JSON.parse(text)).historical_logs;
    if (!Array.isArray(rows)) throw new Error('PRONO_SCHEMA_CHANGED');
    return rows.map(object);
  }
  // Extract JSON only, never evaluate script received from the website.
  const match = /\blet\s+allLogs\s*=\s*\[/.exec(text);
  if (!match) throw new Error('PRONO_SCHEMA_CHANGED');
  const start = match.index + match[0].length - 1;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        const rows: unknown = JSON.parse(text.slice(start, i + 1));
        if (!Array.isArray(rows) || rows.length > 5000) throw new Error('PRONO_SCHEMA_CHANGED');
        return rows.map(object);
      }
    }
  }
  throw new Error('PRONO_SCHEMA_CHANGED');
}

export interface Course {
  race_id: string; date: string; meeting: number; number: number; hippodrome: string;
  start_at: string; raw: ObjectData; meeting_raw: ObjectData;
}
export function quinteCourses(programme: unknown, date: string): Course[] {
  const out: Course[] = [];
  for (const item of array(object(object(programme).programme).reunions)) {
    const reunion = object(item), meeting = number(reunion.numOfficiel);
    const hippo = str(object(reunion.hippodrome).libelleCourt);
    const country = str(object(reunion.pays).code);
    if (!meeting || !hippo || (country && country !== 'FRA')) continue;
    for (const c of array(reunion.courses)) {
      const course = object(c), n = number(course.numOrdre);
      const offered = array(course.paris).some(p => {
        const b = object(p);
        return ['QUINTE_PLUS', 'E_QUINTE_PLUS'].includes(str(b.codePari) || str(b.typePari));
      });
      if (!offered || !n) continue;
      const epoch = number(course.heureDepart);
      const start = epoch === null ? null : new Date(epoch > 1e11 ? epoch : epoch * 1000);
      const start_at = start && Number.isFinite(start.getTime()) ? start.toISOString() : '';
      const { courses: _courses, ...meetingRaw } = reunion;
      out.push({ race_id: `R${meeting}C${n}_${apiDate(date)}_${hippo}`, date, meeting, number: n,
        hippodrome: hippo, start_at, raw: course, meeting_raw: meetingRaw });
    }
  }
  return out;
}

export interface Receipt { url: string; received_at: string; response_sha256: string; http_date: string | null }
export interface Snapshot {
  schema: 'elite-bases-observation-v1'; adapter_version: string;
  race_id: string; race_date: string; observed_at: string; start_at: string; edition: string;
  selection8: number[]; market_selection8: number[]; eligible: boolean; reasons: string[];
  radar: { status: 'NOT_CONNECTED' }; source_receipts: Receipt[];
  source_hashes: Record<string, string>;
  race_features: ObjectData; runners: ObjectData[]; producer: ObjectData;
}

function arrived(row: ObjectData): boolean {
  return row.is_finished === true || row.is_started === true || row.is_cancelled === true ||
    row.arriveeDefinitive === true || row.isArriveeDefinitive === true ||
    ['FINISHED', 'ANNULEE', 'COURSE_ANNULEE', 'PARTIE', 'EN_COURS'].includes(str(row.status) || str(row.statut)) ||
    (str(row.statut).startsWith('ARRIVEE')) || array(row.arrival_list).length > 0 || array(row.ordreArrivee).length > 0;
}
export function buildSnapshot(course: Course, prono: ObjectData | null, participants: unknown,
                              receipts: Receipt[], observedAt: string, sourceHashes: Record<string, string>): Snapshot {
  const row = prono ?? {}, errors: string[] = [];
  const now = instant(observedAt), start = instant(course.start_at);
  const edition = str(row.display_horizon) || 'UNKNOWN';
  const entry = object(object(row.editions_moteur)[edition]);
  const selection = numbers(row.sel_moteur_list);
  const editionSelection = numbers(entry.sel);
  if (!prono) errors.push('MOTEUR_ABSENT');
  if (row.race_id !== course.race_id || row.date !== course.date) errors.push('IDENTITY_MISMATCH');
  if (now === null || start === null) errors.push('START_OR_RECEIPT_UNKNOWN');
  else if (now >= start) errors.push('RECEIVED_AFTER_START');
  if (arrived(row) || arrived(course.raw)) errors.push('RACE_STARTED_OR_CLOSED');
  if (selection.length !== 8 || new Set(selection).size !== 8) errors.push('SELECTION_NOT_EIGHT_DISTINCT');
  if (!['T_MATIN', 'T90', 'T30', 'T15'].includes(edition) || canonical(selection) !== canonical(editionSelection)) errors.push('EDITION_AMBIGUOUS');
  if (row.publishable !== true) errors.push('PRODUCER_NOT_PUBLISHABLE');
  if (row.is_no_bet !== false) errors.push('NO_BET_OR_UNKNOWN');
  if (!receipts.length || receipts.some(r => instant(r.received_at) === null || now === null || instant(r.received_at)! > now)) errors.push('SOURCE_AFTER_CUTOFF');
  const parts = array(object(participants).participants).map(object);
  if (!parts.length) errors.push('PARTICIPANTS_ABSENT');
  const nums = parts.map(p => number(p.numPmu));
  if (nums.some(n => n === null) || new Set(nums).size !== nums.length) errors.push('RUNNER_IDENTITIES_INVALID');
  const existing = new Map(array(row.runners).map(object).map(r => [number(r.num), r]));
  const runners = parts.map(p => {
    const num = number(p.numPmu), prior = existing.get(num) ?? {};
    const np = p.nonPartant === true || ['NON_PARTANT', 'NP', 'FORFAIT'].includes(str(p.statut));
    const odds = number(object(p.dernierRapportDirect).rapport);
    // Explicit feature allowlist: no arrival, coverage or post-race decision field.
    return { num, name: str(p.nom), is_non_partant: np, music: str(p.musique), age: number(p.age),
      sex: str(p.sexe), driver: str(p.driver), trainer: str(p.entraineur), shoeing: str(p.deferre),
      blinkers: str(p.oeilleres), draw: number(p.placeCorde), weight_raw: number(p.handicapPoids),
      market_odds: odds !== null && odds > 1 ? odds : null,
      odds_source_timestamp_raw: object(p.dernierRapportDirect).dateRapport ?? null,
      reference_odds: number(object(p.dernierRapportReference).rapport),
      earnings_raw: object(p.gainsParticipant).gainsCarriere ?? null,
      producer_win_probability_pct: number(prior.prob_pct),
      producer_value_index: number(prior.value_index),
      producer_rank: num === null ? null : (selection.includes(num) ? selection.indexOf(num) + 1 : null) };
  });
  for (const n of selection) {
    const runner = runners.find(p => p.num === n);
    if (!runner) errors.push('SELECTED_RUNNER_MISSING');
    else if (runner.is_non_partant || numbers(row.np_nums).includes(n)) errors.push('SELECTED_NON_STARTER');
  }
  if (parts.some(p => p.ordreArrivee !== undefined && p.ordreArrivee !== null && p.ordreArrivee !== 0)) errors.push('RUNNER_RESULT_ALREADY_PRESENT');
  const active = runners.filter(p => !p.is_non_partant);
  if (!active.length || active.filter(p => p.market_odds !== null).length / active.length < 0.9) errors.push('MARKET_COVERAGE_LOW');
  return { schema: 'elite-bases-observation-v1', adapter_version: VERSION, race_id: course.race_id,
    race_date: course.date, observed_at: observedAt, start_at: course.start_at, edition,
    selection8: selection, market_selection8: numbers(object(object(row.editions_marche)[edition]).sel),
    eligible: errors.length === 0, reasons: [...new Set(errors)], radar: { status: 'NOT_CONNECTED' },
    source_receipts: receipts, source_hashes: sourceHashes,
    race_features: { discipline: str(course.raw.discipline), distance: number(course.raw.distance),
      rope: str(course.raw.corde), speciality: str(course.raw.specialite), hippodrome: course.hippodrome },
    runners, producer: { name: 'MOTEUR', announced_lock_text: str(entry.lock),
      announced_lock_precision: 'MINUTE_ONLY_UNVERIFIED', source_generated_at: null,
      contract_recorded: row.contract_recorded === true,
      priced_ratio: number(entry.priced_ratio), odds_real: entry.odds_real === true } };
}

export interface OfficialResult { schema: string; race_id: string; status: string; ranking: number[][]; non_partants: number[]; non_partants_known?: boolean; finality: string }
export function officialResult(course: Course, participants?: unknown): OfficialResult | null {
  const raw = course.raw, status = str(raw.statut);
  if (status === 'COURSE_ANNULEE' || status === 'ANNULEE') return { schema: 'elite-bases-result-v1', race_id: course.race_id,
    status: 'CANCELLED', ranking: [], non_partants: [], finality: 'PMU_CANCELLED' };
  const ranking = array(raw.ordreArrivee).map(numbers);
  const flat = ranking.flat();
  if (!ranking.length || ranking.some(r => !r.length) || new Set(flat).size !== flat.length) return null;
  // PMU also uses FIN_COURSE with explicit definitive-arrival flags (e.g. Compiègne).
  // FIN_COURSE alone, or contradictory explicit flags, cannot certify finality.
  const definitiveFlag = raw.arriveeDefinitive === true || raw.isArriveeDefinitive === true;
  const contradictory = raw.arriveeDefinitive === false || raw.isArriveeDefinitive === false;
  const verified = definitiveFlag && !contradictory &&
    (status.startsWith('ARRIVEE_DEFINITIVE') || status === 'FIN_COURSE');
  const non_partants = array(object(participants).participants).map(object)
    .filter(p => p.nonPartant === true || str(p.statut) === 'NON_PARTANT').map(p => number(p.numPmu)).filter((n): n is number => n !== null);
  return { schema: 'elite-bases-result-v1', race_id: course.race_id, status: verified && flat.length >= 5 ? 'DEFINITIVE' : 'PROVISIONAL',
    ranking, non_partants, non_partants_known: array(object(participants).participants).length>0 &&
      flat.every(n=>array(object(participants).participants).some(p=>number(object(p).numPmu)===n)),
    finality: verified ? 'PMU_VERIFIED' : 'NOT_VERIFIED' };
}
export function containsAllBases(result: OfficialResult, bases: number[]): boolean | null {
  if (result.status !== 'DEFINITIVE' || ![3, 4].includes(bases.length) || new Set(bases).size !== bases.length) return null;
  let rank = 1; const topFive = new Set<number>();
  for (const group of result.ranking) { if (rank <= 5) group.forEach(n => topFive.add(n)); rank += group.length; }
  return bases.every(n => topFive.has(n));
}
export function proposalState(snapshot: Snapshot, now: string): { status: string; bases: number[]; reason: string } {
  if (!snapshot.eligible) return { status: 'ABSTAIN', bases: [], reason: snapshot.reasons.join(',') };
  if (instant(now) === null || instant(snapshot.start_at) === null || instant(now)! >= instant(snapshot.start_at)!) return { status: 'ABSTAIN', bases: [], reason: 'RACE_STARTED' };
  return { status: 'COLLECT_ONLY', bases: [], reason: 'NO_VALIDATED_MODEL' };
}
