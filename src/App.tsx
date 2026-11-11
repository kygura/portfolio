import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Index from "./pages/Index";
import SmoothScroll from "./components/SmoothScroll";
import CustomCursor from "./components/CustomCursor";
import ScrollProgress from "./components/ScrollProgress";
import TerminalHost from "./components/TerminalHost";
import CommandHost from "./components/CommandHost";
import Keys from "./theme/Keys";
import LofiPlayer from "./components/player/LofiPlayer";
import FamiliarHost from "./components/familiar/FamiliarHost";
import { isGate } from "./components/familiar/gate";

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
const Codebase = lazy(() => import("./pages/Codebase"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Artifacts = lazy(() => import("./pages/Artifacts"));
const Canvas = lazy(() => import("./pages/Canvas"));
const CV = lazy(() => import("./pages/CV"));
const Scenes = lazy(() => import("./pages/Scenes"));
const Boot = lazy(() => import("./pages/Boot"));

// Unknown paths land here. One of them, matched by hash so it never appears
// in the bundle, is the hidden page; the rest are a 404.
const Fallthrough = () => {
  const { pathname } = useLocation();
  return isGate(pathname) ? <Boot /> : <NotFound />;
};

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
        <FamiliarHost />
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
              path="/artifacts/commons"
              element={
                <Layout>
                  <Canvas />
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
            <Route
              path="/projects/:name"
              element={
                <Layout>
                  <Codebase />
                </Layout>
              }
            />
            <Route
              path="/scenes/:id?"
              element={
                <Layout>
                  <Scenes />
                </Layout>
              }
            />
            <Route
              path="/cv"
              element={
                <Layout>
                  <CV />
                </Layout>
              }
            />
            <Route
              path="*"
              element={
                <Layout>
                  <Fallthrough />
                </Layout>
              }
            />
          </Routes>
        </Suspense>
      </SmoothScroll>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
