import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from '@/theme';

export type SheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

/**
 * A bottom sheet of actions.
 *
 * Exists because Alert.alert shows at most three buttons on Android, and a
 * conversation menu has more than that.
 */
export function ActionSheet({
  visible,
  onClose,
  actions,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  actions: SheetAction[];
  title?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        {/* Swallows taps so pressing between rows does not close the sheet. */}
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.label, action.destructive && styles.destructive]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.label, styles.cancel]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.4)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  title: { ...type.caption, paddingVertical: spacing.sm, textAlign: 'center' },
  row: {
    minHeight: 52,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: { ...type.bodyStrong, textAlign: 'center' },
  destructive: { color: colors.danger },
  cancel: { color: colors.muted },
});
