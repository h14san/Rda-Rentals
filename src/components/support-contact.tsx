import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/features/help/content';
import { colors, radius, spacing, type } from '@/theme';

/**
 * How to reach a person. Until a support inbox exists this says so, rather
 * than print an address that nobody reads to someone asking for their data to
 * be deleted.
 */
export function SupportContact() {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Contact support</Text>
      {SUPPORT_EMAIL ? (
        <>
          <Text style={styles.meta}>
            Write to {SUPPORT_EMAIL}. For appeals and deletion requests, write from
            the email you sign in with so we know it is you.
          </Text>
          <Button
            label="Write an email"
            variant="secondary"
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
        </>
      ) : (
        <Text style={styles.meta}>
          Our support address is being set up. Until it is, use Report on a
          listing, an account or a conversation to reach our team.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.lightGray,
  },
  title: type.bodyStrong,
  meta: type.meta,
});
