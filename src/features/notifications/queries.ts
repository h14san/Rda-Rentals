import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  DEFAULT_PREFERENCES,
  type NotificationPreferencesRow,
  type NotificationRow,
} from '@/features/notifications/types';
import { supabase } from '@/lib/supabase';

export const notificationKeys = {
  list: (userId: string) => ['notifications', 'list', userId] as const,
  preferences: (userId: string) => ['notifications', 'preferences', userId] as const,
};

const COLUMNS =
  'id, user_id, kind, category, title, body, payload, collapse_key, read_at, pushed_at, created_at';

/** The newest hundred. Older ones are still in the table; nobody scrolls that far. */
export function useNotifications(userId: string | null) {
  return useQuery({
    queryKey: notificationKeys.list(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(COLUMNS)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as NotificationRow[];
    },
  });
}

/**
 * Unread count for the bell. Messages are left out: they have their own badge
 * on the Messages tab, and counting them twice makes both numbers look wrong.
 */
export function useUnreadNotificationCount(userId: string | null): number {
  const list = useNotifications(userId);
  return (list.data ?? []).filter((n) => !n.read_at && n.kind !== 'message_new').length;
}

/** Same rule as chat: the socket is a hint, and the foreground refetch is the truth. */
export function useNotificationsRealtime(userId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const refresh = () =>
      void qc.invalidateQueries({ queryKey: notificationKeys.list(userId) });

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        // '*' because a repeat of the same event updates the unread row.
        { event: '*', schema: 'public', table: 'notifications' },
        refresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
      });

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });

    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

/**
 * Marks one notification read, or all of them. The value sent is irrelevant:
 * the server stamps its own clock.
 */
export function useMarkNotificationsRead(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string | 'all') => {
      let query = supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);
      if (id !== 'all') query = query.eq('id', id);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.list(userId) });
    },
  });
}

/** Marks a conversation's message notification read when the conversation is opened. */
export function useClearMessageNotification(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('kind', 'message_new')
        .eq('collapse_key', conversationId)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.list(userId) });
    },
  });
}

export type Preferences = Pick<
  NotificationPreferencesRow,
  'messages' | 'listings' | 'saved' | 'bookings'
>;

/** A missing row means everything is on, so this never returns null. */
export function useNotificationPreferences(userId: string) {
  return useQuery({
    queryKey: notificationKeys.preferences(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Preferences> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('messages, listings, saved, bookings')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? DEFAULT_PREFERENCES;
    },
  });
}

export function useSetNotificationPreferences(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: Preferences) => {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    // Optimistic: a switch that waits for the network before it moves feels
    // broken on a slow connection.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: notificationKeys.preferences(userId) });
      const previous = qc.getQueryData<Preferences>(notificationKeys.preferences(userId));
      qc.setQueryData(notificationKeys.preferences(userId), next);
      return { previous };
    },
    onError: (_e, _next, context) => {
      if (context?.previous) {
        qc.setQueryData(notificationKeys.preferences(userId), context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.preferences(userId) });
    },
  });
}
