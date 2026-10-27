import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";
import path from "path";
import { buildShowcase, parseRepoList, type Showcase } from "./api/github/repos";
import { createScripter, createSessionStore, handleTerminal } from "./api/github/terminal";
import { createLimiter, createSpeaker, handleCompanion } from "./api/companion";

/**
 * Serves /api/github/repos and /api/github/terminal under `vite dev` with the
 * same code the Vercel functions run. The index is cached for ten minutes so
 * reloads stay inside GitHub's unauthenticated rate limit; terminal sessions
 * need ANTHROPIC_API_KEY, as in production, and live in memory.
 */
function devGithubApi(): Plugin {
  let cached: { at: number; body: Showcase } | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const sessions = apiKey ? createSessionStore({ script: createScripter({ apiKey }) }) : null;
  const filter = {
    include: parseRepoList(process.env.SHOWCASE_INCLUDE),
    exclude: parseRepoList(process.env.SHOWCASE_EXCLUDE),
  };
  return {
    name: "dev-github-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/github/repos", async (_req, res) => {
        res.setHeader("content-type", "application/json");
        try {
          if (!cached || Date.now() - cached.at > 600_000) {
            const body = await buildShowcase({
              user: process.env.GITHUB_USER || "kygura",
              token: process.env.GITHUB_TOKEN,
              terminal: sessions !== null,
              filter,
            });
            cached = { at: Date.now(), body };
          }
          res.end(JSON.stringify(cached.body));
        } catch (error) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      server.middlewares.use("/api/github/terminal", async (req, res) => {
        const response = await handleTerminal(new Request(`http://localhost${req.originalUrl ?? req.url}`), sessions, {
          user: process.env.GITHUB_USER || "kygura",
          token: process.env.GITHUB_TOKEN || null,
          filter,
        });
        res.statusCode = response.status;
        res.setHeader("content-type", "application/json");
        res.end(await response.text());
      });
    },
  };
}

/** Serves /api/companion under `vite dev`; without ANTHROPIC_API_KEY it answers 503 and Wick uses his own lines. */
function devCompanionApi(): Plugin {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const speaker = apiKey ? createSpeaker({ apiKey }) : null;
  const limiter = createLimiter({ limit: 12, windowMs: 60_000 });
  return {
    name: "dev-companion-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/companion", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const response = await handleCompanion(
          new Request("http://localhost/api/companion", { method: "POST", body: Buffer.concat(chunks) }),
          speaker,
          limiter,
        );
        res.statusCode = response.status;
        res.setHeader("content-type", "application/json");
        res.end(await response.text());
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 4000,
  },
  plugins: [react(), devGithubApi(), devCompanionApi(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // No "radix" bucket: grouping every primitive into one chunk meant
        // a page that used a tooltip also downloaded accordion, dialog,
        // select and the rest. Rollup splits them per-route on its own.
        manualChunks: {
          "framer-motion": ["framer-motion"],
          "react-query": ["@tanstack/react-query"],
        },
      },
    },
    cssCodeSplit: true,
  },
}));
