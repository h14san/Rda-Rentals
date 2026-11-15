import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/states';
import { Button, Chip, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { useSubmitReport } from '@/features/moderation/queries';
import {
  REASONS_FOR_TARGET,
  REPORT_REASON_LABELS,
  type ReportReason,
  type ReportTarget,
} from '@/features/moderation/types';
import { spacing, type } from '@/theme';

const TITLES: Record<ReportTarget, string> = {
  listing: 'Report this listing',
  user: 'Report this account',
  message: 'Report this message',
};

function isTarget(value: string | undefined): value is ReportTarget {
  return value === 'listing' || value === 'user' || value === 'message';
}

/**
 * The report form: a reason and an optional note, nothing else.
 *
 * Kept this short on purpose. Someone reporting a scam is usually annoyed and
 * on a slow connection, and every extra field is a reason to give up.
 */
export default function ReportScreen() {
  const params = useLocalSearchParams<{ type: string; id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const submit = useSubmitReport(session?.user.id ?? '');

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');

  if (!session || !isTarget(params.type) || !params.id) {
    return <EmptyState title="Nothing to report" message="Go back and try again." />;
  }
  const targetType = params.type;
  const needsNote = reason === 'other' && !note.trim();

  function onSend() {
    if (!reason) return;
    submit.mutate(
      { targetType, targetId: params.id, reason, note },
      {
        onSuccess: () => {
          Alert.alert(
            'Report sent',
            'Thank you. Our team will look at it. You can follow it under "Your reports" on your profile.',
          );
          router.back();
        },
        onError: (e) => Alert.alert('Could not send the report', e.message),
      },
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: TITLES[targetType] }} />

      <Text style={styles.lead}>What is wrong?</Text>
      <View style={styles.chips}>
        {REASONS_FOR_TARGET[targetType].map((r) => (
          <Chip
            key={r}
            label={REPORT_REASON_LABELS[r]}
            selected={reason === r}
            onPress={() => setReason(r)}
          />
        ))}
      </View>

      <TextField
        label={reason === 'other' ? 'What happened' : 'Anything to add (optional)'}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={1000}
        style={styles.note}
        hint="Do not include your phone number or other private details."
      />

      <Text style={styles.caption}>
        The person you report is not told who reported them.
      </Text>

      <Button
        label="Send report"
        onPress={onSend}
        disabled={!reason || needsNote}
        loading={submit.isPending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  lead: type.bodyStrong,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.sm },
  caption: type.caption,
});
