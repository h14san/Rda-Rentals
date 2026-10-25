import { useMutation } from '@tanstack/react-query';

import type { SortOrder } from '@/features/listings/queries';
import { filtersSchema, type Filters } from '@/features/listings/types';
import { messageFromFunctionError } from '@/lib/edge-functions';
import {
  KIGALI_DISTRICTS,
  SECTORS_BY_DISTRICT,
  type District,
} from '@/lib/locations';
import { supabase } from '@/lib/supabase';

/**
 * The conversational search.
 *
 * Same contract as smart search, one turn at a time: the model returns a
 * `Filters` object and the existing feed query does the searching. The model
 * never sees a listing row, so it cannot name a property that does not exist or
 * quote a rent that has changed — the results under a reply are real rows, and
 * the reply only proves the question was understood.
 */

/** Conversation turns held in screen state. Not persisted — an MVP session. */
export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** Filters this turn applied, if any. Shown as chips under the reply. */
  filters?: Filters;
}

/** Mirrors the function's own cap. */
export const MAX_CHAT_INPUT = 400;

/** Turns sent as history. The function truncates too; this saves the upload. */
const MAX_HISTORY = 8;

/** Every sector the app knows about, flattened for the model's vocabulary. */
const ALL_SECTORS = KIGALI_DISTRICTS.flatMap(
  (d: District) => SECTORS_BY_DISTRICT[d],
);

export interface ChatTurnInput {
  /** Whole conversation so far, ending with the renter's new message. */
  messages: Pick<ChatMessage, 'role' | 'text'>[];
  /** Filters currently in force, so a follow-up refines rather than restarts. */
  filters: Filters | null;
  sort: SortOrder;
}

export interface ChatTurnResult {
  reply: string;
  /** Null when this turn was a question rather than a search. */
  filters: Filters | null;
  /** Null unless the renter asked for an ordering. */
  sort: SortOrder | null;
}

export function useChatTurn() {
  return useMutation<ChatTurnResult, Error, ChatTurnInput>({
    mutationFn: async ({ messages, filters, sort }) => {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: messages
            .slice(-MAX_HISTORY)
            .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHAT_INPUT) })),
          filters,
          sort,
          // Sent rather than duplicated server-side so src/lib/locations.ts stays
          // the single source of truth for Kigali place names.
          districts: KIGALI_DISTRICTS,
          sectors: ALL_SECTORS,
        },
      });

      if (error) {
        throw new Error(
          await messageFromFunctionError(error, 'The assistant is unavailable.'),
        );
      }

      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
      if (!reply) throw new Error('The assistant did not answer. Try again.');

      // Re-validated here on purpose: the function shapes the output, this
      // schema decides what the app will actually apply. A malformed filter set
      // costs the renter the results, not the reply — so the turn still stands
      // as conversation and they can rephrase.
      const parsed = data?.search === true ? filtersSchema.safeParse(data.filters) : null;

      const nextSort: SortOrder | null =
        data?.sort === 'newest' || data?.sort === 'price_asc' || data?.sort === 'price_desc'
          ? data.sort
          : null;

      return {
        reply,
        filters: parsed?.success ? parsed.data : null,
        sort: nextSort,
      };
    },
  });
}
