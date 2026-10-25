import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

import { formatPrice } from '@/lib/format';

/**
 * Landlord contact actions — the app's conversion point.
 *
 * WhatsApp is reached through the https://wa.me link rather than the
 * whatsapp:// scheme on purpose. Checking a custom scheme with canOpenURL
 * requires a <queries> entry in the Android manifest and silently returns false
 * without one, so the scheme route fails closed on exactly the devices that do
 * have WhatsApp. The https link is an app link: it opens WhatsApp directly when
 * installed and falls back to the browser when not, with no permission needed.
 * Call is offered as its own button rather than a fallback, so the user always
 * has both.
 */

export interface ContactContext {
  listingTitle: string;
  priceRwf: number;
  location: string;
}

/** wa.me wants bare digits: no plus, no spaces. */
function waNumber(e164: string): string {
  return e164.replace(/[^\d]/g, '');
}

function defaultMessage({ listingTitle, priceRwf, location }: ContactContext): string {
  return (
    `Hello, I saw your listing "${listingTitle}" ` +
    `(${formatPrice(priceRwf)}/month, ${location}) on Rwanda Rentals. ` +
    `Is it still available?`
  );
}

export async function openWhatsApp(
  phone: string,
  context: ContactContext,
): Promise<void> {
  const url = `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(
    defaultMessage(context),
  )}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open WhatsApp', `You can reach the landlord on ${phone}.`);
  }
}

export async function openPhoneCall(phone: string): Promise<void> {
  try {
    await Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  } catch {
    Alert.alert('Could not start the call', `You can reach the landlord on ${phone}.`);
  }
}
