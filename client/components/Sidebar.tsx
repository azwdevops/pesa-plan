"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isLoggedIn?: boolean;
}

export function Sidebar({ isOpen, onClose, isLoggedIn = false }: SidebarProps) {
  const pathname = usePathname();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(() => {
    // Auto-expand menus if we're on their pages
    const expanded: string[] = [];
    if (pathname === "/loans" || pathname === "/liabilities/short-term") {
      expanded.push("liabilities");
    }
    if (pathname === "/assets/current" || pathname === "/assets/fixed") {
      expanded.push("assets");
    }
    return expanded;
  });
  
  const allMenuItems = [
    { icon: "🏦", label: "Accounts", href: "/accounts", type: "link" as const },
    { icon: "🏢", label: "Assets", href: null, type: "expandable" as const, subMenuKey: "assets" },
    { icon: "📊", label: "Dashboard", href: "/dashboard", type: "link" as const },
    { icon: "💸", label: "Expenses", href: "/expenses", type: "link" as const },
    { icon: "💬", label: "Feedback", href: "/feedback", type: "link" as const },
    { icon: "💰", label: "Income", href: "/income", type: "link" as const },
    { icon: "📝", label: "Journal", href: "/journal", type: "link" as const },
    { icon: "📋", label: "Liabilities", href: null, type: "expandable" as const, subMenuKey: "liabilities" },
    { icon: "📈", label: "Reports", href: "/reports", type: "link" as const },
    { icon: "⚙️", label: "Settings", href: "/settings", type: "link" as const },
    { icon: "🔄", label: "Transfers", href: "/transfers", type: "link" as const },
  ];

  const subMenuItems = {
    assets: [
      { icon: "📦", label: "Current Assets", href: "/assets/current" },
      { icon: "🏗️", label: "Fixed Assets", href: "/assets/fixed" },
    ],
    liabilities: [
      { icon: "💳", label: "Long Term", href: "/loans" },
      { icon: "📅", label: "Short Term", href: "/liabilities/short-term" },
    ],
  };

  const toggleMenu = (menuKey: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuKey)
        ? prev.filter((key) => key !== menuKey)
        : [...prev, menuKey]
    );
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 bottom-0 z-40 w-64 transform border-r border-zinc-200 bg-white transition-transform duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-900 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex h-full flex-col overflow-y-auto overscroll-contain p-4">
          <ul className="space-y-2 pb-6">
            {allMenuItems.map((item) => {
              if (item.type === "expandable" && item.subMenuKey) {
                const isActive = 
                  (item.subMenuKey === "liabilities" && (pathname === "/loans" || pathname === "/liabilities/short-term")) ||
                  (item.subMenuKey === "assets" && (pathname === "/assets/current" || pathname === "/assets/fixed"));
                return (
                  <li key={item.label}>
                    <button
                      onClick={() => toggleMenu(item.subMenuKey!)}
                      className={`w-full flex items-center justify-between gap-3 rounded-lg px-4 py-3 transition-colors ${
                        isActive
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                      </div>
                      <span className={`transition-transform ${expandedMenus.includes(item.subMenuKey!) ? "rotate-90" : ""}`}>
                        ▶
                      </span>
                    </button>
                    {expandedMenus.includes(item.subMenuKey!) && (
                      <ul className="mt-1 ml-4 space-y-1">
                        {subMenuItems[item.subMenuKey as keyof typeof subMenuItems].map((subItem) => {
                          const isSubActive = pathname === subItem.href;
                          return (
                            <li key={subItem.label}>
                              <Link
                                href={subItem.href}
                                className={`flex items-center gap-3 rounded-lg px-4 py-2 transition-colors ${
                                  isSubActive
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                }`}
                                onClick={() => {
                                  // Only close sidebar on mobile when clicking a link
                                  if (typeof window !== "undefined" && window.innerWidth < 1024) {
                                    onClose();
                                  }
                                }}
                              >
                                <span className="text-lg">{subItem.icon}</span>
                                <span className="text-sm font-medium">{subItem.label}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              } else {
                const isActive = pathname === item.href;
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href!}
                      className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${
                        isActive
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                      onClick={() => {
                        // Only close sidebar on mobile when clicking a link
                        if (typeof window !== "undefined" && window.innerWidth < 1024) {
                          onClose();
                        }
                      }}
                    >
                      <span className="text-xl">{item.icon}</span>
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  </li>
                );
              }
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}

