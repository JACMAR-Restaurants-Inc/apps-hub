'use client';

import { markNotificationsReadAction } from '@/app/actions';
import { useEffect } from 'react';

/**
 * Marks the person's notifications read once the page has shown them, so this visit
 * still says which are "Nouveau" and the badge is gone on the next page.
 */
export function MarkRead() {
  useEffect(() => {
    void markNotificationsReadAction();
  }, []);
  return null;
}
