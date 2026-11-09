import React, { useRef } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMarkdownPost, useMarkdownPosts } from "../hooks/useMarkdownPosts";
import { resolvePostTags } from "../lib/postTagFallbacks";
import CodeBlock from "../components/CodeBlock";
import PostImage from "../components/PostImage";
import Alert from "../components/Alert";
import PostToc from "../components/PostToc";

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
  const { posts } = useMarkdownPosts();
  const articleRef = useRef<HTMLElement>(null);

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

  // The index lists newest first and numbers entries up from the oldest.
  const at = posts.findIndex((p) => p.slug === post.slug);
  const number = at >= 0 ? posts.length - at : 0;
  const newer = at > 0 ? posts[at - 1] : null;
  const older = at >= 0 && at < posts.length - 1 ? posts[at + 1] : null;
  const tags = resolvePostTags(post).slice(0, 4);
  const parsed = new Date(post.date);
  const date = Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    : "";

  return (
    <div className="page-shell page-shell--narrow animate-fade-in">
      <header className="post-head">
        <Link to="/writings" className="post-head__back">
          <ArrowLeft size={14} aria-hidden="true" />
          Writings
        </Link>

        <p className="post-head__eyebrow">
          {number > 0 && <span>№{String(number).padStart(2, "0")}</span>}
          {date && <time dateTime={post.date}>{date}</time>}
          <span>{post.readTime} min read</span>
        </p>

        <h1 className="post-head__title">{post.title}</h1>

        {tags.length > 0 && (
          <p className="post-head__tags">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </p>
        )}
      </header>

      <PostToc articleRef={articleRef} contentKey={post.content} />

      <article ref={articleRef} className="prose-minimal text-lg leading-relaxed text-foreground">
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
          {post.content}
        </ReactMarkdown>
      </article>

      {(older || newer) && (
        <nav className="post-next" aria-label="More writings">
          {older ? (
            <Link to={`/writings/${older.slug}`} className="post-next__link">
              <span className="post-next__dir">
                <ArrowLeft size={13} aria-hidden="true" /> Older
              </span>
              <span className="post-next__title">{older.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {newer && (
            <Link to={`/writings/${newer.slug}`} className="post-next__link post-next__link--newer">
              <span className="post-next__dir">
                Newer <ArrowRight size={13} aria-hidden="true" />
              </span>
              <span className="post-next__title">{newer.title}</span>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
};

export default Post;
