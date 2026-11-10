import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { isLang, type Lang } from "../../content/posts";

/**
 * The language posts are read in. `?lang=es` in the URL wins, so a shared link
 * opens in the language it was shared in; otherwise the reader's last choice,
 * then their browser language. English is the original and the fallback.
 */
const STORAGE_KEY = "writings:lang";

function storedLang(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

function browserLang(): Lang {
  const languages = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  return languages.some((tag) => tag?.toLowerCase().startsWith("es")) ? "es" : "en";
}

export function useReadingLang(): [Lang, (next: Lang) => void] {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("lang");
  const lang: Lang = isLang(fromUrl) ? fromUrl : storedLang() ?? browserLang();

  const setLang = useCallback(
    (next: Lang) => {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private mode or blocked storage: the URL still carries the choice.
      }
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          if (next === "en") updated.delete("lang");
          else updated.set("lang", next);
          return updated;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );

  return [lang, setLang];
}

/** Link to a post in a given language. */
export const postPath = (slug: string, lang: Lang) =>
  lang === "en" ? `/writings/${slug}` : `/writings/${slug}?lang=${lang}`;

/** The handful of interface words that sit around a post. */
export const READING_COPY = {
  en: {
    locale: "en-GB",
    switchLabel: "Reading language",
    names: { en: "Read in English", es: "Read in Spanish" },
    minRead: (minutes: number) => `${minutes} min read`,
    older: "Older",
    newer: "Newer",
    more: "More writings",
    stale: "",
  },
  es: {
    locale: "es-ES",
    switchLabel: "Idioma de lectura",
    names: { en: "Leer en inglés", es: "Leer en español" },
    minRead: (minutes: number) => `${minutes} min de lectura`,
    older: "Anterior",
    newer: "Siguiente",
    more: "Más escritos",
    stale:
      "El original en inglés ha cambiado desde que se tradujo este texto; algunos pasajes pueden no coincidir.",
  },
} satisfies Record<Lang, unknown>;
