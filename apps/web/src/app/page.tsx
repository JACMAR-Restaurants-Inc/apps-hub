import { getViewer, type RosterStanding } from '@/lib/viewer';
import { SignInButton, SignOutButton } from './sign-in-buttons';

// Placeholder until the portal screens are built: proves sign-in and the roster check.
const STANDING: Record<RosterStanding, string> = {
  admin: 'System administrator.',
  active: 'On the roster and active.',
  inactive: 'On the roster, but deactivated. Ask an administrator.',
  not_on_roster: 'Signed in, but not on the roster yet, so there is nothing to open.',
};

export default async function Home() {
  const viewer = await getViewer();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Apps Hub</h1>
      {viewer ? (
        <>
          <div className="space-y-1">
            <p className="font-medium">{viewer.name}</p>
            <p className="text-zinc-600 dark:text-zinc-400">{viewer.email}</p>
            <p>{STANDING[viewer.standing]}</p>
          </div>
          <div>
            <SignOutButton />
          </div>
        </>
      ) : (
        <>
          <p>Sign in with your Google account. Any Google account works, including Gmail.</p>
          <div>
            <SignInButton />
          </div>
        </>
      )}
    </main>
  );
}
