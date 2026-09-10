import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import {
  AUTH_CHANNEL,
  OTP_LENGTH,
  formatRwandanPhone,
  requestCode,
  verifyCode,
} from '@/lib/auth';
import { colors, fontSize, spacing } from '@/theme';

/** Matches auth.email.max_frequency in supabase/config.toml. */
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyScreen() {
  const router = useRouter();
  const { identifier } = useLocalSearchParams<{ identifier: string }>();
  const { refreshProfile } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);
  // Supabase rate-limits outbound mail (auth.email.max_frequency, plus a much
  // tighter project-wide cap on the built-in SMTP). Without a visible cooldown
  // the Resend button just returns an opaque "email rate limit exceeded",
  // which reads as the app being broken.
  //
  // Tracked as a deadline rather than a counter so the display cannot drift if
  // the interval is throttled while the app is backgrounded.
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (resendAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  const cooldown =
    resendAt === null ? 0 : Math.max(0, Math.ceil((resendAt - now) / 1000));

  const display =
    AUTH_CHANNEL === 'phone' && identifier ? formatRwandanPhone(identifier) : identifier;

  async function onVerify() {
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await verifyCode(identifier, code);
      // The profile row is created by a DB trigger on signup; pull it in before
      // the gate decides where to send the user.
      await refreshProfile();
      // No explicit navigate: the auth gate in the root layout routes on the
      // new session, so navigating here would race it.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work. Try again.');
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (cooldown > 0) return;
    try {
      await requestCode(identifier);
      setResent(true);
      setError(null);
      setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend the code.');
      // Back off anyway — the usual failure here IS the rate limit.
      setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* The number pad covers the Verify button on shorter handsets without
          this — and the button is the only way forward on this screen. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.header}>
          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.subtitle}>
            We sent a {OTP_LENGTH}-digit code to {display}.
          </Text>
        </View>

        <TextField
          label="Verification code"
          error={error}
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^\d]/g, '').slice(0, OTP_LENGTH))}
          placeholder={"0".repeat(OTP_LENGTH)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          style={styles.codeInput}
          autoFocus
        />

        <Button
          label="Verify"
          onPress={onVerify}
          loading={submitting}
          disabled={code.length !== OTP_LENGTH}
        />

        <View style={styles.footer}>
          <Pressable
            onPress={onResend}
            accessibilityRole="button"
            disabled={cooldown > 0}
          >
            <Text style={[styles.link, cooldown > 0 && styles.linkDisabled]}>
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : resent
                  ? 'Code resent'
                  : 'Resend code'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.link}>
              Change {AUTH_CHANNEL === 'phone' ? 'number' : 'email'}
            </Text>
          </Pressable>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  header: { gap: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.softBlack },
  subtitle: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 22 },
  codeInput: { fontSize: fontSize.xl, letterSpacing: 4, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: colors.charcoal, fontSize: fontSize.sm, fontWeight: '600' },
  linkDisabled: { color: colors.muted },
});
