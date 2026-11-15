import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/text';

import { PhotoGallery } from '@/components/photo-gallery';
import { imageUrl } from '@/lib/supabase';
import { colors, radius, spacing, type } from '@/theme';

/**
 * Paged, horizontally swipeable image strip for the listing detail page.
 * Tapping any photo opens the full gallery.
 */
export function ImageCarousel({ paths }: { paths: string[] }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const slide = { width, height: (width * 3) / 4 };

  if (paths.length === 0) {
    return (
      <View style={[slide, styles.slide, styles.fallback]}>
        <Text style={styles.fallbackText}>No photos yet</Text>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      >
        {paths.map((path, i) => (
          <Pressable
            key={path}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo ${i + 1} of ${paths.length}. Opens all photos.`}
            onPress={() => setGalleryOpen(true)}
          >
            <Image
              source={{ uri: imageUrl(path) }}
              style={[slide, styles.slide]}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        ))}
      </ScrollView>

      {/* A button as well as a counter: it says the photos can be opened,
          which a bare "1 / 6" does not. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show all photos"
        onPress={() => setGalleryOpen(true)}
        style={styles.counter}
      >
        <Ionicons name="images-outline" size={14} color={colors.white} />
        <Text style={styles.counterText}>
          {index + 1} / {paths.length}
        </Text>
      </Pressable>

      <PhotoGallery
        paths={paths}
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { backgroundColor: colors.lightGray },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: type.meta,
  counter: {
    position: 'absolute',
    // Bottom left, because the listing page's save button hangs off the
    // bottom-right corner of the photo.
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(17,24,39,0.75)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  counterText: {
    ...type.caption,
    color: colors.white,
  },
});
