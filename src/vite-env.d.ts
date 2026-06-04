/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_API_BASE_URL?: string;
  readonly VITE_APP_BUILD_ID?: string;
  readonly VITE_APP_PROFILE?: "desktop" | "web";
  readonly VITE_DESKTOP_RELEASES_URL?: string;
  readonly VITE_DOWNLOAD_LINUX_URL?: string;
  readonly VITE_DOWNLOAD_MACOS_URL?: string;
  readonly VITE_DOWNLOAD_WINDOWS_URL?: string;
}

interface Window {
  docsyDesktop?: {
    isDesktop: true;
    platform: string;
    versions: {
      chrome?: string;
      electron?: string;
    };
  };
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
