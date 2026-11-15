import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, TextField } from '@/components/ui';
import { useSubmitReview, useSubmitTenantReview } from '@/features/listings/extras';
import { colors, spacing, type } from '@/theme';

const WORDS = ['', 'Poor', 'Below average', 'Fine', 'Good', 'Excellent'];

/**
 * Review a rental you moved into. Reached only from a completed booking, and
 * the database refuses anything else (rule 13), so there is no way to review a
 * place you did not rent.
 */
export default function RateScreen() {
  // ?about=renter is the landlord reviewing the person who rented. The two
  // directions share a form and nothing else: different functions, different
  // tables, and only the tenant's review of the place is public.
  const { bookingId, about } = useLocalSearchParams<{ bookingId: string; about?: string }>();
  const router = useRouter();
  const aboutRenter = about === 'renter';
  const submitPlace = useSubmitReview();
  const submitRenter = useSubmitTenantReview();
  const submit = aboutRenter ? submitRenter : submitPlace;
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');

  function onSubmit() {
    submit.mutate(
      { bookingId, rating, body },
      {
        onSuccess: () => {
          Alert.alert(
            'Thank you',
            aboutRenter
              ? 'Other landlords will see it when this person asks to book with them.'
              : 'Your review is now on the listing.',
          );
          router.back();
        },
        onError: (e) => Alert.alert('Could not post your review', e.message),
      },
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.h2}>{aboutRenter ? 'How was this renter?' : 'How was it?'}</Text>
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
        label={aboutRenter ? 'Anything to add (optional)' : 'Tell others about it (optional)'}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={1000}
        style={styles.body}
        hint={
          aboutRenter
            ? 'Did they pay on time and look after the place? Phone numbers and emails are removed.'
            : 'Was it as described? How was the landlord? Phone numbers and emails are removed.'
        }
      />

      <Text style={styles.caption}>
        {aboutRenter
          ? 'Not public. The renter can read it, and so can a landlord they ask to book with. One review per rental.'
          : 'Reviews are public and show your name. You can write one review per rental.'}
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
