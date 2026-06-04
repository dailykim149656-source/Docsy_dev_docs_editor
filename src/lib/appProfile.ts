export type AppProfile = "desktop" | "web";

export interface FeatureFlags {
  advancedBlocksOnInitialMount: boolean;
  aiOnInitialMount: boolean;
  llmFeaturesEnabled: boolean;
  documentToolsOnInitialMount: boolean;
  defaultUserProfile: "advanced" | "beginner";
  historyOnInitialMount: boolean;
  knowledgeOnInitialMount: boolean;
  profile: AppProfile;
  remoteShareEnabled: boolean;
  remoteTexServiceEnabled: boolean;
  remoteWorkspaceEnabled: boolean;
  structuredModesVisibleOnInitialMount: boolean;
  structuredIoOnInitialMount: boolean;
}

const resolveProfile = (): AppProfile => {
  const configured = import.meta.env.VITE_APP_PROFILE?.trim().toLowerCase();
  return configured === "web" ? "web" : "desktop";
};

export const appProfile = resolveProfile();

export const featureFlags: FeatureFlags = {
  advancedBlocksOnInitialMount: appProfile === "desktop",
  aiOnInitialMount: false,
  defaultUserProfile: appProfile === "desktop" ? "advanced" : "beginner",
  documentToolsOnInitialMount: appProfile === "desktop",
  historyOnInitialMount: appProfile === "desktop",
  knowledgeOnInitialMount: appProfile === "desktop",
  llmFeaturesEnabled: false,
  profile: appProfile,
  remoteShareEnabled: false,
  remoteTexServiceEnabled: false,
  remoteWorkspaceEnabled: false,
  structuredModesVisibleOnInitialMount: appProfile !== "web",
  structuredIoOnInitialMount: appProfile !== "web",
};

export const isWebProfile = appProfile === "web";
