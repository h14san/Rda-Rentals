import { useRouter } from 'expo-router';
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
import {
  AUTH_CHANNEL,
  IDENTIFIER_HINT,
  IDENTIFIER_LABEL,
  IDENTIFIER_PLACEHOLDER,
  normalizeIdentifier,
  requestCode,
} from '@/lib/auth';
import { colors, fontSize, spacing } from '@/theme';

export default function SignInScreen() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    const identifier = normalizeIdentifier(value);
    if (!identifier) {
      setError(
        AUTH_CHANNEL === 'phone'
          ? 'Enter a Rwandan mobile number, for example 0788 123 456.'
          : 'Enter a valid email address.',
      );
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await requestCode(identifier);
      router.push({ pathname: '/verify', params: { identifier } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>Rwanda Rentals</Text>
            <Text style={styles.tagline}>
              Verified rentals in Kigali, without the WhatsApp group scroll.
            </Text>
          </View>

          <TextField
            label={IDENTIFIER_LABEL}
            hint={IDENTIFIER_HINT}
            error={error}
            value={value}
            onChangeText={setValue}
            placeholder={IDENTIFIER_PLACEHOLDER}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={AUTH_CHANNEL === 'phone' ? 'phone-pad' : 'email-address'}
            textContentType={AUTH_CHANNEL === 'phone' ? 'telephoneNumber' : 'emailAddress'}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          <Button label="Send code" onPress={onSubmit} loading={submitting} />

          <Text style={styles.legal}>
            By continuing you agree to be contacted about listings you enquire about.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  header: { gap: spacing.sm, marginBottom: spacing.md },
  brand: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.softBlack },
  tagline: { fontSize: fontSize.md, color: colors.muted, lineHeight: 24 },
  legal: { fontSize: fontSize.xs, color: colors.muted, textAlign: 'center' },
});
