import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';

import { imageUrl } from '@/lib/supabase';
import { colors, fontSize, radius, spacing } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Paged, horizontally swipeable image strip for the listing detail page. */
export function ImageCarousel({ paths }: { paths: string[] }) {
  const [index, setIndex] = useState(0);

  if (paths.length === 0) {
    return (
      <View style={[styles.slide, styles.fallback]}>
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
          setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
        }
      >
        {paths.map((path) => (
          <Image
            key={path}
            source={{ uri: imageUrl(path) }}
            style={styles.slide}
            contentFit="cover"
            transition={200}
          />
        ))}
      </ScrollView>

      {paths.length > 1 && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {index + 1} / {paths.length}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    width: SCREEN_WIDTH,
    aspectRatio: 4 / 3,
    backgroundColor: colors.lightGray,
  },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: colors.muted, fontSize: fontSize.sm },
  counter: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: 'rgba(17,24,39,0.75)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  counterText: { color: colors.white, fontSize: fontSize.xs, fontWeight: '600' },
});
