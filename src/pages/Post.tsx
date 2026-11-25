import React, { useRef } from "react";
import { useParams, useSearchParams, Link, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMarkdownPost, useMarkdownPosts } from "../hooks/useMarkdownPosts";
import CodeBlock from "../components/CodeBlock";
import PostImage from "../components/PostImage";
import Alert from "../components/Alert";
import PostToc from "../components/PostToc";
import TranslateMenu from "../components/TranslateMenu";
import { usePostTranslation } from "../hooks/usePostTranslation";
import { isRtl, langAttribute } from "../lib/languages";
import { buildEdges, neighboursOf, toMapPosts } from "../../content/meaning-map";

type MarkdownCodeProps = React.ComponentPropsWithoutRef<"code"> & {
  node?: unknown;
};

type MarkdownHeadingProps = React.ComponentPropsWithoutRef<"h2"> & {
  node?: unknown;
};

// Recursively extract the text content of rendered markdown children.
const extractText = (node: React.ReactNode): string => {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
};

// Sections are numbered by position on the rail and in the contents sheet,
// the same in every post, so an author's own leading numeral ("VIII. …")
// is dropped from the heading rather than left to disagree with them.
const LEADING_NUMERAL = /^[IVXLCDM]+[.:)]\s+/;
const stripNumeral = (children: React.ReactNode) => {
  const parts = React.Children.toArray(children);
  if (typeof parts[0] === "string") parts[0] = parts[0].replace(LEADING_NUMERAL, "");
  return parts;
};

type MarkdownImageProps = React.ComponentPropsWithoutRef<"img"> & {
  node?: unknown;
};

type MarkdownBlockquoteProps = React.ComponentPropsWithoutRef<"blockquote"> & {
  node?: unknown;
};

type AlertType = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";

const alertTypes: Record<AlertType, AlertType> = {
  NOTE: "NOTE",
  TIP: "TIP",
  IMPORTANT: "IMPORTANT",
  WARNING: "WARNING",
  CAUTION: "CAUTION",
};

const Post = () => {
  const { slug } = useParams();
  const { post, loading, error } = useMarkdownPost(slug);
  const { posts, clusters } = useMarkdownPosts();
  const articleRef = useRef<HTMLElement>(null);
  // ?lang=es keeps a translated view shareable and survives a reload.
  const [searchParams, setSearchParams] = useSearchParams();
  const lang = searchParams.get("lang");
  const translation = usePostTranslation(post ? slug : undefined, lang);
  const setLang = (next: string | null) =>
    setSearchParams(
      (params) => {
        if (next) params.set("lang", next);
        else params.delete("lang");
        return params;
      },
      { replace: true },
    );

  if (loading) {
    return (
      <div className="page-shell page-shell--narrow animate-fade-in">
        <div className="notice">
          Loading post...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell page-shell--narrow animate-fade-in">
        <div className="notice notice--error">
          {error}
        </div>
      </div>
    );
  }

  // Handle post not found
  if (!post) {
    return <Navigate
      to="/writings"
      replace />;
  }

  const entry = posts.find((p) => p.slug === post.slug) ?? null;
  const cluster = clusters.find((c) => c.id === entry?.cluster) ?? null;
  // Essays that share a topic with this one, the closest first.
  const linkedPosts = neighboursOf(post.slug, buildEdges(toMapPosts(posts)))
    .slice(0, 4)
    .flatMap((neighbour) => {
      const other = posts.find((p) => p.slug === neighbour.slug);
      return other ? [{ post: other, topics: neighbour.topics }] : [];
    });

  const translated = translation.status === "streaming" || translation.status === "done";
  const title = translated && translation.title ? translation.title : post.title;
  const content = translated && translation.body ? translation.body : post.content;
  const contentLang = translated && lang ? langAttribute(lang) : undefined;
  const dir = translated && lang && isRtl(lang) ? "rtl" : undefined;

  return (
    <div className="page-shell page-shell--narrow animate-fade-in">
      <header className="post-head">
        <div className="post-head__bar">
          <Link to="/writings" className="post-head__back">
            <ArrowLeft size={14} aria-hidden="true" />
            Writings
          </Link>
          <TranslateMenu value={lang} onChange={setLang} />
        </div>

        <p className="post-head__eyebrow">
          {cluster && <Link to="/writings" className="post-head__cluster">{cluster.name}</Link>}
          <span>{post.readTime} min read</span>
        </p>

        <h1 className="post-head__title" lang={contentLang} dir={dir}>{title}</h1>

        {lang && translation.status !== "idle" && (
          <p className={`post-translate__status${translation.status === "error" ? " is-error" : ""}`} role="status">
            {translation.status === "error" ? (
              translation.error
            ) : translation.status === "loading" ? (
              "Fetching translation…"
            ) : translation.status === "streaming" ? (
              `Translating into ${translation.language}…`
            ) : (
              `Machine-translated into ${translation.language} by Claude`
            )}
            <button type="button" onClick={() => setLang(null)}>
              Show original
            </button>
          </p>
        )}
      </header>

      <PostToc
        articleRef={articleRef}
        contentKey={translation.status === "streaming" ? `${lang}:streaming` : content}
      />

      <article ref={articleRef} lang={contentLang} dir={dir} className="prose-minimal text-lg leading-relaxed text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // The page title owns the only <h1>; a markdown h1 is a section.
            h1({ node, className, children, ...props }: MarkdownHeadingProps) {
              void node;
              return (
                <h2 {...props} className={["md-h1", className].filter(Boolean).join(" ")}>
                  {stripNumeral(children)}
                </h2>
              );
            },
            h2({ node, children, ...props }: MarkdownHeadingProps) {
              void node;
              return <h2 {...props}>{stripNumeral(children)}</h2>;
            },
            pre({ children }) {
              // Fenced blocks arrive as <pre><code class="language-x">. The
              // <pre> is what marks a block: react-markdown no longer passes an
              // `inline` flag, so deciding inside `code` turned every inline
              // `code` span into a full CodeBlock.
              const code = React.Children.toArray(children).find(React.isValidElement) as
                | React.ReactElement<{ className?: string; children?: React.ReactNode }>
                | undefined;
              const match = /language-(\w+)/.exec(code?.props.className || "");
              return (
                <div className="not-prose my-6">
                  <CodeBlock
                    language={match ? match[1] : undefined}
                    value={extractText(code?.props.children).replace(/\n$/, "")}
                    className={code?.props.className}
                  />
                </div>
              );
            },
            code({ node, ...props }: MarkdownCodeProps) {
              // Only inline code reaches here as a plain element; `node` is
              // the hast node and must not land on the DOM.
              void node;
              return <code {...props} />;
            },
                        img({ node, ...props }: MarkdownImageProps) {
              void node;
              return (
                <PostImage
                  {...props}
                  className="w-full h-auto rounded-lg shadow-md"
                />
              );
            },
            blockquote({ node, children, ...props }: MarkdownBlockquoteProps) {
              void node;

              const childrenArray = React.Children.toArray(children);

              // Find the first meaningful child (ignore whitespace strings)
              const firstContentIndex = childrenArray.findIndex(child => {
                if (typeof child === 'string') return child.trim().length > 0;
                return true; // Elements are content
              });

              if (firstContentIndex !== -1) {
                const contentChild = childrenArray[firstContentIndex];
                const textContent = extractText(contentChild);

                if (textContent) {
                  // Relaxed regex to handle potential leading whitespace or newlines
                  const match = textContent.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
                  if (match) {
                    const type = alertTypes[match[1] as AlertType];
                    const pattern = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/;

                    const processChildren = (nodes: React.ReactNode): React.ReactNode => {
                      let found = false;
                      return React.Children.map(nodes, (child) => {
                        if (found) return child;

                        if (typeof child === 'string') {
                          if (child.match(pattern)) {
                            found = true;
                            return child.replace(pattern, '');
                          }
                          return child;
                        }

                        if (React.isValidElement<{ children?: React.ReactNode }>(child) && child.props.children) {
                          const processed = processChildren(child.props.children);
                          return React.cloneElement(child, {}, processed);
                        }
                        return child;
                      });
                    };

                    // Transform the specific child that contains the trigger
                    const newContentChild = React.isValidElement(contentChild)
                      ? React.cloneElement(contentChild as React.ReactElement, {}, processChildren(contentChild.props.children))
                      : (typeof contentChild === 'string' ? contentChild.replace(pattern, '') : contentChild);

                    /* 
                       Reconstruct children: 
                       0..firstContentIndex-1 (whitespace)
                       newContentChild (stripped trigger)
                       firstContentIndex+1..end (rest)
                    */
                    const newChildren = [
                      ...childrenArray.slice(0, firstContentIndex),
                      newContentChild,
                      ...childrenArray.slice(firstContentIndex + 1)
                    ];

                    return (
                      <Alert type={type}>
                        {newChildren}
                      </Alert>
                    );
                  }
                }
              }

              return <blockquote {...props}>{children}</blockquote>;
            }
          }}
        >
          {content}
        </ReactMarkdown>
      </article>

      {linkedPosts.length > 0 && (
        <nav className="post-links" aria-labelledby="post-links-title">
          <h2 id="post-links-title" className="post-links__title">Linked essays</h2>
          <p className="post-links__note">Essays that share a topic with this one. The links are generated by a language model.</p>
          <ul className="post-links__list">
            {linkedPosts.map(({ post: other, topics }) => (
              <li key={other.slug}>
                <Link to={`/writings/${other.slug}`} className="post-links__link">
                  <span className="post-links__mark">{other.mark}</span>
                  <span className="post-links__name">{other.title}</span>
                  <span className="post-links__why">{topics.join(", ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

    </div>
  );
};

export default Post;
