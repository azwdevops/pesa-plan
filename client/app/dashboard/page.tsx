"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTransactions } from "@/lib/hooks/use-transactions";
import { useLedgers, useSpendingTypes } from "@/lib/hooks/use-accounts";
import { useQuery } from "@tanstack/react-query";
import { getTransaction } from "@/lib/api/transactions";

type PeriodType = "month" | "custom";

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: incomeTransactions = [], refetch: refetchIncome } = useTransactions("MONEY_RECEIVED");
  const { data: expenseTransactions = [], refetch: refetchExpenses } = useTransactions("MONEY_PAID");
  const { data: ledgers = [], refetch: refetchLedgers } = useLedgers();
  const { data: spendingTypes = [], refetch: refetchSpendingTypes } = useSpendingTypes();
  const { token } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);

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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Don't show loading screen if we're just checking auth - only show if actually loading
  if (!isAuthenticated && !isLoading) {
    return null; // Will redirect, don't render anything
  }

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

  const filteredExpenseTransactions = useMemo(() => {
    return expenseTransactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transaction_date);
      return transactionDate >= startDate && transactionDate <= endDate;
    });
  }, [expenseTransactions, startDate, endDate]);

  // Calculate totals - ensure values are numbers
  const totalIncome = filteredIncomeTransactions.reduce(
    (sum, transaction) => {
      const amount = typeof transaction.total_amount === 'string' 
        ? parseFloat(transaction.total_amount) 
        : Number(transaction.total_amount) || 0;
      return sum + amount;
    },
    0
  );
  const totalExpenses = filteredExpenseTransactions.reduce(
    (sum, transaction) => {
      const amount = typeof transaction.total_amount === 'string' 
        ? parseFloat(transaction.total_amount) 
        : Number(transaction.total_amount) || 0;
      return sum + amount;
    },
    0
  );
  const netBalance = totalIncome - totalExpenses;

  // Create a map of spending_type_id to spending_type name
  const spendingTypeMap = useMemo(() => {
    const map = new Map<number, string>();
    spendingTypes.forEach((spendingType) => {
      map.set(spendingType.id, spendingType.name);
    });
    return map;
  }, [spendingTypes]);

  // Create a map of ledger_id to spending_type_id for quick lookup
  const ledgerSpendingTypeIdMap = useMemo(() => {
    const map = new Map<number, number>();
    ledgers.forEach((ledger) => {
      if (ledger.spending_type_id) {
        map.set(ledger.id, ledger.spending_type_id);
      }
    });
    return map;
  }, [ledgers]);

  // Fetch transaction details for filtered expense transactions to get items
  // We'll fetch them in parallel using Promise.all
  const expenseTransactionIds = filteredExpenseTransactions.map(t => t.id).sort().join(',');
  const { data: expenseTransactionsWithItems = [], isLoading: isLoadingTransactions, refetch: refetchExpenseTransactionsWithItems } = useQuery({
    queryKey: ["expenseTransactionsWithItems", expenseTransactionIds],
    queryFn: async () => {
      if (!token || filteredExpenseTransactions.length === 0) return [];
      
      const transactions = await Promise.all(
        filteredExpenseTransactions.map((t) => getTransaction(token, t.id))
      );
      return transactions;
    },
    enabled: filteredExpenseTransactions.length > 0 && !!token,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchIncome(),
        refetchExpenses(),
        refetchLedgers(),
        refetchSpendingTypes(),
      ]);
      // Refetch expense transactions with items after expenses are refetched
      if (filteredExpenseTransactions.length > 0) {
        await refetchExpenseTransactionsWithItems();
      }
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Group expenses by spending type
  // Approach: For each spending type, sum all transaction items from ledgers with that spending_type_id
  const expensesBySpendingType = useMemo(() => {
    const spendingTypeTotals = new Map<number, number>();

    // Process transactions with items
    if (expenseTransactionsWithItems.length > 0) {
      expenseTransactionsWithItems.forEach((transaction) => {
        // Find all DEBIT items that have spending types (expense ledgers)
        // Transaction charges don't have spending types, so they're excluded
        transaction.items.forEach((item) => {
          if (item.entry_type === "DEBIT") {
            const spendingTypeId = ledgerSpendingTypeIdMap.get(item.ledger_id);
            if (spendingTypeId) {
              const amount =
                typeof item.amount === "string"
                  ? parseFloat(item.amount)
                  : Number(item.amount) || 0;

              if (amount > 0) {
                const existing = spendingTypeTotals.get(spendingTypeId) || 0;
                spendingTypeTotals.set(spendingTypeId, existing + amount);
              }
            }
          }
        });
      });
    }

    // Calculate total expenses from spending types (for percentage calculation)
    // This ensures percentages add up to 100% based on actual categorized expenses
    const totalExpensesFromSpendingTypes = Array.from(spendingTypeTotals.values()).reduce(
      (sum, total) => sum + total,
      0
    );

    // Build result array with spending type names
    const result = Array.from(spendingTypeTotals.entries())
      .map(([spendingTypeId, total]) => {
        const spendingTypeName = spendingTypeMap.get(spendingTypeId) || `Unknown (ID: ${spendingTypeId})`;
        return {
          name: spendingTypeName,
          value: Number(total.toFixed(2)),
          percentage:
            totalExpensesFromSpendingTypes > 0
              ? Number(((total / totalExpensesFromSpendingTypes) * 100).toFixed(1))
              : 0,
        };
      })
      .sort((a, b) => b.value - a.value);

    return result;
  }, [
    expenseTransactionsWithItems,
    ledgerSpendingTypeIdMap,
    spendingTypeMap,
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
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              Dashboard
            </h1>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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

          {/* Financial Overview */}
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 md:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-6">
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Your Financial Overview
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
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-3">
              <div className="text-center p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <div className="mb-2 text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
                  KSh {totalIncome.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    useGrouping: true,
                  })}
                </div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Total Income
                </div>
              </div>
              <div className="text-center p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <div className="mb-2 text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400">
                  KSh {totalExpenses.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    useGrouping: true,
                  })}
                </div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Total Expenses
                </div>
              </div>
              <div className="text-center p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <div className={`mb-2 text-2xl sm:text-3xl font-bold ${
                  netBalance >= 0 
                    ? "text-blue-600 dark:text-blue-400" 
                    : "text-red-600 dark:text-red-400"
                }`}>
                  KSh {netBalance.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    useGrouping: true,
                  })}
                </div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Net Balance
                </div>
              </div>
            </div>
          </div>

          {/* Expenses by Spending Type Chart */}
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 md:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Expenses by Spending Type
            </h2>
            {isLoadingTransactions ? (
              <div className="py-12 text-center">
                <p className="text-zinc-600 dark:text-zinc-400">Loading spending breakdown...</p>
              </div>
            ) : expensesBySpendingType.length > 0 ? (
              <div className="flex flex-col gap-8">
                {/* Pie Chart */}
                <div className="flex items-center justify-center min-h-0 p-0 sm:p-2 md:p-4">
                  <div className="w-full h-[450px] sm:h-[550px] md:h-[650px] lg:h-[700px] xl:h-[750px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 0, right: 15, bottom: 10, left: 15 }}>
                      <Pie
                        data={expensesBySpendingType}
                        cx="50%"
                          cy="40%"
                          labelLine={true}
                        label={(props: any) => {
                          const entry = expensesBySpendingType[props.index];
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
                        {expensesBySpendingType.map((entry, index) => (
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
                    {expensesBySpendingType.map((item, index) => (
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
                  {filteredExpenseTransactions.length === 0
                    ? "No expense transactions yet. Start recording expenses to see spending breakdown."
                    : expenseTransactionsWithItems.length === 0
                    ? "Loading transaction details..."
                    : spendingTypes.length === 0
                    ? "No spending categories found. Create spending categories in the Accounts page."
                    : ledgerSpendingTypeIdMap.size === 0
                    ? "No expense ledgers with spending categories found. Make sure your expense ledgers have spending categories assigned in the Accounts page."
                    : "No expenses with spending categories found in the selected transactions. Make sure your expense ledgers have spending categories assigned."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

