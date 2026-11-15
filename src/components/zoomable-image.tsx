import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const MAX_SCALE = 4;

/**
 * A photo you can pinch to look closer at, which settles back when you let go.
 *
 * It springs back rather than staying zoomed on purpose. A zoom that stays
 * needs panning, and panning inside a sideways-swiping gallery means deciding
 * on every drag whether the finger meant "move the photo" or "next photo".
 * Pinch-and-release answers "is that a crack in the wall?" without that.
 */
export function ZoomableImage({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const scale = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(e.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      scale.value = withTiming(1, { duration: 180 });
    });

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <GestureDetector gesture={pinch}>
      <Animated.View style={[{ width, height }, style]}>
        {/* The whole photo, never cropped: this is where someone looks closely
            at a room. */}
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}
