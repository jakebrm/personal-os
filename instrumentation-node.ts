import dns from 'node:dns';

// AT&T router DNS cannot resolve .co TLD — patch dns.lookup for .supabase.co only.
const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

type LookupCb = (err: NodeJS.ErrnoException | null, address: string, family: number) => void;
type LookupImpl = (hostname: string, optionsOrCb: dns.LookupOptions | number | LookupCb, callback?: LookupCb) => void;

const orig = dns.lookup.bind(dns) as LookupImpl;

// @ts-expect-error — overriding the overloaded lookup signature
dns.lookup = function patchedLookup(hostname: string, optionsOrCb: dns.LookupOptions | number | LookupCb, callback?: LookupCb) {
  const options: dns.LookupOptions | number = typeof optionsOrCb === 'function' ? {} : optionsOrCb;
  const cb: LookupCb = typeof optionsOrCb === 'function' ? optionsOrCb : callback!;

  if (typeof hostname !== 'string' || !hostname.endsWith('.supabase.co')) {
    return orig(hostname, options, cb);
  }

  const af      = (options as dns.LookupOptions)?.family === 6 ? 6 : 4;
  const resolve = af === 6 ? resolver.resolve6.bind(resolver) : resolver.resolve4.bind(resolver);

  resolve(hostname, (err, addrs) => {
    if (err || !addrs?.length) return orig(hostname, options, cb);
    cb(null, addrs[0], af);
  });
} as LookupImpl;

console.log('[dns-patch] .supabase.co → 8.8.8.8');
