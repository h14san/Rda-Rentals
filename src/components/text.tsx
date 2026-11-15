import { Text as NativeText, type TextProps } from 'react-native';

import { useT } from '@/lib/i18n';

/**
 * The app's Text. Use this, not react-native's.
 *
 * It shows its text in the user's language: when the child is one plain
 * string, that string is looked up in the French dictionary. This is why
 * screens are translated without calling t() on every line. A child that is
 * built from pieces (`{count} saved`, or text around a nested <Text>) is an
 * array, not a string, and passes through untouched; give those a template
 * with `t('{n} saved', { n })`.
 *
 * A side effect worth knowing: user-written text that happens to equal a
 * dictionary key (a listing titled exactly "Studio") is shown translated too.
 */
export function Text({ children, ...rest }: TextProps) {
  const t = useT();
  return <NativeText {...rest}>{typeof children === 'string' ? t(children) : children}</NativeText>;
}
