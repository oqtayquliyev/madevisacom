// In-app notifications (bell in the header). Table: notifications
// (migration 20261107090000). Admins also see admin notifications
// (new plan requests…). Polls every minute while the tab is visible.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export type AppNotification = { id: number; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; audience: 'user' | 'admin' };

/** `limit`: the bell shows the latest 30; the notifications page everything kept (30 days). */
export function useNotifications(limit = 30) {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    if (!user) return setItems([]);
    const { data, error } = await supabase.from('notifications').select('id, kind, title, body, link, read_at, created_at, audience').order('created_at', { ascending: false }).limit(limit);
    if (!error) setItems((data ?? []) as AppNotification[]);
  }, [user, limit]);

  useEffect(() => {
    void load();
    if (!user) return;
    const id = window.setInterval(() => document.visibilityState === 'visible' && void load(), 60_000);
    // Something just happened here (offer generated, application tracked) → refresh now.
    const now = () => window.setTimeout(() => void load(), 800);
    window.addEventListener('madevisa:notifications', now);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('madevisa:notifications', now);
    };
  }, [load, user]);

  const markAllRead = useCallback(async () => {
    const unread = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!unread.length) return;
    setItems((cur) => cur.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread);
  }, [items]);

  return { items, unread: items.filter((n) => !n.read_at).length, markAllRead, reload: load };
}
