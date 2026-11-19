/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GA4 measurement ID (G-XXXXXXXXXX). Unset means no analytics at all. */
  readonly VITE_GA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
