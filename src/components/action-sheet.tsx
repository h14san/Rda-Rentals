import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { colors, radius, spacing, type } from '@/theme';

export type SheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Marks the current choice when the sheet is a picker (the feed's sort). */
  selected?: boolean;
};

/**
 * A bottom sheet of actions, or of choices.
 *
 * Exists because Alert.alert shows at most three buttons on Android, and a
 * conversation menu, a listing's manage menu and the sort picker all have more.
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
  const t = useT();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        {/* Swallows taps so pressing between rows does not close the sheet. */}
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View style={styles.handle} />
          {!!title && <Text style={styles.title}>{t(title)}</Text>}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityState={{ selected: !!action.selected }}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Text
                style={[
                  styles.label,
                  action.selected && styles.selected,
                  action.destructive && styles.destructive,
                ]}
              >
                {t(action.label)}
              </Text>
              {action.selected && (
                <Ionicons name="checkmark" size={20} color={colors.softBlack} />
              )}
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.row, styles.last, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.label, styles.cancel]}>{t('Cancel')}</Text>
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
    borderTopLeftRadius: radius.lg + 8,
    borderTopRightRadius: radius.lg + 8,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: { ...type.h2, paddingVertical: spacing.sm },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  last: { borderBottomWidth: 0 },
  label: type.body,
  selected: type.bodyStrong,
  destructive: { color: colors.danger },
  cancel: { color: colors.muted },
});
