"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSidebar } from "@/contexts/SidebarContext";
import {
  useLedgers,
  useLedgerGroups,
  useParentLedgerGroups,
} from "@/lib/hooks/use-accounts";
import { useTransactions } from "@/lib/hooks/use-transactions";
import { useQuery } from "@tanstack/react-query";
import { getTransaction } from "@/lib/api/transactions";

export default function CurrentAssetsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], refetch: refetchLedgers } = useLedgers();
  const { data: groups = [], refetch: refetchGroups } = useLedgerGroups();
  const { data: parentGroups = [], refetch: refetchParentGroups } = useParentLedgerGroups();
  const { token } = useAuth();
  const { data: allTransactions = [], refetch: refetchTransactions } = useTransactions();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Find "Current Assets" parent group
  const currentAssetsParent = parentGroups.find(
    (pg) => pg.name === "Current Assets"
  );

  // Filter ledger groups that belong to "Current Assets"
  const currentAssetGroups = groups.filter(
    (group) => group.parent_ledger_group_id === currentAssetsParent?.id
  );

  // Filter to only current asset ledgers
  const currentAssetLedgers = ledgers.filter((ledger) =>
    currentAssetGroups.some((group) => group.id === ledger.ledger_group_id)
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Don't show loading screen if we're just checking auth - only show if actually loading
  if (!isAuthenticated && !isLoading) {
    return null; // Will redirect, don't render anything
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchLedgers(),
        refetchGroups(),
        refetchParentGroups(),
        refetchTransactions(),
      ]);
    } catch (err) {
      console.error("Error refreshing data:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch all transactions with items to calculate asset balances
  const transactionIds = allTransactions.map(t => t.id).sort().join(',');
  const { data: transactionsWithItems = [] } = useQuery({
    queryKey: ["allTransactionsWithItems", transactionIds],
    queryFn: async () => {
      if (!token || allTransactions.length === 0) return [];
      const transactions = await Promise.all(
        allTransactions.map((t) => getTransaction(token, t.id))
      );
      return transactions;
    },
    enabled: allTransactions.length > 0 && !!token,
  });

  // Calculate asset balances (for assets: debit - credit)
  const assetsByLedger = useMemo(() => {
    const ledgerBalances = new Map<number, number>();

    // Process all transactions to calculate balances
    if (transactionsWithItems.length > 0) {
      transactionsWithItems.forEach((transaction) => {
        transaction.items.forEach((item) => {
          // Check if this ledger is a current asset ledger
          const ledger = ledgers.find(l => l.id === item.ledger_id);
          if (ledger && currentAssetLedgers.some(ca => ca.id === ledger.id)) {
            const amount =
              typeof item.amount === "string"
                ? parseFloat(item.amount)
                : Number(item.amount) || 0;

            const existing = ledgerBalances.get(item.ledger_id) || 0;
            // For assets: DEBIT increases balance, CREDIT decreases balance
            if (item.entry_type === "DEBIT") {
              ledgerBalances.set(item.ledger_id, existing + amount);
            } else if (item.entry_type === "CREDIT") {
              ledgerBalances.set(item.ledger_id, existing - amount);
            }
          }
        });
      });
    }

    // Calculate total assets (for percentage calculation)
    const totalAssets = Array.from(ledgerBalances.values())
      .filter(balance => balance > 0) // Only show positive balances
      .reduce((sum, balance) => sum + balance, 0);

    // Build result array with ledger names, only including positive balances
    const result = Array.from(ledgerBalances.entries())
      .filter(([_, balance]) => balance > 0) // Only show positive balances
      .map(([ledgerId, balance]) => {
        const ledger = ledgers.find(l => l.id === ledgerId);
        return {
          ledger_id: ledgerId,
          name: ledger?.name || `Ledger ${ledgerId}`,
          value: balance,
          percentage: totalAssets > 0 ? (balance / totalAssets) * 100 : 0,
        };
      })
      .sort((a, b) => b.value - a.value); // Sort by balance descending

    return result;
  }, [transactionsWithItems, ledgers, currentAssetLedgers]);

  // Colors for pie chart
  const COLORS = [
    "#8884d8",
    "#82ca9d",
    "#ffc658",
    "#ff7300",
    "#00ff00",
    "#0088fe",
    "#00c49f",
    "#ffbb28",
    "#ff8042",
    "#8884d8",
  ];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950" suppressHydrationWarning>
      <Header
        onMenuClick={toggleSidebar}
        isSidebarOpen={isSidebarOpen}
      />
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isLoggedIn={isAuthenticated}
      />
      <main
        className={`flex-1 transition-all duration-300 ${
          isSidebarOpen && isAuthenticated ? "lg:ml-64" : "lg:ml-0"
        }`}
      >
        <div className="container mx-auto px-4 py-8 md:px-6 md:py-12">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                Current Assets
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                View and manage current asset balances
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                title="Refresh data"
              >
                <svg
                  className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
              </button>
            </div>
          </div>

          {/* Current Assets by Ledger Chart */}
          {assetsByLedger.length > 0 ? (
            <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 md:p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  Current Assets by Ledger
                </h2>
              </div>

              <div className="flex flex-col">
                <div className="h-[450px] sm:h-[550px] md:h-[650px] lg:h-[700px] xl:h-[750px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 15, bottom: 10, left: 15 }}>
                      <Pie
                        data={assetsByLedger}
                        cx="50%"
                        cy="40%"
                        labelLine={true}
                        label={(props: any) => {
                          const entry = assetsByLedger[props.index];
                          if (!entry) return "";
                          const amount = entry.value.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            useGrouping: true,
                          });
                          return `${entry.name}: ${entry.percentage.toFixed(1)}% (KSh ${amount})`;
                        }}
                        outerRadius="70%"
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {assetsByLedger.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [
                          `KSh ${value.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            useGrouping: true,
                          })}`,
                          "Balance",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {assetsByLedger.map((entry, index) => (
                    <div
                      key={entry.ledger_id}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800"
                    >
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {entry.name}
                        </div>
                        <div className="text-xs text-zinc-600 dark:text-zinc-400">
                          {entry.percentage.toFixed(1)}% • KSh{" "}
                          {entry.value.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            useGrouping: true,
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-zinc-600 dark:text-zinc-400">
                No current assets found. Create asset accounts in{" "}
                <a
                  href="/accounts"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Accounts
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

