import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, TextField } from '@/components/ui';
import { useSubmitReview } from '@/features/listings/extras';
import { colors, spacing, type } from '@/theme';

const WORDS = ['', 'Poor', 'Below average', 'Fine', 'Good', 'Excellent'];

/**
 * Review a rental you moved into. Reached only from a completed booking, and
 * the database refuses anything else (rule 13), so there is no way to review a
 * place you did not rent.
 */
export default function RateScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const submit = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');

  function onSubmit() {
    submit.mutate(
      { bookingId, rating, body },
      {
        onSuccess: () => {
          Alert.alert('Thank you', 'Your review is now on the listing.');
          router.back();
        },
        onError: (e) => Alert.alert('Could not post your review', e.message),
      },
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.h2}>How was it?</Text>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            hitSlop={6}
            onPress={() => setRating(n)}
          >
            <Ionicons
              name={n <= rating ? 'star' : 'star-outline'}
              size={40}
              color={n <= rating ? colors.softBlack : colors.border}
            />
          </Pressable>
        ))}
      </View>
      <Text style={styles.word}>{WORDS[rating]}</Text>

      <TextField
        label="Tell others about it (optional)"
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={1000}
        style={styles.body}
        hint="Was it as described? How was the landlord? Phone numbers and emails are removed."
      />

      <Text style={styles.caption}>
        Reviews are public and show your name. You can write one review per rental.
      </Text>

      <Button
        label="Submit review"
        disabled={rating === 0}
        loading={submit.isPending}
        onPress={onSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  h2: type.h2,
  stars: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  word: { ...type.label, textAlign: 'center', minHeight: 20 },
  body: { minHeight: 110, textAlignVertical: 'top', paddingTop: spacing.sm },
  caption: type.caption,
});
