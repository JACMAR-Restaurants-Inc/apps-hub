'use client';

import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const button =
  'rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900';

export function SignInButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={button}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Leaves for Google; comes back to the callback, then here.
        const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
        if (error) setBusy(false);
      }}
    >
      Sign in with Google
    </button>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={button}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
