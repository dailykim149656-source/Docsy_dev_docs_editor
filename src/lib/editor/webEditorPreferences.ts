import type { EditorUserProfile } from "@/lib/editor/userProfiles";

const USER_PROFILE_STORAGE_KEY = "docsy:web:user-profile";
const ADVANCED_BLOCKS_STORAGE_KEY = "docsy:web:advanced-blocks-enabled";
const DOCUMENT_TOOLS_STORAGE_KEY = "docsy:web:document-tools-enabled";

const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const readAdvancedBlocksPreference = () => {
  if (!canUseStorage()) {
    return false;
  }

  try {
    return window.localStorage.getItem(ADVANCED_BLOCKS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const readDocumentToolsPreference = () => {
  if (!canUseStorage()) {
    return false;
  }

  try {
    return window.localStorage.getItem(DOCUMENT_TOOLS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

export const readUserProfilePreference = (fallbackProfile: EditorUserProfile = "beginner"): EditorUserProfile => {
  if (!canUseStorage()) {
    return fallbackProfile;
  }

  try {
    const stored = window.localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (stored === "advanced" || stored === "beginner") {
      return stored;
    }

    return fallbackProfile;
  } catch {
    return fallbackProfile;
  }
};

export const writeAdvancedBlocksPreference = (enabled: boolean) => {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(ADVANCED_BLOCKS_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // noop
  }
};

export const writeUserProfilePreference = (profile: EditorUserProfile) => {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(USER_PROFILE_STORAGE_KEY, profile);
  } catch {
    // noop
  }
};

export const writeDocumentToolsPreference = (enabled: boolean) => {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(DOCUMENT_TOOLS_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // noop
  }
};

export {
  ADVANCED_BLOCKS_STORAGE_KEY,
  DOCUMENT_TOOLS_STORAGE_KEY,
  USER_PROFILE_STORAGE_KEY,
};
