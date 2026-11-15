import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import type { ListingBadgeKind } from '@/features/listings/types';
import {
  LISTING_BADGE_LABELS,
  LISTING_BADGE_ORDER,
  PROFILE_BADGE_LABELS,
} from '@/features/verification/types';
import { timeAgo } from '@/lib/format';
import { colors, fontFamily, radius, spacing, type } from '@/theme';
import { translate } from '@/lib/i18n';

/**
 * Verification badges.
 *
 * Deliberately unlike the Featured pill: Featured is paid placement in gold on
 * the photo, and these are green-on-white in the card body with a shield.
 * Paid placement must never look like a check someone performed.
 */

type Badge = { kind: ListingBadgeKind; checked_at: string };

function ordered(badges: Badge[] | undefined): Badge[] {
  return [...(badges ?? [])].sort(
    (a, b) => LISTING_BADGE_ORDER.indexOf(a.kind) - LISTING_BADGE_ORDER.indexOf(b.kind),
  );
}

/** One line for a feed card: the strongest check, plus how many more. */
export function CompactBadges({ badges }: { badges: Badge[] | undefined }) {
  const list = ordered(badges);
  if (list.length === 0) return null;
  const more = list.length - 1;

  return (
    <View style={styles.compact}>
      <Ionicons name="shield-checkmark" size={14} color={colors.success} />
      <Text style={styles.compactText} numberOfLines={1}>
        {LISTING_BADGE_LABELS[list[0].kind].label}
        {more > 0 ? translate(more === 1 ? ' · {n} more check' : ' · {n} more checks', { n: more }) : ''}
      </Text>
    </View>
  );
}

/** The listing page: every check, what it means, and when it was done. */
export function BadgeList({
  badges,
  identityCheckedAt,
}: {
  badges: Badge[] | undefined;
  /** When the landlord's ID was checked, or null if it has not been. */
  identityCheckedAt: string | null;
}) {
  const rows = [
    ...(identityCheckedAt
      ? [{ key: 'identity', ...PROFILE_BADGE_LABELS.identity_checked, at: identityCheckedAt }]
      : []),
    ...ordered(badges).map((b) => ({
      key: b.kind,
      ...LISTING_BADGE_LABELS[b.kind],
      at: b.checked_at,
    })),
  ];

  if (rows.length === 0) {
    return (
      <View style={styles.list}>
        <Text style={styles.none}>
          This listing has not been checked by Rwanda Rentals yet.
        </Text>
        <ExplainerLink />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          <Ionicons name="shield-checkmark" size={18} color={colors.success} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            <Text style={styles.rowDetail}>
              {r.detail} Checked {timeAgo(r.at)}.
            </Text>
          </View>
        </View>
      ))}
      <Text style={styles.none}>
        Checks lower the risk; they are not a guarantee. Never pay before you have
        seen the place.
      </Text>
      <ExplainerLink />
    </View>
  );
}

function ExplainerLink() {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push('/help/badges')}>
      <Text style={styles.link}>What these checks mean</Text>
    </Pressable>
  );
}

/** A single named badge, e.g. "ID checked" on a profile card. */
export function BadgePill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Ionicons name="shield-checkmark" size={14} color={colors.success} />
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  compactText: {
    ...type.caption,
    fontFamily: fontFamily.semibold,
    color: colors.success,
    flexShrink: 1,
  },

  list: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  rowText: { flex: 1, gap: 2 },
  rowLabel: type.bodyStrong,
  rowDetail: type.meta,
  none: type.caption,
  link: { ...type.caption, color: colors.softBlack, textDecorationLine: 'underline' },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.successTint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  pillText: {
    ...type.caption,
    fontFamily: fontFamily.semibold,
    color: colors.success,
  },
});
