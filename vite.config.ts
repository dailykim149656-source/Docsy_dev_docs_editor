import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { gzipSync } from "node:zlib";
import { componentTagger } from "lovable-tagger";

const matchesPackage = (id: string, packageNames: string[]) =>
  packageNames.some((packageName) => {
    const posixName = packageName.replaceAll("/", path.posix.sep);
    const windowsName = packageName.replaceAll("/", path.win32.sep);

    return (
      id.includes(`${path.posix.sep}node_modules${path.posix.sep}${posixName}${path.posix.sep}`) ||
      id.includes(`${path.win32.sep}node_modules${path.win32.sep}${windowsName}${path.win32.sep}`)
    );
  });

const matchesSource = (id: string, sourceFragments: string[]) =>
  sourceFragments.some((fragment) => {
    const posixFragment = fragment.replaceAll("/", path.posix.sep);
    const windowsFragment = fragment.replaceAll("/", path.win32.sep);

    return id.includes(posixFragment) || id.includes(windowsFragment);
  });

const shouldIgnoreChunkRelocationWarning = (message: string) =>
  message.includes("dynamic import will not move module into another chunk")
  && [
    "src/components/editor/GraphExplorerDialog.tsx",
    "src/lib/ast/documentIndex.ts",
    "src/lib/ai/compareDocuments.ts",
    "src/lib/ast/renderAstToHtml.ts",
    "src/lib/ast/tiptapAst.ts",
    "src/lib/ast/renderAstToLatex.ts",
    "src/lib/ast/renderAstToMarkdown.ts",
  ].some((fragment) => message.includes(fragment));

const bundleReportPlugin = () => ({
  generateBundle(_options: unknown, bundle: Record<string, { fileName: string; type: string; code?: string; source?: string | Uint8Array }>) {
    const assets = Object.values(bundle)
      .filter((entry) => entry.type === "asset" || entry.type === "chunk")
      .map((entry) => {
        const content = entry.type === "chunk"
          ? Buffer.from(entry.code || "")
          : typeof entry.source === "string"
            ? Buffer.from(entry.source)
            : entry.source
              ? Buffer.from(entry.source)
              : Buffer.alloc(0);
        const size = content.byteLength;
        const gzipSize = gzipSync(content).byteLength;

        return {
          fileName: entry.fileName,
          gzipSize,
          size,
          type: entry.type,
        };
      })
      .sort((left, right) => right.size - left.size);

    this.emitFile({
      fileName: "bundle-report.json",
      source: JSON.stringify({ assets }, null, 2),
      type: "asset",
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const webPageStub = path.resolve(__dirname, "./src/pages/WebRedirect.tsx");
  const webGuideContentStub = path.resolve(__dirname, "./src/content/webGuideContentStub.ts");

  return ({
  base: mode === "web" ? "/" : "./",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        changeOrigin: true,
        secure: false,
        target: "http://localhost:8787",
      },
    },
  },
  plugins: [react(), bundleReportPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      ...(mode === "web" ? {
        "@/content/guideContent": webGuideContentStub,
        "@/pages/Guide": webPageStub,
        "@/pages/Index": webPageStub,
        "@/pages/WorkspaceGraph": webPageStub,
      } : {}),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (shouldIgnoreChunkRelocationWarning(warning.message || "")) {
          return;
        }

        defaultHandler(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (matchesPackage(id, ["katex"])) {
            return "math-vendor";
          }

          if (matchesPackage(id, ["js-yaml"])) {
            return "structured-io";
          }

          if (matchesPackage(id, ["qrcode"])) {
            return "share";
          }

          if (matchesPackage(id, ["@tiptap"])) {
            return "tiptap-vendor";
          }

          if (matchesPackage(id, ["prosemirror"])) {
            return "prosemirror-vendor";
          }

          if (matchesPackage(id, ["lowlight", "highlight.js"])) {
            return "syntax-vendor";
          }

          if (matchesPackage(id, ["recharts"])) {
            return "graph-vendor";
          }

          if (matchesPackage(id, ["@radix-ui", "vaul", "cmdk", "lucide-react"])) {
            return "ui-vendor";
          }

          if (matchesPackage(id, ["framer-motion"])) {
            return "motion-vendor";
          }

          if (matchesPackage(id, ["react", "react-dom", "react-router", "react-router-dom", "@tanstack"])) {
            return "react-vendor";
          }
        },
      },
    },
  },
  });
});
