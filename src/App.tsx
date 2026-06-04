import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n/I18nProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { isDesktopShell } from "@/lib/runtime/desktopShell";
import { isWebProfile } from "@/lib/appProfile";

const isWebBuildProfile = import.meta.env.VITE_APP_PROFILE?.trim().toLowerCase() === "web";
const Landing = lazy(() => import("@/pages/Landing"));
const Guide = isWebBuildProfile ? null : lazy(() => import("@/pages/Guide"));
const Index = isWebBuildProfile ? null : lazy(() => import("@/pages/Index"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const WorkspaceGraph = isWebBuildProfile ? null : lazy(() => import("@/pages/WorkspaceGraph"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient();
const Router = isDesktopShell() ? HashRouter : BrowserRouter;
const WebEditorRoute = () => <Navigate replace to="/" />;
const GuideRoute = () => (Guide ? <Guide /> : <WebEditorRoute />);
const EditorRoute = () => (Index ? <Index /> : <WebEditorRoute />);
const GraphRoute = () => (WorkspaceGraph ? <WorkspaceGraph /> : <WebEditorRoute />);

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
    Loading...
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Router>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/index.html" element={<Landing />} />
              <Route path="/guide" element={isWebProfile ? <WebEditorRoute /> : <GuideRoute />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/editor" element={isWebProfile ? <WebEditorRoute /> : <EditorRoute />} />
              <Route path="/s/:shareId" element={isWebProfile ? <WebEditorRoute /> : <EditorRoute />} />
              <Route path="/editor/graph" element={isWebProfile ? <WebEditorRoute /> : <GraphRoute />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Router>
      </TooltipProvider>
    </I18nProvider>
  </QueryClientProvider>
);

export default App;
