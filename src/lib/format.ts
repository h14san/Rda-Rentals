/**
 * Formatting helpers shared across screens.
 *
 * They read the language from i18n's module state rather than taking it as an
 * argument: they are called from dozens of places, and a screen re-renders
 * when the language changes, which re-runs them.
 */
import { activeLanguage } from '@/lib/i18n-state';

/** "150,000 RWF" — currency after the number, which is how prices read locally. */
export function formatPrice(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount)} RWF`;
}

/** Compact form for dense card corners: "150K RWF", "1.2M RWF". */
export function formatPriceCompact(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M RWF`;
  }
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K RWF`;
  return `${amount} RWF`;
}

/** "2 days ago" / "just now". Avoids pulling in a date library for one use. */
export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const french = activeLanguage() === 'fr';
  if (seconds < 60) return french ? 'à l’instant' : 'just now';
  const units: [number, string][] = [
    [60, 'minute'],
    [60, 'hour'],
    [24, 'day'],
    [7, 'week'],
    [4.35, 'month'],
    [12, 'year'],
  ];
  let value = seconds;
  let label = 'second';
  for (const [factor, name] of units) {
    if (value < factor) break;
    value = value / factor;
    label = name;
  }
  const rounded = Math.floor(value);
  if (french) {
    const unit = FRENCH_UNITS[label] ?? label;
    // "mois" is already plural.
    const plural = rounded === 1 || unit.endsWith('s') ? '' : 's';
    return `il y a ${rounded} ${unit}${plural}`;
  }
  return `${rounded} ${label}${rounded === 1 ? '' : 's'} ago`;
}

const FRENCH_UNITS: Record<string, string> = {
  second: 'seconde',
  minute: 'minute',
  hour: 'heure',
  day: 'jour',
  week: 'semaine',
  month: 'mois',
  year: 'an',
};

/** Human location line: "Kimironko, Gasabo". */
export function formatLocation(
  sector?: string | null,
  district?: string | null,
): string {
  return (
    [sector, district].filter(Boolean).join(', ') ||
    (activeLanguage() === 'fr' ? 'Emplacement non précisé' : 'Location not set')
  );
}
