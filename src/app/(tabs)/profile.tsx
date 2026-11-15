import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MenuRow, MenuSection } from '@/components/menu-row';
import { Button } from '@/components/ui';
import { BadgePill } from '@/components/verification-badges';
import { useAuth } from '@/features/auth/context';
import { useMyBookings } from '@/features/bookings/queries';
import { useMyListings } from '@/features/listings/queries';
import { useMyRestriction } from '@/features/moderation/queries';
import { useUnreadNotificationCount } from '@/features/notifications/queries';
import { useMyIdentity } from '@/features/verification/queries';
import { CASE_STATUS_LABELS, PROFILE_BADGE_LABELS } from '@/features/verification/types';
import { signOut } from '@/lib/auth';
import { unregisterPush } from '@/lib/push';
import { colors, fontFamily, radius, shadow, spacing, type } from '@/theme';

export default function ProfileScreen() {
  const { session } = useAuth();
  // Null for a render after sign-out or session expiry: this tab is still
  // mounted when AuthGate's redirect to sign-in runs, since that is an effect.
  if (!session) return null;
  return <SignedInProfile userId={session.user.id} />;
}

/**
 * The profile tab: who you are, then a menu of places to go.
 *
 * It used to carry everything inline, including every listing with all of its
 * buttons. Each of those now has its own screen (edit profile, your listings),
 * and this page only says what is waiting behind each row.
 */
function SignedInProfile({ userId }: { userId: string }) {
  const router = useRouter();
  const { profile, isStaff, mode } = useAuth();
  const identity = useMyIdentity(userId);
  const restriction = useMyRestriction(userId);
  const listings = useMyListings(userId);
  const bookings = useMyBookings(userId);
  const unreadNotifications = useUnreadNotificationCount(userId);

  const identityCase = identity.data?.latestCase ?? null;
  const name = profile?.full_name ?? 'Your profile';
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  const live = listings.data?.filter((l) => l.status === 'published').length ?? 0;
  const listingCount = listings.data?.length ?? 0;
  const listingsDetail =
    listingCount === 0 ? 'None yet' : `${live} live · ${listingCount} in all`;

  // Requests waiting for this person as a landlord, or acceptances waiting for
  // them as a renter: the two things on the bookings screen that need a tap.
  const bookingsWaiting =
    bookings.data?.filter(
      (b) =>
        (b.landlord_id === userId && b.status === 'requested') ||
        (b.renter_id === userId && b.status === 'accepted'),
    ).length ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit your profile"
        onPress={() => router.push('/edit-profile')}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.cardText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {identity.data?.badge ? (
            <BadgePill label={PROFILE_BADGE_LABELS.identity_checked.label} />
          ) : (
            <Text style={styles.meta}>Edit profile</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>

      {!!restriction.data && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Your account is suspended</Text>
          <Text style={styles.noticeBody}>{restriction.data.note}</Text>
          <Text style={styles.noticeBody}>
            Your listings are hidden and you cannot post new ones until this is
            lifted.
          </Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/help/reporting')}>
            <Text style={[styles.noticeBody, styles.noticeLink]}>
              What this means and how to appeal
            </Text>
          </Pressable>
        </View>
      )}

      {/* Shown until the ID is checked, because nothing a landlord posts can
          go live before it (rule 9). */}
      {identity.isSuccess && !identity.data.badge && (mode !== 'guest' || !!identityCase) && (
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>
            {identityCase?.status === 'submitted'
              ? 'Your ID is being checked'
              : identityCase
                ? `ID ${CASE_STATUS_LABELS[identityCase.status].toLowerCase()}`
                : 'Renting out a place?'}
          </Text>
          <Text style={styles.meta}>
            {identityCase?.status === 'submitted'
              ? 'We will notify you. Your listings can go live once it is done.'
              : identityCase?.decision_note
                ? identityCase.decision_note
                : 'Verify your ID once, and your listings can be reviewed and go live.'}
          </Text>
          {identityCase?.status !== 'submitted' && (
            <Button
              label="Verify your ID"
              variant="secondary"
              onPress={() => router.push('/verify-identity')}
            />
          )}
        </View>
      )}

      <MenuSection title={mode === 'guest' ? 'Renting' : 'Renting and hosting'}>
        {/* A guest who has listings anyway still sees them: the mode arranges
            the app, it does not hide what someone owns. */}
        {(mode !== 'guest' || listingCount > 0) && (
          <MenuRow
            icon="home-outline"
            label="Your listings"
            detail={listings.isPending ? undefined : listingsDetail}
            onPress={() => router.push('/my-listings')}
          />
        )}
        {mode === 'guest' && (
          <MenuRow
            icon="add-circle-outline"
            label="Rent out a place"
            detail="Switch to hosting"
            onPress={() => router.push('/edit-profile')}
          />
        )}
        <MenuRow
          icon="calendar-outline"
          label="Bookings"
          detail={bookingsWaiting > 0 ? `${bookingsWaiting} waiting for you` : undefined}
          badge={bookingsWaiting > 0}
          onPress={() => router.push('/bookings')}
        />
      </MenuSection>

      <MenuSection title="Account">
        <MenuRow
          icon="notifications-outline"
          label="Notifications"
          detail={unreadNotifications > 0 ? `${unreadNotifications} new` : undefined}
          badge={unreadNotifications > 0}
          onPress={() => router.push('/notifications')}
        />
        <MenuRow
          icon="flag-outline"
          label="Your reports"
          onPress={() => router.push('/my-reports')}
        />
        <MenuRow
          icon="shield-checkmark-outline"
          label="Safety and help"
          onPress={() => router.push('/help')}
        />
        {isStaff && (
          <MenuRow
            icon="construct-outline"
            label="Staff console"
            onPress={() => router.push('/staff')}
          />
        )}
      </MenuSection>

      <MenuRow
        icon="log-out-outline"
        label="Sign out"
        destructive
        onPress={() =>
          // Signing back in costs an emailed code and a wait, so this is worth
          // a confirmation even though it destroys nothing.
          Alert.alert('Sign out?', 'You will need a new code to sign back in.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              // Unregister first, while there is still a session to
              // authorise it; otherwise this phone keeps getting the
              // account's notifications after sign-out.
              onPress: () => void unregisterPush().then(signOut),
            },
          ])
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softBlack,
  },
  avatarText: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.white },
  cardText: { flex: 1, gap: spacing.xs },
  name: type.h2,
  meta: type.meta,

  notice: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  noticeTitle: { ...type.bodyStrong, color: colors.danger },
  noticeBody: { ...type.meta, color: colors.charcoal },
  noticeLink: { textDecorationLine: 'underline' },

  prompt: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  promptTitle: type.bodyStrong,
});
