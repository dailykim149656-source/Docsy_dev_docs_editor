import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("docsyDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});
