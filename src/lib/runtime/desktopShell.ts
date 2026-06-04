export const isDesktopShell = () =>
  typeof window !== "undefined" && window.docsyDesktop?.isDesktop === true;
