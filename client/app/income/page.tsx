"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Dialog } from "@/components/Dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSidebar } from "@/contexts/SidebarContext";
import {
  useLedgers,
  useLedgerGroups,
  useCreateLedger,
} from "@/lib/hooks/use-accounts";
import { useCreateTransaction, useTransactions } from "@/lib/hooks/use-transactions";
import { useQuery } from "@tanstack/react-query";
import { getTransaction } from "@/lib/api/transactions";
import type { LedgerCreate } from "@/lib/api/accounts";

type PeriodType = "month" | "custom";

export default function IncomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], isLoading: ledgersLoading, refetch: refetchLedgers } = useLedgers();
  const { data: groups = [] } = useLedgerGroups();
  const { data: incomeTransactions = [], refetch: refetchIncomes } = useTransactions("MONEY_RECEIVED");
  const { token } = useAuth();
  const createTransactionMutation = useCreateTransaction();
  const createLedgerMutation = useCreateLedger();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);

  // Filter ledgers: income ledgers and asset ledgers (for receiving account)
  const incomeGroups = groups.filter(
    (group) => group.category === "incomes"
  );
  const assetGroups = groups.filter(
    (group) =>
      group.category === "bank_accounts" ||
      group.category === "cash_accounts"
  );

  const incomeLedgers = ledgers.filter((ledger) =>
    incomeGroups.some((group) => group.id === ledger.ledger_group_id)
  );
  const assetLedgers = ledgers.filter((ledger) =>
    assetGroups.some((group) => group.id === ledger.ledger_group_id)
  );

  const [showPostIncomeDialog, setShowPostIncomeDialog] = useState(false);
  const [showCreateLedgerDialog, setShowCreateLedgerDialog] = useState(false);
  const [showCreateAssetLedgerDialog, setShowCreateAssetLedgerDialog] = useState(false);
  const [pendingLedgerName, setPendingLedgerName] = useState("");
  const [pendingAssetLedgerName, setPendingAssetLedgerName] = useState("");
  const [formData, setFormData] = useState({
    transaction_date: new Date(),
    income_ledger_id: 0,
    receiving_account_id: 0,
    amount: "",
  });
  const [ledgerFormData, setLedgerFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: incomeGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [assetLedgerFormData, setAssetLedgerFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: assetGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Initialize custom dates when switching to custom mode
  useEffect(() => {
    if (periodType === "custom" && !customStartDate && !customEndDate) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      setCustomStartDate(start);
      setCustomEndDate(end);
    }
  }, [periodType, customStartDate, customEndDate]);

  // Calculate date range based on period type
  const getDateRange = () => {
    if (periodType === "month") {
      const start = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1);
      const end = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    } else {
      // Custom date range
      if (!customStartDate || !customEndDate) {
        // Default to current month if custom dates not set
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
      }
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Filter transactions by date range
  const filteredIncomeTransactions = useMemo(() => {
    return incomeTransactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transaction_date);
      return transactionDate >= startDate && transactionDate <= endDate;
    });
  }, [incomeTransactions, startDate, endDate]);

  // Create a map of ledger_id to ledger name
  const ledgerMap = useMemo(() => {
    const map = new Map<number, string>();
    ledgers.forEach((ledger) => {
      map.set(ledger.id, ledger.name);
    });
    return map;
  }, [ledgers]);

  // Fetch transaction details for filtered income transactions to get items
  const incomeTransactionIds = filteredIncomeTransactions.map(t => t.id).sort().join(',');
  const { data: incomeTransactionsWithItems = [], isLoading: isLoadingTransactions, refetch: refetchIncomeTransactionsWithItems } = useQuery({
    queryKey: ["incomeTransactionsWithItems", incomeTransactionIds],
    queryFn: async () => {
      if (!token || filteredIncomeTransactions.length === 0) return [];
      
      const transactions = await Promise.all(
        filteredIncomeTransactions.map((t) => getTransaction(token, t.id))
      );
      return transactions;
    },
    enabled: filteredIncomeTransactions.length > 0 && !!token,
  });

  // Group incomes by ledger
  const incomesByLedger = useMemo(() => {
    const ledgerTotals = new Map<number, number>();

    // Process transactions with items
    if (incomeTransactionsWithItems.length > 0) {
      incomeTransactionsWithItems.forEach((transaction) => {
        // Find all CREDIT items that are income ledgers
        transaction.items.forEach((item) => {
          if (item.entry_type === "CREDIT") {
            // Check if this ledger is an income ledger
            const ledger = ledgers.find(l => l.id === item.ledger_id);
            if (ledger && incomeLedgers.some(il => il.id === ledger.id)) {
              const amount =
                typeof item.amount === "string"
                  ? parseFloat(item.amount)
                  : Number(item.amount) || 0;

              if (amount > 0) {
                const existing = ledgerTotals.get(item.ledger_id) || 0;
                ledgerTotals.set(item.ledger_id, existing + amount);
              }
            }
          }
        });
      });
    }

    // Calculate total incomes (for percentage calculation)
    const totalIncomes = Array.from(ledgerTotals.values()).reduce(
      (sum, total) => sum + total,
      0
    );

    // Build result array with ledger names
    const result = Array.from(ledgerTotals.entries())
      .map(([ledgerId, total]) => {
        const ledgerName = ledgerMap.get(ledgerId) || `Unknown (ID: ${ledgerId})`;
        return {
          name: ledgerName,
          value: Number(total.toFixed(2)),
          percentage:
            totalIncomes > 0
              ? Number(((total / totalIncomes) * 100).toFixed(1))
              : 0,
        };
      })
      .sort((a, b) => b.value - a.value);

    return result;
  }, [
    incomeTransactionsWithItems,
    ledgerMap,
    ledgers,
    incomeLedgers,
  ]);

  // Colors for the pie chart
  const COLORS = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
    "#84cc16", // lime
    "#6366f1", // indigo
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchIncomes(),
        refetchLedgers(),
      ]);
      // Refetch income transactions with items after incomes are refetched
      if (filteredIncomeTransactions.length > 0) {
        await refetchIncomeTransactionsWithItems();
      }
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Don't show loading screen if we're just checking auth - only show if actually loading
  if (!isAuthenticated && !isLoading) {
    return null; // Will redirect, don't render anything
  }

  const handlePostIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.income_ledger_id) {
      setError("Please select an income source");
      return;
    }

    if (!formData.receiving_account_id) {
      setError("Please select a receiving account");
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!formData.transaction_date) {
      setError("Please select a transaction date");
      return;
    }

    const amount = parseFloat(formData.amount);
    // Format date as YYYY-MM-DD for the API
    const transactionDate = formData.transaction_date instanceof Date
      ? formData.transaction_date.toISOString().split("T")[0]
      : new Date(formData.transaction_date).toISOString().split("T")[0];

    try {
      // Create transaction with double-entry accounting for income:
      // Debit: Receiving account (asset increases - cash/bank account)
      // Credit: Income account (income increases - revenue account)
      // Total amount is automatically calculated from the items
      await createTransactionMutation.mutateAsync({
        transaction_date: transactionDate,
        reference: null,
        transaction_type: "MONEY_RECEIVED",
        total_amount: amount,
        items: [
          {
            ledger_id: formData.receiving_account_id,
            entry_type: "DEBIT",
            amount: amount,
          },
          {
            ledger_id: formData.income_ledger_id,
            entry_type: "CREDIT",
            amount: amount,
          },
        ],
      });

      // Reset form and close dialog
      setFormData({
        transaction_date: new Date(),
        income_ledger_id: 0,
        receiving_account_id: 0,
        amount: "",
      });
      setShowPostIncomeDialog(false);
      alert("Income posted successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post income");
    }
  };

  const handleCreateLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ledgerFormData.name.trim()) {
      setError("Ledger name is required");
      return;
    }

    if (!ledgerFormData.ledger_group_id) {
      setError("Please select a ledger group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(ledgerFormData);
      
      // Set the newly created ledger as the selected income source
      setFormData({
        ...formData,
        income_ledger_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setLedgerFormData({
        name: "",
        ledger_group_id: incomeGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateLedgerDialog(false);
      setPendingLedgerName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ledger");
    }
  };

  const handleCreateNewLedger = (searchTerm: string) => {
    setPendingLedgerName(searchTerm);
    setLedgerFormData({
      name: searchTerm,
      ledger_group_id: incomeGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateLedgerDialog(true);
  };

  const handleCreateNewAssetLedger = (searchTerm: string) => {
    setPendingAssetLedgerName(searchTerm);
    setAssetLedgerFormData({
      name: searchTerm,
      ledger_group_id: assetGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateAssetLedgerDialog(true);
  };

  const handleCreateAssetLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!assetLedgerFormData.name.trim()) {
      setError("Ledger name is required");
      return;
    }

    if (!assetLedgerFormData.ledger_group_id) {
      setError("Ledger group is required");
      return;
    }

    try {
      await createLedgerMutation.mutateAsync(assetLedgerFormData);
      const { data: updatedLedgers } = await refetchLedgers();
      setShowCreateAssetLedgerDialog(false);
      const savedName = pendingAssetLedgerName;
      setAssetLedgerFormData({
        name: "",
        ledger_group_id: assetGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setPendingAssetLedgerName("");
      
      // Auto-select the newly created ledger
      if (updatedLedgers) {
        const newLedger = updatedLedgers.find(
          (l) => l.name === savedName && assetGroups.some((g) => g.id === l.ledger_group_id)
        );
        if (newLedger) {
          setFormData({
            ...formData,
            receiving_account_id: newLedger.id,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ledger");
    }
  };

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
                Income
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Record and manage income transactions
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
              <button
                onClick={() => setShowPostIncomeDialog(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                + Post Income
              </button>
            </div>
          </div>

          {/* Incomes by Ledger Chart */}
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 md:p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3">
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  Incomes by Ledger
                </h2>
              
                {/* Period Filter */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPeriodType("month")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        periodType === "month"
                          ? "bg-blue-600 text-white dark:bg-blue-500"
                          : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      }`}
                    >
                      Month
                    </button>
                    <button
                      onClick={() => setPeriodType("custom")}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        periodType === "custom"
                          ? "bg-blue-600 text-white dark:bg-blue-500"
                          : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {periodType === "month" ? (
                    <DatePicker
                      selected={selectedMonthDate}
                      onChange={(date: Date | null) => {
                        if (date) setSelectedMonthDate(date);
                      }}
                      dateFormat="MMMM yyyy"
                      showMonthYearPicker
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:w-48"
                      popperPlacement="bottom-start"
                    />
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <DatePicker
                        selected={customStartDate}
                        onChange={(date: Date | null) => setCustomStartDate(date)}
                        selectsStart
                        startDate={customStartDate}
                        endDate={customEndDate}
                        dateFormat="dd/MM/yyyy"
                        placeholderText="Start Date"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:w-40"
                        popperPlacement="bottom-start"
                      />
                      <span className="text-center text-zinc-600 dark:text-zinc-400 sm:text-left">to</span>
                      <DatePicker
                        selected={customEndDate}
                        onChange={(date: Date | null) => setCustomEndDate(date)}
                        selectsEnd
                        startDate={customStartDate}
                        endDate={customEndDate}
                        minDate={customStartDate || undefined}
                        dateFormat="dd/MM/yyyy"
                        placeholderText="End Date"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 sm:w-40"
                        popperPlacement="bottom-start"
                      />
                    </div>
                  )}
                </div>
              </div>
              {/* Period Display */}
              <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {periodType === "month" ? (
                  <span>
                    {selectedMonthDate.toLocaleDateString("en-GB", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                ) : customStartDate && customEndDate ? (
                  <span>
                    {customStartDate.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}{" "}
                    to{" "}
                    {customEndDate.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                ) : (
                  <span>Select date range</span>
                )}
              </div>
            </div>
            {isLoadingTransactions ? (
              <div className="py-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">Loading income breakdown...</p>
              </div>
            ) : incomesByLedger.length > 0 ? (
              <div className="flex flex-col gap-8">
                {/* Pie Chart */}
                <div className="flex items-center justify-center min-h-0 p-0 sm:p-2 md:p-4">
                  <div className="w-full h-[450px] sm:h-[550px] md:h-[650px] lg:h-[700px] xl:h-[750px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 0, right: 15, bottom: 10, left: 15 }}>
                        <Pie
                          data={incomesByLedger}
                          cx="50%"
                          cy="40%"
                          labelLine={true}
                          label={(props: any) => {
                            const entry = incomesByLedger[props.index];
                            if (!entry) return "";
                            const amount = entry.value.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                              useGrouping: true,
                            });
                            return `${entry.name}: ${entry.percentage}% (KSh ${amount})`;
                          }}
                          outerRadius="70%"
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {incomesByLedger.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | undefined) => {
                          if (value === undefined) return "";
                          return `KSh ${value.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            useGrouping: true,
                          })}`;
                        }}
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.95)",
                          border: "1px solid #e4e4e7",
                          borderRadius: "0.5rem",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  </div>
                </div>

                {/* Legend with amounts */}
                <div className="flex flex-col justify-center">
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {incomesByLedger.map((item, index) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="h-4 w-4 rounded-full"
                            style={{
                              backgroundColor: COLORS[index % COLORS.length],
                            }}
                          />
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                            KSh {item.value.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                              useGrouping: true,
                            })}
                          </div>
                          <div className="text-sm text-zinc-600 dark:text-zinc-400">
                            {item.percentage}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">
                  {filteredIncomeTransactions.length === 0
                    ? "No income transactions yet. Start recording income to see income breakdown."
                    : incomeTransactionsWithItems.length === 0
                    ? "Loading transaction details..."
                    : incomeLedgers.length === 0
                    ? "No income ledgers found. Create income ledgers in the Accounts page."
                    : "No incomes found in the selected transactions."}
                </p>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Post Income Dialog */}
      <Dialog
        isOpen={showPostIncomeDialog}
        onClose={() => {
          setShowPostIncomeDialog(false);
          setError(null);
        }}
        title="Post Income"
        size="lg"
      >
        <form onSubmit={handlePostIncome} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Transaction Date *
              </label>
              <DatePicker
                selected={formData.transaction_date instanceof Date ? formData.transaction_date : new Date(formData.transaction_date)}
                onChange={(date: Date | null) => {
                  if (date) {
                    setFormData({
                      ...formData,
                      transaction_date: date,
                    });
                  }
                }}
                dateFormat="dd/MM/yyyy"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                required
                popperPlacement="bottom-start"
                popperClassName="react-datepicker-popper-no-backdrop"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Income Source *
              </label>
              <SearchableSelect
                options={incomeLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.income_ledger_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    income_ledger_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select income source"
                searchPlaceholder="Type to search income sources..."
                required
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewLedger}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" ledger`}
              />
              {incomeLedgers.length === 0 && !ledgersLoading && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  No income accounts found. Create one in{" "}
                  <Link
                    href="/accounts"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Accounts
                  </Link>
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Receiving Account *
              </label>
              <SearchableSelect
                options={assetLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.receiving_account_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    receiving_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select receiving account"
                searchPlaceholder="Type to search accounts..."
                required
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewAssetLedger}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" account`}
              />
              {assetLedgers.length === 0 && !ledgersLoading && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  No asset accounts found. Create one in{" "}
                  <Link
                    href="/accounts"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Accounts
                  </Link>
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                required
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setShowPostIncomeDialog(false);
                setError(null);
              }}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTransactionMutation.isPending}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {createTransactionMutation.isPending ? "Posting..." : "Post Income"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create Ledger Dialog */}
      <Dialog
        isOpen={showCreateLedgerDialog}
        onClose={() => {
          setShowCreateLedgerDialog(false);
          setError(null);
          setPendingLedgerName("");
        }}
        title="Create Income Ledger"
        size="lg"
      >
        <form onSubmit={handleCreateLedger} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Name *
            </label>
            <input
              type="text"
              value={ledgerFormData.name}
              onChange={(e) =>
                setLedgerFormData({ ...ledgerFormData, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Salary Income, Freelance Income"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Group *
            </label>
            <SearchableSelect
              options={incomeGroups.map((group) => ({
                value: group.id,
                label: group.name,
                searchText: group.parent_ledger_group
                  ? `${group.name} ${group.parent_ledger_group.name}`
                  : group.name,
              }))}
              value={ledgerFormData.ledger_group_id || 0}
              onChange={(value) =>
                setLedgerFormData({
                  ...ledgerFormData,
                  ledger_group_id:
                    typeof value === "number" ? value : parseInt(value as string),
                })
              }
              placeholder="Select a ledger group"
              searchPlaceholder="Type to search ledger groups..."
              required
              className="w-full"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setShowCreateLedgerDialog(false);
                setError(null);
                setPendingLedgerName("");
              }}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createLedgerMutation.isPending}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {createLedgerMutation.isPending ? "Creating..." : "Create Ledger"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create Asset Ledger Dialog */}
      <Dialog
        isOpen={showCreateAssetLedgerDialog}
        onClose={() => {
          setShowCreateAssetLedgerDialog(false);
          setError(null);
          setPendingAssetLedgerName("");
        }}
        title="Create Asset Ledger"
        size="lg"
      >
        <form onSubmit={handleCreateAssetLedger} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Name *
            </label>
            <input
              type="text"
              value={assetLedgerFormData.name}
              onChange={(e) =>
                setAssetLedgerFormData({ ...assetLedgerFormData, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Bank Account, Cash Account"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Group *
            </label>
            <SearchableSelect
              options={assetGroups.map((group) => ({
                value: group.id,
                label: group.name,
                searchText: group.parent_ledger_group
                  ? `${group.name} ${group.parent_ledger_group.name}`
                  : group.name,
              }))}
              value={assetLedgerFormData.ledger_group_id || 0}
              onChange={(value) =>
                setAssetLedgerFormData({
                  ...assetLedgerFormData,
                  ledger_group_id:
                    typeof value === "number" ? value : parseInt(value as string),
                })
              }
              placeholder="Select a ledger group"
              searchPlaceholder="Type to search ledger groups..."
              required
              className="w-full"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setShowCreateAssetLedgerDialog(false);
                setError(null);
                setPendingAssetLedgerName("");
              }}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createLedgerMutation.isPending}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {createLedgerMutation.isPending ? "Creating..." : "Create Ledger"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
