import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { ListingImageRow, ProfileRow } from '@/features/listings/types';
import type {
  ConversationParticipantRow,
  ConversationRow,
  MessageRow,
  StaffTranscript,
} from '@/features/messaging/types';
import { supabase } from '@/lib/supabase';

export const PAGE = 50;

export const messagingKeys = {
  all: ['messaging'] as const,
  inbox: (userId: string) => ['messaging', 'inbox', userId] as const,
  conversation: (id: string) => ['messaging', 'conversation', id] as const,
  messages: (id: string) => ['messaging', 'messages', id] as const,
  messagesPage: (id: string, limit: number) => ['messaging', 'messages', id, limit] as const,
  blocked: (userId: string, otherId: string) =>
    ['messaging', 'blocked', userId, otherId] as const,
};

// Named columns throughout, never `*`: a column added to messages later should
// not start arriving on phones by accident.
const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, kind, body, masked, flagged, created_at';

const CONVERSATION_SELECT = `
  id, listing_id, listing_title, renter_id, landlord_id, created_at,
  last_message_at, last_message_preview, last_message_sender_id,
  renter:profiles!renter_id (id, full_name),
  landlord:profiles!landlord_id (id, full_name),
  listings (id, title, status, listing_images (storage_path, position)),
  conversation_participants (last_read_at, archived, muted)
`;

type Person = Pick<ProfileRow, 'id' | 'full_name'>;

export type ConversationSummary = ConversationRow & {
  renter: Person | null;
  landlord: Person | null;
  /** Null when the listing was deleted, or RLS no longer shows it to you. */
  listings: {
    id: string;
    title: string;
    status: string;
    listing_images: Pick<ListingImageRow, 'storage_path' | 'position'>[];
  } | null;
  /** RLS returns only the caller's own row, so this has at most one entry. */
  conversation_participants: Pick<
    ConversationParticipantRow,
    'last_read_at' | 'archived' | 'muted'
  >[];
};

/** The person on the other side of a conversation. */
export function otherParty(c: ConversationSummary, userId: string): Person | null {
  return c.renter_id === userId ? c.landlord : c.renter;
}

export function myState(c: ConversationSummary) {
  return c.conversation_participants[0] ?? null;
}

export function isUnread(c: ConversationSummary, userId: string): boolean {
  const mine = myState(c);
  return (
    !!mine &&
    c.last_message_sender_id !== userId &&
    c.last_message_preview !== null &&
    c.last_message_at > mine.last_read_at
  );
}

function tidy(c: ConversationSummary): ConversationSummary {
  c.listings?.listing_images.sort((a, b) => a.position - b.position);
  return c;
}

/* -------------------------------------------------------------------------- */
/* Inbox                                                                      */
/* -------------------------------------------------------------------------- */

export function useInbox(userId: string | null) {
  return useQuery({
    queryKey: messagingKeys.inbox(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .order('last_message_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as ConversationSummary[]).map(tidy);
    },
  });
}

/** Conversations with something new, for the tab badge. Muted ones still count. */
export function useUnreadCount(userId: string | null): number {
  const inbox = useInbox(userId);
  if (!userId || !inbox.data) return 0;
  return inbox.data.filter((c) => isUnread(c, userId) && !myState(c)?.archived).length;
}

/**
 * Keeps the inbox and the tab badge current while the app is open.
 *
 * One subscription to every message insert: Realtime applies the select
 * policy, so only messages in the caller's own conversations arrive. The
 * socket is not trusted on its own. Coming back to the foreground refetches,
 * because on a flaky connection a dropped event is the normal case.
 */
export function useInboxRealtime(userId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const refresh = () =>
      void qc.invalidateQueries({ queryKey: messagingKeys.inbox(userId) });

    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        refresh,
      )
      .subscribe((status) => {
        // A (re)connect may follow a gap, so catch up rather than assume.
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

/* -------------------------------------------------------------------------- */
/* One conversation                                                           */
/* -------------------------------------------------------------------------- */

export function useConversation(id: string) {
  return useQuery({
    queryKey: messagingKeys.conversation(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .eq('id', id)
        .single();
      if (error) throw error;
      return tidy(data as unknown as ConversationSummary);
    },
  });
}

/**
 * The newest `limit` messages, newest first (the list is inverted).
 *
 * "Load earlier" raises the limit instead of paging by cursor: simpler, and a
 * conversation about one rental is rarely long enough for it to matter.
 */
export function useMessages(conversationId: string, limit: number) {
  return useQuery({
    queryKey: messagingKeys.messagesPage(conversationId, limit),
    enabled: !!conversationId,
    placeholderData: keepPreviousData,
    // The socket and the foreground refetch keep this current.
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as MessageRow[];
    },
  });
}

/** Adds a message to every cached page of its conversation, once. */
function addToCache(qc: QueryClient, message: MessageRow) {
  qc.setQueriesData<MessageRow[]>(
    { queryKey: messagingKeys.messages(message.conversation_id) },
    (current) =>
      !current || current.some((m) => m.id === message.id) ? current : [message, ...current],
  );
}

/**
 * Live messages for the open conversation, plus the catch-up refetches.
 * `onIncoming` fires for messages from the other side, to mark them read.
 */
export function useConversationRealtime(
  conversationId: string,
  userId: string | null,
  onIncoming: () => void,
) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!conversationId || !userId) return;
    const refetch = () =>
      void qc.invalidateQueries({ queryKey: messagingKeys.messages(conversationId) });

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new as MessageRow;
          addToCache(qc, message);
          if (message.sender_id !== userId) onIncoming();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refetch();
      });

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') refetch();
    });

    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
    // onIncoming is deliberately not a dependency: resubscribing on every
    // render of the screen would drop events in the gap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId, qc]);
}

export function useSendMessage(conversationId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: userId, body })
        // Read back what was stored, not what was typed: the server may have
        // masked it, and the sender should see what the other person sees.
        .select(MESSAGE_COLUMNS)
        .single();
      if (error) throw error;
      return data as MessageRow;
    },
    onSuccess: (message) => {
      addToCache(qc, message);
      void qc.invalidateQueries({ queryKey: messagingKeys.inbox(userId) });
    },
  });
}

/**
 * Marks the conversation read. The value sent is irrelevant: a trigger
 * replaces any change to last_read_at with the server's clock.
 */
export function useMarkRead(conversationId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messagingKeys.inbox(userId) });
    },
  });
}

export function useSetConversationState(conversationId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { archived?: boolean; muted?: boolean }) => {
      const { error } = await supabase
        .from('conversation_participants')
        .update(patch)
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messagingKeys.inbox(userId) });
      void qc.invalidateQueries({ queryKey: messagingKeys.conversation(conversationId) });
    },
  });
}

/** Opens the renter's conversation about a listing, creating it if needed. */
export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (listingId: string) => {
      const { data, error } = await supabase.rpc('start_conversation', {
        p_listing_id: listingId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messaging', 'inbox'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

/** Whether the caller has blocked the other person. Never the reverse: RLS hides that. */
export function useHasBlocked(userId: string, otherId: string | null) {
  return useQuery({
    queryKey: messagingKeys.blocked(userId, otherId ?? ''),
    enabled: !!userId && !!otherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', userId)
        .eq('blocked_id', otherId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

export function useSetBlocked(userId: string, otherId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blocked: boolean) => {
      const { error } = blocked
        ? await supabase
            .from('user_blocks')
            .upsert(
              { blocker_id: userId, blocked_id: otherId },
              { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
            )
        : await supabase
            .from('user_blocks')
            .delete()
            .eq('blocker_id', userId)
            .eq('blocked_id', otherId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messagingKeys.blocked(userId, otherId) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The reported conversation as typed. A mutation, not a query, so it runs only
 * when a reviewer asks: every call is written to the moderation log.
 */
export function useStaffTranscript() {
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase.rpc('staff_report_conversation', {
        p_report_id: reportId,
      });
      if (error) throw error;
      return data as StaffTranscript;
    },
  });
}
