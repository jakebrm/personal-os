'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError('');

    const pw = (e.currentTarget.elements.namedItem('password') as HTMLInputElement).value;
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });

    if (res.ok) {
      const next = searchParams.get('next');
      // Guard against open-redirect: only allow relative paths
      router.push(next?.startsWith('/') ? next : '/dashboard');
    } else {
      setError('Incorrect password.');
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm bg-ink-1 border border-ink-2 rounded-xl p-8 flex flex-col gap-5"
    >
      <h1 className="text-ink-4 font-semibold tracking-tight text-xl">personal-os</h1>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs text-ink-3 uppercase tracking-widest">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          disabled={pending}
          placeholder="••••••••"
          className="bg-ink-0 border border-ink-2 rounded-lg px-3 py-2 text-ink-4 placeholder:text-ink-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50 transition-colors"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-white rounded-lg px-4 py-2 font-medium hover:opacity-90 active:opacity-75 disabled:opacity-50 transition-opacity"
      >
        {pending ? 'Entering…' : 'Enter'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
