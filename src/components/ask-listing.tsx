import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '@/components/text';

import {
  MAX_QUESTION_LENGTH,
  SUGGESTED_QUESTIONS,
  useAskListing,
} from '@/features/listings/ask-listing';
import { colors, fontFamily, fontSize, radius, shadow, spacing, type } from '@/theme';

/**
 * "Ask about this place": a small box on the listing page that answers from
 * this listing's own details.
 *
 * Collapsed to one row until tapped, so it does not push the facts it draws on
 * down the page. Same sparkles mark as the search bar: one icon means "a model
 * did this".
 */
export function AskListing({
  listingId,
  onMessageLandlord,
}: {
  listingId: string;
  /** Offered when the listing does not say. Omitted for the owner. */
  onMessageLandlord?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ask = useAskListing(listingId);

  function submit(question: string) {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setText('');
    ask.mutate(q);
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.collapsed, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="sparkles-outline" size={18} color={colors.softBlack} />
        <Text style={styles.collapsedText}>Ask about this place</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.box}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles-outline" size={18} color={colors.softBlack} />
        <Text style={styles.heading}>Ask about this place</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          onPress={() => setOpen(false)}
        >
          <Ionicons name="chevron-up" size={18} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="For example: is there parking?"
          placeholderTextColor={colors.muted}
          style={styles.input}
          maxLength={MAX_QUESTION_LENGTH}
          returnKeyType="send"
          onSubmitEditing={() => submit(text)}
          editable={!ask.isPending}
          accessibilityLabel="Your question about this listing"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          disabled={!text.trim() || ask.isPending}
          onPress={() => submit(text)}
          style={[styles.send, (!text.trim() || ask.isPending) && { opacity: 0.4 }]}
        >
          {ask.isPending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="arrow-up" size={18} color={colors.white} />
          )}
        </Pressable>
      </View>

      {!ask.data && !ask.isPending && !ask.isError && (
        <View style={styles.chips}>
          {SUGGESTED_QUESTIONS.map((q) => (
            <Pressable
              key={q}
              accessibilityRole="button"
              onPress={() => submit(q)}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.chipText}>{q}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {ask.isPending && <Text style={styles.meta}>Reading the listing…</Text>}

      {ask.isError && <Text style={styles.error}>{ask.error.message}</Text>}

      {ask.data && !ask.isPending && (
        <View style={styles.answer}>
          <Text style={styles.question}>{ask.data.question}</Text>
          <Text style={styles.answerText}>{ask.data.answer}</Text>
          {!ask.data.known && onMessageLandlord && (
            <Pressable accessibilityRole="button" onPress={onMessageLandlord}>
              <Text style={styles.link}>Message the landlord to ask</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.caption}>
        Answers come only from this listing&apos;s details, as the landlord gave them.
        Check anything important before you decide.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  collapsedText: { ...type.bodyStrong, flex: 1 },
  box: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    ...shadow,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heading: { ...type.bodyStrong, flex: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.softBlack,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softBlack,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.lightGray,
  },
  chipText: type.label,
  answer: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  question: type.caption,
  answerText: type.body,
  link: { ...type.label, textDecorationLine: 'underline', marginTop: spacing.xs },
  meta: type.meta,
  error: { ...type.meta, color: colors.danger },
  caption: type.caption,
});
