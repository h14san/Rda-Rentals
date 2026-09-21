import { useMutation } from '@tanstack/react-query';

import { compressForAnalysis, type PickedImage } from '@/features/listings/create';
import type { PropertyType } from '@/features/listings/types';
import { messageFromFunctionError } from '@/lib/edge-functions';
import { supabase } from '@/lib/supabase';

/**
 * Photo-to-description.
 *
 * The model writes a draft; the landlord owns the result. Nothing is published
 * from this — the text lands in the same editable field they would have typed
 * into, which is what makes a wrong sentence a five-second fix rather than a
 * listing that lies about the property.
 *
 * The photos are sent to the `auto-describe` Edge Function because that is
 * where GEMINI_API_KEY lives; it can never be bundled into the app.
 */

/**
 * Photos sent per request.
 *
 * The brief says 3-5. More than five is data spent for a description that does
 * not improve, and the function rejects anything above this anyway.
 */
export const DESCRIBE_IMAGE_LIMIT = 5;

/** Below this the description gets thin and generic — worth telling the user. */
export const DESCRIBE_IDEAL_IMAGES = 3;

/** Mirrors the function's own cap, so a bad response cannot flood the field. */
const MAX_DESCRIPTION_CHARS = 1_000;

/**
 * What the landlord has already entered.
 *
 * Passed so the prose agrees with the structured fields instead of guessing at
 * them. Price is deliberately absent — it renders as its own field everywhere,
 * and a price repeated in prose goes stale the moment the rent is edited.
 */
export interface DescribeFacts {
  title?: string;
  propertyType?: PropertyType | null;
  bedrooms?: number | null;
  furnished?: boolean;
  district?: string | null;
  sector?: string | null;
}

export interface AutoDescribeInput {
  images: PickedImage[];
  facts: DescribeFacts;
}

export interface AutoDescribeResult {
  description: string;
  /** True when the photos yielded nothing usable — not an error, just no output. */
  unusable: boolean;
}

/** Drops empty values so the prompt never states "bedrooms: null" as a fact. */
function cleanFacts(facts: DescribeFacts): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (facts.title?.trim()) out.title = facts.title.trim();
  if (facts.propertyType) out.propertyType = facts.propertyType;
  if (typeof facts.bedrooms === 'number') out.bedrooms = facts.bedrooms;
  if (typeof facts.furnished === 'boolean') out.furnished = facts.furnished;
  if (facts.district) out.district = facts.district;
  if (facts.sector) out.sector = facts.sector;
  return out;
}

export function useAutoDescribe() {
  return useMutation<AutoDescribeResult, Error, AutoDescribeInput>({
    mutationFn: async ({ images, facts }) => {
      if (images.length === 0) throw new Error('Add at least one photo first.');

      // The first photos are the cover and the rooms the landlord chose to lead
      // with, so truncating from the end keeps the most representative ones.
      const encoded = await compressForAnalysis(
        images.slice(0, DESCRIBE_IMAGE_LIMIT),
      );

      const { data, error } = await supabase.functions.invoke('auto-describe', {
        body: { images: encoded, facts: cleanFacts(facts) },
      });

      if (error) {
        throw new Error(
          await messageFromFunctionError(error, 'Auto-describe is unavailable.'),
        );
      }

      const description =
        typeof data?.description === 'string'
          ? data.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
          : '';

      return {
        description,
        // Re-derived rather than trusted: an empty string presented as success
        // would wipe whatever the landlord had already written.
        unusable: data?.unusable === true || description.length === 0,
      };
    },
  });
}
