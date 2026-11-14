import { useEffect, useState } from "react";
import { buildPostFromMarkdown } from "../../content/markdown";
import type { Post, PostSummary } from "../../content/posts";

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

const clusterModules = import.meta.glob<{ clusters: Cluster[] }>("../../content/writings/clusters.json", {
  eager: true,
  import: "default",
});

/** A thematic cluster of essays, re-formed by Haiku whenever the corpus changes. */
export interface Cluster {
  id: string;
  numeral: string;
  name: string;
  thesis: string;
  slugs: string[];
}

// The manifest is already in clustering order: cluster by cluster, each a reading path.
const summaries: PostSummary[] = Object.values(manifestModules)[0] ?? [];
const clusters: Cluster[] = (Object.values(clusterModules)[0]?.clusters ?? []).filter((cluster) =>
  cluster.slugs.some((slug) => summaries.some((post) => post.slug === slug)),
);

interface UsePostsResult {
  posts: PostSummary[];
  clusters: Cluster[];
  loading: boolean;
  error: string | null;
}

interface UsePostResult {
  post: Post | null;
  loading: boolean;
  error: string | null;
}

export const useMarkdownPosts = (): UsePostsResult => ({
  posts: summaries,
  clusters,
  loading: false,
  error: null,
});

export const useMarkdownPost = (slug: string | undefined): UsePostResult => {
  const loader = slug ? postLoaders[`../../content/writings/${slug}.md`] : undefined;
  const [state, setState] = useState<UsePostResult>({
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
    setState({ post: null, loading: true, error: null });

    loader()
      .then((raw) => {
        if (cancelled) return;
        const parsed = buildPostFromMarkdown(raw, slug);
        setState({
          post: parsed ? { ...parsed.summary, content: parsed.content } : null,
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
  }, [slug, loader]);

  return state;
};
