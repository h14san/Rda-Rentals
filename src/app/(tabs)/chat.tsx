import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ListingCard } from '@/components/listing-card';
import { Button } from '@/components/ui';
import {
  MAX_CHAT_INPUT,
  useChatTurn,
  type ChatMessage,
} from '@/features/listings/chat';
import { useFilters } from '@/features/listings/filters-context';
import { SORT_LABELS, useListingsFeed, type SortOrder } from '@/features/listings/queries';
import { EMPTY_FILTERS, filterSummary, type Filters } from '@/features/listings/types';
import { colors, radius, spacing, type } from '@/theme';

/**
 * The AI chatbot.
 *
 * A conversational front end to the ordinary feed query, not a second search
 * engine: each turn produces a `Filters` object, and the cards under the reply
 * come from the same `useListingsFeed` the Explore tab and the filter sheet use.
 * That is what lets "Show these in Explore" work — there is nothing to translate.
 *
 * Only the newest answer shows listings. Rendering results inside every past
 * bubble would mean one query per turn for rows the renter has scrolled away
 * from, on connections where the brief says a request hanging is the normal
 * case.
 */

/** Openers, from the brief's own examples. */
const SUGGESTIONS = [
  'I need a 2-bedroom in Remera under 250,000',
  'Furnished studio close to town',
  'Cheapest place in Kimironko',
];

/** Results previewed under a reply before handing off to Explore. */
const PREVIEW_COUNT = 3;

let nextId = 0;
function messageId(): string {
  nextId += 1;
  return `m${nextId}`;
}

export default function ChatScreen() {
  const router = useRouter();
  const { setFilters, setSort, setInterpretation } = useFilters();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  /** Filters from the latest turn that searched — what the preview below shows. */
  const [activeFilters, setActiveFilters] = useState<Filters | null>(null);
  const [activeSort, setActiveSort] = useState<SortOrder>('newest');

  const scrollRef = useRef<ScrollView>(null);
  const chat = useChatTurn();

  const results = useListingsFeed(
    activeFilters ?? EMPTY_FILTERS,
    activeSort,
    !!activeFilters,
  );
  const preview = activeFilters
    ? (results.data?.pages[0]?.rows ?? []).slice(0, PREVIEW_COUNT)
    : [];
  const total = results.data?.pages[0]?.total ?? 0;

  function send(text: string) {
    const trimmed = text.trim().slice(0, MAX_CHAT_INPUT);
    if (!trimmed || chat.isPending) return;

    const outgoing: ChatMessage = { id: messageId(), role: 'user', text: trimmed };
    // Captured before the state update so the request carries this turn too.
    const history = [...messages, outgoing].map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((current) => [...current, outgoing]);
    setDraft('');

    chat.mutate(
      { messages: history, filters: activeFilters, sort: activeSort },
      {
        onSuccess: (result) => {
          setMessages((current) => [
            ...current,
            {
              id: messageId(),
              role: 'assistant',
              text: result.reply,
              filters: result.filters ?? undefined,
            },
          ]);

          if (result.filters) setActiveFilters(result.filters);
          if (result.sort) setActiveSort(result.sort);
        },
        onError: (error) => {
          // The failed turn is rolled back rather than left in place: a user
          // message with no answer under it looks like the assistant ignored it,
          // and resending would then duplicate it in the history.
          setMessages((current) => current.filter((m) => m.id !== outgoing.id));
          setDraft(trimmed);
          Alert.alert('Could not answer', error.message);
        },
      },
    );
  }

  /** Hands the conversation's filters to the feed, which owns browsing. */
  function showInExplore() {
    if (!activeFilters) return;

    setFilters(activeFilters);
    setSort(activeSort);
    // The last reply doubles as the feed's "what this is showing" banner, so the
    // two screens cannot disagree about what was searched.
    const lastReply = [...messages].reverse().find((m) => m.role === 'assistant');
    setInterpretation(lastReply?.text ?? null);
    router.push('/');
  }

  function startOver() {
    setMessages([]);
    setActiveFilters(null);
    setActiveSort('newest');
    setDraft('');
  }

  const showResults = !!activeFilters && !chat.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.intro}>
            <Ionicons name="sparkles-outline" size={24} color={colors.softBlack} />
            <Text style={styles.introTitle}>Ask for what you need</Text>
            <Text style={styles.introBody}>
              Describe the place in your own words — area, budget, how many rooms.
              I will search the listings and show what matches.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  onPress={() => send(s)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={styles.turn}>
              <View style={m.role === 'user' ? styles.userBubble : styles.botBubble}>
                <Text style={m.role === 'user' ? styles.userText : styles.botText}>
                  {m.text}
                </Text>
              </View>

              {/* Read back off the Filters the query ran with, not off the
                  reply — if the wording and the filters disagree, these are the
                  ones that decided the results. */}
              {m.role === 'assistant' && m.filters && (
                <View style={styles.criteria}>
                  {filterSummary(m.filters).map((chip) => (
                    <View key={chip} style={styles.criteriaChip}>
                      <Text style={styles.criteriaText}>{chip}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))
        )}

        {chat.isPending && (
          <View style={styles.thinking}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text style={styles.thinkingText}>Searching…</Text>
          </View>
        )}

        {showResults && (
          <View style={styles.results}>
            {results.isPending ? (
              <View style={styles.thinking}>
                <ActivityIndicator size="small" color={colors.muted} />
                <Text style={styles.thinkingText}>Loading rentals…</Text>
              </View>
            ) : results.isError ? (
              <View style={styles.resultsNotice}>
                <Text style={styles.resultsNoticeText}>
                  The rentals could not be loaded.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void results.refetch()}
                >
                  <Text style={styles.link}>Try again</Text>
                </Pressable>
              </View>
            ) : total === 0 ? (
              <View style={styles.resultsNotice}>
                <Text style={styles.resultsNoticeText}>
                  Nothing matches that yet. Try a wider budget or a nearby sector.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.resultsHeader}>
                  <Text style={styles.resultsCount}>
                    {total} rental{total === 1 ? '' : 's'}
                    {activeSort === 'newest' ? '' : ` · ${SORT_LABELS[activeSort]}`}
                  </Text>
                </View>

                {preview.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onPress={() => router.push(`/listing/${listing.id}`)}
                  />
                ))}

                <Button
                  label={
                    total > preview.length
                      ? `Show all ${total} in Explore`
                      : 'Show in Explore'
                  }
                  variant="secondary"
                  onPress={showInExplore}
                />
              </>
            )}
          </View>
        )}

        {messages.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={startOver}
            style={styles.startOver}
          >
            <Text style={styles.link}>Start over</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="A furnished studio in Kacyiru…"
          placeholderTextColor={colors.muted}
          maxLength={MAX_CHAT_INPUT}
          multiline
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={() => send(draft)}
          editable={!chat.isPending}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !draft.trim() || chat.isPending }}
          onPress={() => send(draft)}
          disabled={!draft.trim() || chat.isPending}
          style={({ pressed }) => [
            styles.send,
            (!draft.trim() || chat.isPending) && styles.sendDisabled,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="arrow-up" size={20} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },

  intro: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  introTitle: type.h2,
  introBody: { ...type.meta, textAlign: 'center', paddingHorizontal: spacing.md },
  suggestions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // flexShrink is explicit: a long opener must wrap inside the row rather than
  // push the arrow off the screen, and RN does not shrink flex items by default.
  suggestionText: { ...type.body, flexShrink: 1 },

  turn: { gap: spacing.sm },
  // Greyscale on both sides: the palette's one warm colour is reserved for price
  // and featured placement, and a gold chat bubble would outshout both.
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.softBlack,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
  },
  userText: { ...type.body, color: colors.white },
  botBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    backgroundColor: colors.lightGray,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderBottomLeftRadius: radius.sm,
  },
  botText: type.body,

  criteria: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  criteriaChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  criteriaText: type.caption,

  thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thinkingText: type.meta,

  results: { gap: spacing.sm },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  resultsCount: type.label,
  resultsNotice: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultsNoticeText: type.meta,
  link: { ...type.label, color: colors.softBlack },
  startOver: { alignSelf: 'center', paddingVertical: spacing.sm },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    ...type.body,
    maxHeight: 120,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.lightGray,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softBlack,
  },
  sendDisabled: { opacity: 0.4 },
});
