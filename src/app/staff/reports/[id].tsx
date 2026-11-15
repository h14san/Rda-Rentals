import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';

import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button, Chip, SectionTitle, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { LISTING_STATUS_LABELS } from '@/features/listings/types';
import {
  useModerateListing,
  useReportDetail,
  useResolveReport,
  useRestrictAccount,
  useTriageReport,
} from '@/features/moderation/queries';
import {
  REPORT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  SEVERITY_LABELS,
  isOpenReport,
  type ReportSeverity,
} from '@/features/moderation/types';
import { formatLocation, formatPrice, timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

const SEVERITIES: ReportSeverity[] = ['low', 'medium', 'high'];

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isStaff } = useAuth();
  const router = useRouter();

  const detail = useReportDetail(id, isStaff);
  const triage = useTriageReport();
  const resolve = useResolveReport();
  const moderateListing = useModerateListing();
  const restrictAccount = useRestrictAccount();

  const [note, setNote] = useState('');

  if (!isStaff) {
    return <EmptyState title="Staff only" message="Reports are handled by Rwanda Rentals staff." />;
  }
  if (detail.isPending) return <LoadingState label="Loading the report…" />;
  if (detail.isError)
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  const r = detail.data;
  const open = isOpenReport(r.status);
  const busy =
    triage.isPending || resolve.isPending || moderateListing.isPending || restrictAccount.isPending;
  const listingSuspended = r.listing?.status === 'suspended';
  const isChat = r.target_type === 'message' || r.target_type === 'conversation';

  /** Every action here is read by someone, so none goes out without a note. */
  function withNote(run: (trimmed: string) => void) {
    const trimmed = note.trim();
    if (!trimmed) {
      Alert.alert('Add a note', 'The person affected by this action will read it.');
      return;
    }
    run(trimmed);
  }

  const done = (title: string, leave = true) => ({
    onSuccess: () => {
      setNote('');
      Alert.alert(title);
      if (leave) router.back();
    },
    onError: (e: Error) => Alert.alert('That did not work', e.message),
  });

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.headerBlock}>
        <Text style={styles.caption}>
          {REPORT_TARGET_LABELS[r.target_type]} · {REPORT_STATUS_LABELS[r.status]} · sent{' '}
          {timeAgo(r.created_at)}
        </Text>
        <Text style={styles.h2}>{REPORT_REASON_LABELS[r.reason]}</Text>
        <Text style={styles.meta}>
          {r.reporter_id === null
            ? 'Flagged automatically'
            : `Reported by ${r.reporter?.full_name ?? 'unknown'}`}
          {r.otherReports > 0
            ? ` · ${r.otherReports} other report${r.otherReports === 1 ? '' : 's'} on this`
            : ''}
        </Text>
        {!!r.note && <Text style={styles.body}>{r.note}</Text>}
      </View>

      <View style={styles.section}>
        <SectionTitle>About</SectionTitle>
        {r.target_type === 'listing' &&
          (r.listing ? (
            <View style={styles.box}>
              <Text style={styles.bodyStrong}>{r.listing.title}</Text>
              <Text style={styles.meta}>
                {[
                  formatPrice(r.listing.price_rwf),
                  formatLocation(r.listing.sector, r.listing.district),
                  LISTING_STATUS_LABELS[r.listing.status],
                ].join(' · ')}
              </Text>
              <Button
                label="Open listing"
                variant="secondary"
                onPress={() => router.push(`/listing/${r.listing!.id}`)}
              />
            </View>
          ) : (
            <Text style={styles.meta}>This listing has been deleted.</Text>
          ))}
        {r.user ? (
          <View style={styles.box}>
            <Text style={styles.bodyStrong}>{r.user.full_name ?? 'Unnamed account'}</Text>
            <Text style={styles.meta}>
              {r.target_type === 'listing'
                ? 'Owner of the listing'
                : r.target_type === 'message'
                  ? 'Sent the reported message'
                  : r.target_type === 'conversation'
                    ? 'The other person in the conversation'
                    : 'Reported account'}
              {r.accountRestricted ? ' · account suspended' : ''}
            </Text>
            <Button
              label="Open profile"
              variant="secondary"
              onPress={() => router.push(`/user/${r.user!.id}`)}
            />
          </View>
        ) : (
          r.target_type === 'user' && (
            <Text style={styles.meta}>This account has been deleted.</Text>
          )
        )}
      </View>

      {isChat && (
        <View style={styles.section}>
          {open ? (
            <Button
              label="Read the conversation (logged)"
              variant="secondary"
              onPress={() => router.push(`/staff/conversation/${r.id}`)}
            />
          ) : (
            <Text style={styles.meta}>
              The conversation is closed to staff now that this report is closed.
            </Text>
          )}
        </View>
      )}

      {open && (
        <View style={styles.section}>
          <SectionTitle>Severity</SectionTitle>
          <View style={styles.chips}>
            {SEVERITIES.map((s) => (
              <Chip
                key={s}
                label={SEVERITY_LABELS[s]}
                selected={r.severity === s}
                onPress={() =>
                  triage.mutate(
                    { reportId: r.id, severity: s },
                    { onError: (e) => Alert.alert('That did not work', e.message) },
                  )
                }
              />
            ))}
          </View>
          <Text style={styles.caption}>Setting a severity marks the report as in review.</Text>
        </View>
      )}

      {!open && (
        <View style={styles.box}>
          <Text style={styles.bodyStrong}>{REPORT_STATUS_LABELS[r.status]}</Text>
          {!!r.resolved_at && <Text style={styles.meta}>Closed {timeAgo(r.resolved_at)}</Text>}
          {!!r.action_taken && (
            <Text style={styles.body}>{REPORT_ACTION_LABELS[r.action_taken]}</Text>
          )}
          {!!r.resolution_note && <Text style={styles.body}>{r.resolution_note}</Text>}
        </View>
      )}

      <TextField
        label="Note"
        hint="Suspending or restoring: the landlord reads this. Resolving or dismissing: the reporter reads it."
        value={note}
        onChangeText={setNote}
        multiline
        style={styles.noteInput}
      />

      <View style={styles.actions}>
        {r.listing && !listingSuspended && (
          <Button
            label="Suspend listing"
            variant="danger"
            disabled={busy}
            onPress={() =>
              withNote((n) =>
                moderateListing.mutate(
                  {
                    listingId: r.listing!.id,
                    action: 'suspend',
                    note: n,
                    reportId: open ? r.id : null,
                  },
                  done('Listing suspended'),
                ),
              )
            }
          />
        )}
        {r.listing && listingSuspended && (
          <Button
            label="Restore listing"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              withNote((n) =>
                moderateListing.mutate(
                  { listingId: r.listing!.id, action: 'restore', note: n },
                  done('Listing restored to its earlier status', false),
                ),
              )
            }
          />
        )}
        {r.user && !r.accountRestricted && (
          <Button
            label="Suspend account"
            variant="danger"
            disabled={busy}
            onPress={() =>
              withNote((n) =>
                restrictAccount.mutate(
                  {
                    userId: r.user!.id,
                    action: 'suspend',
                    note: n,
                    reportId: open ? r.id : null,
                  },
                  done('Account suspended'),
                ),
              )
            }
          />
        )}
        {r.user && r.accountRestricted && (
          <Button
            label="Restore account"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              withNote((n) =>
                restrictAccount.mutate(
                  { userId: r.user!.id, action: 'restore', note: n },
                  done('Account restored', false),
                ),
              )
            }
          />
        )}
        {open && (
          <>
            <Button
              label="Resolve with this reply"
              disabled={busy}
              onPress={() =>
                withNote((n) =>
                  resolve.mutate(
                    { reportId: r.id, outcome: 'resolved', note: n },
                    done('Report resolved'),
                  ),
                )
              }
            />
            <Button
              label="Dismiss: no action"
              variant="secondary"
              disabled={busy}
              onPress={() =>
                withNote((n) =>
                  resolve.mutate(
                    { reportId: r.id, outcome: 'dismissed', note: n },
                    done('Report dismissed'),
                  ),
                )
              }
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  headerBlock: { gap: spacing.xs },
  section: { gap: spacing.sm },
  h2: type.h2,
  body: type.body,
  bodyStrong: type.bodyStrong,
  meta: type.meta,
  caption: type.caption,
  box: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  noteInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.sm },
  actions: { gap: spacing.sm },
});
