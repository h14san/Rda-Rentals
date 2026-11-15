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

import { ModePicker } from '@/components/mode-picker';
import { Button, TextField } from '@/components/ui';
import { BadgePill } from '@/components/verification-badges';
import { useAuth } from '@/features/auth/context';
import { setAccountMode, type AccountMode } from '@/features/auth/mode';
import { useMyIdentity } from '@/features/verification/queries';
import { PROFILE_BADGE_LABELS } from '@/features/verification/types';
import { supabase } from '@/lib/supabase';
import { colors, fontFamily, radius, spacing, type } from '@/theme';

/**
 * Edit your profile, on its own screen.
 *
 * The name is the one thing other people see. "I am here to" rearranges the
 * app for this account and is seen by nobody else. The sign-in email or number
 * is shown so it is clear which account this is, and marked private because
 * it is.
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const { session, profile, mode: savedMode, refreshProfile } = useAuth();
  const [mode, setMode] = useState<AccountMode | null>(savedMode);
  const identity = useMyIdentity(session?.user.id ?? '');

  const [name, setName] = useState(profile?.full_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!session) return null;

  const signIn = session.user.email ?? session.user.phone ?? null;
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const nameChanged = name.trim() !== (profile?.full_name ?? '');
  const modeChanged = mode !== null && mode !== savedMode;
  const changed = nameChanged || modeChanged;

  async function onSave() {
    if (name.trim().length < 2) {
      setError('Enter your name.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (nameChanged) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ full_name: name.trim() })
          .eq('id', session!.user.id);
        if (updateError) throw updateError;
        await refreshProfile();
      }
      if (modeChanged) await setAccountMode(mode);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          {identity.data?.badge && (
            <BadgePill label={PROFILE_BADGE_LABELS.identity_checked.label} />
          )}
        </View>

        <TextField
          label="Full name"
          value={name}
          onChangeText={setName}
          error={error}
          autoCapitalize="words"
          hint="Landlords and tenants see this when you message them."
          returnKeyType="done"
          onSubmitEditing={() => void onSave()}
        />

        <View style={styles.group}>
          <Text style={styles.label}>I am here to</Text>
          <ModePicker value={mode} onChange={setMode} />
          <Text style={styles.caption}>
            Changes the tabs at the bottom of the app. Nothing you have posted or
            booked is affected.
          </Text>
        </View>

        {!!signIn && (
          <View style={styles.readOnly}>
            <Text style={styles.label}>You sign in with</Text>
            <Text style={styles.value}>{signIn}</Text>
            <Text style={styles.caption}>Private. Nobody else on Rwanda Rentals sees it.</Text>
          </View>
        )}

        <Button
          label="Save"
          onPress={() => void onSave()}
          loading={saving}
          disabled={!changed}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg, gap: spacing.lg },
  avatarWrap: { alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softBlack,
  },
  avatarText: { fontFamily: fontFamily.bold, fontSize: 40, color: colors.white },
  group: { gap: spacing.sm },
  readOnly: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  label: type.label,
  value: type.body,
  caption: type.caption,
});
