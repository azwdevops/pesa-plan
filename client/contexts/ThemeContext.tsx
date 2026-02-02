"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize theme from localStorage, defaulting to light
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme") as Theme | null;
      // Default to light mode if nothing is stored
      return stored === "dark" ? "dark" : "light";
    }
    return "light";
  });
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Sync with what was set by the blocking script
    if (typeof window !== "undefined" && !hasInitialized.current) {
      hasInitialized.current = true;
      const root = document.documentElement;
      const stored = localStorage.getItem("theme") as Theme | null;
      
      // Use stored preference, defaulting to light if not set
      let initialTheme: Theme = "light";
      if (stored === "dark") {
        initialTheme = "dark";
      } else if (stored === "light") {
        initialTheme = "light";
      }
      // If stored is null or invalid, default to light
      
      // Ensure correct class is applied
      root.classList.remove("dark");
      if (initialTheme === "dark") {
        root.classList.add("dark");
      }
      
      setThemeState(initialTheme);
      // Only save if we have a valid stored value, otherwise set to light
      if (!stored || (stored !== "light" && stored !== "dark")) {
        localStorage.setItem("theme", "light");
      }
    }
  }, []);

  useEffect(() => {
    // Update document class when theme changes
    if (hasInitialized.current) {
      const root = document.documentElement;
      if (theme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      // Persist to localStorage
      localStorage.setItem("theme", theme);
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => {
      const newTheme = prev === "light" ? "dark" : "light";
      // Immediately update the DOM to ensure it works
      const root = document.documentElement;
      if (newTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      localStorage.setItem("theme", newTheme);
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

