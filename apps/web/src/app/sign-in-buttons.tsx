'use client';

import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SignInButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Leaves for Google; comes back to the callback, then here.
        const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
        if (error) setBusy(false);
      }}
    >
      {label}
    </button>
  );
}

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="rounded-md px-2 py-1 text-sm text-zinc-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-zinc-400"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
