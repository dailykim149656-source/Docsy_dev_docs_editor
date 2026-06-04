import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Landing from "@/pages/Landing";
import { I18nContext } from "@/i18n/I18nProvider";
import { translateMessage } from "@/i18n/core";

vi.mock("framer-motion", async () => {
  const React = await import("react");

  const createMotionComponent = (tag: string) =>
    React.forwardRef<HTMLElement, Record<string, unknown> & { children?: ReactNode }>((props, ref) => {
      const {
        animate,
        custom,
        initial,
        transition,
        variants,
        viewport,
        whileHover,
        whileInView,
        children,
        ...domProps
      } = props;

      void animate;
      void custom;
      void initial;
      void transition;
      void variants;
      void viewport;
      void whileHover;
      void whileInView;

      return React.createElement(tag, { ...domProps, ref }, children);
    });

  const motion = new Proxy({}, {
    get: (_target, property) => createMotionComponent(String(property)),
  });

  return {
    motion,
    useScroll: () => ({ scrollYProgress: 0 }),
    useTransform: () => 1,
  };
});

const renderWithI18n = (locale: "en" | "ko" = "en") =>
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <I18nContext.Provider
        value={{
          locale,
          setLocale: vi.fn(),
          t: (key, variables) => translateMessage(locale, key, variables),
        }}
      >
        <Landing />
      </I18nContext.Provider>
    </MemoryRouter>,
  );

describe("Landing page", () => {
  it("renders grouped format support and the profile callout", () => {
    renderWithI18n("en");

    expect(screen.getByText("Docsy can drive the visible workflow, not just describe it")).toBeInTheDocument();
    expect(screen.getByText("Capture the live viewport")).toBeInTheDocument();
    expect(screen.getByText("Gemini chooses one UI action")).toBeInTheDocument();
    expect(screen.getByText("Docsy executes and hands off to review")).toBeInTheDocument();
    expect(screen.getByText(/Docsy looks at the real visible UI/i)).toBeInTheDocument();
    expect(screen.getByText(/Open the guide to learn where the Visual Navigator lives/i)).toBeInTheDocument();
    expect(screen.getByText("Edit now")).toBeInTheDocument();
    expect(screen.getByText("Import / export")).toBeInTheDocument();
    expect(screen.getByText(".docsy")).toBeInTheDocument();
    expect(screen.getAllByText("PDF").length).toBeGreaterThan(0);
    expect(screen.getByText("Begin in Beginner, unlock Advanced when the workflow expands")).toBeInTheDocument();
    expect(screen.getByText("Unlocked in Advanced")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getAllByText("Patch Review").length).toBeGreaterThan(0);
    expect(screen.getByText("JSON / YAML")).toBeInTheDocument();
  });
});
