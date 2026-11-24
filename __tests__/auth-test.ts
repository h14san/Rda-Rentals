/**
 * Sign-in: what people type, and what the code screen expects.
 *
 * The client is mocked because these helpers only need the module to load;
 * the network half of sign-in is Supabase's.
 */
import {
  formatRwandanPhone,
  IDENTIFIER_HINT,
  normalizeIdentifier,
  normalizeRwandanPhone,
  OTP_LENGTH,
} from '@/lib/auth';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('normalizeRwandanPhone', () => {
  it.each([
    ['0788123456', '+250788123456'],
    ['788123456', '+250788123456'],
    ['250788123456', '+250788123456'],
    ['+250 788 123 456', '+250788123456'],
    ['0788-123-456', '+250788123456'],
    [' 0788 123 456 ', '+250788123456'],
    ['0722123456', '+250722123456'], // Airtel
    ['0732123456', '+250732123456'], // Airtel
    ['0792123456', '+250792123456'], // MTN
  ])('accepts %p as %p', (input, expected) => {
    expect(normalizeRwandanPhone(input)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['abc', 'no digits'],
    ['078812345', 'one digit short'],
    ['07881234567', 'one digit long'],
    ['0252123456', 'a landline'],
    ['0748123456', 'an unassigned 74 prefix'],
    ['+254712345678', 'a Kenyan number'],
  ])('rejects %p (%s)', (input) => {
    expect(normalizeRwandanPhone(input)).toBeNull();
  });
});

describe('formatRwandanPhone', () => {
  it('groups an E.164 number in threes', () => {
    expect(formatRwandanPhone('+250788123456')).toBe('+250 788 123 456');
  });

  it('leaves anything else as it was', () => {
    expect(formatRwandanPhone('not a number')).toBe('not a number');
  });
});

describe('email sign-in (the default channel)', () => {
  it('lower-cases and trims a valid address', () => {
    expect(normalizeIdentifier('  Someone@Example.COM ')).toBe('someone@example.com');
  });

  it.each(['someone', 'someone@', '@example.com', 'some one@example.com'])(
    'rejects %p',
    (input) => {
      expect(normalizeIdentifier(input)).toBeNull();
    },
  );

  it('expects 8-digit codes, which is auth.email.otp_length', () => {
    expect(OTP_LENGTH).toBe(8);
  });

  // The hint once promised a 6-digit code while email codes are 8. Whatever
  // it says, it must not state a length the code screen will not accept.
  it('never promises a code length that differs from OTP_LENGTH', () => {
    const stated = IDENTIFIER_HINT.match(/(\d+)-digit/);
    if (stated) expect(Number(stated[1])).toBe(OTP_LENGTH);
  });
});

describe('phone sign-in (EXPO_PUBLIC_AUTH_CHANNEL=phone)', () => {
  const original = process.env.EXPO_PUBLIC_AUTH_CHANNEL;
  afterEach(() => {
    process.env.EXPO_PUBLIC_AUTH_CHANNEL = original;
  });

  function loadWithPhone(): typeof import('@/lib/auth') {
    process.env.EXPO_PUBLIC_AUTH_CHANNEL = 'phone';
    let mod!: typeof import('@/lib/auth');
    jest.isolateModules(() => {
      // AUTH_CHANNEL is read once at load, so a fresh copy needs a require.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('@/lib/auth');
    });
    return mod;
  }

  it('expects 6-digit codes, which is auth.sms.otp_length', () => {
    expect(loadWithPhone().OTP_LENGTH).toBe(6);
  });

  it('normalises the typed number instead of an email', () => {
    const auth = loadWithPhone();
    expect(auth.normalizeIdentifier('0788 123 456')).toBe('+250788123456');
    expect(auth.normalizeIdentifier('someone@example.com')).toBeNull();
  });
});
