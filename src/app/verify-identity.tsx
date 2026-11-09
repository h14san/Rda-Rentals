import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/states';
import { Button, SectionTitle } from '@/components/ui';
import { BadgePill } from '@/components/verification-badges';
import { useAuth } from '@/features/auth/context';
import { useMyIdentity, useSubmitIdentity } from '@/features/verification/queries';
import {
  CASE_STATUS_LABELS,
  MAX_EVIDENCE_PHOTOS,
  PROFILE_BADGE_LABELS,
} from '@/features/verification/types';
import { captureImage, pickImages, type PickedImage } from '@/lib/images';
import { timeAgo } from '@/lib/format';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Landlord identity verification (rule 9, Features #20).
 *
 * Says up front what is collected, why, and who sees it: an ID photo is the most
 * sensitive thing the app asks for (rule 10), and a landlord who cannot tell
 * where it goes has every reason to refuse.
 */
export default function VerifyScreen() {
  const { session } = useAuth();
  if (!session) return null;
  return <SignedInVerify userId={session.user.id} />;
}

function SignedInVerify({ userId }: { userId: string }) {
  const identity = useMyIdentity(userId);
  const submit = useSubmitIdentity(userId);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  if (identity.isPending) return <LoadingState label="Checking your status…" />;
  if (identity.isError)
    return <ErrorState error={identity.error} onRetry={() => void identity.refetch()} />;

  const { badge, latestCase } = identity.data;
  const waiting = latestCase?.status === 'submitted';
  const canSubmit = !badge && !waiting;

  async function addFromLibrary() {
    const picked = await pickImages(MAX_EVIDENCE_PHOTOS - images.length);
    setImages((prev) => [...prev, ...picked].slice(0, MAX_EVIDENCE_PHOTOS));
  }

  async function addFromCamera() {
    const shot = await captureImage();
    if (shot) setImages((prev) => [...prev, shot].slice(0, MAX_EVIDENCE_PHOTOS));
  }

  function onSubmit() {
    submit.mutate(
      {
        images,
        onProgress: (done, total) => setProgress(`Uploading photo ${done} of ${total}…`),
      },
      {
        onSuccess: () => {
          setImages([]);
          Alert.alert(
            'Sent for review',
            'Rwanda Rentals will check your ID. Your listings go live once it is approved.',
          );
        },
        onError: (e) => Alert.alert('Could not send', e.message),
        onSettled: () => setProgress(null),
      },
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Verify your ID' }} />

      {badge ? (
        <View style={styles.card}>
          <BadgePill label={PROFILE_BADGE_LABELS.identity_checked.label} />
          <Text style={styles.body}>
            Your identity was checked {timeAgo(badge.checked_at)}. Tenants see this
            on every listing you post.
          </Text>
        </View>
      ) : latestCase ? (
        <View style={styles.card}>
          <Text style={styles.status}>{CASE_STATUS_LABELS[latestCase.status]}</Text>
          {waiting && (
            <Text style={styles.body}>
              Sent {timeAgo(latestCase.submitted_at)}. You will see the result here.
            </Text>
          )}
          {!!latestCase.decision_note && !waiting && (
            <Text style={styles.body}>{latestCase.decision_note}</Text>
          )}
        </View>
      ) : null}

      {canSubmit && (
        <>
          <View style={styles.section}>
            <SectionTitle>Why we ask</SectionTitle>
            <Text style={styles.body}>
              Every listing on Rwanda Rentals comes from a landlord whose identity we
              have checked. It is what keeps fake listings and deposit scams out.
            </Text>
          </View>

          <View style={styles.section}>
            <SectionTitle>What to send</SectionTitle>
            <Text style={styles.body}>
              A clear photo of your national ID or passport. Add the back as a second
              photo if it carries information. Make sure the text is readable.
            </Text>
          </View>

          <View style={styles.section}>
            <SectionTitle>Who sees it</SectionTitle>
            <Text style={styles.body}>
              Only Rwanda Rentals verification staff. It is never shown on your
              listings or to tenants. Tenants only see the &quot;
              {PROFILE_BADGE_LABELS.identity_checked.label}&quot; badge.
            </Text>
          </View>

          <View style={styles.thumbs}>
            {images.map((img, i) => (
              <View key={img.uri} style={styles.thumbWrap}>
                <Image source={{ uri: img.uri }} style={styles.thumb} contentFit="cover" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  hitSlop={8}
                  onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  style={styles.remove}
                >
                  <Ionicons name="close" size={16} color={colors.white} />
                </Pressable>
              </View>
            ))}
          </View>

          {images.length < MAX_EVIDENCE_PHOTOS && (
            <View style={styles.row}>
              <Button
                label="Take photo"
                variant="secondary"
                style={styles.flex}
                icon={<Ionicons name="camera-outline" size={18} color={colors.charcoal} />}
                onPress={() => void addFromCamera()}
                disabled={submit.isPending}
              />
              <Button
                label="Choose photo"
                variant="secondary"
                style={styles.flex}
                icon={<Ionicons name="images-outline" size={18} color={colors.charcoal} />}
                onPress={() => void addFromLibrary()}
                disabled={submit.isPending}
              />
            </View>
          )}

          {!!progress && <Text style={styles.caption}>{progress}</Text>}

          <Button
            label="Send for review"
            onPress={onSubmit}
            disabled={images.length === 0}
            loading={submit.isPending}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  status: type.bodyStrong,
  section: { gap: spacing.xs },
  body: type.body,
  caption: type.caption,
  thumbs: { flexDirection: 'row', gap: spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: { width: 140, height: 100, borderRadius: radius.sm },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.7)',
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
