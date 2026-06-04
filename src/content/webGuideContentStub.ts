import type { Locale } from "@/i18n/types";

const emptyLanding = {
  ctaDescription: "",
  ctaTitle: "",
  featureCards: [],
  featureDescription: "",
  featureEyebrow: "",
  featureTitle: "",
  quickStartDescription: "",
  quickStartEyebrow: "",
  quickStartSteps: [],
  quickStartTitle: "",
  workflowCards: [],
  workflowDescription: "",
  workflowEyebrow: "",
  workflowTitle: "",
};

export const getGuideContent = (_locale: Locale) => ({
  faqs: [],
  landing: emptyLanding,
  sections: [],
});
