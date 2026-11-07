import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { formatBytes, type CodeMap, type ShowcaseRepo } from "@/lib/showcase";
import { squarify, type Rect } from "@/lib/treemap";

/** Group headers get this much of a plot when it is tall enough to spare it. */
const HEADER_PX = 16;
/** Below this a plot shows no label; its title still names it on hover. */
const LABEL_MIN = { w: 44, h: 16 };
/** Languages past the third share the plain sheet. */
const TONES = 3;

type Cell = Rect & {
  key: string;
  label: string;
  title: string;
  tone: number;
  group: boolean;
  delay: number;
};

const describe = (path: string, files: number, bytes: number) =>
  `${path} · ${files} ${files === 1 ? "file" : "files"} · ${formatBytes(bytes)}`;

/**
 * Lays the map out in pixels: top-level plots squarified over the whole area,
 * then each directory's children squarified inside it, under a header strip.
 */
function layout(map: CodeMap, size: { w: number; h: number }): Cell[] {
  const rank = new Map(map.languages.map((lang, i) => [lang.name, i]));
  const tone = (lang: string | null) => Math.min(lang === null ? TONES : (rank.get(lang) ?? TONES), TONES);
  const cells: Cell[] = [];
  const groups = squarify(
    map.nodes.map((node) => node.bytes),
    { x: 0, y: 0, ...size },
  );

  map.nodes.forEach((node, i) => {
    const rect = groups[i];
    const path = `${map.base}${node.name}`;
    const delay = i * 40;
    if (!node.children?.length) {
      cells.push({ ...rect, key: node.name, label: node.name, title: describe(path, node.files, node.bytes), tone: tone(node.lang), group: false, delay });
      return;
    }
    const header = rect.h > HEADER_PX * 2.5 ? HEADER_PX : 0;
    cells.push({ ...rect, key: node.name, label: node.name, title: describe(path, node.files, node.bytes), tone: tone(node.lang), group: true, delay });
    const inner = squarify(
      node.children.map((child) => child.bytes),
      { x: rect.x, y: rect.y + header, w: rect.w, h: rect.h - header },
    );
    node.children.forEach((child, j) => {
      cells.push({
        ...inner[j],
        key: `${node.name}${child.name}`,
        label: child.name,
        title: describe(`${path}${child.name}`, child.files, child.bytes),
        tone: tone(child.lang),
        group: false,
        delay: delay + 60 + j * 25,
      });
    });
  });
  return cells;
}

/** The source tree as a survey plat: one plot per directory or file, sized by bytes. */
const CodeMapView = ({ map }: { map: CodeMap }) => {
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cells = useMemo(() => (size.w && size.h ? layout(map, size) : []), [map, size]);
  const key = map.languages.slice(0, 4).map((lang, i) => ({
    ...lang,
    tone: Math.min(i, TONES),
    share: Math.max(1, Math.round((lang.bytes / map.bytes) * 100)),
  }));

  return (
    <div className="code-map">
      <div ref={plotRef} className="code-map__plot" role="img" aria-label={`Source map: ${map.files} files${map.base ? ` under ${map.base}` : ""}`}>
        {cells.map((cell) => {
          const labelled = cell.w >= LABEL_MIN.w && (cell.group ? cell.h > HEADER_PX * 2.5 : cell.h >= LABEL_MIN.h);
          return (
            <div
              key={cell.key}
              className={cell.group ? "code-map__group" : "code-map__cell"}
              data-tone={cell.tone}
              title={cell.title}
              style={{
                left: cell.x,
                top: cell.y,
                width: cell.w,
                height: cell.h,
                animationDelay: `${cell.delay}ms`,
              }}
            >
              {labelled && <span>{cell.label}</span>}
            </div>
          );
        })}
      </div>
      <div className="code-map__key">
        {key.map((lang) => (
          <span key={lang.name}>
            <i data-tone={lang.tone} aria-hidden="true" />
            {lang.name} {lang.share}%
          </span>
        ))}
        <span className="code-map__count">
          {map.base && `${map.base} · `}
          {map.files} files{map.truncated && "+"}
        </span>
      </div>
    </div>
  );
};

/** The window for a repo with no site to frame: its source as a map. */
const CodeWindow = ({ repo, map }: { repo: ShowcaseRepo; map: CodeMap }) => (
  <div className="repo-window repo-window--code">
    <div className="repo-window__bar">
      <span className="repo-window__address">{repo.name}</span>
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="repo-window__open"
        aria-label={`Open ${repo.name}'s source in a new tab`}
      >
        <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
      </a>
    </div>

    <div className="repo-window__viewport">
      <CodeMapView map={map} />
    </div>
  </div>
);

export default CodeWindow;
