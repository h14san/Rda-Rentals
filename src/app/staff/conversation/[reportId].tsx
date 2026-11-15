import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useStaffTranscript } from '@/features/messaging/queries';
import { timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

/**
 * A reported conversation, as typed, for the reviewer of that report.
 *
 * Nothing loads until the reviewer asks: each load is written to the
 * moderation log, so opening this screen by accident should cost nothing.
 * The function behind it refuses once the report is closed.
 */
export default function StaffConversationScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const { isStaff } = useAuth();
  const transcript = useStaffTranscript();

  if (!isStaff) {
    return <EmptyState title="Staff only" message="This page is for Rwanda Rentals staff." />;
  }

  if (!transcript.data) {
    return (
      <View style={styles.gate}>
        <Text style={styles.h2}>Read this conversation?</Text>
        <Text style={styles.meta}>
          You will see what both people typed, including contact details that were
          hidden from them. Your look is recorded with your name and this report.
        </Text>
        {transcript.isError && <Text style={styles.error}>{transcript.error.message}</Text>}
        <Button
          label="Show the conversation"
          loading={transcript.isPending}
          onPress={() => transcript.mutate(reportId)}
        />
      </View>
    );
  }

  const { conversation: c, messages } = transcript.data;
  const nameOf = (id: string | null) =>
    id === c.renter.id
      ? `${c.renter.full_name ?? 'Renter'} (renter)`
      : id === c.landlord.id
        ? `${c.landlord.full_name ?? 'Landlord'} (landlord)`
        : 'System';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.caption}>About</Text>
      <Text style={styles.h2}>{c.listing_title}</Text>
      <Text style={styles.meta}>Your view of this conversation was logged.</Text>

      {messages.length === 0 && <Text style={styles.meta}>No messages.</Text>}

      {messages.map((m) => (
        <View key={m.id} style={[styles.message, m.reported && styles.reported]}>
          <Text style={styles.caption}>
            {nameOf(m.sender_id)} · {timeAgo(m.created_at)}
            {m.reported ? ' · reported' : ''}
            {m.flagged ? ' · flagged' : ''}
          </Text>
          <Text style={styles.body}>{m.original_body ?? m.body}</Text>
          {m.original_body !== null && (
            <Text style={styles.caption}>The other person saw: {m.body}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  h2: type.h2,
  body: type.body,
  meta: type.meta,
  caption: type.caption,
  error: { ...type.label, color: colors.danger },
  message: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  reported: { backgroundColor: colors.dangerTint },
});
