// Custom fetch for the Supabase client that bypasses the broken AT&T router DNS.
// Node 24's globalThis.fetch uses internal c-ares and ignores dns.lookup.
// node:https.request DOES accept a custom lookup — we use that instead.
import { request as httpsReq } from 'node:https';
import { IncomingMessage }      from 'node:http';
import { Resolver }             from 'node:dns/promises';
import type { LookupOptions, LookupAddress } from 'node:dns';

const resolver = new Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

const cache = new Map<string, { address: string; family: number }[]>();

function lookup(
  hostname: string,
  opts:     LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, addresses: string | LookupAddress[]) => void,
) {
  const cached = cache.get(hostname);
  if (cached) {
    callback(null, opts.all ? cached : cached[0].address);
    return;
  }

  const f      = opts.family;
  const family = (f === 6 || f === 'IPv6') ? 6 : 4;
  const resolve = family === 6 ? resolver.resolve6.bind(resolver) : resolver.resolve4.bind(resolver);

  resolve(hostname)
    .then(addrs => {
      const result = addrs.map(a => ({ address: a, family }));
      cache.set(hostname, result);
      callback(null, opts.all ? result : result[0]?.address ?? addrs[0]);
    })
    .catch(err => callback(err as NodeJS.ErrnoException, opts.all ? [] : ''));
}

function incomingToResponse(msg: IncomingMessage, body: Uint8Array): Response {
  const headers = new Headers();
  for (const [k, v] of Object.entries(msg.headers)) {
    if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  return new Response(body.byteLength > 0 ? (body as BodyInit) : null, {
    status:     msg.statusCode ?? 200,
    statusText: msg.statusMessage ?? '',
    headers,
  });
}

export async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const req = new Request(input as RequestInfo, init);
  const url = new URL(req.url);

  const bodyBuf = req.body ? Buffer.from(await req.arrayBuffer()) : null;

  const hdrs: Record<string, string> = {};
  req.headers.forEach((v, k) => { hdrs[k] = v; });

  return new Promise<Response>((resolve, reject) => {
    const nodeReq = httpsReq(
      {
        hostname: url.hostname,
        port:     443,
        path:     url.pathname + url.search,
        method:   req.method,
        headers:  hdrs,
        lookup,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(incomingToResponse(res, Buffer.concat(chunks))));
        res.on('error', reject);
      },
    );
    nodeReq.on('error', reject);
    if (bodyBuf?.length) nodeReq.write(bodyBuf);
    nodeReq.end();
  });
}
