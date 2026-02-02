"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "@/lib/hooks/use-auth";

interface SidebarContextType {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const initializedRef = useRef(false);
  
  // Initialize state from localStorage immediately (lazy initialization)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("sidebarOpen");
    if (stored !== null) {
      return stored === "true";
    }
    // Default: open on desktop, closed on mobile
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      return true;
    }
    return false;
  });

  // Only initialize once when authenticated
  useEffect(() => {
    if (isLoading || typeof window === "undefined" || initializedRef.current) return;
    
    if (isAuthenticated) {
      const stored = localStorage.getItem("sidebarOpen");
      if (stored === null) {
        // Set default based on screen size
        const shouldBeOpen = window.innerWidth >= 1024;
        setIsSidebarOpen(shouldBeOpen);
        localStorage.setItem("sidebarOpen", shouldBeOpen.toString());
      } else {
        // Restore from localStorage
        setIsSidebarOpen(stored === "true");
      }
      initializedRef.current = true;
    }
  }, [isAuthenticated, isLoading]);

  // Handle window resize - only close on mobile, don't force open on desktop
  useEffect(() => {
    if (isLoading || typeof window === "undefined") return;

    const handleResize = () => {
      if (window.innerWidth < 1024) {
        // Always closed on mobile
        setIsSidebarOpen(false);
      }
      // On desktop, keep current state (don't force open)
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isLoading]);

  // Save sidebar state to localStorage when it changes
  useEffect(() => {
    if (!isLoading && typeof window !== "undefined") {
      localStorage.setItem("sidebarOpen", isSidebarOpen.toString());
    }
  }, [isSidebarOpen, isLoading]);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  return (
    <SidebarContext.Provider
      value={{
        isSidebarOpen,
        setIsSidebarOpen,
        toggleSidebar,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

