import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/components/text';

import { ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  useNotificationPreferences,
  useSetNotificationPreferences,
} from '@/features/notifications/queries';
import { PREFERENCE_TOGGLES } from '@/features/notifications/types';
import { registerForPush, type PushState } from '@/lib/push';
import { colors, radius, spacing, type } from '@/theme';

const PUSH_COPY: Record<PushState, { title: string; detail: string }> = {
  on: {
    title: 'Push notifications are on',
    detail: 'This phone will alert you. Choose what about below.',
  },
  'not-asked': {
    title: 'Push notifications are off',
    detail: 'Turn them on to hear about replies when the app is closed.',
  },
  denied: {
    title: 'Push notifications are blocked',
    detail: 'You turned them off for Rwanda Rentals in your phone settings.',
  },
  unavailable: {
    title: 'Push is not available here',
    detail:
      'This copy of the app cannot receive push. Everything still shows in the notifications list.',
  },
};

export default function NotificationSettingsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const prefs = useNotificationPreferences(userId);
  const setPrefs = useSetNotificationPreferences(userId);
  const [push, setPush] = useState<PushState | null>(null);
  const [asking, setAsking] = useState(false);

  // Check without prompting: opening a settings screen is not consent.
  useEffect(() => {
    let active = true;
    void registerForPush({ prompt: false }).then((state) => {
      if (active) setPush(state);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!session) return null;
  if (prefs.isPending) return <LoadingState label="Loading your settings…" />;
  if (prefs.isError)
    return <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />;

  async function turnOn() {
    setAsking(true);
    setPush(await registerForPush({ prompt: true }));
    setAsking(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {push && (
        <View style={styles.box}>
          <Text style={styles.bodyStrong}>{PUSH_COPY[push].title}</Text>
          <Text style={styles.meta}>{PUSH_COPY[push].detail}</Text>
          {push === 'not-asked' && (
            <Button label="Turn on push" loading={asking} onPress={() => void turnOn()} />
          )}
          {push === 'denied' && (
            <Button
              label="Open phone settings"
              variant="secondary"
              onPress={() => void Linking.openSettings()}
            />
          )}
        </View>
      )}

      <View style={styles.section}>
        <SectionTitle>Alert me about</SectionTitle>
        {PREFERENCE_TOGGLES.map((t) => (
          <View key={t.key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.bodyStrong}>{t.label}</Text>
              <Text style={styles.meta}>{t.detail}</Text>
            </View>
            <Switch
              accessibilityLabel={t.label}
              value={prefs.data[t.key]}
              onValueChange={(value) => setPrefs.mutate({ ...prefs.data, [t.key]: value })}
              trackColor={{ true: colors.softBlack, false: colors.border }}
            />
          </View>
        ))}

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.bodyStrong}>Account and safety</Text>
            <Text style={styles.meta}>
              ID checks, suspensions and the result of reports you send. These are
              always on.
            </Text>
          </View>
          <Switch accessibilityLabel="Account and safety" value disabled />
        </View>
      </View>

      <Text style={styles.caption}>
        These switches only decide whether your phone alerts you. The notifications
        list in the app always shows everything.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  box: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, gap: 2 },
  bodyStrong: type.bodyStrong,
  meta: type.meta,
  caption: type.caption,
});
