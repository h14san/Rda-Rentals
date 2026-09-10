/**
 * Design tokens for Rwanda Rentals.
 *
 * Palette and principles come from the Developer Framework doc: minimalist,
 * spacious, image-first, rounded corners, soft shadows.
 */
import { Platform } from 'react-native';

export const colors = {
  /** Page and card background. */
  white: '#FFFFFF',
  /** Surface behind cards, input fills, skeletons. */
  lightGray: '#F3F4F6',
  /** Body copy and icons. */
  charcoal: '#1F2937',
  /** Headings and price emphasis. */
  softBlack: '#111827',
  /** Accent: featured badges, primary CTA. */
  gold: '#E9B44C',

  /** Derived, not in the source doc but needed for real UI. */
  border: '#E5E7EB',
  muted: '#6B7280',
  danger: '#DC2626',
  success: '#059669',
  whatsapp: '#25D366',
} as const;

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

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

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

export const fonts = Platform.select({
  ios: { sans: 'system-ui' },
  default: { sans: 'normal' },
  web: { sans: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif' },
})!;
