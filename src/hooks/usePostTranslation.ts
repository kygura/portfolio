import { useEffect, useState } from "react";

export type TranslationStatus = "idle" | "loading" | "streaming" | "done" | "error";

export interface PostTranslation {
  status: TranslationStatus;
  /** Language name as the server resolved it, e.g. "Spanish". */
  language: string;
  title: string;
  body: string;
  /** committed | blob | model */
  source: string;
  error: string | null;
}

const IDLE: PostTranslation = { status: "idle", language: "", title: "", body: "", source: "", error: null };

/** Finished translations, kept for the session so switching back is instant. */
const memo = new Map<string, PostTranslation>();

/** First line is the title, the rest (after a blank line) is the body. */
function split(text: string): { title: string; body: string } {
  const at = text.indexOf("\n");
  if (at < 0) return { title: "", body: "" };
  return { title: text.slice(0, at).replace(/^#+\s*/, "").trim(), body: text.slice(at + 1).replace(/^\s+/, "") };
}

/**
 * Fetches /api/writings/translate and exposes the text as it arrives, so a
 * fresh model translation fills in on the page while it is being written.
 */
export function usePostTranslation(slug: string | undefined, lang: string | null): PostTranslation {
  const key = slug && lang ? `${slug}:${lang.toLowerCase()}` : "";
  const [state, setState] = useState<PostTranslation>(() => memo.get(key) ?? IDLE);

  useEffect(() => {
    if (!key || !slug || !lang) {
      setState(IDLE);
      return;
    }
    const done = memo.get(key);
    if (done) {
      setState(done);
      return;
    }

    const controller = new AbortController();
    setState({ ...IDLE, status: "loading", language: lang });

    (async () => {
      const response = await fetch(
        `/api/writings/translate?slug=${encodeURIComponent(slug)}&lang=${encodeURIComponent(lang)}`,
        { signal: controller.signal },
      );
      if (!response.ok || !response.body) {
        const message = await response
          .json()
          .then((body: { error?: string }) => body.error)
          .catch(() => null);
        throw new Error(message || `Translation failed (${response.status})`);
      }
      const language = decodeURIComponent(response.headers.get("x-translation-language") ?? lang);
      const source = response.headers.get("x-translation-source") ?? "";

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let text = "";
      let lastPaint = 0;
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        text += value;
        // Repaint at most every ~80ms: re-rendering markdown per token is wasteful.
        const now = performance.now();
        if (now - lastPaint > 80) {
          lastPaint = now;
          setState({ status: "streaming", language, source, error: null, ...split(text) });
        }
      }

      const parts = split(text);
      if (text.trim() === "UNSUPPORTED" || !parts.title || !parts.body) {
        throw new Error(`Couldn't translate this post into ${language}.`);
      }
      const result: PostTranslation = { status: "done", language, source, error: null, ...parts };
      memo.set(key, result);
      setState(result);
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setState({
        ...IDLE,
        status: "error",
        language: lang,
        error: error instanceof Error ? error.message : "Translation failed",
      });
    });

    return () => controller.abort();
  }, [key, slug, lang]);

  return state;
}
