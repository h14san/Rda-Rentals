import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { supabase } from '@/lib/supabase';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

/**
 * One-time completion step.
 *
 * Only a name. This used to demand a WhatsApp number, because that was the one
 * way a tenant could reach a landlord. Chat is that way now, so the number is
 * no longer necessary, and what is not necessary is not collected (rule 10).
 */
export default function ProfileSetupScreen() {
  const { session, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSave() {
    if (fullName.trim().length < 2) {
      setNameError('Enter your name.');
      return;
    }
    setNameError(null);
    if (!session) return;

    setSaving(true);
    setSubmitError(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', session.user.id);

      if (error) throw error;
      // The gate re-routes once the refreshed profile is complete.
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
              Landlords and tenants see this name when you message them. Your
              phone number and email stay private.
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
            onSubmitEditing={() => void onSave()}
          />

          {!!submitError && <Text style={styles.error}>{submitError}</Text>}

          <Button label="Continue" onPress={() => void onSave()} loading={saving} />
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
  title: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.bold,
    color: colors.softBlack,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.muted,
    lineHeight: 22,
  },
  error: {
    color: colors.danger,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
  },
});
