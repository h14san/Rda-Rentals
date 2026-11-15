import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/text';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ZoomableImage } from '@/components/zoomable-image';

import { imageUrl } from '@/lib/supabase';
import { colors, spacing, type } from '@/theme';

/**
 * Full-screen photos for a listing, in two steps like any phone gallery:
 * a grid of everything, then one photo at a time, swiped sideways.
 *
 * A Modal rather than a route: it has no state worth a URL, and closing it
 * must return to exactly where the listing page was scrolled.
 */
export function PhotoGallery({
  paths,
  visible,
  onClose,
}: {
  paths: string[];
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Null shows the grid; a number shows that photo in the viewer.
  const [viewing, setViewing] = useState<number | null>(null);
  const [index, setIndex] = useState(0);

  function close() {
    setViewing(null);
    onClose();
  }

  // Android back steps out of the viewer first, then out of the gallery.
  const back = () => (viewing === null ? close() : setViewing(null));
  const tile = (width - spacing.md * 2 - spacing.sm) / 2;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={back}>
      {viewing === null ? (
        <View style={[styles.grid, { paddingTop: insets.top }]}>
          <View style={styles.bar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close photos"
              hitSlop={12}
              onPress={close}
            >
              <Ionicons name="chevron-down" size={26} color={colors.softBlack} />
            </Pressable>
            <Text style={styles.barTitle}>
              {paths.length} photo{paths.length === 1 ? '' : 's'}
            </Text>
            <View style={styles.barSpacer} />
          </View>

          <FlatList
            data={paths}
            keyExtractor={(p) => p}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={[
              styles.gridContent,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
            renderItem={({ item, index: i }) => (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel={`Photo ${i + 1} of ${paths.length}`}
                onPress={() => {
                  setIndex(i);
                  setViewing(i);
                }}
              >
                <Image
                  source={{ uri: imageUrl(item) }}
                  style={[styles.tile, { width: tile, height: tile }]}
                  contentFit="cover"
                  transition={150}
                />
              </Pressable>
            )}
          />
        </View>
      ) : (
        <GestureHandlerRootView style={styles.viewer}>
          <FlatList
            data={paths}
            keyExtractor={(p) => p}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={viewing}
            // Fixed-size pages, so the list can open on any photo without
            // measuring the ones before it.
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) =>
              setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
            }
            renderItem={({ item }) => (
              <ZoomableImage uri={imageUrl(item)} width={width} height={height} />
            )}
          />

          <View style={[styles.viewerBar, { top: insets.top + spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to all photos"
              hitSlop={12}
              onPress={() => setViewing(null)}
              style={styles.viewerButton}
            >
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
            <Text style={styles.viewerCount}>
              {index + 1} / {paths.length}
            </Text>
            <View style={styles.barSpacer} />
          </View>
        </GestureHandlerRootView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, backgroundColor: colors.white },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  barTitle: type.bodyStrong,
  barSpacer: { width: 26 },
  gridContent: { paddingHorizontal: spacing.md, gap: spacing.sm },
  gridRow: { gap: spacing.sm },
  tile: { borderRadius: 12, backgroundColor: colors.lightGray },

  viewer: { flex: 1, backgroundColor: '#000' },
  viewerBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  viewerCount: { ...type.label, color: colors.white },
});
