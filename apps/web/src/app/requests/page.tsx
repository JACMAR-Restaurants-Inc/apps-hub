import { redirect } from 'next/navigation';

/** Demandes became Notifications (owner, 2026-09-29): an old link still lands there. */
export default function RequestsPage() {
  redirect('/notifications');
}
