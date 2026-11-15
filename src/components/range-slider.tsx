import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { colors, fontFamily, fontSize, spacing } from '@/theme';

const THUMB = 28;
/** Fixed, so two labels can be kept from printing over each other. */
const LABEL_WIDTH = 92;

/**
 * One bar with two handles, for a price range.
 *
 * Written here rather than pulled in as a dependency: the community slider has
 * a single thumb, and two of them stacked as "Minimum" and "Maximum" is what
 * this replaces. The amount under each handle follows it while it moves, so
 * the range is read where the finger is, not from a line somewhere above.
 *
 * `onChange` fires on release only. Every intermediate position would
 * otherwise re-render the whole filter sheet around a moving finger.
 */
export function RangeSlider({
  min,
  max,
  step,
  low,
  high,
  onChange,
  format,
}: {
  min: number;
  max: number;
  step: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  /** Text under a handle. Receives which end it is, for "Any" at the bounds. */
  format: (value: number, end: 'low' | 'high') => string;
}) {
  const [width, setWidth] = useState(0);
  // Positions while a handle is being dragged; null means "show the props".
  const [dragging, setDragging] = useState<{ low: number; high: number } | null>(null);
  const shown = dragging ?? { low, high };

  // The responders are created once, so they read the latest numbers from
  // here instead of closing over the first render's.
  const latest = useRef({ width, low, high, min, max, step, onChange });
  useEffect(() => {
    latest.current = { width, low: shown.low, high: shown.high, min, max, step, onChange };
  });

  const responders = useMemo(() => {
    const make = (end: 'low' | 'high') => {
      let startValue = 0;
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // The sheet scrolls vertically. Without this, a slightly diagonal drag
        // hands the gesture to the ScrollView and the handle stops dead.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const s = latest.current;
          startValue = s[end];
          setDragging({ low: s.low, high: s.high });
        },
        onPanResponderMove: (_e, g) => {
          const s = latest.current;
          const usable = s.width - THUMB;
          if (usable <= 0) return;
          const raw = startValue + (g.dx / usable) * (s.max - s.min);
          const snapped = Math.round(raw / s.step) * s.step;
          // A handle cannot cross the other one; they may meet.
          const value =
            end === 'low'
              ? Math.min(Math.max(snapped, s.min), s.high)
              : Math.max(Math.min(snapped, s.max), s.low);
          setDragging(end === 'low' ? { low: value, high: s.high } : { low: s.low, high: value });
        },
        onPanResponderRelease: () => {
          const s = latest.current;
          s.onChange(s.low, s.high);
          setDragging(null);
        },
        onPanResponderTerminate: () => setDragging(null),
      });
    };
    // The rule sees `latest.current` inside `make` and assumes it is read
    // while rendering. It is only read inside gesture callbacks, long after.
    // eslint-disable-next-line react-hooks/refs
    return { low: make('low'), high: make('high') };
  }, []);

  const toX = (value: number) =>
    width === 0 ? 0 : ((value - min) / (max - min)) * (width - THUMB);
  const lowX = toX(shown.low);
  const highX = toX(shown.high);

  // Each label is centred under its handle, kept inside the bar, and pushed
  // apart from the other when the handles are close.
  const clamp = (x: number) => Math.min(Math.max(x, 0), Math.max(width - LABEL_WIDTH, 0));
  let lowLabel = clamp(lowX + THUMB / 2 - LABEL_WIDTH / 2);
  let highLabel = clamp(highX + THUMB / 2 - LABEL_WIDTH / 2);
  if (highLabel - lowLabel < LABEL_WIDTH) {
    const middle = (lowLabel + highLabel) / 2;
    lowLabel = clamp(middle - LABEL_WIDTH / 2 - LABEL_WIDTH / 2);
    highLabel = clamp(lowLabel + LABEL_WIDTH);
    lowLabel = highLabel - LABEL_WIDTH;
  }

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout}>
      <View style={styles.trackArea}>
        <View style={styles.track} />
        <View
          style={[styles.fill, { left: lowX + THUMB / 2, width: Math.max(highX - lowX, 0) }]}
        />
        {(['low', 'high'] as const).map((end) => (
          <View
            key={end}
            {...responders[end].panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={end === 'low' ? 'Lowest price' : 'Highest price'}
            accessibilityValue={{ text: format(shown[end], end) }}
            // A larger touch target than the visible handle.
            hitSlop={12}
            style={[styles.thumb, { left: end === 'low' ? lowX : highX }]}
          />
        ))}
      </View>

      <View style={styles.labels}>
        <Text style={[styles.label, { left: lowLabel }]} numberOfLines={1}>
          {format(shown.low, 'low')}
        </Text>
        <Text style={[styles.label, { left: highLabel }]} numberOfLines={1}>
          {format(shown.high, 'high')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  trackArea: { height: THUMB + 8, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  fill: { position: 'absolute', height: 4, backgroundColor: colors.softBlack },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.softBlack,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  labels: { height: 24, marginTop: spacing.xs },
  label: {
    position: 'absolute',
    width: LABEL_WIDTH,
    textAlign: 'center',
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.softBlack,
  },
});
