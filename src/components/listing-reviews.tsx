import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  reviewSummary,
  useListingReviews,
  useRemoveReview,
  useReplyToReview,
} from '@/features/listings/extras';
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
export function ListingReviews({
  listingId,
  ownerId,
}: {
  listingId: string;
  /** The landlord, who may answer each review once. */
  ownerId?: string;
}) {
  const t = useT();
  const { session, isStaff } = useAuth();
  const reply = useReplyToReview();
  const remove = useRemoveReview();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const isOwner = !!ownerId && session?.user.id === ownerId;
  const reviews = useListingReviews(listingId);
  const [showAll, setShowAll] = useState(false);

  // Staff also receive removed reviews; they do not count towards the rating.
  const summary = reviews.data
    ? reviewSummary(reviews.data.filter((r) => !r.removed_at))
    : null;
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
          {!!r.removed_at && <Text style={styles.removed}>Removed by staff. Hidden from everyone else.</Text>}

          {!!r.reply && (
            <View style={styles.reply}>
              <Text style={styles.caption}>Reply from the landlord</Text>
              <Text style={styles.body}>{r.reply}</Text>
            </View>
          )}

          {isOwner && !r.reply && replyingTo !== r.id && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDraft('');
                setReplyingTo(r.id);
              }}
            >
              <Text style={styles.link}>Reply</Text>
            </Pressable>
          )}
          {isOwner && replyingTo === r.id && (
            <View style={styles.replyForm}>
              <TextField
                label="Your reply"
                hint="Public, and you can reply once. Phone numbers and emails are removed."
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={1000}
              />
              <Button
                label="Post reply"
                disabled={!draft.trim()}
                loading={reply.isPending}
                onPress={() =>
                  reply.mutate(
                    { reviewId: r.id, body: draft },
                    {
                      onSuccess: () => setReplyingTo(null),
                      onError: (e) => Alert.alert('Not posted', e.message),
                    },
                  )
                }
              />
            </View>
          )}

          {/* Staff remove a review that breaks the rules. The reason is fixed
              here because a free-text prompt does not exist on Android; the
              audit log records who and when. */}
          {isStaff && !isOwner && !r.removed_at && (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert('Remove this review?', 'It is hidden from everyone but staff.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () =>
                      remove.mutate(
                        { reviewId: r.id, note: 'Removed by staff from the listing page.' },
                        { onError: (e) => Alert.alert('Not removed', e.message) },
                      ),
                  },
                ])
              }
            >
              <Text style={[styles.link, styles.danger]}>Remove (staff)</Text>
            </Pressable>
          )}
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
  danger: { color: colors.danger },
  removed: { ...type.caption, color: colors.danger },
  reply: {
    gap: 2,
    marginTop: spacing.xs,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  replyForm: { gap: spacing.sm, marginTop: spacing.xs },
});
