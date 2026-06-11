export const COOKIE_NAME = '__session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toB64Url(buf: ArrayBuffer) {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64Url(str: string) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function createSession(secret: string): Promise<string> {
  const exp = (Date.now() + SESSION_MS).toString();
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(exp));
  return `${exp}.${toB64Url(sig)}`;
}

export async function verifySession(value: string, secret: string): Promise<boolean> {
  try {
    const dot = value.lastIndexOf('.');
    if (dot === -1) return false;
    const exp = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    if (Date.now() > Number(exp)) return false;
    const key = await importKey(secret);
    return crypto.subtle.verify('HMAC', key, fromB64Url(sig), new TextEncoder().encode(exp));
  } catch {
    return false;
  }
}
