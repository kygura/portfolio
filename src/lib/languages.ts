/**
 * Languages offered in the post translator. Mirrors LANGUAGES in
 * api/writings/translate.ts (which can't be imported here: it pulls in Node
 * modules). Any other language can be typed by name.
 */
export const LANGUAGES: { code: string; name: string; native: string }[] = [
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ca", name: "Catalan", native: "Català" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
];

const RTL = new Set(["ar", "he", "fa", "ur"]);

export const findLanguage = (value: string) => {
  const lower = value.trim().toLowerCase();
  return LANGUAGES.find((l) => l.code === lower || l.name.toLowerCase() === lower) ?? null;
};

/** The `lang` attribute for translated text, when we know the code. */
export const langAttribute = (value: string) => findLanguage(value)?.code;
export const isRtl = (value: string) => {
  const code = langAttribute(value);
  return code ? RTL.has(code) : false;
};
