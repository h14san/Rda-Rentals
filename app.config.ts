import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic config layered over app.json.
 *
 * Its only job is injecting the Google Maps API key into native config at build
 * time. Maps keys must be baked into the native project, so they cannot be read
 * from process.env at runtime the way EXPO_PUBLIC_* values are.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  return {
    ...config,
    name: config.name ?? 'Rwanda Rentals',
    slug: config.slug ?? 'rwanda-rentals',
    ios: {
      ...config.ios,
      config: googleMapsApiKey ? { googleMapsApiKey } : undefined,
    },
    android: {
      ...config.android,
      config: googleMapsApiKey ? { googleMaps: { apiKey: googleMapsApiKey } } : undefined,
    },
  };
};
