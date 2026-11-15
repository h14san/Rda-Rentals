import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listingKeys } from '@/features/listings/queries';
import type { ListingRow, ProfileRow } from '@/features/listings/types';
import {
  SEVERITY_RANK,
  type AccountRestrictionRow,
  type ListingSuspensionRow,
  type ModerationAction,
  type ReportReason,
  type ReportRow,
  type ReportSeverity,
  type ReportTarget,
} from '@/features/moderation/types';
import { supabase } from '@/lib/supabase';

export const moderationKeys = {
  all: ['moderation'] as const,
  myReports: (userId: string) => ['moderation', 'myReports', userId] as const,
  myRestriction: (userId: string) => ['moderation', 'myRestriction', userId] as const,
  mySuspensions: (userId: string) => ['moderation', 'mySuspensions', userId] as const,
  queue: ['moderation', 'queue'] as const,
  report: (id: string) => ['moderation', 'report', id] as const,
};

/** Postgres unique_violation: the reporter already has a live report on this. */
const ALREADY_REPORTED = '23505';

/* -------------------------------------------------------------------------- */
/* Everyone                                                                   */
/* -------------------------------------------------------------------------- */

export function useSubmitReport(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      targetType: ReportTarget;
      targetId: string;
      reason: ReportReason;
      note: string;
    }) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: userId,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        note: input.note.trim() || null,
      });
      if (error) {
        if (error.code === ALREADY_REPORTED) {
          throw new Error('You have already reported this. We are looking at it.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: moderationKeys.myReports(userId) });
    },
  });
}

/** The caller's own reports, newest first, with whatever staff decided. */
export function useMyReports(userId: string) {
  return useQuery({
    queryKey: moderationKeys.myReports(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('reporter_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ReportRow[];
    },
  });
}

/** The caller's active account restriction, or null. */
export function useMyRestriction(userId: string | null) {
  return useQuery({
    queryKey: moderationKeys.myRestriction(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_restrictions')
        .select('*')
        .eq('user_id', userId!)
        .is('lifted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data as AccountRestrictionRow | null;
    },
  });
}

/**
 * Why each of the landlord's suspended listings was suspended, keyed by
 * listing id. RLS returns only suspensions of the caller's own listings.
 */
export function useMyListingSuspensions(userId: string) {
  return useQuery({
    queryKey: moderationKeys.mySuspensions(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listing_suspensions')
        .select('*, listings!inner (owner_id)')
        // Staff can read every suspension; this keeps their own profile to
        // their own listings.
        .eq('listings.owner_id', userId)
        .is('lifted_at', null);
      if (error) throw error;
      return new Map(
        (data as unknown as ListingSuspensionRow[]).map((s) => [s.listing_id, s]),
      );
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

export type QueueReport = ReportRow & {
  reporter: Pick<ProfileRow, 'id' | 'full_name'> | null;
};

/**
 * Every report, most urgent first within its status: severity, then age.
 * Sorted here rather than in SQL because severity is text and its order is not
 * alphabetical; the queue is short enough that it does not matter.
 */
export function useReportsQueue(enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.queue,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, reporter:profiles!reporter_id (id, full_name)')
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data as unknown as QueueReport[]).sort(
        (a, b) =>
          SEVERITY_RANK[a.severity ?? 'none'] - SEVERITY_RANK[b.severity ?? 'none'] ||
          a.created_at.localeCompare(b.created_at),
      );
    },
  });
}

export type ReportDetail = QueueReport & {
  /** Null when the target has been deleted since. */
  listing:
    | (Pick<
        ListingRow,
        'id' | 'title' | 'status' | 'price_rwf' | 'sector' | 'district' | 'owner_id'
      > & { owner: Pick<ProfileRow, 'id' | 'full_name'> | null })
    | null;
  user: Pick<ProfileRow, 'id' | 'full_name'> | null;
  /** Whether the account the report is about (or that owns the listing) is suspended. */
  accountRestricted: boolean;
  /** Other reports on the same target, to show a pattern. */
  otherReports: number;
};

export function useReportDetail(reportId: string, enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.report(reportId),
    enabled: enabled && !!reportId,
    queryFn: async (): Promise<ReportDetail> => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, reporter:profiles!reporter_id (id, full_name)')
        .eq('id', reportId)
        .single();
      if (error) throw error;
      const report = data as unknown as QueueReport;

      let listing: ReportDetail['listing'] = null;
      let user: ReportDetail['user'] = null;

      if (report.target_type === 'listing') {
        const res = await supabase
          .from('listings')
          .select(
            'id, title, status, price_rwf, sector, district, owner_id, owner:profiles!owner_id (id, full_name)',
          )
          .eq('id', report.target_id)
          .maybeSingle();
        if (res.error) throw res.error;
        listing = res.data as unknown as ReportDetail['listing'];
        user = listing?.owner ?? null;
      } else if (report.target_type === 'user') {
        const res = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', report.target_id)
          .maybeSingle();
        if (res.error) throw res.error;
        user = res.data;
      }

      const [restriction, others] = await Promise.all([
        user
          ? supabase
              .from('account_restrictions')
              .select('id')
              .eq('user_id', user.id)
              .is('lifted_at', null)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('target_type', report.target_type)
          .eq('target_id', report.target_id)
          .neq('id', report.id),
      ]);
      if (restriction.error) throw restriction.error;
      if (others.error) throw others.error;

      return {
        ...report,
        listing,
        user,
        accountRestricted: !!restriction.data,
        otherReports: others.count ?? 0,
      };
    },
  });
}

/** Every staff action changes what several screens show, so refresh broadly. */
function useInvalidateModeration() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: moderationKeys.all });
    void qc.invalidateQueries({ queryKey: listingKeys.all });
  };
}

export function useTriageReport() {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: async (input: { reportId: string; severity: ReportSeverity }) => {
      const { error } = await supabase.rpc('triage_report', {
        p_report_id: input.reportId,
        p_severity: input.severity,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useResolveReport() {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: async (input: {
      reportId: string;
      outcome: 'resolved' | 'dismissed';
      note: string;
    }) => {
      const { error } = await supabase.rpc('resolve_report', {
        p_report_id: input.reportId,
        p_outcome: input.outcome,
        p_note: input.note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useModerateListing() {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: async (input: {
      listingId: string;
      action: ModerationAction;
      note: string;
      reportId?: string | null;
    }) => {
      const { error } = await supabase.rpc('moderate_listing', {
        p_listing_id: input.listingId,
        p_action: input.action,
        p_note: input.note.trim(),
        p_report_id: input.reportId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRestrictAccount() {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      action: ModerationAction;
      note: string;
      reportId?: string | null;
    }) => {
      const { error } = await supabase.rpc('restrict_account', {
        p_user_id: input.userId,
        p_action: input.action,
        p_note: input.note.trim(),
        p_report_id: input.reportId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
