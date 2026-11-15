import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { StaffOnly } from '@/components/staff';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/context';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, type } from '@/theme';

type Step =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /** A factor exists: ask for the current code. */
  | { kind: 'challenge'; factorId: string }
  /** No factor yet: show the secret to add to an authenticator app. */
  | { kind: 'enroll'; factorId: string; secret: string; uri: string };

/**
 * The staff sign-in step: a code from an authenticator app.
 *
 * Staff reach the console only through here. The first visit enrols the app;
 * every later one asks for its current code. It is not only a screen:
 * has_role() in the database stops counting an enrolled staff member's role in
 * any session that has not passed this, so skipping the screen gets nothing.
 */
export default function StaffUnlockScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!isStaff) return;
    let active = true;

    void (async () => {
      const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (level.data?.currentLevel === 'aal2') {
        router.replace('/staff');
        return;
      }

      const factors = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (factors.error) {
        setStep({ kind: 'error', message: factors.error.message });
        return;
      }

      const verified = factors.data.totp.find((f) => f.status === 'verified');
      if (verified) {
        setStep({ kind: 'challenge', factorId: verified.id });
        return;
      }

      // A half-finished enrolment from an earlier visit would block a new one
      // under the same name, so clear it first.
      for (const stale of factors.data.all.filter((f) => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }

      const enrolled = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Rwanda Rentals staff',
      });
      if (!active) return;
      if (enrolled.error) {
        setStep({ kind: 'error', message: enrolled.error.message });
        return;
      }
      setStep({
        kind: 'enroll',
        factorId: enrolled.data.id,
        secret: enrolled.data.totp.secret,
        uri: enrolled.data.totp.uri,
      });
    })();

    return () => {
      active = false;
    };
  }, [isStaff, router]);

  if (!isStaff) return <StaffOnly />;
  if (step.kind === 'loading') return <LoadingState label="Checking your sign-in…" />;
  if (step.kind === 'error') return <ErrorState error={new Error(step.message)} />;

  const factorId = step.factorId;

  async function onVerify() {
    setError(null);
    setVerifying(true);
    const result = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    setVerifying(false);
    if (result.error) {
      setError('That code was not accepted. Codes change every 30 seconds; try the current one.');
      return;
    }
    router.replace('/staff');
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.h2}>
        {step.kind === 'enroll' ? 'Set up staff sign-in' : 'Staff sign-in'}
      </Text>

      {step.kind === 'enroll' ? (
        <>
          <Text style={styles.body}>
            Staff accounts can see identity documents and suspend people, so they
            need a second step. Add Rwanda Rentals to an authenticator app (Google
            Authenticator, Authy, Microsoft Authenticator), then type the 6-digit
            code it shows.
          </Text>
          <Button
            label="Open my authenticator app"
            variant="secondary"
            onPress={() => void Linking.openURL(step.uri).catch(() => undefined)}
          />
          <View style={styles.box}>
            <Text style={styles.caption}>Or add this key by hand</Text>
            <Text style={styles.secret} selectable>
              {step.secret}
            </Text>
          </View>
        </>
      ) : (
        <Text style={styles.body}>
          Type the 6-digit code from your authenticator app to open the staff console.
        </Text>
      )}

      <TextField
        label="6-digit code"
        value={code}
        onChangeText={(v) => setCode(v.replace(/[^\d]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        error={error}
        autoFocus={step.kind === 'challenge'}
        onSubmitEditing={() => void onVerify()}
      />

      <Button
        label={step.kind === 'enroll' ? 'Finish setup' : 'Open the console'}
        disabled={code.length !== 6}
        loading={verifying}
        onPress={() => void onVerify()}
      />

      <Text style={styles.caption}>
        Lost the phone with your authenticator? Another admin can remove and re-grant
        your role, and you set this up again.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  h2: type.h2,
  body: type.body,
  caption: type.caption,
  box: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  secret: { ...type.bodyStrong, letterSpacing: 1 },
});
