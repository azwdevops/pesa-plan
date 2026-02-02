"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSidebar } from "@/contexts/SidebarContext";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { isSidebarOpen, toggleSidebar, setIsSidebarOpen } = useSidebar();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950" suppressHydrationWarning>
      <Header onMenuClick={toggleSidebar} isSidebarOpen={isSidebarOpen} />
      {isAuthenticated && (
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          isLoggedIn={isAuthenticated}
        />
      )}
      <main
        className={`flex-1 transition-all duration-300 ${
          isSidebarOpen && isAuthenticated ? "lg:ml-64" : "lg:ml-0"
        }`}
      >
        <div className="container mx-auto px-4 py-8 md:px-6 md:py-12">
          {/* Hero Section */}
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-4xl font-bold text-zinc-900 dark:text-zinc-100 md:text-5xl">
              Track Your Money, Plan Your Future
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              Know exactly where your money comes from, where it goes, and how
              it moves between your accounts. Take control of your finances with
              Pesa Plan.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* Income Card */}
            <div className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <span className="text-2xl">💰</span>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Record Income
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                Track every source of money coming in. Know exactly when and
                where your income arrives.
              </p>
            </div>

            {/* Expenses Card */}
            <div className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <span className="text-2xl">💸</span>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Track Expenses
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                Monitor every expense. Understand your spending patterns and
                identify areas to save.
              </p>
            </div>

            {/* Transfers Card */}
            <div className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <span className="text-2xl">🔄</span>
              </div>
              <h3 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Manage Transfers
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                Record transfers between accounts - Equity Bank, M-Pesa, Cash,
                and more. Keep track of your money flow.
              </p>
            </div>
          </div>


          {/* Call to Action */}
          {!isAuthenticated && (
            <div className="mt-12 text-center">
              <p className="mb-4 text-zinc-600 dark:text-zinc-400">
                Ready to take control of your finances?
              </p>
              <button
                onClick={() => router.push("/signup")}
                className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
