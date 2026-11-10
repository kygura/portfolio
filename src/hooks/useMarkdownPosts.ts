import { useEffect, useState } from "react";
import { buildPostFromMarkdown } from "../../content/markdown";
import type { Lang, Post, PostSummary } from "../../content/posts";

// Both globs resolve at build time against content/writings/, which
// scripts/build-writings.ts fills from Notion before `vite build`. The manifest
// is tiny and bundled eagerly; each post body becomes its own lazily-loaded
// chunk. A missing manifest (script not run yet) yields an empty list.
const manifestModules = import.meta.glob<PostSummary[]>("../../content/writings/manifest.json", {
  eager: true,
  import: "default",
});
const postLoaders = import.meta.glob<string>("../../content/writings/*.md", {
  query: "?raw",
  import: "default",
});
// Translations sit in content/writings/<lang>/ and load the same way.
const translationLoaders = import.meta.glob<string>("../../content/writings/es/*.md", {
  query: "?raw",
  import: "default",
});

const loaderFor = (slug: string, lang: Lang) =>
  lang === "en"
    ? postLoaders[`../../content/writings/${slug}.md`]
    : translationLoaders[`../../content/writings/${lang}/${slug}.md`];

/** The language a post is shown in when `lang` is asked for: it, or English if untranslated. */
export const readableLang = (post: Pick<PostSummary, "translations">, lang: Lang): Lang =>
  lang !== "en" && post.translations?.[lang] ? lang : "en";

/** Summary of a post in the given language, falling back to English. */
export const localizedSummary = (post: PostSummary, lang: Lang): PostSummary => {
  const translation = lang === "en" ? undefined : post.translations?.[lang];
  return translation
    ? { ...post, title: translation.title, excerpt: translation.excerpt, readTime: translation.readTime }
    : post;
};

/** Languages a post can be read in. */
export const postLangs = (post: Pick<PostSummary, "translations">): Lang[] => [
  "en",
  ...(post.translations?.es ? (["es"] as const) : []),
];

const summaries: PostSummary[] = Object.values(manifestModules)[0] ?? [];

interface UsePostsResult {
  posts: PostSummary[];
  loading: boolean;
  error: string | null;
}

interface UsePostResult {
  post: Post | null;
  /** Language the post is shown in: the one asked for, or English if it has no translation. */
  lang: Lang;
  /** The translation predates the latest edit of the English original. */
  stale: boolean;
  loading: boolean;
  error: string | null;
}

export const useMarkdownPosts = (): UsePostsResult => ({
  posts: summaries,
  loading: false,
  error: null,
});

export const useMarkdownPost = (slug: string | undefined, requested: Lang = "en"): UsePostResult => {
  const summary = summaries.find((post) => post.slug === slug);
  const translated = slug ? loaderFor(slug, requested) : undefined;
  const lang: Lang = translated ? requested : "en";
  const loader = slug ? loaderFor(slug, lang) : undefined;
  const stale = lang !== "en" && Boolean(summary?.translations?.[lang]?.stale);

  const [state, setState] = useState<Omit<UsePostResult, "lang" | "stale">>({
    post: null,
    loading: Boolean(loader),
    error: null,
  });

  useEffect(() => {
    if (!slug || !loader) {
      setState({ post: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    // Keep the current post on screen while the other language loads, so
    // switching does not flash the loading notice.
    setState((previous) => ({ ...previous, loading: !previous.post, error: null }));

    loader()
      .then((raw) => {
        if (cancelled) return;
        const parsed = buildPostFromMarkdown(raw, slug);
        // A translation carries only its own title and excerpt; date and tags
        // come from the original.
        const base = summary ?? parsed?.summary;
        setState({
          post:
            parsed && base
              ? {
                  ...base,
                  title: parsed.summary.title,
                  excerpt: parsed.summary.excerpt,
                  readTime: lang === "en" ? base.readTime : localizedSummary(base, lang).readTime,
                  content: parsed.content,
                }
              : null,
          loading: false,
          error: null,
        });
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;
        setState({
          post: null,
          loading: false,
          error: caughtError instanceof Error ? caughtError.message : "Failed to load post",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [slug, loader, lang, summary]);

  return { ...state, lang, stale };
};
