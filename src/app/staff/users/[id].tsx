import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';

import { StaffOnly, StaffRow } from '@/components/staff';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle, TextField } from '@/components/ui';
import { BadgePill } from '@/components/verification-badges';
import { useAuth } from '@/features/auth/context';
import {
  LISTING_STATUS_LABELS,
  type StaffRole,
} from '@/features/listings/types';
import { useRestrictAccount } from '@/features/moderation/queries';
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from '@/features/moderation/types';
import { useSetStaffRole, useStaffUser } from '@/features/staff/queries';
import { CASE_STATUS_LABELS, PROFILE_BADGE_LABELS } from '@/features/verification/types';
import { formatPrice, timeAgo } from '@/lib/format';
import { colors, radius, shadow, spacing, type } from '@/theme';

const ROLE_LABELS: Record<StaffRole, string> = { admin: 'Admin', verifier: 'Verifier' };

/** One account, as staff see it: what was checked, what they list, what was said about them. */
export default function StaffUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isStaff, roles: myRoles, session } = useAuth();
  const router = useRouter();
  const user = useStaffUser(id, isStaff);
  const restrict = useRestrictAccount();
  const setRole = useSetStaffRole();
  const [note, setNote] = useState('');

  if (!isStaff) return <StaffOnly />;
  if (user.isPending) return <LoadingState label="Loading the account…" />;
  if (user.isError) return <ErrorState error={user.error} onRetry={() => void user.refetch()} />;

  const u = user.data;
  const active = u.restrictions.find((r) => r.lifted_at === null) ?? null;
  const isSelf = session?.user.id === u.profile.id;
  const iAmAdmin = myRoles.includes('admin');

  function act(action: 'suspend' | 'restore') {
    const trimmed = note.trim();
    if (!trimmed) {
      Alert.alert('Add a note', "The account's owner will read it.");
      return;
    }
    restrict.mutate(
      { userId: u.profile.id, action, note: trimmed },
      {
        onSuccess: () => {
          setNote('');
          void user.refetch();
        },
        onError: (e) => Alert.alert('That did not work', e.message),
      },
    );
  }

  function changeRole(role: StaffRole, grant: boolean) {
    Alert.alert(
      grant ? `Make this account ${ROLE_LABELS[role].toLowerCase()}?` : `Remove ${ROLE_LABELS[role].toLowerCase()}?`,
      grant
        ? role === 'admin'
          ? 'An admin can do everything, including granting roles.'
          : 'A verifier can review IDs and listings, handle reports and suspend.'
        : 'They lose that access at once.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: grant ? 'Grant' : 'Remove',
          style: grant ? 'default' : 'destructive',
          onPress: () =>
            setRole.mutate(
              { userId: u.profile.id, role, grant },
              { onError: (e) => Alert.alert('That did not work', e.message) },
            ),
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.h2}>{u.profile.full_name ?? 'No name yet'}</Text>
        <Text style={styles.meta}>Joined {timeAgo(u.profile.created_at)}</Text>
        {u.badges.some((b) => b.kind === 'identity_checked') ? (
          <BadgePill label={PROFILE_BADGE_LABELS.identity_checked.label} />
        ) : (
          <Text style={styles.meta}>
            ID not checked
            {u.identityCase ? ` · case ${CASE_STATUS_LABELS[u.identityCase.status].toLowerCase()}` : ''}
          </Text>
        )}
        {u.identityCase && (
          <Button
            label="Open ID case"
            variant="secondary"
            onPress={() => router.push(`/review/${u.identityCase!.id}`)}
          />
        )}
        <Button
          label="Activity on this account"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/staff/audit', params: { subject: u.profile.id } })
          }
        />
      </View>

      <View style={styles.section}>
        <SectionTitle>Account status</SectionTitle>
        {active ? (
          <View style={[styles.box, styles.danger]}>
            <Text style={styles.bodyStrong}>Suspended {timeAgo(active.restricted_at)}</Text>
            <Text style={styles.body}>{active.note}</Text>
          </View>
        ) : (
          <Text style={styles.meta}>In good standing.</Text>
        )}

        {!isSelf && (
          <>
            <TextField
              label="Note to the account's owner"
              hint="Required. They read it in the app."
              value={note}
              onChangeText={setNote}
              multiline
              style={styles.noteInput}
            />
            <Button
              label={active ? 'Restore account' : 'Suspend account'}
              variant={active ? 'secondary' : 'danger'}
              loading={restrict.isPending}
              onPress={() => act(active ? 'restore' : 'suspend')}
            />
          </>
        )}

        {u.restrictions
          .filter((r) => r.lifted_at !== null)
          .map((r) => (
            <View key={r.id} style={styles.box}>
              <Text style={styles.caption}>
                Suspended {timeAgo(r.restricted_at)} · lifted {timeAgo(r.lifted_at!)}
              </Text>
              <Text style={styles.meta}>{r.note}</Text>
              {!!r.lift_note && <Text style={styles.meta}>Lifted: {r.lift_note}</Text>}
            </View>
          ))}
      </View>

      {iAmAdmin && (
        <View style={styles.section}>
          <SectionTitle>Staff roles</SectionTitle>
          <Text style={styles.meta}>
            {u.roles.length === 0
              ? 'Not staff.'
              : u.roles.map((r) => ROLE_LABELS[r]).join(' and ')}
          </Text>
          {(['verifier', 'admin'] as const).map((role) => {
            const has = u.roles.includes(role);
            // The database refuses removing your own admin role; do not offer it.
            if (has && role === 'admin' && isSelf) return null;
            return (
              <Button
                key={role}
                label={has ? `Remove ${ROLE_LABELS[role].toLowerCase()}` : `Make ${ROLE_LABELS[role].toLowerCase()}`}
                variant="secondary"
                disabled={setRole.isPending}
                onPress={() => changeRole(role, !has)}
              />
            );
          })}
        </View>
      )}

      <View style={styles.section}>
        <SectionTitle>Listings ({u.listings.length})</SectionTitle>
        {u.listings.length === 0 && <Text style={styles.meta}>None.</Text>}
        {u.listings.map((l) => (
          <StaffRow
            key={l.id}
            caption={LISTING_STATUS_LABELS[l.status]}
            title={l.title}
            meta={`${formatPrice(l.price_rwf)} · posted ${timeAgo(l.created_at)}`}
            onPress={() => router.push(`/staff/listings/${l.id}`)}
          />
        ))}
      </View>

      <View style={styles.section}>
        <SectionTitle>Reports about them ({u.reports.length})</SectionTitle>
        {u.reports.length === 0 && <Text style={styles.meta}>None.</Text>}
        {u.reports.map((r) => (
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
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    ...shadow,
  },
  box: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  danger: { backgroundColor: colors.dangerTint },
  noteInput: { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.sm },
  h2: type.h2,
  body: type.body,
  bodyStrong: type.bodyStrong,
  meta: type.meta,
  caption: type.caption,
});
