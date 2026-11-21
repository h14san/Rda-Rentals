/**
 * Where a tapped notification leads, and how prices and times read.
 */
import { formatLocation, formatPrice, formatPriceCompact, timeAgo } from '@/lib/format';
import { setActiveLanguage } from '@/lib/i18n-state';
import { routeForNotification } from '@/lib/push';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
// push.ts registers its foreground handler as it loads, and jest-expo's
// automatic mock of expo-notifications cannot (its subscription has no remove).
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));

describe('routeForNotification', () => {
  it.each([
    ['message_new', { conversation_id: 'c1' }, '/conversation/c1'],
    // A landlord accepts from the conversation, so booking news opens it.
    ['booking_accepted', { conversation_id: 'c1' }, '/conversation/c1'],
    ['booking_requested', {}, '/bookings'],
    ['verification_decided', {}, '/verify-identity'],
    ['report_resolved', {}, '/my-reports'],
    ['account_suspended', {}, '/profile'],
    ['account_restored', {}, '/profile'],
    ['price_dropped', { listing_id: 'l1' }, '/listing/l1'],
    // The public page may refuse a suspended listing; its owner finds it on the profile.
    ['listing_suspended', { listing_id: 'l1' }, '/profile'],
  ])('%s opens %s', (kind, payload, route) => {
    expect(routeForNotification(kind, payload)).toBe(route);
  });

  it('opens nothing for a kind it does not know', () => {
    expect(routeForNotification('something_new', {})).toBeNull();
  });

  it('ignores ids that are not strings', () => {
    expect(routeForNotification('message_new', { conversation_id: 42 })).toBeNull();
  });
});

describe('prices (integer RWF)', () => {
  it('reads like local prices: number, then RWF', () => {
    expect(formatPrice(250000)).toBe('250,000 RWF');
  });

  it.each([
    [800, '800 RWF'],
    [150000, '150K RWF'],
    [1000000, '1M RWF'],
    [1250000, '1.3M RWF'],
  ])('compacts %p to %p', (amount, text) => {
    expect(formatPriceCompact(amount)).toBe(text);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-21T12:00:00Z').getTime();
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    setActiveLanguage('en');
  });
  afterEach(() => jest.restoreAllMocks());

  it('says "just now" under a minute', () => {
    expect(timeAgo(ago(30))).toBe('just now');
  });

  it.each([
    [60, '1 minute ago'],
    [2 * 3600, '2 hours ago'],
    [3 * 86400, '3 days ago'],
  ])('%p seconds is %p', (seconds, text) => {
    expect(timeAgo(ago(seconds))).toBe(text);
  });

  it('speaks French, with "mois" left as it is', () => {
    setActiveLanguage('fr');
    expect(timeAgo(ago(2 * 86400))).toBe('il y a 2 jours');
    expect(timeAgo(ago(65 * 86400))).toBe('il y a 2 mois');
  });
});

describe('formatLocation', () => {
  it('reads sector then district', () => {
    setActiveLanguage('en');
    expect(formatLocation('Kimironko', 'Gasabo')).toBe('Kimironko, Gasabo');
    expect(formatLocation(null, null)).toBe('Location not set');
  });
});
