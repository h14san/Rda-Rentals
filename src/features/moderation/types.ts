/**
 * Reports and moderation. Mirrors
 * supabase/migrations/20261115120000_reports_and_moderation.sql.
 */

export type ReportTarget = 'listing' | 'user' | 'message' | 'conversation';
export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';
export type ReportSeverity = 'low' | 'medium' | 'high';
export type ReportAction = 'listing_suspended' | 'account_suspended';
export type ModerationAction = 'suspend' | 'restore';

/** The Blueprint §27 list. The check constraint on reports.reason is the same. */
export const REPORT_REASONS = [
  'fake_property',
  'fake_landlord',
  'incorrect_price',
  'property_unavailable',
  'misleading_photos',
  'misleading_description',
  'duplicate_listing',
  'scam',
  'harassment',
  'inappropriate_content',
  'suspicious_payment_request',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  fake_property: 'This property does not exist',
  fake_landlord: 'Not the real landlord',
  incorrect_price: 'The price is wrong',
  property_unavailable: 'It is no longer available',
  misleading_photos: 'The photos are misleading',
  misleading_description: 'The description is misleading',
  duplicate_listing: 'It is a duplicate listing',
  scam: 'It looks like a scam',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate content',
  suspicious_payment_request: 'Asked for payment in a suspicious way',
  other: 'Something else',
};

/**
 * Which reasons are offered for which target. The database accepts any reason
 * on any target; this only keeps the form short, because "duplicate listing"
 * is not a thing a person can be.
 */
export const REASONS_FOR_TARGET: Record<ReportTarget, ReportReason[]> = {
  listing: [
    'fake_property',
    'property_unavailable',
    'incorrect_price',
    'misleading_photos',
    'misleading_description',
    'duplicate_listing',
    'scam',
    'suspicious_payment_request',
    'inappropriate_content',
    'other',
  ],
  user: [
    'fake_landlord',
    'scam',
    'suspicious_payment_request',
    'harassment',
    'inappropriate_content',
    'other',
  ],
  message: [
    'scam',
    'suspicious_payment_request',
    'harassment',
    'inappropriate_content',
    'other',
  ],
  conversation: [
    'scam',
    'suspicious_payment_request',
    'harassment',
    'fake_landlord',
    'inappropriate_content',
    'other',
  ],
};

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  listing: 'Listing',
  user: 'Account',
  message: 'Message',
  conversation: 'Conversation',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Received',
  in_review: 'Being reviewed',
  resolved: 'Resolved',
  dismissed: 'No action taken',
};

export const SEVERITY_LABELS: Record<ReportSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Queue order: the most urgent first, untriaged after everything that is. */
export const SEVERITY_RANK: Record<ReportSeverity | 'none', number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

/** What the reporter is told when a report was closed by an action. */
export const REPORT_ACTION_LABELS: Record<ReportAction, string> = {
  listing_suspended: 'We suspended the listing.',
  account_suspended: 'We suspended the account.',
};

export type ReportRow = {
  id: string;
  /** Null for automated flags, and for a reporter who has since left. */
  reporter_id: string | null;
  target_type: ReportTarget;
  target_id: string;
  /**
   * Who the report is about, resolved by the server when it is made: the
   * listing's owner, the account, the message's sender, or the other person in
   * the conversation.
   */
  subject_user_id: string | null;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  severity: ReportSeverity | null;
  resolution_note: string | null;
  action_taken: ReportAction | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type AccountRestrictionRow = {
  id: string;
  user_id: string;
  note: string;
  restricted_at: string;
  lifted_at: string | null;
  lift_note: string | null;
};

export type ListingSuspensionRow = {
  id: string;
  listing_id: string;
  note: string;
  suspended_at: string;
  lifted_at: string | null;
  lift_note: string | null;
};

export type ModerationEventRow = {
  id: number;
  actor: string | null;
  action: string;
  subject_type: 'listing' | 'user' | 'report' | 'conversation';
  subject_id: string;
  report_id: string | null;
  note: string | null;
  at: string;
};

export function isOpenReport(status: ReportStatus): boolean {
  return status === 'open' || status === 'in_review';
}
