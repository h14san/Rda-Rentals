import type {
  CaseStatus,
  ListingBadgeKind,
  ProfileBadgeKind,
} from '@/features/listings/types';

/**
 * Badge wording (rule 8, Features #22).
 *
 * Each label says what a person at Rwanda Rentals actually checked, never a bare
 * "Verified". `detail` is the longer line shown on the listing page, because a
 * badge is not a guarantee against all risk and should not read like one.
 */
export const PROFILE_BADGE_LABELS: Record<ProfileBadgeKind, { label: string; detail: string }> =
  {
    identity_checked: {
      label: 'ID checked',
      detail: "Rwanda Rentals checked this landlord's identity document.",
    },
  };

export const LISTING_BADGE_LABELS: Record<ListingBadgeKind, { label: string; detail: string }> =
  {
    existence_checked: {
      label: 'Property checked',
      detail: 'Rwanda Rentals confirmed this property exists at the stated location.',
    },
    authorization_checked: {
      label: 'Authorized to list',
      detail: 'The advertiser showed they are allowed to rent this property out.',
    },
    information_checked: {
      label: 'Details reviewed',
      detail: 'The rent, terms and photos were reviewed against the property.',
    },
  };

/** Display order: the strongest check first, so a one-badge card shows it. */
export const LISTING_BADGE_ORDER: ListingBadgeKind[] = [
  'existence_checked',
  'authorization_checked',
  'information_checked',
];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  submitted: 'Waiting for review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Not approved',
};

/**
 * Larger than listing photos (1600px / q0.7): an identity document has small
 * print that has to survive compression, and there are only one or two of them.
 */
export const EVIDENCE_MAX_EDGE = 2000;
export const EVIDENCE_QUALITY = 0.8;
export const MAX_EVIDENCE_PHOTOS = 2;

/** How long a reviewer's link to a document stays valid. */
export const EVIDENCE_URL_TTL_S = 300;
