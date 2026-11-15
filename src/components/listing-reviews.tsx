import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { reviewSummary, useListingReviews } from '@/features/listings/extras';
import { timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { colors, spacing, type } from '@/theme';

const PREVIEW = 3;

/**
 * Reviews of a listing, from people who rented it through the app.
 *
 * Renders nothing at all until there is one: a new listing should not carry a
 * "No reviews yet" line that reads as a mark against it.
 */
export function ListingReviews({ listingId }: { listingId: string }) {
  const t = useT();
  const reviews = useListingReviews(listingId);
  const [showAll, setShowAll] = useState(false);

  const summary = reviews.data ? reviewSummary(reviews.data) : null;
  if (!reviews.data || !summary) return null;

  const shown = showAll ? reviews.data : reviews.data.slice(0, PREVIEW);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Reviews')}</Text>
        <Ionicons name="star" size={16} color={colors.softBlack} />
        <Text style={styles.average}>
          {summary.average} · {summary.count}
        </Text>
      </View>
      <Text style={styles.caption}>From people who rented this place through Rwanda Rentals.</Text>

      {shown.map((r) => (
        <View key={r.id} style={styles.review}>
          <View style={styles.reviewTop}>
            <Text style={styles.author}>{r.author?.full_name ?? 'A former tenant'}</Text>
            <Text style={styles.caption}>{timeAgo(r.created_at)}</Text>
          </View>
          <View style={styles.stars} accessibilityLabel={`${r.rating} of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons
                key={n}
                name={n <= r.rating ? 'star' : 'star-outline'}
                size={14}
                color={n <= r.rating ? colors.softBlack : colors.border}
              />
            ))}
          </View>
          {!!r.body && <Text style={styles.body}>{r.body}</Text>}
        </View>
      ))}

      {reviews.data.length > PREVIEW && (
        <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)}>
          <Text style={styles.link}>
            {showAll ? t('Show less') : `Show all ${reviews.data.length} reviews`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...type.h2, marginRight: spacing.sm },
  average: type.bodyStrong,
  caption: type.caption,
  review: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: type.bodyStrong,
  stars: { flexDirection: 'row', gap: 2 },
  body: type.body,
  link: { ...type.label, textDecorationLine: 'underline' },
});
