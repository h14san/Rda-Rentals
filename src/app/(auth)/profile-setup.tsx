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
import { normalizeRwandanPhone } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

/**
 * One-time completion step.
 *
 * A WhatsApp number is mandatory rather than optional: it is the only channel a
 * tenant has to reach a landlord, so a profile without one produces listings
 * nobody can respond to.
 */
export default function ProfileSetupScreen() {
  const { session, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [whatsapp, setWhatsapp] = useState(
    profile?.whatsapp_phone ?? profile?.phone ?? '',
  );
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSave() {
    const nextErrors: { name?: string; phone?: string } = {};
    if (fullName.trim().length < 2) nextErrors.name = 'Enter your name.';

    const normalized = normalizeRwandanPhone(whatsapp);
    if (!normalized) {
      nextErrors.phone = 'Enter a Rwandan mobile number, for example 0788 123 456.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !session) return;

    setSaving(true);
    setSubmitError(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), whatsapp_phone: normalized })
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
              Tenants use your WhatsApp number to ask about your listings.
            </Text>
          </View>

          <TextField
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            error={errors.name}
            placeholder="Your name"
            autoCapitalize="words"
          />

          <TextField
            label="WhatsApp number"
            value={whatsapp}
            onChangeText={setWhatsapp}
            error={errors.phone}
            hint="This is where enquiries about your listings arrive."
            placeholder="0788 123 456"
            keyboardType="phone-pad"
          />

          {!!submitError && <Text style={styles.error}>{submitError}</Text>}

          <Button label="Continue" onPress={onSave} loading={saving} />
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
