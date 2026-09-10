/** Formatting helpers shared across screens. */

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
  if (seconds < 60) return 'just now';
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
  return `${rounded} ${label}${rounded === 1 ? '' : 's'} ago`;
}

/** Human location line: "Kimironko, Gasabo". */
export function formatLocation(
  sector?: string | null,
  district?: string | null,
): string {
  return [sector, district].filter(Boolean).join(', ') || 'Location not set';
}
