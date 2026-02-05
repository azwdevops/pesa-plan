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
  useSpendingTypes,
  useCreateSpendingType,
  useCreateLedgerGroup,
  useParentLedgerGroups,
} from "@/lib/hooks/use-accounts";
import { useCreateTransaction, useTransactions } from "@/lib/hooks/use-transactions";
import { useQuery } from "@tanstack/react-query";
import { getTransaction } from "@/lib/api/transactions";
import type { LedgerCreate, LedgerGroupCreate } from "@/lib/api/accounts";

type PeriodType = "month" | "custom";

export default function ExpensesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], isLoading: ledgersLoading, refetch: refetchLedgers } = useLedgers();
  const { data: groups = [] } = useLedgerGroups();
  const { data: parentGroups = [] } = useParentLedgerGroups();
  const { data: spendingTypes = [], refetch: refetchSpendingTypes } = useSpendingTypes();
  const { data: expenseTransactions = [], refetch: refetchExpenses } = useTransactions("MONEY_PAID");
  const { token } = useAuth();
  const createTransactionMutation = useCreateTransaction();
  const createLedgerMutation = useCreateLedger();
  const createSpendingTypeMutation = useCreateSpendingType();
  const createLedgerGroupMutation = useCreateLedgerGroup();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);

  // Filter ledgers: expense ledgers (under Expenditure parent group), asset ledgers (for paying account), and charge ledgers
  const expenditureParentGroup = parentGroups.find(
    (parent) => parent.name.toLowerCase() === "expenditure"
  );

  const expenseGroups = expenditureParentGroup
    ? groups.filter(
        (group) => group.parent_ledger_group_id === expenditureParentGroup.id
      )
    : groups.filter((group) => group.category === "expenses");
  const assetGroups = groups.filter(
    (group) =>
      group.category === "bank_accounts" ||
      group.category === "cash_accounts"
  );
  const chargeGroups = groups.filter(
    (group) => group.category === "bank_charges"
  );

  const expenseLedgers = ledgers.filter((ledger) =>
    expenseGroups.some((group) => group.id === ledger.ledger_group_id)
  );
  const assetLedgers = ledgers.filter((ledger) =>
    assetGroups.some((group) => group.id === ledger.ledger_group_id)
  );
  const chargeLedgers = ledgers.filter((ledger) =>
    chargeGroups.some((group) => group.id === ledger.ledger_group_id)
  );

  const [showPostExpenseDialog, setShowPostExpenseDialog] = useState(false);
  const [showCreateLedgerDialog, setShowCreateLedgerDialog] = useState(false);
  const [showCreateAssetLedgerDialog, setShowCreateAssetLedgerDialog] = useState(false);
  const [showCreateChargeLedgerDialog, setShowCreateChargeLedgerDialog] = useState(false);
  const [showSpendingTypeForm, setShowSpendingTypeForm] = useState(false);
  const [showLedgerGroupForm, setShowLedgerGroupForm] = useState(false);
  const [pendingLedgerName, setPendingLedgerName] = useState("");
  const [pendingAssetLedgerName, setPendingAssetLedgerName] = useState("");
  const [pendingChargeLedgerName, setPendingChargeLedgerName] = useState("");
  const [pendingLedgerGroupName, setPendingLedgerGroupName] = useState("");
  const [creatingLedgerGroupFromForm, setCreatingLedgerGroupFromForm] = useState<"expense" | "asset" | "charge" | null>(null);
  const [spendingTypeFormData, setSpendingTypeFormData] = useState({
    name: "",
  });
  const [ledgerGroupFormData, setLedgerGroupFormData] = useState<LedgerGroupCreate>({
    name: "",
    parent_ledger_group_id: 0,
    category: "other",
  });
  const [formData, setFormData] = useState({
    transaction_date: new Date(),
    expense_ledger_id: 0,
    paying_account_id: 0,
    charge_ledger_id: 0,
    charge_amount: "",
    amount: "",
    reference: "",
  });
  const [ledgerFormData, setLedgerFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: expenseGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [assetLedgerFormData, setAssetLedgerFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: assetGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [chargeLedgerFormData, setChargeLedgerFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: chargeGroups[0]?.id || 0,
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
  const filteredExpenseTransactions = useMemo(() => {
    return expenseTransactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transaction_date);
      return transactionDate >= startDate && transactionDate <= endDate;
    });
  }, [expenseTransactions, startDate, endDate]);

  // Create a map of ledger_id to ledger name
  const ledgerMap = useMemo(() => {
    const map = new Map<number, string>();
    ledgers.forEach((ledger) => {
      map.set(ledger.id, ledger.name);
    });
    return map;
  }, [ledgers]);

  // Fetch transaction details for filtered expense transactions to get items
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

  // Group expenses by ledger (expense ledgers only, excluding charges)
  const expensesByLedger = useMemo(() => {
    const ledgerTotals = new Map<number, number>();

    // Process transactions with items
    if (expenseTransactionsWithItems.length > 0) {
      expenseTransactionsWithItems.forEach((transaction) => {
        // Find all DEBIT items that are expense ledgers (not charge ledgers)
        transaction.items.forEach((item) => {
          if (item.entry_type === "DEBIT") {
            // Check if this ledger is an expense ledger (not a charge ledger)
            const ledger = ledgers.find(l => l.id === item.ledger_id);
            if (ledger && expenseLedgers.some(el => el.id === ledger.id)) {
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

    // Calculate total expenses (for percentage calculation)
    const totalExpenses = Array.from(ledgerTotals.values()).reduce(
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
            totalExpenses > 0
              ? Number(((total / totalExpenses) * 100).toFixed(1))
              : 0,
        };
      })
      .sort((a, b) => b.value - a.value);

    return result;
  }, [
    expenseTransactionsWithItems,
    ledgerMap,
    ledgers,
    expenseLedgers,
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

  // Don't show loading screen if we're just checking auth - only show if actually loading
  if (!isAuthenticated && !isLoading) {
    return null; // Will redirect, don't render anything
  }

  // Format date to YYYY-MM-DD without timezone issues
  const formatDateForAPI = (date: Date | null): string => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handlePostExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.expense_ledger_id) {
      setError("Please select an expense category");
      return;
    }

    if (!formData.paying_account_id) {
      setError("Please select a paying account");
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
    const chargeAmount = formData.charge_ledger_id && formData.charge_amount
      ? parseFloat(formData.charge_amount)
      : 0;
    const transactionDate = formatDateForAPI(formData.transaction_date);

    // Validate charge amount if charge ledger is selected
    if (formData.charge_ledger_id && (!formData.charge_amount || chargeAmount <= 0)) {
      setError("Please enter a valid charge amount");
      return;
    }

    // Build transaction items
    const items: Array<{
      ledger_id: number;
      entry_type: "DEBIT" | "CREDIT";
      amount: number;
    }> = [];

    // Debit: Expense ledger
    items.push({
      ledger_id: formData.expense_ledger_id,
      entry_type: "DEBIT",
      amount: amount,
    });

    // If charge ledger is selected and charge amount is provided, add it as a debit
    if (formData.charge_ledger_id && chargeAmount > 0) {
      items.push({
        ledger_id: formData.charge_ledger_id,
        entry_type: "DEBIT",
        amount: chargeAmount,
      });
    }

    // Credit: Asset ledger (paying account) - total of expense + charge
    const totalCreditAmount = amount + chargeAmount;
    items.push({
      ledger_id: formData.paying_account_id,
      entry_type: "CREDIT",
      amount: totalCreditAmount,
    });

    try {
      // Create transaction with double-entry accounting for expense:
      // Debit: Expense ledger (increases expense)
      // Debit: Charge ledger (if selected, increases charge expense)
      // Credit: Asset ledger (decreases asset - cash/bank account)
      await createTransactionMutation.mutateAsync({
        transaction_date: transactionDate,
        reference:
          formData.reference && formData.reference.trim() !== ""
            ? formData.reference.trim()
            : null,
        transaction_type: "MONEY_PAID",
        total_amount: totalCreditAmount,
        items: items,
      });

      // Reset form and close dialog
      setFormData({
        transaction_date: new Date(),
        expense_ledger_id: 0,
        paying_account_id: 0,
        charge_ledger_id: 0,
        charge_amount: "",
        amount: "",
        reference: "",
      });
      setShowPostExpenseDialog(false);
      alert("Expense posted successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post expense");
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
      
      // Set the newly created ledger as the selected expense category
      setFormData({
        ...formData,
        expense_ledger_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setLedgerFormData({
        name: "",
        ledger_group_id: expenseGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateLedgerDialog(false);
      setPendingLedgerName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ledger");
    }
  };

  const handleSpendingTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!spendingTypeFormData.name.trim()) {
      setError("Spending category name is required");
      return;
    }

    try {
      const newSpendingType = await createSpendingTypeMutation.mutateAsync({
        name: spendingTypeFormData.name,
      });
      
      // Set the newly created spending type as selected
      setLedgerFormData({
        ...ledgerFormData,
        spending_type_id: newSpendingType.id,
      });
      
      setShowSpendingTypeForm(false);
      setSpendingTypeFormData({
        name: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create spending category");
    }
  };

  const handleCreateNewLedger = (searchTerm: string) => {
    setPendingLedgerName(searchTerm);
    setLedgerFormData({
      name: searchTerm,
      ledger_group_id: expenseGroups[0]?.id || 0,
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

  const handleCreateNewChargeLedger = (searchTerm: string) => {
    setPendingChargeLedgerName(searchTerm);
    setChargeLedgerFormData({
      name: searchTerm,
      ledger_group_id: chargeGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateChargeLedgerDialog(true);
  };

  const handleCreateAssetLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!assetLedgerFormData.name.trim()) {
      setError("Account name is required");
      return;
    }

    if (!assetLedgerFormData.ledger_group_id) {
      setError("Please select an account group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(assetLedgerFormData);
      
      // Set the newly created ledger as the selected paying account
      setFormData({
        ...formData,
        paying_account_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setAssetLedgerFormData({
        name: "",
        ledger_group_id: assetGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateAssetLedgerDialog(false);
      setPendingAssetLedgerName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    }
  };

  const handleCreateChargeLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!chargeLedgerFormData.name.trim()) {
      setError("Ledger name is required");
      return;
    }

    if (!chargeLedgerFormData.ledger_group_id) {
      setError("Please select a ledger group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(chargeLedgerFormData);
      
      // Set the newly created ledger as the selected transaction charges ledger
      setFormData({
        ...formData,
        charge_ledger_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setChargeLedgerFormData({
        name: "",
        ledger_group_id: chargeGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateChargeLedgerDialog(false);
      setPendingChargeLedgerName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transaction charges ledger");
    }
  };

  const handleLedgerGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ledgerGroupFormData.name.trim()) {
      setError("Ledger group name is required");
      return;
    }

    if (!ledgerGroupFormData.parent_ledger_group_id) {
      setError("Please select a parent ledger group");
      return;
    }

    try {
      const newLedgerGroup = await createLedgerGroupMutation.mutateAsync(ledgerGroupFormData);
      
      // Auto-select the newly created ledger group in the appropriate form
      if (creatingLedgerGroupFromForm === "expense") {
        setLedgerFormData({
          ...ledgerFormData,
          ledger_group_id: newLedgerGroup.id,
        });
      } else if (creatingLedgerGroupFromForm === "asset") {
        setAssetLedgerFormData({
          ...assetLedgerFormData,
          ledger_group_id: newLedgerGroup.id,
        });
      } else if (creatingLedgerGroupFromForm === "charge") {
        setChargeLedgerFormData({
          ...chargeLedgerFormData,
          ledger_group_id: newLedgerGroup.id,
        });
      }
      
      setShowLedgerGroupForm(false);
      setLedgerGroupFormData({
        name: "",
        parent_ledger_group_id: 0,
        category: "other",
      });
      setPendingLedgerGroupName("");
      setCreatingLedgerGroupFromForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ledger group");
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
                Expenses
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Record and manage expense transactions
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
                onClick={() => setShowPostExpenseDialog(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                + Post Expense
              </button>
            </div>
          </div>

          {/* Expenses by Ledger Chart */}
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 md:p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3">
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  Expenses by Ledger
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
                <p className="text-zinc-600 dark:text-zinc-400">Loading expense breakdown...</p>
              </div>
            ) : expensesByLedger.length > 0 ? (
              <div className="flex flex-col gap-8">
                {/* Pie Chart */}
                <div className="flex items-center justify-center min-h-0 p-0 sm:p-2 md:p-2">
                  <div className="w-full h-[450px] sm:h-[550px] md:h-[650px] lg:h-[700px] xl:h-[750px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 0, right: 15, bottom: 10, left: 15 }}>
                        <Pie
                          data={expensesByLedger}
                          cx="50%"
                          cy="40%"
                          labelLine={true}
                          label={(props: any) => {
                            const entry = expensesByLedger[props.index];
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
                        {expensesByLedger.map((entry, index) => (
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
                    {expensesByLedger.map((item, index) => (
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
                    ? "No expense transactions yet. Start recording expenses to see expense breakdown."
                    : expenseTransactionsWithItems.length === 0
                    ? "Loading transaction details..."
                    : expenseLedgers.length === 0
                    ? "No expense ledgers found. Create expense ledgers in the Accounts page."
                    : "No expenses found in the selected transactions."}
                </p>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Post Expense Dialog */}
      <Dialog
        isOpen={showPostExpenseDialog}
        onClose={() => {
          setShowPostExpenseDialog(false);
          setError(null);
        }}
        title="Post Expense"
        size="lg"
      >
        <form onSubmit={handlePostExpense} className="space-y-4">
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
                Narration (optional)
              </label>
              <input
                type="text"
                value={formData.reference}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    reference: e.target.value,
                  })
                }
                placeholder="What is this expense about?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Expense Category *
              </label>
              <SearchableSelect
                options={expenseLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.expense_ledger_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    expense_ledger_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select expense category"
                searchPlaceholder="Type to search expense categories..."
                required
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewLedger}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" expense ledger`}
              />
              {expenseLedgers.length === 0 && !ledgersLoading && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  No expense accounts found. Create one in{" "}
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
                Paying Account *
              </label>
              <SearchableSelect
                options={assetLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.paying_account_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    paying_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select paying account"
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

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Transaction Charges Ledger (Optional)
              </label>
              <SearchableSelect
                options={chargeLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.charge_ledger_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    charge_ledger_id:
                      typeof value === "number" ? value : parseInt(value as string),
                    charge_amount: typeof value === "number" && value === 0 ? "" : formData.charge_amount,
                  })
                }
                placeholder="Select transaction charges ledger (optional)"
                searchPlaceholder="Type to search transaction charges ledgers..."
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewChargeLedger}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" transaction charges ledger`}
              />
            </div>

            {formData.charge_ledger_id > 0 && (
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Transaction Charges Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.charge_amount}
                  onChange={(e) =>
                    setFormData({ ...formData, charge_amount: e.target.value })
                  }
                  required
                  placeholder="0.00"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            )}
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
                setShowPostExpenseDialog(false);
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
              {createTransactionMutation.isPending ? "Posting..." : "Post Expense"}
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
        title="Create Expense Ledger"
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
              placeholder="e.g., Office Supplies, Travel Expenses"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Group *
            </label>
            <SearchableSelect
              options={expenseGroups.map((group) => ({
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
              onCreateNew={(searchTerm) => {
                setPendingLedgerGroupName(searchTerm);
                setCreatingLedgerGroupFromForm("expense");
                setLedgerGroupFormData({
                  name: searchTerm,
                  parent_ledger_group_id: 0,
                  category: "expenses",
                });
                setShowLedgerGroupForm(true);
              }}
              createNewLabel={(searchTerm) => `Create "${searchTerm}" ledger group`}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Spending Category *
            </label>
            <SearchableSelect
              options={spendingTypes.map((type) => ({
                value: type.id,
                label: type.name,
                searchText: type.name,
              }))}
              value={ledgerFormData.spending_type_id || 0}
              onChange={(value) =>
                setLedgerFormData({
                  ...ledgerFormData,
                  spending_type_id:
                    typeof value === "number" && value !== 0
                      ? value
                      : typeof value === "string" && value !== "0"
                      ? parseInt(value)
                      : null,
                })
              }
              placeholder="Select spending category"
              searchPlaceholder="Type to search spending categories..."
              required
              className="w-full"
              onCreateNew={(searchTerm) => {
                setSpendingTypeFormData({ name: searchTerm });
                setShowSpendingTypeForm(true);
              }}
              createNewLabel={(searchTerm) => `Create "${searchTerm}" spending category`}
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
        title="Create Account"
        size="lg"
      >
        <form onSubmit={handleCreateAssetLedger} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Name *
            </label>
            <input
              type="text"
              value={assetLedgerFormData.name}
              onChange={(e) =>
                setAssetLedgerFormData({ ...assetLedgerFormData, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Equity Bank, M-Pesa, Cash"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Group *
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
              placeholder="Select an account group"
              searchPlaceholder="Type to search account groups..."
              required
              className="w-full"
              onCreateNew={(searchTerm) => {
                setPendingLedgerGroupName(searchTerm);
                setCreatingLedgerGroupFromForm("asset");
                setLedgerGroupFormData({
                  name: searchTerm,
                  parent_ledger_group_id: 0,
                  category: "bank_accounts",
                });
                setShowLedgerGroupForm(true);
              }}
              createNewLabel={(searchTerm) => `Create "${searchTerm}" ledger group`}
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
              {createLedgerMutation.isPending ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create Spending Category Dialog */}
      <Dialog
        isOpen={showSpendingTypeForm}
        onClose={() => setShowSpendingTypeForm(false)}
        title="Create Spending Category"
        size="md"
      >
        <form onSubmit={handleSpendingTypeSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Name *
            </label>
            <input
              type="text"
              value={spendingTypeFormData.name}
              onChange={(e) =>
                setSpendingTypeFormData({
                  ...spendingTypeFormData,
                  name: e.target.value,
                })
              }
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Food, Transport"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={createSpendingTypeMutation.isPending}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {createSpendingTypeMutation.isPending
                ? "Creating..."
                : "Create Spending Category"}
            </button>
            <button
              type="button"
              onClick={() => setShowSpendingTypeForm(false)}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create Charge Ledger Dialog */}
      <Dialog
        isOpen={showCreateChargeLedgerDialog}
        onClose={() => {
          setShowCreateChargeLedgerDialog(false);
          setError(null);
          setPendingChargeLedgerName("");
        }}
        title="Create Transaction Charges Ledger"
        size="lg"
      >
        <form onSubmit={handleCreateChargeLedger} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Name *
            </label>
            <input
              type="text"
              value={chargeLedgerFormData.name}
              onChange={(e) =>
                setChargeLedgerFormData({ ...chargeLedgerFormData, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Bank Charges, Transaction Fees"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Group *
            </label>
            <SearchableSelect
              options={chargeGroups.map((group) => ({
                value: group.id,
                label: group.name,
                searchText: group.parent_ledger_group
                  ? `${group.name} ${group.parent_ledger_group.name}`
                  : group.name,
              }))}
              value={chargeLedgerFormData.ledger_group_id || 0}
              onChange={(value) =>
                setChargeLedgerFormData({
                  ...chargeLedgerFormData,
                  ledger_group_id:
                    typeof value === "number" ? value : parseInt(value as string),
                })
              }
              placeholder="Select a ledger group"
              searchPlaceholder="Type to search ledger groups..."
              required
              className="w-full"
              onCreateNew={(searchTerm) => {
                setPendingLedgerGroupName(searchTerm);
                setCreatingLedgerGroupFromForm("charge");
                setLedgerGroupFormData({
                  name: searchTerm,
                  parent_ledger_group_id: 0,
                  category: "bank_charges",
                });
                setShowLedgerGroupForm(true);
              }}
              createNewLabel={(searchTerm) => `Create "${searchTerm}" ledger group`}
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
                setShowCreateChargeLedgerDialog(false);
                setError(null);
                setPendingChargeLedgerName("");
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

      {/* Create Ledger Group Dialog */}
      <Dialog
        isOpen={showLedgerGroupForm}
        onClose={() => {
          setShowLedgerGroupForm(false);
          setLedgerGroupFormData({
            name: "",
            parent_ledger_group_id: 0,
            category: "other",
          });
          setPendingLedgerGroupName("");
          setCreatingLedgerGroupFromForm(null);
        }}
        title="Create Ledger Group"
        size="lg"
      >
        <form onSubmit={handleLedgerGroupSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Name *
              </label>
              <input
                type="text"
                value={ledgerGroupFormData.name}
                onChange={(e) =>
                  setLedgerGroupFormData({
                    ...ledgerGroupFormData,
                    name: e.target.value,
                  })
                }
                required
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="e.g., Bank Accounts, Cash Accounts"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Parent Ledger Group *
              </label>
              <SearchableSelect
                options={parentGroups.map((group) => ({
                  value: group.id,
                  label: group.name,
                  searchText: group.name,
                }))}
                value={ledgerGroupFormData.parent_ledger_group_id || 0}
                onChange={(value) =>
                  setLedgerGroupFormData({
                    ...ledgerGroupFormData,
                    parent_ledger_group_id: typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select a parent ledger group"
                searchPlaceholder="Type to search parent groups..."
                required
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Category *
              </label>
              <select
                value={ledgerGroupFormData.category}
                onChange={(e) =>
                  setLedgerGroupFormData({
                    ...ledgerGroupFormData,
                    category: e.target.value as LedgerGroupCreate["category"],
                  })
                }
                required
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="incomes">Incomes</option>
                <option value="expenses">Expenses</option>
                <option value="bank_accounts">Bank Accounts</option>
                <option value="cash_accounts">Cash Accounts</option>
                <option value="bank_charges">Bank Charges</option>
                <option value="other">Other</option>
              </select>
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
                setShowLedgerGroupForm(false);
                setLedgerGroupFormData({
                  name: "",
                  parent_ledger_group_id: 0,
                  category: "other",
                });
                setPendingLedgerGroupName("");
                setCreatingLedgerGroupFromForm(null);
              }}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createLedgerGroupMutation.isPending}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {createLedgerGroupMutation.isPending ? "Creating..." : "Create Ledger Group"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

