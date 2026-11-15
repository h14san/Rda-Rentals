import type { Session } from '@supabase/supabase-js';
import { useCallback } from 'react';

import { useAuth } from '@/features/auth/context';
import { FR } from '@/lib/i18n-fr';
import { supabase } from '@/lib/supabase';

/**
 * Languages. English is the source; French is a dictionary keyed by the
 * English text.
 *
 * Keyed by the English string, not by an id, on purpose: a string with no
 * translation yet simply shows in English instead of as "profile.menu.title",
 * and translating a screen is adding lines to one file. The cost is that
 * changing English wording orphans its French line, which then falls back to
 * English, visibly, rather than breaking.
 *
 * The shared components (Button, Chip, TextField, the menu rows, the empty
 * and error states, the action sheet) translate what they are given, so most
 * screens are covered without knowing this file exists. Text built from
 * numbers or names ("3 rentals", "Joined 2 days ago") and everything composed
 * in the database (notifications, system messages) is not translated yet.
 */
export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
};

/** The phone's own language, for someone who has not chosen one. */
function deviceLanguage(): Language {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('fr')
      ? 'fr'
      : 'en';
  } catch {
    return 'en';
  }
}

/** The account's choice, kept in its own auth metadata like the account mode. */
export function languageOf(session: Session | null): Language {
  const value = session?.user.user_metadata?.language;
  return (LANGUAGES as readonly string[]).includes(value) ? (value as Language) : deviceLanguage();
}

export async function setLanguage(language: Language): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { language } });
  if (error) throw error;
}

export type Translate = (text: string) => string;

/** `const t = useT()` then `t('Save')`. Unknown text comes back unchanged. */
export function useT(): Translate {
  const { session } = useAuth();
  const language = languageOf(session);
  return useCallback((text: string) => (language === 'fr' ? (FR[text] ?? text) : text), [language]);
}

export function useLanguage(): Language {
  const { session } = useAuth();
  return languageOf(session);
}
