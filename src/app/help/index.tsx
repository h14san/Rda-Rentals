import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { SupportContact } from '@/components/support-contact';
import { HELP, HELP_TOPICS } from '@/features/help/content';
import { colors, radius, spacing, type } from '@/theme';

export default function HelpIndexScreen() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {HELP_TOPICS.map((topic) => (
        <Pressable
          key={topic}
          accessibilityRole="button"
          onPress={() => router.push(`/help/${topic}`)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.text}>
            <Text style={styles.title}>{HELP[topic].title}</Text>
            <Text style={styles.meta}>{HELP[topic].summary}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
      <SupportContact />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  text: { flex: 1, gap: 2 },
  title: type.bodyStrong,
  meta: type.meta,
});
