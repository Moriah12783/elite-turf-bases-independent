import { canonical, sha256, type ObjectData, type OfficialResult, type Snapshot } from './core.ts';

export interface RawSource { kind: string; value: unknown }
export async function gzip(text: string): Promise<ArrayBuffer> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}
export async function gunzip(bytes: ArrayBuffer): Promise<string> {
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
export async function sourcesToStore(raw: RawSource[]): Promise<{hash: string; kind: string; bytes: ArrayBuffer}[]> {
  return Promise.all(raw.map(async s => {
    const text = canonical(s.value);
    if (new TextEncoder().encode(text).byteLength > 400_000) throw new Error('COURSE_SOURCE_TOO_LARGE');
    return { hash: await sha256(text), kind: s.kind, bytes: await gzip(text) };
  }));
}
export async function saveObservation(db: D1Database, snapshot: Snapshot, sources: Awaited<ReturnType<typeof sourcesToStore>>): Promise<void> {
  const text = canonical(snapshot), hash = await sha256(text);
  // D1 batch is transactional. A failure cannot leave a partially stored observation.
  const statements = sources.map(s => db.prepare(`INSERT INTO source_blobs(hash,kind,payload_gzip)
    SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM source_blobs WHERE hash=?)`).bind(s.hash,s.kind,s.bytes,s.hash));
  statements.push(db.prepare(`INSERT INTO observations(id,race_id,race_date,edition,observed_at,start_at,eligible,reasons_json,payload_hash,payload_json)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM observations WHERE id=?)`)
    .bind(hash,snapshot.race_id,snapshot.race_date,snapshot.edition,snapshot.observed_at,snapshot.start_at,
      snapshot.eligible ? 1 : 0,canonical(snapshot.reasons),hash,text,hash));
  await db.batch(statements);
}
export async function saveResult(db: D1Database, result: OfficialResult, observed: string, source: ObjectData): Promise<boolean> {
  const payload = { result, source }, text = canonical(payload), hash = await sha256(text);
  const id = await sha256(canonical(result));
  const existing = await db.prepare('SELECT id FROM results WHERE id=?').bind(id).first();
  if (existing) return false;
  await db.prepare(`INSERT INTO results(id,race_id,observed_at,status,payload_hash,payload_json)
    SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM results WHERE id=?)`)
    .bind(id,result.race_id,observed,result.status,hash,text,id).run();
  return true;
}
export async function verifyObservation(row: { payload_hash: string; payload_json: string }): Promise<Snapshot> {
  if (await sha256(row.payload_json) !== row.payload_hash) throw new Error('OBSERVATION_HASH_MISMATCH');
  const parsed: unknown = JSON.parse(row.payload_json);
  // All observation writes use buildSnapshot; the digest guards the archived bytes.
  return parsed as Snapshot;
}
export async function lock(db: D1Database, token: string, now: number): Promise<boolean> {
  await db.prepare(`INSERT INTO leases(name,token,expires_at) VALUES('collect',?,?)
    ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE leases.expires_at < ?`)
    .bind(token,now+240_000,now).run();
  const result = await db.prepare("SELECT token FROM leases WHERE name='collect'").first<{token:string}>();
  return result?.token === token;
}
export async function unlock(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM leases WHERE name='collect' AND token=?").bind(token).run();
}
