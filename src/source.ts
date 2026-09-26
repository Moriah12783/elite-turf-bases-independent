import { MAX_BYTES, sha256, type Receipt } from './core.ts';
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export interface CollectedSource { text: string; receipt: Receipt }
export class SourceError extends Error {
  source: string; code: string; attempts: number; retryable: boolean;
  constructor(source: string, code: string, retryable: boolean, attempts=1) {
    super(`${source}_${code}`); this.source=source; this.code=code; this.retryable=retryable; this.attempts=attempts;
  }
}
function sourceName(url: URL): string {
  return url.hostname==='prono.elite-turf.fr' ? 'PRONO' : url.pathname.endsWith('/participants') ? 'PMU_PARTICIPANTS' : 'PMU_PROGRAMME';
}
function normalize(error: unknown, source: string): SourceError {
  if(error instanceof SourceError) return error;
  const message=error instanceof Error ? `${error.name} ${error.message}` : '';
  if(/timeout|abort/i.test(message)) return new SourceError(source,'TIMEOUT',true);
  if(/decode|encoded data/i.test(message)) return new SourceError(source,'INVALID_UTF8',false);
  return new SourceError(source,'NETWORK_ERROR',true);
}
export async function readSource(url: string, fetcher: Fetcher=fetch, clock: ()=>Date=()=>new Date(),
  options: {sleep?: (ms:number)=>Promise<void>; deadline?:number}={}): Promise<CollectedSource> {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.port ||
    !['prono.elite-turf.fr','online.turfinfo.api.pmu.fr'].includes(parsed.hostname)) throw new Error('SOURCE_NOT_ALLOWED');
  const source=sourceName(parsed), sleep=options.sleep ?? (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  for(let attempt=1;attempt<=3;attempt++) {
    const remaining=(options.deadline ?? Infinity)-clock().getTime();
    if(remaining<1000) throw new SourceError(source,'DEADLINE',false,attempt-1);
    try {
      const response=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(Math.min(20_000,remaining)),
        headers:{'User-Agent':'EliteTurfBasesIndependent/0.2','Accept':'application/json,text/html'}});
      if(!response.ok || !response.body) {
        await response.body?.cancel();
        throw new SourceError(source,`HTTP_${response.status}`,[408,429,500,502,503,504].includes(response.status));
      }
      if(Number(response.headers.get('content-length'))>MAX_BYTES) {
        await response.body.cancel(); throw new SourceError(source,'SOURCE_TOO_LARGE',false);
      }
      const reader=response.body.getReader(), chunks:Uint8Array[]=[]; let length=0;
      try {
        for(;;) {
          const {value,done}=await reader.read(); if(done)break;
          length+=value.byteLength;
          if(length>MAX_BYTES) {await reader.cancel();throw new SourceError(source,'SOURCE_TOO_LARGE',false);}
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes=new Uint8Array(length); let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes);
      return {text,receipt:{url,received_at:clock().toISOString(),response_sha256:await sha256(text),http_date:response.headers.get('date')}};
    } catch(error) {
      const normalized=normalize(error,source);normalized.attempts=attempt;
      console.warn(JSON.stringify({event:'source_attempt_failed',source,code:normalized.code,attempt,retryable:normalized.retryable}));
      if(!normalized.retryable || attempt===3) throw normalized;
      await sleep(attempt*500);
    }
  }
  throw new SourceError(source,'RETRY_EXHAUSTED',false,3);
}
