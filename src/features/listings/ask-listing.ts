import { useMutation } from '@tanstack/react-query';

import { messageFromFunctionError } from '@/lib/edge-functions';
import { supabase } from '@/lib/supabase';

/**
 * Ask a question about one listing.
 *
 * Different in kind from the search assistant, which never sees a listing. The
 * `ask-listing` function reads this one listing with the caller's own token and
 * answers from its published details only. `known` is the model's own report
 * of whether those details answered the question; when it is false the screen
 * points at the landlord rather than presenting the reply as an answer.
 */
export interface ListingAnswer {
  question: string;
  answer: string;
  known: boolean;
}

/** Offered as chips, so the first question costs one tap. */
export const SUGGESTED_QUESTIONS = [
  'When can I move in?',
  'How much is the deposit?',
  'Is it furnished?',
  'What was checked?',
] as const;

export const MAX_QUESTION_LENGTH = 300;

export function useAskListing(listingId: string) {
  return useMutation<ListingAnswer, Error, string>({
    mutationFn: async (question: string) => {
      const { data, error } = await supabase.functions.invoke('ask-listing', {
        body: { listing_id: listingId, question },
      });

      if (error) {
        throw new Error(await messageFromFunctionError(error, 'Ask is unavailable.'));
      }
      if (typeof data?.answer !== 'string') {
        throw new Error('Could not answer that. Try asking it another way.');
      }
      return { question, answer: data.answer, known: data.known === true };
    },
  });
}
