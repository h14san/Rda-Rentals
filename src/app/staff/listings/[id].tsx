import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';

import { StaffOnly, StaffRow } from '@/components/staff';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { LISTING_STATUS_LABELS } from '@/features/listings/types';
import { useModerateListing } from '@/features/moderation/queries';
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from '@/features/moderation/types';
import { useStaffListing } from '@/features/staff/queries';
import { CASE_STATUS_LABELS } from '@/features/verification/types';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

/** One listing, as staff see it: its status, its review, and what was said about it. */
export default function StaffListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isStaff, session } = useAuth();
  const router = useRouter();
  const listing = useStaffListing(id, isStaff);
  const moderate = useModerateListing();
  const [note, setNote] = useState('');

  if (!isStaff) return <StaffOnly />;
  if (listing.isPending) return <LoadingState label="Loading the listing…" />;
  if (listing.isError)
    return <ErrorState error={listing.error} onRetry={() => void listing.refetch()} />;

  const l = listing.data;
  const suspended = l.status === 'suspended';
  const isOwn = session?.user.id === l.owner_id;
  const active = l.suspensions.find((s) => s.lifted_at === null) ?? null;

  function act() {
    const trimmed = note.trim();
    if (!trimmed) {
      Alert.alert('Add a note', 'The landlord will read it.');
      return;
    }
    moderate.mutate(
      { listingId: l.id, action: suspended ? 'restore' : 'suspend', note: trimmed },
      {
        onSuccess: () => {
          setNote('');
          void listing.refetch();
        },
        onError: (e) => Alert.alert('That did not work', e.message),
      },
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.caption}>{LISTING_STATUS_LABELS[l.status]}</Text>
        <Text style={styles.h2}>{l.title}</Text>
        <Text style={styles.meta}>
          {formatPrice(l.price_rwf)} · {formatLocation(l.sector, l.district)} · posted{' '}
          {timeAgo(l.created_at)}
        </Text>
        <Button
          label="Open the listing page"
          variant="secondary"
          onPress={() => router.push(`/listing/${l.id}`)}
        />
        <Button
          label={`Owner: ${l.owner?.full_name ?? 'unknown'}`}
          variant="secondary"
          onPress={() => router.push(`/staff/users/${l.owner_id}`)}
        />
        {l.reviewCase && (
          <Button
            label={`Review case: ${CASE_STATUS_LABELS[l.reviewCase.status].toLowerCase()}`}
            variant="secondary"
            onPress={() => router.push(`/review/${l.reviewCase!.id}`)}
          />
        )}
        <Button
          label="Activity on this listing"
          variant="secondary"
          onPress={() => router.push({ pathname: '/staff/audit', params: { subject: l.id } })}
        />
      </View>

      <View style={styles.section}>
        <SectionTitle>Moderation</SectionTitle>
        {active && (
          <View style={[styles.box, styles.danger]}>
            <Text style={styles.bodyStrong}>Suspended {timeAgo(active.suspended_at)}</Text>
            <Text style={styles.body}>{active.note}</Text>
          </View>
        )}
        {isOwn ? (
          <Text style={styles.meta}>This is your own listing. Another staff member must moderate it.</Text>
        ) : (
          <>
            <TextField
              label="Note to the landlord"
              hint={
                suspended
                  ? 'Required. Restoring returns it to the status it had before, not straight to live.'
                  : 'Required. They read it in the app.'
              }
              value={note}
              onChangeText={setNote}
              multiline
              style={styles.noteInput}
            />
            <Button
              label={suspended ? 'Restore listing' : 'Suspend listing'}
              variant={suspended ? 'secondary' : 'danger'}
              loading={moderate.isPending}
              onPress={act}
            />
          </>
        )}

        {l.suspensions
          .filter((s) => s.lifted_at !== null)
          .map((s) => (
            <View key={s.id} style={styles.box}>
              <Text style={styles.caption}>
                Suspended {timeAgo(s.suspended_at)} · lifted {timeAgo(s.lifted_at!)}
              </Text>
              <Text style={styles.meta}>{s.note}</Text>
              {!!s.lift_note && <Text style={styles.meta}>Lifted: {s.lift_note}</Text>}
            </View>
          ))}
      </View>

      <View style={styles.section}>
        <SectionTitle>Reports ({l.reports.length})</SectionTitle>
        {l.reports.length === 0 && <Text style={styles.meta}>None.</Text>}
        {l.reports.map((r) => (
          <StaffRow
            key={r.id}
            caption={`${REPORT_STATUS_LABELS[r.status]} · ${timeAgo(r.created_at)}`}
            title={REPORT_REASON_LABELS[r.reason]}
            onPress={() => router.push(`/staff/reports/${r.id}`)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.xl, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  box: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  danger: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.danger },
  noteInput: { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.sm },
  h2: type.h2,
  body: type.body,
  bodyStrong: type.bodyStrong,
  meta: type.meta,
  caption: type.caption,
});
