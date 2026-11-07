import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowUp, ChevronRight, FileText, GitBranch, Square } from "lucide-react";
import { SyntaxHighlighter, languageForPath, tokenTheme } from "@/lib/highlight";
import {
  askCodebase,
  formatBytes,
  rawUrl,
  timeAgo,
  useCodebase,
  type ChatTurn,
  type Codebase as CodebaseData,
  type CodebaseEntry,
} from "@/lib/showcase";

/** Where the viewer points: a file and, optionally, the lines to mark. */
type Target = { path: string; start?: number; end?: number };

/** A "path", "path:12" or "path:12-30" citation, if the path is in the tree. */
function parseCitation(text: string, known: Set<string>): Target | null {
  const match = text.trim().match(/^\.?\/?([^\s:]+?)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match || !known.has(match[1])) return null;
  const start = match[2] ? Number(match[2]) : undefined;
  const end = match[3] ? Number(match[3]) : start;
  return { path: match[1], start, end };
}

const describeTarget = ({ path, start, end }: Target) =>
  start ? `${path}:${start}${end && end !== start ? `-${end}` : ""}` : path;

// ---- File tree -------------------------------------------------------------------

type TreeNode = { name: string; path: string; size: number; children?: TreeNode[] };

/** Folds sorted blob paths into nested directories, directories first. */
function buildTree(entries: CodebaseEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", size: 0, children: [] };
  for (const entry of entries) {
    const parts = entry.path.split("/");
    let dir = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      if (i === parts.length - 1) {
        dir.children!.push({ name: part, path, size: entry.size });
        return;
      }
      let next = dir.children!.find((child) => child.children && child.name === part);
      if (!next) {
        next = { name: part, path, size: 0, children: [] };
        dir.children!.push(next);
      }
      next.size += entry.size;
      dir = next;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.name.localeCompare(b.name));
    nodes.forEach((node) => node.children && sort(node.children));
  };
  sort(root.children!);
  return root.children!;
}

const ancestors = (path: string) => path.split("/").slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join("/"));

type TreeProps = {
  nodes: TreeNode[];
  depth: number;
  open: Set<string>;
  selected: string | null;
  read: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
};

const TreeLevel = ({ nodes, depth, open, selected, read, onToggle, onSelect }: TreeProps) => (
  <ul role={depth === 0 ? "tree" : "group"} className="cb-tree__level">
    {nodes.map((node) => {
      const isDir = Boolean(node.children);
      const expanded = isDir && open.has(node.path);
      return (
        <li key={node.path} role="treeitem" aria-expanded={isDir ? expanded : undefined} aria-selected={node.path === selected}>
          <button
            type="button"
            className="cb-tree__row"
            data-dir={isDir}
            data-selected={node.path === selected}
            data-read={read.has(node.path)}
            style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}
            onClick={() => (isDir ? onToggle(node.path) : onSelect(node.path))}
            title={node.path}
          >
            {isDir ? (
              <ChevronRight className="cb-tree__chevron" data-open={expanded} aria-hidden="true" />
            ) : (
              <FileText className="cb-tree__icon" aria-hidden="true" />
            )}
            <span className="cb-tree__name">{node.name}</span>
          </button>
          {expanded && <TreeLevel {...{ open, selected, read, onToggle, onSelect }} nodes={node.children!} depth={depth + 1} />}
        </li>
      );
    })}
  </ul>
);

// ---- File viewer -----------------------------------------------------------------

/** Past this, highlighting costs more than it gives; the file shows plain. */
const HIGHLIGHT_LIMIT = 150_000;

/** `shown` changes when a phone reveals the pane, so the cited lines get scrolled to then. */
const FileViewer = ({ codebase, target, shown }: { codebase: CodebaseData; target: Target | null; shown: boolean }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const path = target?.path ?? null;
  const { data, error, isPending } = useQuery({
    queryKey: ["github-file", codebase.fullName, codebase.commit, path],
    queryFn: async () => {
      const response = await fetch(rawUrl(codebase, path!));
      if (!response.ok) throw new Error(`GitHub responded ${response.status}`);
      const text = await response.text();
      if (text.slice(0, 4096).includes("\u0000")) throw new Error("This is a binary file.");
      return text;
    },
    enabled: Boolean(path),
    staleTime: Infinity,
    retry: 1,
  });

  // Bring the cited lines into view once the file has rendered.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !data) return;
    const line = target?.start ? el.querySelector<HTMLElement>(`[data-line="${target.start}"]`) : null;
    if (line) el.scrollTo({ top: Math.max(0, line.offsetTop - el.clientHeight / 4), behavior: "smooth" });
    else el.scrollTo({ top: 0 });
  }, [data, target?.start, target?.path, shown]);

  if (!path) {
    return (
      <div className="cb-viewer cb-viewer--empty">
        <p>Pick a file from the tree, or ask a question and follow along as Claude opens files.</p>
      </div>
    );
  }

  const inRange = (n: number) => Boolean(target?.start && n >= target.start && n <= (target.end ?? target.start));
  const lines = data?.split("\n") ?? [];

  return (
    <div className="cb-viewer">
      <div className="cb-viewer__bar">
        <span className="cb-viewer__path">{describeTarget(target!)}</span>
        {data !== undefined && <span className="cb-viewer__meta">{lines.length} lines</span>}
        <a
          href={`${codebase.url}/blob/${codebase.commit}/${path}${target?.start ? `#L${target.start}${target.end && target.end !== target.start ? `-L${target.end}` : ""}` : ""}`}
          target="_blank"
          rel="noopener noreferrer"
          className="cb-viewer__out"
        >
          GitHub
        </a>
      </div>
      <div ref={scrollRef} className="cb-viewer__body">
        {isPending && <p className="cb-viewer__status">Loading {path}…</p>}
        {error && <p className="cb-viewer__status">Couldn't open {path}: {error.message}</p>}
        {data !== undefined &&
          (data.length > HIGHLIGHT_LIMIT ? (
            <pre className="cb-viewer__plain">
              {lines.map((line, i) => (
                <div key={i} data-line={i + 1} data-hit={inRange(i + 1)} className="cb-line">
                  <span className="cb-line__no">{i + 1}</span>
                  {line || " "}
                </div>
              ))}
            </pre>
          ) : (
            <SyntaxHighlighter
              language={languageForPath(path)}
              style={tokenTheme}
              PreTag="div"
              showLineNumbers
              wrapLines
              lineNumberStyle={{ minWidth: "3em", paddingRight: "1em", color: "var(--ink-3)", textAlign: "right", userSelect: "none" }}
              lineProps={(n: number) => ({ "data-line": n, "data-hit": inRange(n), className: "cb-line" })}
              codeTagProps={{ style: { fontFamily: "inherit", background: "transparent" } }}
              customStyle={{ margin: 0, padding: "0.75rem 0", background: "transparent", fontSize: "0.78rem", lineHeight: 1.6 }}
            >
              {data}
            </SyntaxHighlighter>
          ))}
      </div>
    </div>
  );
};

// ---- Chat ------------------------------------------------------------------------

type Exchange = {
  question: string;
  answer: string;
  reads: Target[];
  status: "streaming" | "done" | "error";
  error?: string;
};

const STARTERS = [
  "What does this project do, and where does it start?",
  "Walk me through the architecture.",
  "What's the most interesting piece of code here?",
  "How is it tested and built?",
];

type ChatProps = {
  codebase: CodebaseData;
  known: Set<string>;
  onOpen: (target: Target, follow?: boolean) => void;
};

const Chat = ({ codebase, known, onOpen }: ChatProps) => {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const busy = exchanges.at(-1)?.status === "streaming";

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [exchanges]);

  const update = (fn: (exchange: Exchange) => Exchange) =>
    setExchanges((list) => [...list.slice(0, -1), fn(list[list.length - 1])]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const history: ChatTurn[] = [
      ...exchanges.flatMap((exchange): ChatTurn[] =>
        exchange.status === "done" && exchange.answer
          ? [
              { role: "user", content: exchange.question },
              { role: "assistant", content: exchange.answer },
            ]
          : [],
      ),
      { role: "user", content: text },
    ];
    setDraft("");
    setExchanges((list) => [...list, { question: text, answer: "", reads: [], status: "streaming" }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await askCodebase(
        codebase.name,
        history,
        (event) => {
          if (event.type === "text") update((ex) => ({ ...ex, answer: ex.answer + event.text }));
          else if (event.type === "read") {
            const target = { path: event.path, start: event.startLine, end: event.endLine };
            update((ex) => ({ ...ex, reads: [...ex.reads, target] }));
            // The viewer follows along as Claude opens files.
            onOpen({ path: event.path }, true);
          } else if (event.type === "error") update((ex) => ({ ...ex, status: "error", error: event.message }));
          else if (event.type === "done") update((ex) => ({ ...ex, status: ex.status === "error" ? "error" : "done" }));
        },
        controller.signal,
      );
      update((ex) => (ex.status === "streaming" ? { ...ex, status: "done" } : ex));
    } catch (error) {
      if (controller.signal.aborted) {
        update((ex) => ({ ...ex, status: ex.answer ? "done" : "error", error: ex.answer ? undefined : "Stopped." }));
        return;
      }
      update((ex) => ({ ...ex, status: "error", error: error instanceof Error ? error.message : "Something went wrong." }));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(draft);
    }
  };

  // Inline code that names a file becomes a link into the viewer.
  const markdown = useMemo(
    () => ({
      code({ className, children }: { className?: string; children?: ReactNode }) {
        const text = String(children ?? "");
        const target = !className ? parseCitation(text, known) : null;
        if (target) {
          return (
            <button type="button" className="cb-cite" onClick={() => onOpen(target)}>
              {describeTarget(target)}
            </button>
          );
        }
        return <code className={className}>{children}</code>;
      },
      a({ href, children }: { href?: string; children?: ReactNode }) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    }),
    [known, onOpen],
  );

  if (!codebase.chat) {
    return (
      <div className="cb-chat">
        <p className="cb-chat__status">The chat isn't switched on for this site right now. The files are all browsable.</p>
      </div>
    );
  }

  return (
    <div className="cb-chat">
      <div ref={logRef} className="cb-chat__log" aria-live="polite">
        {exchanges.length === 0 && (
          <div className="cb-chat__intro">
            <p>
              Ask anything about <strong>{codebase.name}</strong>. Claude reads the source at{" "}
              <code>{codebase.commit.slice(0, 7)}</code> to answer, and the viewer follows the files it opens.
            </p>
            <ul className="cb-chat__starters">
              {STARTERS.map((starter) => (
                <li key={starter}>
                  <button type="button" onClick={() => void ask(starter)}>
                    {starter}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {exchanges.map((exchange, i) => (
          <div key={i} className="cb-exchange">
            <p className="cb-exchange__q">{exchange.question}</p>
            {exchange.reads.length > 0 && (
              <ul className="cb-exchange__reads" aria-label="Files read">
                {exchange.reads.map((target, j) => (
                  <li key={j}>
                    <button type="button" onClick={() => onOpen(target)}>
                      {describeTarget(target)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {exchange.answer ? (
              <div className="cb-exchange__a">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdown}>
                  {exchange.answer}
                </ReactMarkdown>
              </div>
            ) : (
              exchange.status === "streaming" && (
                <p className="cb-chat__status">
                  {exchange.reads.length ? "Reading" : "Thinking"}
                  <span className="cb-caret" aria-hidden="true" />
                </p>
              )
            )}
            {exchange.status === "error" && <p className="cb-chat__error">{exchange.error}</p>}
          </div>
        ))}
      </div>
      <form className="cb-chat__form" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Ask about ${codebase.name}…`}
          rows={2}
          maxLength={2000}
          aria-label="Question"
        />
        {busy ? (
          <button type="button" className="cb-chat__send" onClick={() => abortRef.current?.abort()} aria-label="Stop">
            <Square className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className="cb-chat__send" disabled={!draft.trim()} aria-label="Send">
            <ArrowUp className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </form>
    </div>
  );
};

// ---- Page ------------------------------------------------------------------------

type Pane = "chat" | "files" | "code";

const Codebase = () => {
  const { name = "" } = useParams();
  const { data: codebase, error, isPending } = useCodebase(name);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pane, setPane] = useState<Pane>("chat");
  const known = useMemo(() => new Set(codebase?.entries.map((entry) => entry.path)), [codebase]);
  const tree = useMemo(() => (codebase ? buildTree(codebase.entries) : []), [codebase]);
  const [read, setRead] = useState<Set<string>>(new Set());

  // The open file lives in the URL (?file=src/app.ts&L=12-30), so a view can be shared.
  const target = useMemo((): Target | null => {
    const path = params.get("file");
    // With no file asked for, the README is the place to start.
    if (!path || !known.has(path)) {
      const readme = codebase?.entries.find((entry) => /^readme(\.(md|mdx|rst|txt))?$/i.test(entry.path));
      return readme ? { path: readme.path } : null;
    }
    const [start, end] = (params.get("L") ?? "").split("-").map(Number);
    return { path, start: start || undefined, end: end || start || undefined };
  }, [params, known, codebase]);

  const openTarget = useCallback(
    (next: Target, follow = false) => {
      setOpen((prev) => new Set([...prev, ...ancestors(next.path)]));
      if (follow) setRead((prev) => new Set(prev).add(next.path));
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          out.set("file", next.path);
          if (next.start) out.set("L", next.end && next.end !== next.start ? `${next.start}-${next.end}` : String(next.start));
          else out.delete("L");
          return out;
        },
        { replace: true },
      );
      // On a phone, a click on a citation jumps to the code; Claude's own reads do not.
      if (!follow) setPane("code");
    },
    [setParams],
  );

  // A shared link opens its file's folders.
  useEffect(() => {
    if (target) setOpen((prev) => (ancestors(target.path).every((dir) => prev.has(dir)) ? prev : new Set([...prev, ...ancestors(target.path)])));
  }, [target]);

  useEffect(() => {
    document.title = `${name} · Software`;
  }, [name]);

  const toggle = useCallback((path: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (isPending) {
    return (
      <div className="cb-page animate-fade-in">
        <div className="cb-skeleton" aria-busy="true" aria-label={`Loading ${name}`} />
      </div>
    );
  }

  if (error || !codebase) {
    return (
      <div className="page-shell page-shell--wide animate-fade-in">
        <Link to="/projects" className="cb-back">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Software
        </Link>
        <div className="border border-dashed border-foreground/30 px-6 py-8 text-sm uppercase tracking-[0.2em] text-muted-foreground">
          {error?.message ?? `No repository named ${name}`}.
        </div>
      </div>
    );
  }

  const totalBytes = codebase.entries.reduce((sum, entry) => sum + entry.size, 0);

  return (
    <div className="cb-page animate-fade-in">
      <header className="cb-head">
        <Link to="/projects" className="cb-back">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Software
        </Link>
        <h1 className="cb-head__title">{codebase.name}</h1>
        {codebase.description && <p className="cb-head__description">{codebase.description}</p>}
        <p className="cb-head__meta">
          <span>
            {codebase.entries.length}
            {codebase.truncated && "+"} files · {formatBytes(totalBytes)}
          </span>
          <span>
            {codebase.branch} @ {codebase.commit.slice(0, 7)}
          </span>
          <span>pushed {timeAgo(codebase.pushedAt)}</span>
          <a href={codebase.url} target="_blank" rel="noopener noreferrer">
            <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
            Source
          </a>
        </p>
      </header>

      <div className="cb-panes" role="tablist" aria-label="Views">
        {(["chat", "files", "code"] as Pane[]).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={pane === name} onClick={() => setPane(name)}>
            {name}
          </button>
        ))}
      </div>

      <div className="cb-workspace" data-pane={pane}>
        <nav className="cb-tree" aria-label="Files">
          <TreeLevel
            nodes={tree}
            depth={0}
            open={open}
            selected={target?.path ?? null}
            read={read}
            onToggle={toggle}
            onSelect={(path) => openTarget({ path })}
          />
        </nav>
        <FileViewer codebase={codebase} target={target} shown={pane === "code"} />
        <Chat codebase={codebase} known={known} onOpen={openTarget} />
      </div>
    </div>
  );
};

export default Codebase;
