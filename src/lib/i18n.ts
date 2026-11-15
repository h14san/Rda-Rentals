import type { Session } from '@supabase/supabase-js';
import { useCallback } from 'react';

import { useAuth } from '@/features/auth/context';
import { FR as FR_CORE } from '@/lib/i18n-fr';
import { FR_MORE } from '@/lib/i18n-fr-more';
import {
  activeLanguage,
  deviceLanguage,
  setActiveLanguage,
  type Language,
} from '@/lib/i18n-state';
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
 * Three things do the work, so screens rarely call anything:
 *   - components/text.tsx translates any <Text> whose child is one string;
 *   - lib/alert.ts translates alert titles, messages and buttons;
 *   - the shared components translate their label, hint and placeholder.
 * Text with a number or a name in it uses a template:
 * t('{n} saved', { n }) in a component, translate(...) elsewhere.
 * lib/format.ts and listingFacts() handle "2 days ago", "3 bedrooms" and
 * dates themselves.
 *
 * Not translated: anything composed in the database (notification bodies,
 * push banners, chat system messages), error text from the server, and
 * screen-reader labels. `node scripts/i18n-missing.mjs out.tsv labels.tsv`
 * lists static strings with no French line.
 */
const FR: Record<string, string> = { ...FR_CORE, ...FR_MORE };

export const LANGUAGES = ['en', 'fr'] as const;
export type { Language };
export { setActiveLanguage, activeLanguage };

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
};

/** The account's choice, kept in its own auth metadata like the account mode. */
export function languageOf(session: Session | null): Language {
  const value = session?.user.user_metadata?.language;
  return (LANGUAGES as readonly string[]).includes(value) ? (value as Language) : deviceLanguage();
}

export async function setLanguage(language: Language): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { language } });
  if (error) throw error;
}

function fill(template: string, values?: Record<string, string | number | null>): string {
  return values
    ? template.replace(/\{(\w+)\}/g, (whole, key) =>
        key in values ? String(values[key] ?? '') : whole,
      )
    : template;
}

/**
 * The non-hook form, for alerts and for text assembled in helpers. Takes
 * `{name}` values like t(). It reads the language the root layout last set,
 * so it is right on the next render rather than re-rendering by itself.
 */
export function translate(text: string, values?: Record<string, string | number | null>): string {
  return fill(activeLanguage() === 'fr' ? (FR[text] ?? text) : text, values);
}

export type Translate = (text: string, values?: Record<string, string | number>) => string;

/**
 * `const t = useT()` then `t('Save')`, or `t('{n} saved', { n: 3 })` for
 * text with a number or a name in it. The template is the dictionary key, so
 * the French line carries the same `{n}`. Unknown text comes back unchanged.
 */
export function useT(): Translate {
  const { session } = useAuth();
  const language = languageOf(session);
  return useCallback(
    (text: string, values?: Record<string, string | number>) => {
      const template = language === 'fr' ? (FR[text] ?? text) : text;
      return values
        ? template.replace(/\{(\w+)\}/g, (whole, key) =>
            key in values ? String(values[key]) : whole,
          )
        : template;
    },
    [language],
  );
}

export function useLanguage(): Language {
  const { session } = useAuth();
  return languageOf(session);
}
