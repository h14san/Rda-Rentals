import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { EmptyState } from '@/components/states';
import { SupportContact } from '@/components/support-contact';
import { HELP, isHelpTopic } from '@/features/help/content';
import { spacing, type } from '@/theme';

export default function HelpTopicScreen() {
  const { topic } = useLocalSearchParams<{ topic: string }>();

  if (!isHelpTopic(topic)) {
    return <EmptyState title="Page not found" message="That help page does not exist." />;
  }
  const page = HELP[topic];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '' }} />
      <Text style={styles.h1}>{page.title}</Text>
      <Text style={styles.summary}>{page.summary}</Text>

      {page.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.h2}>{section.heading}</Text>
          {section.body.map((paragraph) => (
            <Text key={paragraph} style={styles.body}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}

      {(topic === 'reporting' || topic === 'privacy') && <SupportContact />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  h1: type.h1,
  h2: type.h2,
  summary: { ...type.body, marginTop: -spacing.sm },
  body: type.body,
});
