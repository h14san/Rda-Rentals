import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '@/components/text';
import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { imageUrl } from '@/lib/supabase';

import { ActionSheet } from '@/components/action-sheet';
import { BookingCard } from '@/components/booking-card';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useBookingForPair } from '@/features/bookings/queries';
import { isActiveBooking } from '@/features/bookings/types';
import {
  PAGE,
  myState,
  otherParty,
  useConversation,
  useConversationRealtime,
  useHasBlocked,
  useMarkRead,
  useMessages,
  useSendMessage,
  useSetBlocked,
  useSetConversationState,
} from '@/features/messaging/queries';
import {
  MASKED_NOTICE,
  MAX_MESSAGE_LENGTH,
  type MessageRow,
} from '@/features/messaging/types';
import { useClearMessageNotification } from '@/features/notifications/queries';
import { registerForPush } from '@/lib/push';
import { colors, fontFamily, fontSize, radius, spacing, type } from '@/theme';
import { translate } from '@/lib/i18n';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  if (!session) return null;
  return <Conversation id={id} userId={session.user.id} />;
}

function Conversation({ id, userId }: { id: string; userId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [limit, setLimit] = useState(PAGE);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const conversation = useConversation(id);
  const messages = useMessages(id, limit);
  const send = useSendMessage(id, userId);
  const { mutate: markRead } = useMarkRead(id, userId);
  const setState = useSetConversationState(id, userId);
  const { mutate: clearNotification } = useClearMessageNotification(userId);

  const other = conversation.data ? otherParty(conversation.data, userId) : null;
  const blocked = useHasBlocked(userId, other?.id ?? null);
  const setBlocked = useSetBlocked(userId, other?.id ?? '');

  // A conversation is one renter and one listing, which is exactly what a
  // booking is between. Its system messages change this, so it refetches with
  // the messages.
  const booking = useBookingForPair(
    conversation.data?.listing_id ?? null,
    conversation.data?.renter_id ?? null,
  );
  const { refetch: refetchBooking } = booking;

  useConversationRealtime(id, userId, markRead);

  // Opening the conversation is reading it. Re-run when the newest message
  // changes, so one that arrives while the screen is open is read too.
  const newestId = messages.data?.[0]?.id;
  useEffect(() => {
    if (!newestId) return;
    void refetchBooking();
    markRead();
    // Reading the conversation also clears its line in the notifications list.
    clearNotification(id);
  }, [newestId, markRead, clearNotification, id, refetchBooking]);

  if (conversation.isPending || messages.isPending)
    return <LoadingState label="Loading the conversation…" />;
  if (conversation.isError)
    return (
      <ErrorState error={conversation.error} onRetry={() => void conversation.refetch()} />
    );
  if (messages.isError)
    return <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />;

  const c = conversation.data;
  const state = myState(c);
  const iBlocked = blocked.data === true;
  const canLoadEarlier = messages.data.length >= limit;

  function onSend() {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body, {
      onSuccess: () => {
        setDraft('');
        // The moment someone has just asked a question is the moment "do you
        // want to hear the answer?" explains itself. Asked once by the OS;
        // after that this only refreshes the token.
        void registerForPush({ prompt: true });
      },
      // The draft stays in the box, so a failed send on a bad connection
      // costs a tap, not the message.
      onError: (e) => Alert.alert('Message not sent', e.message),
    });
  }

  function report(type: 'conversation' | 'message', targetId: string) {
    router.push({ pathname: '/report', params: { type, id: targetId } });
  }

  function confirmBlock() {
    Alert.alert(
      translate('Block {name}?', { name: other?.full_name ?? translate('this person') }),
      'Neither of you will be able to send messages to the other. They are not told.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () =>
            setBlocked.mutate(true, {
              onError: (e) => Alert.alert('Could not block', e.message),
            }),
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: other?.full_name ?? 'Conversation',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Conversation options"
              hitSlop={8}
              onPress={() => setMenuOpen(true)}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.softBlack} />
            </Pressable>
          ),
        }}
      />

      <Pressable
        accessibilityRole="button"
        disabled={!c.listings}
        onPress={() => c.listing_id && router.push(`/listing/${c.listing_id}`)}
        style={({ pressed }) => [styles.listingCard, pressed && { opacity: 0.8 }]}
      >
        {c.listings?.listing_images[0] ? (
          <Image
            source={{ uri: imageUrl(c.listings.listing_images[0].storage_path) }}
            style={styles.listingThumb}
            contentFit="cover"
          />
        ) : (
          <View style={styles.listingThumb}>
            <Ionicons name="home-outline" size={18} color={colors.muted} />
          </View>
        )}
        <View style={styles.listingText}>
          <Text style={styles.caption}>About</Text>
          <Text style={styles.listingTitle} numberOfLines={1}>
            {c.listing_title}
          </Text>
        </View>
        {c.listings ? (
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        ) : (
          <Text style={styles.caption}>No longer listed</Text>
        )}
      </Pressable>

      {booking.data && isActiveBooking(booking.data.status) && (
        <BookingCard booking={booking.data} userId={userId} compact />
      )}

      <FlatList
        data={messages.data}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Bubble
            message={item}
            mine={item.sender_id === userId}
            onLongPress={
              item.kind === 'text' && item.sender_id !== userId
                ? () =>
                    Alert.alert('Report this message?', undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Report', onPress: () => report('message', item.id) },
                    ])
                : undefined
            }
          />
        )}
        // Inverted, so the "footer" is the top of the conversation.
        ListFooterComponent={
          canLoadEarlier ? (
            <Button
              label="Load earlier messages"
              variant="ghost"
              loading={messages.isFetching}
              onPress={() => setLimit((n) => n + PAGE)}
            />
          ) : (
            <Pressable accessibilityRole="link" onPress={() => router.push('/help/payments')}>
              <Text style={styles.intro}>
                Keep the conversation here. Never pay before you have seen the place.{' '}
                <Text style={styles.noticeLink}>Paying safely</Text>
              </Text>
            </Pressable>
          )
        }
      />

      {iBlocked ? (
        <View style={[styles.blocked, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Text style={styles.meta}>You blocked this person.</Text>
          <Button
            label="Unblock"
            variant="secondary"
            loading={setBlocked.isPending}
            onPress={() => setBlocked.mutate(false)}
          />
        </View>
      ) : (
        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            style={styles.input}
            accessibilityLabel="Message"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !draft.trim() || send.isPending }}
            disabled={!draft.trim() || send.isPending}
            onPress={onSend}
            style={[styles.send, (!draft.trim() || send.isPending) && { opacity: 0.4 }]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.white} />
          </Pressable>
        </View>
      )}

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            label: state?.muted ? 'Turn notifications back on' : 'Mute notifications',
            onPress: () => setState.mutate({ muted: !state?.muted }),
          },
          {
            label: state?.archived ? 'Move back to inbox' : 'Archive',
            onPress: () =>
              setState.mutate(
                { archived: !state?.archived },
                { onSuccess: () => !state?.archived && router.back() },
              ),
          },
          { label: 'Report this conversation', onPress: () => report('conversation', c.id) },
          iBlocked
            ? { label: 'Unblock', onPress: () => setBlocked.mutate(false) }
            : { label: 'Block', destructive: true, onPress: confirmBlock },
        ]}
      />
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  mine,
  onLongPress,
}: {
  message: MessageRow;
  mine: boolean;
  onLongPress?: () => void;
}) {
  const router = useRouter();
  if (message.kind === 'system') {
    return <Text style={styles.system}>{message.body}</Text>;
  }

  return (
    <View style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
      <Pressable
        onLongPress={onLongPress}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      >
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.body}</Text>
      </Pressable>
      {message.masked && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/help/contact-details')}
        >
          <Text style={styles.notice}>
            {MASKED_NOTICE} <Text style={styles.noticeLink}>Why?</Text>
          </Text>
        </Pressable>
      )}
      <Text style={styles.stamp}>{clock(message.created_at)}</Text>
    </View>
  );
}

/** "14 Nov, 09:05" in the phone's own timezone. */
function clock(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  listingThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingText: { flex: 1 },
  listingTitle: type.bodyStrong,
  caption: type.caption,
  meta: type.meta,

  list: { padding: spacing.md, gap: spacing.sm },
  intro: { ...type.caption, textAlign: 'center', paddingVertical: spacing.md },
  // System lines (booking events) sit in a quiet pill in the middle, so they
  // read as things that happened rather than things someone said.
  system: {
    ...type.caption,
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: '86%',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
    overflow: 'hidden',
  },

  bubbleWrap: { maxWidth: '82%', gap: 2 },
  left: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleMine: { backgroundColor: colors.softBlack, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.lightGray, borderBottomLeftRadius: radius.sm },
  bubbleText: type.body,
  bubbleTextMine: { color: colors.white },
  notice: { ...type.caption, maxWidth: 260 },
  noticeLink: { color: colors.softBlack, textDecorationLine: 'underline' },
  stamp: { ...type.caption, fontFamily: fontFamily.regular },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    backgroundColor: colors.lightGray,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.softBlack,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softBlack,
  },
  blocked: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
