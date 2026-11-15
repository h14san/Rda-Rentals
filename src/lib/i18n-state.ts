/**
 * The language in force, for code that runs outside a component: alerts
 * raised from event handlers, and the shared formatters. The root layout keeps
 * it in step with the session. Components use useT() in i18n.ts, which
 * re-renders when the language changes; this cannot, and does not need to:
 * a language change re-renders the screens that call these helpers.
 *
 * In a file of its own, with no imports, so anything may read it without
 * pulling in the auth context.
 */
export type Language = 'en' | 'fr';

/** The phone's own language, for someone who has not chosen one. */
export function deviceLanguage(): Language {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('fr')
      ? 'fr'
      : 'en';
  } catch {
    return 'en';
  }
}

let active: Language = deviceLanguage();

export function setActiveLanguage(language: Language): void {
  active = language;
}

export function activeLanguage(): Language {
  return active;
}
