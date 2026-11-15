import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModePicker } from '@/components/mode-picker';
import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { setAccountMode, type AccountMode } from '@/features/auth/mode';
import { supabase } from '@/lib/supabase';
import { colors, spacing, type } from '@/theme';

/**
 * One-time completion step: a name, and what you are here to do.
 *
 * The name is all that is collected about a person. It used to demand a
 * WhatsApp number, because that was the one way a tenant could reach a
 * landlord. Chat is that way now, so the number is no longer necessary, and
 * what is not necessary is not collected (rule 10).
 *
 * The second question only arranges the app. See features/auth/mode.ts.
 */
export default function ProfileSetupScreen() {
  const { session, profile, mode: savedMode, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [mode, setMode] = useState<AccountMode | null>(savedMode);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSave() {
    if (fullName.trim().length < 2) {
      setNameError('Enter your name.');
      return;
    }
    setNameError(null);
    if (!session || !mode) return;

    setSaving(true);
    setSubmitError(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', session.user.id);
      if (error) throw error;

      await setAccountMode(mode);
      // The gate re-routes once the refreshed profile and the mode are in.
      await refreshProfile();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>
              Landlords and tenants see your name when you message them. Your phone
              number and email stay private.
            </Text>
          </View>

          <TextField
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            error={nameError}
            placeholder="Your name"
            autoCapitalize="words"
            returnKeyType="done"
          />

          <View style={styles.group}>
            <Text style={styles.question}>What brings you here?</Text>
            <ModePicker value={mode} onChange={setMode} />
            <Text style={styles.caption}>
              This sets up your home screen. You can change it any time from your
              profile, and it never stops you doing the other.
            </Text>
          </View>

          {!!submitError && <Text style={styles.error}>{submitError}</Text>}

          <Button
            label="Continue"
            onPress={() => void onSave()}
            loading={saving}
            disabled={!mode}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: { gap: spacing.sm },
  title: type.h1,
  subtitle: type.meta,
  group: { gap: spacing.sm },
  question: type.bodyStrong,
  caption: type.caption,
  error: { ...type.meta, color: colors.danger },
});
