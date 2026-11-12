import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";
import path from "path";
import { Readable } from "node:stream";
import { buildShowcase, parseRepoList, type Showcase } from "./api/github/repos";
import { handleCodebase } from "./api/github/codebase";
import { handleQuip } from "./api/familiar/quip";
import { handleTranslate } from "./api/writings/translate";

/**
 * Serves /api/github/repos, /api/github/codebase, /api/familiar/quip and
 * /api/writings/translate under `vite dev` with the
 * same code the Vercel functions run. The index is cached for ten minutes so
 * reloads stay inside GitHub's unauthenticated rate limit; the codebase chat
 * and Bit's quips need ANTHROPIC_API_KEY, as in production.
 */
function devGithubApi(): Plugin {
  let cached: { at: number; body: Showcase } | null = null;
  const filter = {
    include: parseRepoList(process.env.SHOWCASE_INCLUDE),
    exclude: parseRepoList(process.env.SHOWCASE_EXCLUDE),
  };
  return {
    name: "dev-github-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/familiar/quip", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const response = await handleQuip(
          new Request(`http://localhost${req.originalUrl ?? req.url}`, {
            method: req.method,
            headers: { "content-type": "application/json" },
            body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
          })
        );
        res.statusCode = response.status;
        res.setHeader("content-type", "application/json");
        res.end(await response.text());
      });
      server.middlewares.use("/api/writings/translate", async (req, res) => {
        const response = await handleTranslate(
          new Request(`http://localhost${req.originalUrl ?? req.url}`, {
            method: req.method,
            headers: { "x-forwarded-for": req.socket.remoteAddress ?? "local" },
          })
        );
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (response.body) Readable.fromWeb(response.body as never).pipe(res);
        else res.end();
      });
      server.middlewares.use("/api/github/repos", async (_req, res) => {
        res.setHeader("content-type", "application/json");
        try {
          if (!cached || Date.now() - cached.at > 600_000) {
            const body = await buildShowcase({
              user: process.env.GITHUB_USER || "kygura",
              token: process.env.GITHUB_TOKEN,
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
      server.middlewares.use("/api/github/codebase", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const request = new Request(`http://localhost${req.originalUrl ?? req.url}`, {
          method: req.method,
          headers: { "content-type": "application/json" },
          body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
        });
        const response = await handleCodebase(request, {
          user: process.env.GITHUB_USER || "kygura",
          token: process.env.GITHUB_TOKEN || null,
          filter,
        });
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (response.body) Readable.fromWeb(response.body as never).pipe(res);
        else res.end();
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
  plugins: [react(), devGithubApi(), mode === "development" && componentTagger()].filter(Boolean),
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
