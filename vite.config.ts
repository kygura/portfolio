import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";
import path from "path";
import { buildShowcase, parseRepoList, type Showcase } from "./api/github/repos";

/**
 * Serves /api/github/repos under `vite dev` with the same code the Vercel
 * function runs. The index is cached for ten minutes so reloads stay inside
 * GitHub's unauthenticated rate limit.
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
