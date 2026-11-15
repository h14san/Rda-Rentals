import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ListingRow,
  ListingStatus,
  ProfileBadgeRow,
  ProfileRow,
  StaffRole,
  VerificationCaseRow,
} from '@/features/listings/types';
import type {
  AccountRestrictionRow,
  ListingSuspensionRow,
  ReportRow,
} from '@/features/moderation/types';
import { supabase } from '@/lib/supabase';

/**
 * Queries for the staff console.
 *
 * Nothing here is a security boundary. Each read works because of a staff
 * select policy or a checked function, and returns nothing to anyone else.
 */

export const staffKeys = {
  all: ['staff'] as const,
  stats: ['staff', 'stats'] as const,
  users: (q: string) => ['staff', 'users', q] as const,
  user: (id: string) => ['staff', 'user', id] as const,
  listings: (q: string, status: ListingStatus | null) =>
    ['staff', 'listings', q, status] as const,
  listing: (id: string) => ['staff', 'listing', id] as const,
  audit: (actor: string | null, subject: string | null) =>
    ['staff', 'audit', actor, subject] as const,
  roles: ['staff', 'roles'] as const,
};

/** Escapes the characters PostgREST's ilike treats as wildcards or separators. */
function likePattern(q: string): string {
  return `%${q.trim().replace(/[%_,()\\]/g, ' ')}%`;
}

/* -------------------------------------------------------------------------- */
/* Statistics                                                                 */
/* -------------------------------------------------------------------------- */

export type StaffStats = {
  listings_by_status: Partial<Record<ListingStatus, number>>;
  open_cases: number;
  open_reports: number;
  open_flags: number;
  suspended_accounts: number;
  users: number;
  weekly: { week: string; new_users: number; new_conversations: number }[];
};

export function useStaffStats(enabled: boolean) {
  return useQuery({
    queryKey: staffKeys.stats,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_stats');
      if (error) throw error;
      return data as StaffStats;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export type StaffUserRow = Pick<ProfileRow, 'id' | 'full_name' | 'created_at'>;

/** By name. An empty search lists the newest accounts. */
export function useStaffUsers(q: string, enabled: boolean) {
  return useQuery({
    queryKey: staffKeys.users(q),
    enabled,
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, full_name, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (q.trim()) query = query.ilike('full_name', likePattern(q));
      const { data, error } = await query;
      if (error) throw error;
      return data as StaffUserRow[];
    },
  });
}

export type StaffUserDetail = {
  profile: StaffUserRow;
  badges: Pick<ProfileBadgeRow, 'kind' | 'checked_at'>[];
  listings: Pick<ListingRow, 'id' | 'title' | 'status' | 'price_rwf' | 'created_at'>[];
  /** Every restriction, newest first. The active one has no lifted_at. */
  restrictions: AccountRestrictionRow[];
  /** Reports about this account, or about something of theirs. */
  reports: Pick<ReportRow, 'id' | 'reason' | 'status' | 'target_type' | 'created_at'>[];
  identityCase: Pick<VerificationCaseRow, 'id' | 'status'> | null;
  /** Empty unless the caller is an admin: RLS hides other people's roles. */
  roles: StaffRole[];
};

export function useStaffUser(id: string, enabled: boolean) {
  return useQuery({
    queryKey: staffKeys.user(id),
    enabled: enabled && !!id,
    queryFn: async (): Promise<StaffUserDetail> => {
      const [profile, badges, listings, restrictions, reports, identityCase, roles] =
        await Promise.all([
          supabase.from('profiles').select('id, full_name, created_at').eq('id', id).single(),
          supabase.from('profile_badges').select('kind, checked_at').eq('profile_id', id),
          supabase
            .from('listings')
            .select('id, title, status, price_rwf, created_at')
            .eq('owner_id', id)
            .order('created_at', { ascending: false }),
          supabase
            .from('account_restrictions')
            .select('*')
            .eq('user_id', id)
            .order('restricted_at', { ascending: false }),
          supabase
            .from('reports')
            .select('id, reason, status, target_type, created_at')
            .eq('subject_user_id', id)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('verification_cases')
            .select('id, status')
            .eq('profile_id', id)
            .eq('subject_type', 'landlord')
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('user_roles').select('role').eq('user_id', id),
        ]);

      for (const res of [profile, badges, listings, restrictions, reports, identityCase, roles]) {
        if (res.error) throw res.error;
      }

      return {
        profile: profile.data as StaffUserRow,
        badges: badges.data ?? [],
        listings: (listings.data ?? []) as StaffUserDetail['listings'],
        restrictions: (restrictions.data ?? []) as AccountRestrictionRow[],
        reports: (reports.data ?? []) as StaffUserDetail['reports'],
        identityCase: identityCase.data as StaffUserDetail['identityCase'],
        roles: (roles.data ?? []).map((r) => r.role),
      };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Listings                                                                   */
/* -------------------------------------------------------------------------- */

export type StaffListingRow = Pick<
  ListingRow,
  'id' | 'title' | 'status' | 'price_rwf' | 'sector' | 'district' | 'owner_id' | 'created_at'
> & { owner: Pick<ProfileRow, 'id' | 'full_name'> | null };

const STAFF_LISTING_SELECT =
  'id, title, status, price_rwf, sector, district, owner_id, created_at, owner:profiles!owner_id (id, full_name)';

/** Every status, by title. This is the search the public feed must never be. */
export function useStaffListings(q: string, status: ListingStatus | null, enabled: boolean) {
  return useQuery({
    queryKey: staffKeys.listings(q, status),
    enabled,
    queryFn: async () => {
      let query = supabase
        .from('listings')
        .select(STAFF_LISTING_SELECT)
        .order('created_at', { ascending: false })
        .limit(50);
      if (q.trim()) query = query.ilike('title', likePattern(q));
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as StaffListingRow[];
    },
  });
}

export type StaffListingDetail = StaffListingRow & {
  suspensions: ListingSuspensionRow[];
  /** The newest review case, open or not. */
  reviewCase: Pick<VerificationCaseRow, 'id' | 'status' | 'submitted_at'> | null;
  reports: Pick<ReportRow, 'id' | 'reason' | 'status' | 'created_at'>[];
};

export function useStaffListing(id: string, enabled: boolean) {
  return useQuery({
    queryKey: staffKeys.listing(id),
    enabled: enabled && !!id,
    queryFn: async (): Promise<StaffListingDetail> => {
      const [listing, suspensions, reviewCase, reports] = await Promise.all([
        supabase.from('listings').select(STAFF_LISTING_SELECT).eq('id', id).single(),
        supabase
          .from('listing_suspensions')
          .select('*')
          .eq('listing_id', id)
          .order('suspended_at', { ascending: false }),
        supabase
          .from('verification_cases')
          .select('id, status, submitted_at')
          .eq('listing_id', id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('reports')
          .select('id, reason, status, created_at')
          .eq('target_type', 'listing')
          .eq('target_id', id)
          .order('created_at', { ascending: false }),
      ]);
      for (const res of [listing, suspensions, reviewCase, reports]) {
        if (res.error) throw res.error;
      }
      return {
        ...(listing.data as unknown as StaffListingRow),
        suspensions: (suspensions.data ?? []) as ListingSuspensionRow[],
        reviewCase: reviewCase.data as StaffListingDetail['reviewCase'],
        reports: (reports.data ?? []) as StaffListingDetail['reports'],
      };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

export type AuditEvent = {
  source: 'verification' | 'moderation';
  event_id: number;
  at: string;
  actor: string | null;
  actor_name: string | null;
  action: string;
  subject_type: 'user' | 'listing' | 'report' | 'conversation';
  subject_id: string;
  subject_label: string | null;
  note: string | null;
};

export function useAuditLog(actor: string | null, subject: string | null, enabled: boolean) {
  return useQuery({
    queryKey: staffKeys.audit(actor, subject),
    enabled,
    // An audit log read from cache is not an audit log.
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_audit_log', {
        p_actor: actor,
        p_subject_id: subject,
        p_limit: 200,
      });
      if (error) throw error;
      return data as AuditEvent[];
    },
  });
}

/** Plain words for the action codes the functions write. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  submitted: 'Submitted for review',
  resubmitted: 'Sent back for review',
  approved: 'Approved',
  rejected: 'Refused',
  changes_requested: 'Asked for changes',
  viewed_location: 'Looked at the exact address',
  report_triaged: 'Set report severity',
  report_resolved: 'Resolved a report',
  report_dismissed: 'Dismissed a report',
  listing_suspend: 'Suspended a listing',
  listing_restore: 'Restored a listing',
  account_suspend: 'Suspended an account',
  account_restore: 'Restored an account',
  conversation_viewed: 'Read a reported conversation',
  role_granted: 'Granted a role',
  role_revoked: 'Removed a role',
  booking_cancelled: 'Cancelled a booking',
  reopened_for_review: 'Sent back to review after an edit',
};

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

export type StaffMember = {
  user_id: string;
  roles: StaffRole[];
  full_name: string | null;
};

/** Admin only: for anyone else RLS returns just their own roles. */
export function useStaffMembers(enabled: boolean) {
  return useQuery({
    queryKey: staffKeys.roles,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role, profile:profiles!user_id (full_name)')
        .order('granted_at', { ascending: true });
      if (error) throw error;

      const byUser = new Map<string, StaffMember>();
      for (const row of data as unknown as {
        user_id: string;
        role: StaffRole;
        profile: { full_name: string | null } | null;
      }[]) {
        const member = byUser.get(row.user_id) ?? {
          user_id: row.user_id,
          roles: [],
          full_name: row.profile?.full_name ?? null,
        };
        member.roles.push(row.role);
        byUser.set(row.user_id, member);
      }
      return [...byUser.values()];
    },
  });
}

export function useSetStaffRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role: StaffRole; grant: boolean }) => {
      const { error } = await supabase.rpc('set_staff_role', {
        p_user_id: input.userId,
        p_role: input.role,
        p_grant: input.grant,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}
