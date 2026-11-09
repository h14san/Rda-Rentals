import { decode } from 'base64-arraybuffer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listingKeys } from '@/features/listings/queries';
import type {
  CaseDecision,
  EvidenceKind,
  ListingBadgeKind,
  ListingImageRow,
  ListingRow,
  ProfileBadgeRow,
  ProfileRow,
  VerificationCaseRow,
  VerificationEvidenceRow,
} from '@/features/listings/types';
import {
  EVIDENCE_MAX_EDGE,
  EVIDENCE_QUALITY,
  EVIDENCE_URL_TTL_S,
} from '@/features/verification/types';
import { compressToJpeg, type PickedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';

const EVIDENCE_BUCKET = 'verification-evidence';

export const verificationKeys = {
  all: ['verification'] as const,
  identity: (userId: string) => ['verification', 'identity', userId] as const,
  listingCases: (userId: string) => ['verification', 'listingCases', userId] as const,
  queue: ['verification', 'queue'] as const,
  case: (id: string) => ['verification', 'case', id] as const,
};

/* -------------------------------------------------------------------------- */
/* Landlord                                                                   */
/* -------------------------------------------------------------------------- */

/** The landlord's identity badge, if any, and their most recent identity case. */
export function useMyIdentity(userId: string) {
  return useQuery({
    queryKey: verificationKeys.identity(userId),
    enabled: !!userId,
    queryFn: async () => {
      const [badge, latest] = await Promise.all([
        supabase
          .from('profile_badges')
          .select('*')
          .eq('profile_id', userId)
          .eq('kind', 'identity_checked')
          .maybeSingle(),
        supabase
          .from('verification_cases')
          .select('*')
          .eq('profile_id', userId)
          .eq('subject_type', 'landlord')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (badge.error) throw badge.error;
      if (latest.error) throw latest.error;
      return {
        badge: badge.data as ProfileBadgeRow | null,
        latestCase: latest.data as VerificationCaseRow | null,
      };
    },
  });
}

/**
 * The newest review case for each of the landlord's listings, keyed by listing
 * id, so the profile can show why a listing is waiting or was refused.
 */
export function useMyListingCases(userId: string) {
  return useQuery({
    queryKey: verificationKeys.listingCases(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('verification_cases')
        .select('*')
        .eq('profile_id', userId)
        .eq('subject_type', 'listing')
        .order('submitted_at', { ascending: false });
      if (error) throw error;

      const byListing = new Map<string, VerificationCaseRow>();
      for (const c of data as VerificationCaseRow[]) {
        // Newest first, so the first one seen per listing is the current one.
        if (c.listing_id && !byListing.has(c.listing_id)) byListing.set(c.listing_id, c);
      }
      return byListing;
    },
  });
}

/**
 * Opens (or reopens) the identity case, then uploads each photo under it.
 *
 * The case comes first because the storage policy only accepts files under one
 * of the uploader's own open cases. Uploads are sequential, like listing photos.
 * If one fails midway the case is still open with what did arrive, and sending
 * again adds to it rather than starting over.
 */
export function useSubmitIdentity(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      images,
      onProgress,
    }: {
      images: PickedImage[];
      onProgress?: (done: number, total: number) => void;
    }) => {
      const { data: caseId, error } = await supabase.rpc('request_identity_verification');
      if (error) throw error;

      await uploadEvidence(userId, caseId, 'id_document', images, onProgress);
      return caseId;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: verificationKeys.identity(userId) });
    },
  });
}

async function uploadEvidence(
  userId: string,
  caseId: string,
  kind: EvidenceKind,
  images: PickedImage[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < images.length; i++) {
    const base64 = await compressToJpeg(images[i], EVIDENCE_MAX_EDGE, EVIDENCE_QUALITY);
    const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `${userId}/${caseId}/${unique}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(path, decode(base64), { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase
      .from('verification_evidence')
      .insert({ case_id: caseId, kind, storage_path: path });
    if (rowError) throw rowError;

    onProgress?.(i + 1, images.length);
  }
}

/** After staff ask for changes, the landlord edits the listing and sends it back. */
export function useResubmitListing(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (listingId: string) => {
      const { error } = await supabase.rpc('resubmit_listing_case', {
        p_listing_id: listingId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: verificationKeys.listingCases(userId) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

export type QueueItem = VerificationCaseRow & {
  // Hinted by column: verification_cases has two foreign keys to profiles
  // (profile_id and decided_by), and an unhinted embed is ambiguous.
  owner: Pick<ProfileRow, 'id' | 'full_name'> | null;
  listings: Pick<ListingRow, 'id' | 'title' | 'sector' | 'district'> | null;
};

/** Open cases, oldest first: whoever has waited longest is reviewed next. */
export function useReviewQueue(enabled: boolean) {
  return useQuery({
    queryKey: verificationKeys.queue,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('verification_cases')
        .select('*, owner:profiles!profile_id (id, full_name), listings (id, title, sector, district)')
        .in('status', ['submitted', 'changes_requested'])
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      return data as unknown as QueueItem[];
    },
  });
}

export type CaseDetail = QueueItem & {
  listings:
    | (ListingRow & {
        listing_images: Pick<ListingImageRow, 'id' | 'storage_path' | 'position'>[];
      })
    | null;
  evidence: (VerificationEvidenceRow & { url: string | null })[];
  ownerHasIdentity: boolean;
};

export function useCaseDetail(caseId: string, enabled: boolean) {
  return useQuery({
    queryKey: verificationKeys.case(caseId),
    enabled: enabled && !!caseId,
    // Signed URLs expire; refetch rather than show a reviewer a dead link.
    staleTime: (EVIDENCE_URL_TTL_S - 60) * 1000,
    queryFn: async (): Promise<CaseDetail> => {
      const { data, error } = await supabase
        .from('verification_cases')
        .select(
          '*, owner:profiles!profile_id (id, full_name), listings (*, listing_images (id, storage_path, position))',
        )
        .eq('id', caseId)
        .single();
      if (error) throw error;
      const row = data as unknown as Omit<CaseDetail, 'evidence' | 'ownerHasIdentity'>;
      row.listings?.listing_images.sort((a, b) => a.position - b.position);

      const [evidence, identity] = await Promise.all([
        supabase.from('verification_evidence').select('*').eq('case_id', caseId),
        supabase
          .from('profile_badges')
          .select('kind')
          .eq('profile_id', row.profile_id)
          .eq('kind', 'identity_checked')
          .maybeSingle(),
      ]);
      if (evidence.error) throw evidence.error;
      if (identity.error) throw identity.error;

      const files = evidence.data as VerificationEvidenceRow[];
      let urls: (string | null)[] = [];
      if (files.length > 0) {
        const signed = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .createSignedUrls(
            files.map((f) => f.storage_path),
            EVIDENCE_URL_TTL_S,
          );
        if (signed.error) throw signed.error;
        urls = signed.data.map((s) => s.signedUrl ?? null);
      }

      return {
        ...row,
        evidence: files.map((f, i) => ({ ...f, url: urls[i] ?? null })),
        ownerHasIdentity: !!identity.data,
      };
    },
  });
}

/** The exact address, fetched only when the reviewer asks; every call is logged. */
export function useStaffLocation() {
  return useMutation({
    mutationFn: async (listingId: string) => {
      const { data, error } = await supabase.rpc('staff_listing_location', {
        p_listing_id: listingId,
      });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}

export function useDecideVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      caseId: string;
      decision: CaseDecision;
      note: string;
      checks: ListingBadgeKind[];
    }) => {
      const { error } = await supabase.rpc('decide_verification', {
        p_case_id: input.caseId,
        p_decision: input.decision,
        p_note: input.note.trim() || null,
        p_checks: input.checks,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: verificationKeys.all });
      void qc.invalidateQueries({ queryKey: listingKeys.all });
    },
  });
}
