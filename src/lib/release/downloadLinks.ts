export type DesktopPlatformId = "linux" | "macos" | "windows";

export interface DesktopDownloadLink {
  id: DesktopPlatformId;
  label: string;
  url: string | null;
}

const GITHUB_RELEASES_BASE_URL = "https://github.com/dailykim149656-source/markdown-muse/releases";
const GITHUB_LATEST_DOWNLOAD_BASE_URL = `${GITHUB_RELEASES_BASE_URL}/latest/download`;

const normalizeUrl = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

export const desktopReleasesUrl = normalizeUrl(import.meta.env.VITE_DESKTOP_RELEASES_URL)
  ?? `${GITHUB_RELEASES_BASE_URL}/latest`;

export const desktopDownloadLinks: DesktopDownloadLink[] = [
  {
    id: "windows",
    label: "Windows",
    url: normalizeUrl(import.meta.env.VITE_DOWNLOAD_WINDOWS_URL)
      ?? `${GITHUB_LATEST_DOWNLOAD_BASE_URL}/Docsy-win-x64.exe`,
  },
  {
    id: "macos",
    label: "macOS",
    url: normalizeUrl(import.meta.env.VITE_DOWNLOAD_MACOS_URL)
      ?? `${GITHUB_LATEST_DOWNLOAD_BASE_URL}/Docsy-mac-x64.dmg`,
  },
  {
    id: "linux",
    label: "Linux",
    url: normalizeUrl(import.meta.env.VITE_DOWNLOAD_LINUX_URL)
      ?? `${GITHUB_LATEST_DOWNLOAD_BASE_URL}/Docsy-linux-x64.AppImage`,
  },
];

export const configuredDesktopDownloadLinks = desktopDownloadLinks.filter((link) => link.url);

export const getPrimaryDesktopDownloadUrl = () =>
  configuredDesktopDownloadLinks[0]?.url ?? desktopReleasesUrl;
