
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, Minus, Terminal as TerminalIcon } from "lucide-react";

type HistoryItem = {
  type: "command" | "output";
  content: React.ReactNode;
};

type TerminalTheme = "survey" | "tokyo-night" | "catppuccin" | "minimal";

interface ThemeColors {
  bg: string;
  bgOverlay: string;
  header: string;
  border: string;
  text: string;
  textMuted: string;
  prompt: string;
  path: string;
  command: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  accent: string;
  scrollbarThumb: string;
  scrollbarTrack: string;
  hasTexture?: boolean;
  hasReflection?: boolean;
}

const themes: Record<TerminalTheme, ThemeColors> = {
  // Default: the site's survey-sheet tokens (follows the accent switch).
  survey: {
    bg: "bg-[var(--code)]",
    bgOverlay: "bg-[var(--scrim)]",
    header: "bg-[var(--bg-2)]",
    border: "border-[var(--rule-2)]",
    text: "text-[var(--ink)]",
    textMuted: "text-[var(--ink-3)]",
    prompt: "text-[var(--accent)]",
    path: "text-[var(--ink-2)]",
    command: "text-[var(--ink)]",
    success: "text-[var(--accent)]",
    error: "text-[var(--danger)]",
    warning: "text-[var(--accent)]",
    info: "text-[var(--ink-2)]",
    accent: "text-[var(--accent)]",
    scrollbarThumb: "bg-[var(--rule-2)]",
    scrollbarTrack: "bg-transparent",
  },
  "tokyo-night": {
    bg: "bg-[#1a1b26]/95",
    bgOverlay: "bg-black/40",
    header: "bg-[#16161e]",
    border: "border-[#545cd8]",
    text: "text-[#d5def5]",
    textMuted: "text-[#656f99]",
    prompt: "text-[#73daca]",
    path: "text-[#2ac3de]",
    command: "text-[#e0e8ff]",
    success: "text-[#3dd68c]",
    error: "text-[#ff5370]",
    warning: "text-[#ffcb6b]",
    info: "text-[#82aaff]",
    accent: "text-[#c792ea]",
    scrollbarThumb: "bg-[#414868]",
    scrollbarTrack: "bg-transparent",
  },
  catppuccin: {
    bg: "bg-[#1e1e2e]/95",
    bgOverlay: "bg-black/30",
    header: "bg-[#181825]",
    border: "border-[#5865f2]",
    text: "text-[#e5eeff]",
    textMuted: "text-[#7c8096]",
    prompt: "text-[#31f7b6]",
    path: "text-[#00d9ff]",
    command: "text-[#e5eeff]",
    success: "text-[#40eb9c]",
    error: "text-[#ff5c8d]",
    warning: "text-[#ffe066]",
    info: "text-[#5b9dff]",
    accent: "text-[#dc8eff]",
    scrollbarThumb: "bg-[#45475a]",
    scrollbarTrack: "bg-transparent",
  },
  minimal: {
    bg: "bg-white/[0.02] backdrop-blur-2xl saturate-150 border-white/10 shadow-2xl",
    bgOverlay: "bg-black/40 backdrop-blur-[2px]",
    header: "bg-transparent border-white/5",
    border: "border-white/10",
    text: "text-foreground drop-shadow-md",
    textMuted: "text-muted-foreground/80",
    prompt: "text-primary drop-shadow-[0_0_15px_hsl(var(--primary)/0.6)]",
    path: "text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]",
    command: "text-foreground font-medium",
    success: "text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]",
    error: "text-rose-400 drop-shadow-[0_0_15px_rgba(251,113,133,0.5)]",
    warning: "text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]",
    info: "text-sky-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]",
    accent: "text-primary drop-shadow-[0_0_15px_hsl(var(--primary)/0.7)]",
    scrollbarThumb: "bg-white/10 hover:bg-white/20 transition-colors",
    scrollbarTrack: "bg-transparent",
    hasTexture: true,
    hasReflection: true,
  },
};

// Convert Tailwind bg- class to CSS color value for scrollbar
const getScrollbarColor = (bgClass: string): string => {
  // Extract color from Tailwind class (e.g., "bg-[#414868]" -> "#414868")
  const hexMatch = bgClass.match(/bg-\[(.+?)\]/);
  if (hexMatch) return hexMatch[1];

  // For Tailwind utility classes like bg-primary/30, return a fallback
  if (bgClass.includes("primary")) return "hsl(var(--primary) / 0.3)";
  return "rgba(128, 128, 128, 0.3)";
};

interface TerminalProps {
  /** Mount already open — the host lazily loads this chunk on first invocation. */
  defaultOpen?: boolean;
}

export const Terminal = ({ defaultOpen = false }: TerminalProps = {}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState<TerminalTheme>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("terminal-theme");
    } catch {
      /* storage blocked */
    }
    return saved && saved in themes ? (saved as TerminalTheme) : "survey";
  });
  const [history, setHistory] = useState<HistoryItem[]>([
    {
      type: "output",
      content: (
        <span>
          Welcome to the <span className={themes[theme].accent}>N.CA</span> terminal{" "}
          <span className={themes[theme].warning}>v1.0.0</span>
        </span>
      ),
    },
    {
      type: "output",
      content: (
        <span>
          Type <span className={themes[theme].info}>help</span> for available
          commands.
        </span>
      ),
    },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Toggle visibility with Ctrl+K or Backtick
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === "k") || e.key === "`") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Scroll to bottom on history update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // Simple Levenshtein distance for fuzzy matching
  const getLevenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  };

  const findClosestTheme = (input: string): TerminalTheme | null => {
    const themeNames = Object.keys(themes) as TerminalTheme[];
    let minDistance = Infinity;
    let closestTheme: TerminalTheme | null = null;

    for (const themeName of themeNames) {
      const distance = getLevenshteinDistance(input.toLowerCase(), themeName);
      if (distance < minDistance) {
        minDistance = distance;
        closestTheme = themeName;
      }
    }

    // Only suggest if the distance is reasonable (<=3 for typos)
    return minDistance <= 3 ? closestTheme : null;
  };

  const handleCommand = (cmd: string) => {
    const parts = cmd.trim().split(" ");
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const newHistory: HistoryItem[] = [
      ...history,
      { type: "command", content: cmd },
    ];

    switch (command) {
      case "help":
        newHistory.push({
          type: "output",
          content: (
            <div className="flex flex-col gap-1">
              <div className={`${themes[theme].info} mb-2`}>Available commands:</div>
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <span className={themes[theme].info}>help</span>
                <span className={themes[theme].textMuted}>Show this help message</span>

                <span className={themes[theme].info}>ls</span>
                <span className={themes[theme].textMuted}>List available pages</span>

                <span className={themes[theme].info}>cd</span>
                <span className={themes[theme].textMuted}>Navigate to a page (usage: cd [page])</span>

                <span className={themes[theme].info}>theme</span>
                <span className={themes[theme].textMuted}>Change terminal theme (usage: theme [name])</span>

                <span className={themes[theme].info}>whoami</span>
                <span className={themes[theme].textMuted}>Display current user</span>

                <span className={themes[theme].info}>date</span>
                <span className={themes[theme].textMuted}>Show current date/time</span>

                <span className={themes[theme].info}>clear</span>
                <span className={themes[theme].textMuted}>Clear terminal history</span>

                <span className={themes[theme].info}>exit</span>
                <span className={themes[theme].textMuted}>Close terminal</span>
              </div>
            </div>
          ),
        });
        break;
      case "ls":
        newHistory.push({
          type: "output",
          content: (
            <div className="flex gap-4">
              <span className={themes[theme].success}>index</span>
              <span className={themes[theme].success}>writings</span>
              <span className={themes[theme].success}>projects</span>
              <span className={themes[theme].success}>artifacts</span>
              <span className={themes[theme].success}>scenes</span>
            </div>
          ),
        });
        break;
      case "cd":
      case "goto":
        if (args.length === 0) {
          newHistory.push({
            type: "output",
            content: (
              <span>
                Usage: <span className={themes[theme].warning}>cd [page]</span>
              </span>
            ),
          });
        } else {
          const target = args[0].toLowerCase();
          const routes: Record<string, string> = {
            index: "/",
            home: "/",
            writings: "/writings",
            projects: "/projects",
            artifacts: "/artifacts",
            gallery: "/artifacts",
            scenes: "/scenes",
          };

          if (routes[target]) {
            newHistory.push({
              type: "output",
              content: (
                <span>
                  Navigating to <span className={themes[theme].success}>{target}</span>
                  ...
                </span>
              ),
            });
            navigate(routes[target]);
            setIsOpen(false); // Optional: close on navigation
          } else {
            newHistory.push({
              type: "output",
              content: (
                <span className={themes[theme].error}>
                  Directory not found: {target}
                </span>
              ),
            });
          }
        }
        break;
      case "whoami":
        newHistory.push({
          type: "output",
          content: (
            <span className={`${themes[theme].accent} font-bold`}>Only you can ever truly know yourself.</span>
          ),
        });
        break;
      case "date":
        newHistory.push({
          type: "output",
          content: <span className={themes[theme].warning}>{new Date().toLocaleString()}</span>,
        });
        break;
      case "theme":
        if (args.length === 0 || args[0] === "list") {
          newHistory.push({
            type: "output",
            content: (
              <div className="flex flex-col gap-2">
                <div>Available themes:</div>
                <div className="flex gap-4 ml-2">
                  <span className={themes[theme].success}>survey</span>
                  <span className={themes[theme].success}>tokyo-night</span>
                  <span className={themes[theme].success}>catppuccin</span>
                  <span className={themes[theme].success}>minimal</span>
                </div>
                <div className={themes[theme].textMuted}>Current: {theme}</div>
              </div>
            ),
          });
        } else {
          const newTheme = args[0].toLowerCase() as TerminalTheme;
          if (themes[newTheme]) {
            setTheme(newTheme);
            try {
              localStorage.setItem("terminal-theme", newTheme);
            } catch {
              /* storage blocked */
            }
            newHistory.push({
              type: "output",
              content: (
                <span>
                  Theme changed to <span className={themes[newTheme].success}>{newTheme}</span>
                </span>
              ),
            });
          } else {
            const suggestion = findClosestTheme(args[0]);
            newHistory.push({
              type: "output",
              content: suggestion ? (
                <span className={themes[theme].error}>
                  Unknown theme: {args[0]}. Did you mean "<span className={themes[theme].success}>{suggestion}</span>"?
                </span>
              ) : (
                <span className={themes[theme].error}>
                  Unknown theme: {args[0]}. Use "theme list" to see available themes.
                </span>
              ),
            });
          }
        }
        break;
      case "clear":
        setHistory([]);
        return; // Return early to avoid setting history with 'clear' command
      case "exit":
        setIsOpen(false);
        break;
      case "":
        break;
      default:
        newHistory.push({
          type: "output",
          content: (
            <span>
              Command not found: <span className={themes[theme].error}>{command}</span>
            </span>
          ),
        });
    }

    setHistory(newHistory);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCommand(input);
      setInput("");
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Dynamic Scrollbar Styles */}
      <style>
        {`
          .terminal-scrollbar::-webkit-scrollbar {
            width: 8px;
          }
          .terminal-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .terminal-scrollbar::-webkit-scrollbar-thumb {
            background: ${getScrollbarColor(themes[theme].scrollbarThumb)};
            border-radius: 4px;
          }
          .terminal-scrollbar::-webkit-scrollbar-thumb:hover {
            background: ${getScrollbarColor(themes[theme].scrollbarThumb).replace(/0\.\d+\)/, "0.5)")};
          }
        `}
      </style>
      <div
        className={`fixed inset-0 ${themes[theme].bgOverlay} z-50 flex items-center justify-center backdrop-blur-sm`}
        onClick={() => setIsOpen(false)}
      >
        <div
          className={`relative w-full max-w-2xl h-96 ${themes[theme].bg} border ${themes[theme].border} flex flex-col font-mono text-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Texture Overlay - Almanac Sketch Effect */}
          {themes[theme].hasTexture && (
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.07] mix-blend-overlay rounded-lg z-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
              }}
            />
          )}
          {/* Glass Reflection & Lighting Effects */}
          {themes[theme].hasReflection && (
            <div className="absolute inset-0 pointer-events-none rounded-lg z-10 overflow-hidden">
              {/* Top Shine Gradient */}
              <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-white/[0.12] to-transparent" />

              {/* Diagonal Sheen */}
              <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-gradient-to-br from-transparent via-white/[0.03] to-transparent rotate-12" />

              {/* Inner Glow/Shadow */}
              <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(255,255,255,0.05)] rounded-lg" />

              {/* Top Edge Highlight */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.4] to-transparent" />
            </div>
          )}
          {/* Header */}
          <div className={`h-8 ${themes[theme].header} border-b ${themes[theme].border} flex items-center justify-between px-3 select-none`}>
            <div className={`flex items-center gap-2 ${themes[theme].info}`}>
              <TerminalIcon size={14} />
              <span className="text-xs">guest@nca:~</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className={`${themes[theme].textMuted} hover:${themes[theme].text} transition-colors`}
              >
                <Minus size={14} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className={`${themes[theme].textMuted} hover:${themes[theme].error} transition-colors`}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div
            className={`flex-1 p-4 overflow-y-auto ${themes[theme].text} terminal-scrollbar`}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: `${getScrollbarColor(themes[theme].scrollbarThumb)} transparent`,
            } as React.CSSProperties & { scrollbarColor?: string }}
            onClick={() => inputRef.current?.focus()}
          >
            {history.map((item, i) => (
              <div key={i} className="mb-1 whitespace-pre-wrap break-words">
                {item.type === "command" ? (
                  <div className={`flex gap-2 ${themes[theme].command}`}>
                    <span className={themes[theme].prompt}>➜</span>
                    <span className={themes[theme].path}>~</span>
                    <span className="font-bold">{item.content}</span>
                  </div>
                ) : (
                  <div className="ml-6">{item.content}</div>
                )}
              </div>
            ))}

            <div className={`flex gap-2 items-center ${themes[theme].command} mt-1`}>
              <span className={themes[theme].prompt}>➜</span>
              <span className={themes[theme].path}>~</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`flex-1 bg-transparent border-none outline-none ${themes[theme].command} placeholder-${themes[theme].textMuted}`}
                autoFocus
              />
            </div>
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </>
  );
};
