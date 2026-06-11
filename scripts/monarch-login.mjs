import { createInterface } from 'readline';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { MonarchClient } = require('monarchmoney');

// If MONARCH_SESSION_TOKEN is set, skip interactive login
if (process.env.MONARCH_SESSION_TOKEN) {
  const client = new MonarchClient();
  client.setToken(process.env.MONARCH_SESSION_TOKEN);
  console.log('Using token from MONARCH_SESSION_TOKEN env var.');
  const session = client.getSessionInfo();
  console.log('\nSession info:', JSON.stringify(session, null, 2));
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const prompt = (q) => new Promise((res) => rl.question(q, res));

console.log('Note: Monarch Money\'s /auth/login/ API returns 405 for programmatic logins.');
console.log('To get a token: open app.monarchmoney.com → DevTools → Network → find any');
console.log('api.monarchmoney.com request → copy the "Authorization: Token <value>" header value.');
console.log('Then run: MONARCH_SESSION_TOKEN=<token> node scripts/monarch-login.mjs\n');

const email = await prompt('Monarch Money email: ');
const password = await prompt('Password: ');
rl.close();

const client = new MonarchClient();

try {
  await client.login({ email, password });
} catch (err) {
  if (err.name === 'MonarchMFARequiredError' || err.message?.toLowerCase().includes('mfa')) {
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const mfaCode = await new Promise((res) => rl2.question('MFA code: ', res));
    rl2.close();
    await client.multiFactorAuthenticate({ code: mfaCode });
  } else {
    console.error('Login failed:', err.message);
    process.exit(1);
  }
}

const session = client.getSessionInfo();
const token = session?.token;

if (token) {
  console.log('\nSession token:');
  console.log(token);
} else {
  console.log('\nSession info:', JSON.stringify(session, null, 2));
}
