import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

/**
 * Opens a coordinate in whatever map app the device prefers.
 *
 * Uses the universal Google Maps https URL rather than the platform-specific
 * `geo:` / `maps:` schemes: it is an app link, so it opens the installed Maps
 * app when there is one and falls back to the browser when there is not, with
 * no canOpenURL check and no Android <queries> manifest entry needed.
 */
export async function openInMaps(
  latitude: number,
  longitude: number,
  label?: string,
): Promise<void> {
  const query = `${latitude},${longitude}`;
  const url =
    `https://www.google.com/maps/search/?api=1&query=${query}` +
    (label ? `&query_place_id=${encodeURIComponent(label)}` : '');

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open Maps', `The property is at ${query}.`);
  }
}

/**
 * Radius of the circle drawn around a listing's approximate point.
 *
 * Must match the 500 m disc the offset is drawn from in
 * 20261024120000_private_location.sql: the real point is anywhere inside it,
 * so a smaller circle would sometimes exclude the property it describes.
 */
export const APPROX_RADIUS_M = 500;
