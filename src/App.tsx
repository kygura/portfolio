import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Index from "./pages/Index";
import SmoothScroll from "./components/SmoothScroll";
import CustomCursor from "./components/CustomCursor";
import ScrollProgress from "./components/ScrollProgress";
import TerminalHost from "./components/TerminalHost";
import CommandHost from "./components/CommandHost";
import Keys from "./theme/Keys";
import LofiPlayer from "./components/player/LofiPlayer";
import Mascot from "./components/mascot/Mascot";

// Toast viewports render nothing until something fires a toast, and only
// two lazily-routed pages ever do — no reason to ship them up front.
const Toaster = lazy(() =>
  import("@/components/ui/toaster").then((m) => ({ default: m.Toaster }))
);
const Sonner = lazy(() =>
  import("@/components/ui/sonner").then((m) => ({ default: m.Toaster }))
);

const Writings = lazy(() => import("./pages/Writings"));
const Post = lazy(() => import("./pages/Post"));
const Projects = lazy(() => import("./pages/Projects"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Artifacts = lazy(() => import("./pages/Artifacts"));
const CV = lazy(() => import("./pages/CV"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Suspense fallback={null}>
      <Toaster />
      <Sonner />
    </Suspense>
    <BrowserRouter>
      <SmoothScroll>
        <CustomCursor />
        <ScrollProgress />
        <TerminalHost />
        <CommandHost />
        <Keys />
        <LofiPlayer />
        <Mascot />
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route
              path="/writings"
              element={
                <Layout>
                  <Writings />
                </Layout>
              }
            />
            <Route
              path="/writings/:slug"
              element={
                <Layout>
                  <Post />
                </Layout>
              }
            />
            <Route
              path="/artifacts"
              element={
                <Layout>
                  <Artifacts />
                </Layout>
              }
            />
            <Route
              path="/projects"
              element={
                <Layout>
                  <Projects />
                </Layout>
              }
            />
            {/* Old dossier links land on the index. */}
            <Route path="/projects/:slug" element={<Navigate to="/projects" replace />} />
            <Route
              path="/cv"
              element={
                <Layout>
                  <CV />
                </Layout>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </SmoothScroll>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
