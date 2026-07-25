"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface AccessibilityPreferences {
  theme: "light" | "dark" | "system";
  reducedMotion: boolean;
  highContrast: boolean;
  lowStimulus: boolean;
  textScale: "md" | "lg" | "xl";
}

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  theme: "system",
  reducedMotion: false,
  highContrast: false,
  lowStimulus: false,
  textScale: "md",
};

const STORAGE_KEY = "crisis:accessibility-preferences";

interface AccessibilityContextValue {
  preferences: AccessibilityPreferences;
  setPreferences: (next: Partial<AccessibilityPreferences>) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

function applyToDocument(prefs: AccessibilityPreferences) {
  const root = document.documentElement;
  if (prefs.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", prefs.theme);

  root.setAttribute("data-reduced-motion", String(prefs.reducedMotion));
  root.setAttribute("data-high-contrast", String(prefs.highContrast));
  root.setAttribute("data-low-stimulus", String(prefs.lowStimulus));
  root.setAttribute("data-text-scale", prefs.textScale);
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<AccessibilityPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<AccessibilityPreferences>;
        const merged = { ...DEFAULT_PREFERENCES, ...parsed };
        setPreferencesState(merged);
        applyToDocument(merged);
        return;
      } catch {
        // fall through to defaults
      }
    }
    applyToDocument(DEFAULT_PREFERENCES);
  }, []);

  const setPreferences = (next: Partial<AccessibilityPreferences>) => {
    setPreferencesState((prev) => {
      const merged = { ...prev, ...next };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      applyToDocument(merged);
      return merged;
    });
  };

  const value = useMemo(() => ({ preferences, setPreferences }), [preferences]);

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("useAccessibility debe usarse dentro de AccessibilityProvider.");
  return ctx;
}
