import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';

import { ImageCarousel } from '@/components/image-carousel';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, Chip, SectionTitle, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import type { CaseDecision, ListingBadgeKind } from '@/features/listings/types';
import { listingFacts } from '@/features/listings/types';
import {
  useCaseDetail,
  useDecideVerification,
  useStaffLocation,
} from '@/features/verification/queries';
import {
  CASE_STATUS_LABELS,
  LISTING_BADGE_LABELS,
  LISTING_BADGE_ORDER,
} from '@/features/verification/types';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

const DECISION_TITLES: Record<CaseDecision, string> = {
  approved: 'Approved',
  changes_requested: 'Changes requested',
  rejected: 'Not approved',
};

export default function ReviewCaseScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { isStaff, session } = useAuth();
  const router = useRouter();

  const detail = useCaseDetail(caseId, isStaff);
  const decide = useDecideVerification();
  const location = useStaffLocation();

  const [checks, setChecks] = useState<ListingBadgeKind[]>([]);
  const [note, setNote] = useState('');

  if (!isStaff) {
    return <EmptyState title="Staff only" message="This page is for verification staff." />;
  }
  if (detail.isPending) return <LoadingState label="Loading the case…" />;
  if (detail.isError)
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  const c = detail.data;
  const listing = c.listings;
  const isListing = c.subject_type === 'listing';
  const isOpen = c.status === 'submitted' || c.status === 'changes_requested';
  const isOwnCase = c.profile_id === session?.user.id;

  // Mirrors decide_verification's own refusals, so the reviewer sees why
  // before pressing rather than after.
  const approveBlocker = isOwnCase
    ? 'You cannot review your own case.'
    : isListing && !c.ownerHasIdentity
      ? "Check the landlord's ID first. Their identity case is in the queue."
      : isListing && checks.length === 0
        ? 'Tick at least one check you actually performed.'
        : null;

  function toggle(kind: ListingBadgeKind) {
    setChecks((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));
  }

  function onDecide(decision: CaseDecision) {
    if (decision !== 'approved' && !note.trim()) {
      Alert.alert('Add a note', 'Tell the landlord what to fix or why it was refused.');
      return;
    }
    decide.mutate(
      { caseId: c.id, decision, note, checks: isListing ? checks : [] },
      {
        onSuccess: () => {
          Alert.alert(DECISION_TITLES[decision], 'The landlord can see the result now.');
          router.back();
        },
        onError: (e) => Alert.alert('Could not record the decision', e.message),
      },
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isListing ? 'Review listing' : 'Review landlord ID' }} />

      <View style={styles.headerBlock}>
        <Text style={styles.caption}>
          {CASE_STATUS_LABELS[c.status]} · sent {timeAgo(c.submitted_at)}
        </Text>
        <Text style={styles.h2}>{c.owner?.full_name ?? 'Unnamed landlord'}</Text>
        {isListing && (
          <Text style={styles.meta}>
            {c.ownerHasIdentity ? 'ID checked' : 'ID not checked yet'}
          </Text>
        )}
        {c.reopen_reason && (
          <Text style={styles.warning}>
            {c.reopen_reason === 'location'
              ? 'Approved before. The landlord has since changed the location, and every earlier check was removed. Check it as a new property.'
              : 'Approved before. The landlord has since changed the photos. "Details reviewed" was removed; the other checks stand unless you see a reason to doubt them.'}
          </Text>
        )}
      </View>

      {isListing && listing && (
        <View style={styles.section}>
          <ImageCarousel paths={listing.listing_images.map((i) => i.storage_path)} />
          <Text style={styles.bodyStrong}>{listing.title}</Text>
          <Text style={styles.meta}>
            {[
              formatPrice(listing.price_rwf) + ' / month',
              formatLocation(listing.sector, listing.district),
              ...listingFacts(listing),
            ].join(' · ')}
          </Text>
          {!!listing.description && <Text style={styles.body}>{listing.description}</Text>}

          {location.data ? (
            <View style={styles.box}>
              <Text style={styles.bodyStrong}>{location.data.address ?? 'No address given'}</Text>
              {location.data.latitude != null && location.data.longitude != null && (
                <Text style={styles.meta}>
                  {location.data.latitude.toFixed(5)}, {location.data.longitude.toFixed(5)}
                </Text>
              )}
              <Text style={styles.caption}>Your view of this address was logged.</Text>
            </View>
          ) : (
            <Button
              label="Show exact address"
              variant="secondary"
              loading={location.isPending}
              onPress={() =>
                location.mutate(listing.id, {
                  onError: (e) => Alert.alert('Could not load the address', e.message),
                })
              }
            />
          )}
        </View>
      )}

      {!isListing && (
        <View style={styles.section}>
          <SectionTitle>Documents</SectionTitle>
          {c.evidence.length === 0 ? (
            <Text style={styles.meta}>
              No documents arrived. Request changes and ask them to send the photo again.
            </Text>
          ) : (
            c.evidence.map((e) =>
              e.url ? (
                <Image
                  key={e.id}
                  source={{ uri: e.url }}
                  style={styles.document}
                  contentFit="contain"
                  // Never cached to disk: these are identity documents on a
                  // phone that may be shared or lost.
                  cachePolicy="memory"
                />
              ) : (
                <Text key={e.id} style={styles.meta}>
                  A document could not be loaded.
                </Text>
              ),
            )
          )}
          <Text style={styles.caption}>Links expire after a few minutes.</Text>
        </View>
      )}

      {isOpen ? (
        <>
          {isListing && (
            <View style={styles.section}>
              <SectionTitle>What you checked</SectionTitle>
              <Text style={styles.meta}>
                Each ticked check becomes a badge tenants see. Only tick what you
                actually verified.
              </Text>
              <View style={styles.chips}>
                {LISTING_BADGE_ORDER.map((kind) => (
                  <Chip
                    key={kind}
                    label={LISTING_BADGE_LABELS[kind].label}
                    selected={checks.includes(kind)}
                    onPress={() => toggle(kind)}
                  />
                ))}
              </View>
            </View>
          )}

          <TextField
            label="Note to the landlord"
            hint="Required to request changes or refuse."
            value={note}
            onChangeText={setNote}
            multiline
            style={styles.noteInput}
          />

          {!!approveBlocker && <Text style={styles.warning}>{approveBlocker}</Text>}

          <View style={styles.actions}>
            <Button
              label="Approve"
              onPress={() => onDecide('approved')}
              disabled={!!approveBlocker || decide.isPending}
              loading={decide.isPending && decide.variables?.decision === 'approved'}
            />
            <Button
              label="Request changes"
              variant="secondary"
              onPress={() => onDecide('changes_requested')}
              disabled={isOwnCase || decide.isPending}
            />
            <Button
              label="Reject"
              variant="danger"
              onPress={() => onDecide('rejected')}
              disabled={isOwnCase || decide.isPending}
            />
          </View>
        </>
      ) : (
        <View style={styles.box}>
          <Text style={styles.bodyStrong}>{CASE_STATUS_LABELS[c.status]}</Text>
          {!!c.decided_at && <Text style={styles.meta}>Decided {timeAgo(c.decided_at)}</Text>}
          {!!c.decision_note && <Text style={styles.body}>{c.decision_note}</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  headerBlock: { gap: 2 },
  section: { gap: spacing.sm },
  h2: type.h2,
  body: type.body,
  bodyStrong: type.bodyStrong,
  meta: type.meta,
  caption: type.caption,
  box: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  document: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  warning: { ...type.label, color: colors.danger },
  actions: { gap: spacing.sm },
});
