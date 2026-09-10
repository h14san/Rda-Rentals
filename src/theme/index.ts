/**
 * Design tokens for Rwanda Rentals.
 *
 * Palette and direction come from the Developer Framework doc: minimalist,
 * spacious, image-first, rounded corners, soft shadows, "clear pricing
 * emphasis". Those are fixed requirements, not open choices — this file decides
 * how they are executed, not whether.
 */
import { Platform, type TextStyle } from 'react-native';

export const colors = {
  /** Page and card background. */
  white: '#FFFFFF',
  /** Surface behind cards, input fills, skeletons. */
  lightGray: '#F3F4F6',
  /** Body copy and icons. */
  charcoal: '#1F2937',
  /** Headings and price emphasis. */
  softBlack: '#111827',
  /** Accent. Spent deliberately — see the note below. */
  gold: '#E9B44C',

  /** Derived, not in the source doc but needed for real UI. */
  border: '#E5E7EB',
  muted: '#6B7280',
  danger: '#DC2626',
  success: '#059669',
  whatsapp: '#25D366',
} as const;

/**
 * Where the accent is allowed to appear.
 *
 * Warm gold is the only colour in the palette with any warmth, so it reads as
 * "important" wherever it lands. It earns its place in exactly two roles: the
 * featured badge (paid placement, Phase 2) and the price rule on a listing.
 * Tying it to price is deliberate — opaque pricing is the market problem the
 * brief opens with, so the one warm mark in the app points at the number the
 * tenant came to find. Everything else stays greyscale; an accent used
 * everywhere is just another neutral.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  /** Airbnb-style image corners. */
  lg: 16,
  pill: 999,
} as const;

/**
 * Font families.
 *
 * React Native does not synthesise weights for custom fonts — asking for
 * fontWeight '700' on Inter silently renders the regular face. Every weight is
 * therefore its own family, and `fontWeight` must not be used alongside these.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Font assets to preload. Keys must match the fontFamily values above. */
export const fontAssets = {
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
};

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 34,
} as const;

/**
 * Composable text styles.
 *
 * Inter's default tracking is loose at display sizes, which is what makes an
 * untuned Inter screen read as a wireframe. Large text is tightened; small text
 * is opened slightly so 12px meta stays legible on a cheap panel in daylight.
 */
export const type = {
  /** Screen titles. */
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xl,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: colors.softBlack,
  },
  /** Section headings. */
  h2: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.lg,
    lineHeight: 26,
    letterSpacing: -0.3,
    color: colors.softBlack,
  },
  /** The hero number on a listing detail page. */
  priceHero: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xxl,
    lineHeight: 40,
    // Tighter than the headings: long RWF figures (900,000) otherwise sprawl
    // and stop reading as a single value.
    letterSpacing: -1.2,
    color: colors.softBlack,
  },
  /** The price on a feed card — the field tenants actually scan for. */
  price: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    lineHeight: 26,
    letterSpacing: -0.5,
    color: colors.softBlack,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    lineHeight: 24,
    color: colors.charcoal,
  },
  bodyStrong: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    lineHeight: 24,
    color: colors.softBlack,
  },
  /** Buttons, chips, field labels. */
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    lineHeight: 20,
    letterSpacing: 0.1,
    color: colors.charcoal,
  },
  /** Secondary information under a title. */
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    letterSpacing: 0.1,
    color: colors.muted,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    lineHeight: 16,
    letterSpacing: 0.2,
    color: colors.muted,
  },
} satisfies Record<string, TextStyle>;

/** Soft shadow. Cross-platform: iOS uses shadow*, Android uses elevation. */
export const shadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  android: { elevation: 3 },
  default: {},
}) as object;
