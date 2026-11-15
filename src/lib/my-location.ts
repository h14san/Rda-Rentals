import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * The renter's own position, for centring the feed map and nothing else.
 *
 * It never leaves the phone and is never stored (rule 10). The map searches
 * the area on screen, and that area is sent rounded outward to about a
 * kilometre (`roundBoundsOutward`), so a request names a neighbourhood rather
 * than a doorstep.
 */

export type LocationAccess = 'granted' | 'denied' | 'blocked' | 'unavailable';

export type Coordinates = { latitude: number; longitude: number };

/**
 * Rwanda's extent with a small margin. Someone outside it (often family
 * abroad looking for a relative) is not centred on, because the map would
 * open on a country with no listings.
 */
const RWANDA = { south: -2.9, north: -1.0, west: 28.8, east: 30.95 };

export function isInRwanda(c: Coordinates): boolean {
  return (
    c.latitude >= RWANDA.south &&
    c.latitude <= RWANDA.north &&
    c.longitude >= RWANDA.west &&
    c.longitude <= RWANDA.east
  );
}

/**
 * Asks for when-in-use access, or reports the answer already given.
 * `blocked` means the system will not show the prompt again, so the only way
 * forward is the phone's settings.
 */
export async function requestLocationAccess(): Promise<LocationAccess> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'blocked';
    const asked = await Location.requestForegroundPermissionsAsync();
    if (asked.granted) return 'granted';
    return asked.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'unavailable';
  }
}

/**
 * A recent fix if the phone has one, otherwise a fresh one at balanced
 * accuracy. The map only needs the neighbourhood, and waiting for GPS to
 * settle indoors can take most of a minute.
 */
export async function currentPosition(): Promise<Coordinates | null> {
  try {
    const recent = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60 * 1000,
      requiredAccuracy: 1000,
    });
    const fix =
      recent ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  } catch {
    // Location services switched off, or no fix indoors. The map stays on
    // Kigali, which is where it would have opened anyway.
    return null;
  }
}
