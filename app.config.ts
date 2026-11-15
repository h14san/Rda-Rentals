import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic config layered over app.json.
 *
 * It injects what cannot be a literal in app.json: the Google Maps key, which
 * must be baked into the native project at build time, and Firebase's client
 * file once it exists. The EAS project id is not handled here: `eas init`
 * writes it to app.json as extra.eas.projectId, and `...config` carries it.
 */

// Required rather than imported: the app's tsconfig has no Node types, and this
// is the one file that runs in Node. The config is always evaluated from the
// project root, so the relative path resolves.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { existsSync } = require('fs') as { existsSync: (path: string) => boolean };

const GOOGLE_SERVICES_FILE = './google-services.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  // Firebase's client config for FCM. Only referenced when the file is really
  // there, because a path to a missing file fails the Android prebuild.
  const hasGoogleServices = existsSync(GOOGLE_SERVICES_FILE);

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
      ...(hasGoogleServices ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
    },
  };
};
