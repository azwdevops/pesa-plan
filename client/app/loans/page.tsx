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
  useParentLedgerGroups,
  useCreateLedgerGroup,
} from "@/lib/hooks/use-accounts";
import { useCreateTransaction, useTransactions } from "@/lib/hooks/use-transactions";
import { useQuery } from "@tanstack/react-query";
import { getTransaction } from "@/lib/api/transactions";
import type { LedgerCreate, LedgerGroupCreate } from "@/lib/api/accounts";

export default function LoansPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], isLoading: ledgersLoading, refetch: refetchLedgers } = useLedgers();
  const { data: groups = [], refetch: refetchGroups } = useLedgerGroups();
  const { data: parentGroups = [], refetch: refetchParentGroups } = useParentLedgerGroups();
  const { token } = useAuth();
  const { data: allTransactions = [], refetch: refetchTransactions } = useTransactions();
  const createTransactionMutation = useCreateTransaction();
  const createLedgerMutation = useCreateLedger();
  const createLedgerGroupMutation = useCreateLedgerGroup();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Find "Long Term Liabilities" parent group
  const longTermLiabilitiesParent = parentGroups.find(
    (pg) => pg.name === "Long Term Liabilities"
  );

  // Filter ledger groups that belong to "Long Term Liabilities"
  const longTermLiabilityGroups = groups.filter(
    (group) => group.parent_ledger_group_id === longTermLiabilitiesParent?.id
  );

  // Filter ledgers: asset ledgers (for receiving account), expense ledgers (for interest), and long-term liability ledgers
  const assetGroups = groups.filter(
    (group) =>
      group.category === "bank_accounts" ||
      group.category === "cash_accounts"
  );
  const expenseGroups = groups.filter(
    (group) => group.category === "expenses"
  );

  const assetLedgers = ledgers.filter((ledger) =>
    assetGroups.some((group) => group.id === ledger.ledger_group_id)
  );
  const expenseLedgers = ledgers.filter((ledger) =>
    expenseGroups.some((group) => group.id === ledger.ledger_group_id)
  );
  // Filter to only long-term liability ledgers
  const longTermLiabilityLedgers = ledgers.filter((ledger) =>
    longTermLiabilityGroups.some((group) => group.id === ledger.ledger_group_id)
  );

  const [showPostLoanDialog, setShowPostLoanDialog] = useState(false);
  const [showRepayLoanDialog, setShowRepayLoanDialog] = useState(false);
  const [showCreateReceivingAccountDialog, setShowCreateReceivingAccountDialog] = useState(false);
  const [showCreateLiabilityDialog, setShowCreateLiabilityDialog] = useState(false);
  const [showCreateInterestExpenseDialog, setShowCreateInterestExpenseDialog] = useState(false);
  const [showLedgerGroupForm, setShowLedgerGroupForm] = useState(false);
  const [pendingReceivingAccountName, setPendingReceivingAccountName] = useState("");
  const [pendingLiabilityName, setPendingLiabilityName] = useState("");
  const [pendingInterestExpenseName, setPendingInterestExpenseName] = useState("");
  const [pendingLedgerGroupName, setPendingLedgerGroupName] = useState("");
  const [creatingLedgerGroupFromForm, setCreatingLedgerGroupFromForm] = useState<"receiving" | "liability" | "interest" | null>(null);
  const [ledgerGroupFormData, setLedgerGroupFormData] = useState<LedgerGroupCreate>({
    name: "",
    parent_ledger_group_id: 0,
    category: "other",
  });
  const [formData, setFormData] = useState({
    transaction_date: new Date(),
    receiving_account_id: 0,
    liability_account_id: 0,
    interest_expense_account_id: 0,
    principal_amount: "",
    interest_amount: "",
    reference: "",
  });
  const [repayLoanFormData, setRepayLoanFormData] = useState({
    transaction_date: new Date(),
    paying_account_id: 0,
    liability_account_id: 0,
    interest_expense_account_id: 0,
    principal_amount: "",
    interest_amount: "",
    reference: "",
  });
  const [receivingAccountFormData, setReceivingAccountFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: assetGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [liabilityFormData, setLiabilityFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: longTermLiabilityGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [interestExpenseFormData, setInterestExpenseFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: expenseGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

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

  const handlePostLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.receiving_account_id) {
      setError("Please select a receiving account");
      return;
    }

    if (!formData.liability_account_id) {
      setError("Please select a liability account");
      return;
    }

    if (!formData.principal_amount || parseFloat(formData.principal_amount) <= 0) {
      setError("Please enter a valid principal amount");
      return;
    }

    if (!formData.interest_amount || parseFloat(formData.interest_amount) < 0) {
      setError("Please enter a valid interest amount (0 or greater)");
      return;
    }

    const interestAmount = parseFloat(formData.interest_amount);
    if (interestAmount > 0 && !formData.interest_expense_account_id) {
      setError("Please select an interest expense account when interest amount is greater than 0");
      return;
    }

    if (!formData.transaction_date) {
      setError("Please select a transaction date");
      return;
    }

    const principalAmount = parseFloat(formData.principal_amount);
    const totalLiability = principalAmount + interestAmount;
    const transactionDate = formatDateForAPI(formData.transaction_date);

    // Build transaction items for loan:
    // Dr: Receiving account (principal)
    // Cr: Liability account (principal + interest)
    // Dr: Interest expense account (interest)
    const items: Array<{
      ledger_id: number;
      entry_type: "DEBIT" | "CREDIT";
      amount: number;
    }> = [];

    // Debit: Receiving account (principal)
    items.push({
      ledger_id: formData.receiving_account_id,
      entry_type: "DEBIT",
      amount: principalAmount,
    });

    // Credit: Liability account (total = principal + interest)
    items.push({
      ledger_id: formData.liability_account_id,
      entry_type: "CREDIT",
      amount: totalLiability,
    });

    // Debit: Interest expense account (interest)
    if (interestAmount > 0) {
      items.push({
        ledger_id: formData.interest_expense_account_id,
        entry_type: "DEBIT",
        amount: interestAmount,
      });
    }

    try {
      // Create transaction with double-entry accounting for loan:
      // Debit: Receiving account (principal) - increases asset
      // Credit: Liability account (principal + interest) - increases liability
      // Debit: Interest expense account (interest) - increases expense
      // Total debits = principal + interest, Total credits = principal + interest (balanced)
      await createTransactionMutation.mutateAsync({
        transaction_date: transactionDate,
        reference:
          formData.reference && formData.reference.trim() !== ""
            ? formData.reference.trim()
            : null,
        transaction_type: "JOURNAL",
        total_amount: totalLiability,
        items: items,
      });

      // Reset form and close dialog
      setFormData({
        transaction_date: new Date(),
        receiving_account_id: 0,
        liability_account_id: 0,
        interest_expense_account_id: 0,
        principal_amount: "",
        interest_amount: "",
        reference: "",
      });
      setShowPostLoanDialog(false);
      alert("Loan recorded successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record loan");
    }
  };

  const handleCreateReceivingAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!receivingAccountFormData.name.trim()) {
      setError("Account name is required");
      return;
    }

    if (!receivingAccountFormData.ledger_group_id) {
      setError("Please select an account group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(receivingAccountFormData);
      
      // Set the newly created ledger as the selected receiving account
      setFormData({
        ...formData,
        receiving_account_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setReceivingAccountFormData({
        name: "",
        ledger_group_id: assetGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateReceivingAccountDialog(false);
      setPendingReceivingAccountName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    }
  };

  const handleCreateLiability = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!liabilityFormData.name.trim()) {
      setError("Liability account name is required");
      return;
    }

    if (!liabilityFormData.ledger_group_id) {
      setError("Please select a ledger group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(liabilityFormData);
      
      // Set the newly created ledger as the selected liability account
      setFormData({
        ...formData,
        liability_account_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setLiabilityFormData({
        name: "",
        ledger_group_id: longTermLiabilityGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateLiabilityDialog(false);
      setPendingLiabilityName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create liability account");
    }
  };

  const handleCreateInterestExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!interestExpenseFormData.name.trim()) {
      setError("Interest expense account name is required");
      return;
    }

    if (!interestExpenseFormData.ledger_group_id) {
      setError("Please select a ledger group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(interestExpenseFormData);
      
      // Set the newly created ledger as the selected interest expense account
      setFormData({
        ...formData,
        interest_expense_account_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setInterestExpenseFormData({
        name: "",
        ledger_group_id: expenseGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateInterestExpenseDialog(false);
      setPendingInterestExpenseName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create interest expense account");
    }
  };

  const handleCreateNewReceivingAccount = (searchTerm: string) => {
    setPendingReceivingAccountName(searchTerm);
    setReceivingAccountFormData({
      name: searchTerm,
      ledger_group_id: assetGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateReceivingAccountDialog(true);
  };

  const handleCreateNewLiability = (searchTerm: string) => {
    setPendingLiabilityName(searchTerm);
    setLiabilityFormData({
      name: searchTerm,
      ledger_group_id: longTermLiabilityGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateLiabilityDialog(true);
  };

  // Fetch all transactions with items to calculate liability balances
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

  // Calculate liability balances (for liabilities: credit - debit)
  const liabilitiesByLedger = useMemo(() => {
    const ledgerBalances = new Map<number, number>();

    // Process all transactions to calculate balances
    if (transactionsWithItems.length > 0) {
      transactionsWithItems.forEach((transaction) => {
        transaction.items.forEach((item) => {
          // Check if this ledger is a long-term liability ledger
          const ledger = ledgers.find(l => l.id === item.ledger_id);
          if (ledger && longTermLiabilityLedgers.some(ltl => ltl.id === ledger.id)) {
            const amount =
              typeof item.amount === "string"
                ? parseFloat(item.amount)
                : Number(item.amount) || 0;

            const existing = ledgerBalances.get(item.ledger_id) || 0;
            // For liabilities: CREDIT increases balance, DEBIT decreases balance
            if (item.entry_type === "CREDIT") {
              ledgerBalances.set(item.ledger_id, existing + amount);
            } else if (item.entry_type === "DEBIT") {
              ledgerBalances.set(item.ledger_id, existing - amount);
            }
          }
        });
      });
    }

    // Calculate total liabilities (for percentage calculation)
    const totalLiabilities = Array.from(ledgerBalances.values())
      .filter(balance => balance > 0) // Only show positive balances (outstanding liabilities)
      .reduce((sum, balance) => sum + balance, 0);

    // Build result array with ledger names, only including positive balances
    const result = Array.from(ledgerBalances.entries())
      .filter(([_, balance]) => balance > 0) // Only show outstanding liabilities
      .map(([ledgerId, balance]) => {
        const ledger = ledgers.find(l => l.id === ledgerId);
        return {
          ledger_id: ledgerId,
          name: ledger?.name || `Ledger ${ledgerId}`,
          value: balance,
          percentage: totalLiabilities > 0 ? (balance / totalLiabilities) * 100 : 0,
        };
      })
      .sort((a, b) => b.value - a.value); // Sort by balance descending

    return result;
  }, [transactionsWithItems, ledgers, longTermLiabilityLedgers]);

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

  const handleCreateNewInterestExpense = (searchTerm: string) => {
    setPendingInterestExpenseName(searchTerm);
    setInterestExpenseFormData({
      name: searchTerm,
      ledger_group_id: expenseGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateInterestExpenseDialog(true);
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
      if (creatingLedgerGroupFromForm === "receiving") {
        setReceivingAccountFormData({
          ...receivingAccountFormData,
          ledger_group_id: newLedgerGroup.id,
        });
      } else if (creatingLedgerGroupFromForm === "liability") {
        setLiabilityFormData({
          ...liabilityFormData,
          ledger_group_id: newLedgerGroup.id,
        });
      } else if (creatingLedgerGroupFromForm === "interest") {
        setInterestExpenseFormData({
          ...interestExpenseFormData,
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

  const handleRepayLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!repayLoanFormData.paying_account_id) {
      setError("Please select a paying account");
      return;
    }

    if (!repayLoanFormData.liability_account_id) {
      setError("Please select a liability account");
      return;
    }

    if (!repayLoanFormData.principal_amount || parseFloat(repayLoanFormData.principal_amount) <= 0) {
      setError("Please enter a valid principal amount");
      return;
    }

    const principalAmount = parseFloat(repayLoanFormData.principal_amount);
    const interestAmount = repayLoanFormData.interest_amount
      ? parseFloat(repayLoanFormData.interest_amount)
      : 0;

    if (interestAmount < 0) {
      setError("Interest amount cannot be negative");
      return;
    }

    const totalPayment = principalAmount + interestAmount;

    // Format date
    const transactionDate = formatDateForAPI(repayLoanFormData.transaction_date);

    // Build transaction items for loan repayment:
    // Debit: Liability account (principal) - decreases liability
    // Debit: Interest expense account (interest, if any) - increases expense
    // Credit: Paying account (total payment) - decreases asset
    const items = [
      {
        ledger_id: repayLoanFormData.liability_account_id,
        entry_type: "DEBIT" as const,
        amount: principalAmount,
      },
      {
        ledger_id: repayLoanFormData.paying_account_id,
        entry_type: "CREDIT" as const,
        amount: totalPayment,
      },
    ];

    // Add interest expense if provided
    if (interestAmount > 0) {
      if (!repayLoanFormData.interest_expense_account_id) {
        setError("Please select an interest expense account when interest amount is provided");
        return;
      }
      items.push({
        ledger_id: repayLoanFormData.interest_expense_account_id,
        entry_type: "DEBIT" as const,
        amount: interestAmount,
      });
    }

    try {
      // Create transaction with double-entry accounting for loan repayment:
      // Debit: Liability account (principal) - decreases liability
      // Debit: Interest expense account (interest, if any) - increases expense
      // Credit: Paying account (total payment) - decreases asset
      // Total debits = principal + interest, Total credits = principal + interest (balanced)
      await createTransactionMutation.mutateAsync({
        transaction_date: transactionDate,
        reference:
          repayLoanFormData.reference && repayLoanFormData.reference.trim() !== ""
            ? repayLoanFormData.reference.trim()
            : null,
        transaction_type: "JOURNAL",
        total_amount: totalPayment,
        items: items,
      });

      // Reset form and close dialog
      setRepayLoanFormData({
        transaction_date: new Date(),
        paying_account_id: 0,
        liability_account_id: 0,
        interest_expense_account_id: 0,
        principal_amount: "",
        interest_amount: "",
        reference: "",
      });
      setShowRepayLoanDialog(false);
      alert("Loan repayment recorded successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record loan repayment");
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
                Long Term Liabilities
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Record and manage long-term liability transactions
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
                onClick={() => setShowRepayLoanDialog(true)}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Repay Loan
              </button>
              <button
                onClick={() => setShowPostLoanDialog(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                + Record Loan
              </button>
            </div>
          </div>

          {/* Long Term Liabilities by Ledger Chart */}
          {liabilitiesByLedger.length > 0 && (
            <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 md:p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3">
              <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                Long Term Liabilities by Ledger
              </h2>
            </div>

            <div className="flex flex-col">
              <div className="h-[450px] sm:h-[550px] md:h-[650px] lg:h-[700px] xl:h-[750px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 15, bottom: 10, left: 15 }}>
                    <Pie
                      data={liabilitiesByLedger}
                      cx="50%"
                      cy="40%"
                      labelLine={true}
                      label={(props: any) => {
                        const entry = liabilitiesByLedger[props.index];
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
                      {liabilitiesByLedger.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined) => [
                        `KSh ${(value || 0).toLocaleString("en-US", {
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
                {liabilitiesByLedger.map((entry, index) => (
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
          )}

        </div>
      </main>

      {/* Post Loan Dialog */}
      <Dialog
        isOpen={showPostLoanDialog}
        onClose={() => {
          setShowPostLoanDialog(false);
          setError(null);
        }}
        title="Record Loan"
        size="lg"
      >
        <form onSubmit={handlePostLoan} className="space-y-4">
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
                placeholder="What is this loan transaction about?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
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
                onCreateNew={handleCreateNewReceivingAccount}
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
                Liability Account *
              </label>
              <SearchableSelect
                options={longTermLiabilityLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.liability_account_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    liability_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select liability account"
                searchPlaceholder="Type to search accounts..."
                required
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewLiability}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" liability account`}
              />
              {longTermLiabilityLedgers.length === 0 && !ledgersLoading && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  No long-term liability accounts found. Create one in{" "}
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
                Interest Expense Account {parseFloat(formData.interest_amount || "0") > 0 ? "*" : "(Optional)"}
              </label>
              <SearchableSelect
                options={expenseLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.interest_expense_account_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    interest_expense_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select interest expense account"
                searchPlaceholder="Type to search expense accounts..."
                required={parseFloat(formData.interest_amount || "0") > 0}
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewInterestExpense}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" interest expense account`}
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
                Principal Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.principal_amount}
                onChange={(e) =>
                  setFormData({ ...formData, principal_amount: e.target.value })
                }
                required
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Interest Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.interest_amount}
                onChange={(e) =>
                  setFormData({ ...formData, interest_amount: e.target.value })
                }
                required
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Total liability will be: Principal + Interest
              </p>
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
                setShowPostLoanDialog(false);
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
              {createTransactionMutation.isPending ? "Recording..." : "Record Loan"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Repay Loan Dialog */}
      <Dialog
        isOpen={showRepayLoanDialog}
        onClose={() => {
          setShowRepayLoanDialog(false);
          setError(null);
        }}
        title="Repay Loan"
        size="lg"
      >
        <form onSubmit={handleRepayLoan} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Transaction Date *
              </label>
              <DatePicker
                selected={repayLoanFormData.transaction_date instanceof Date ? repayLoanFormData.transaction_date : new Date(repayLoanFormData.transaction_date)}
                onChange={(date: Date | null) => {
                  if (date) {
                    setRepayLoanFormData({
                      ...repayLoanFormData,
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
                value={repayLoanFormData.reference}
                onChange={(e) =>
                  setRepayLoanFormData({
                    ...repayLoanFormData,
                    reference: e.target.value,
                  })
                }
                placeholder="What is this loan repayment about?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
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
                value={repayLoanFormData.paying_account_id || 0}
                onChange={(value) =>
                  setRepayLoanFormData({
                    ...repayLoanFormData,
                    paying_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select paying account"
                searchPlaceholder="Type to search accounts..."
                required
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewReceivingAccount}
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
                Liability Account *
              </label>
              <SearchableSelect
                options={longTermLiabilityLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={repayLoanFormData.liability_account_id || 0}
                onChange={(value) =>
                  setRepayLoanFormData({
                    ...repayLoanFormData,
                    liability_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select liability account"
                searchPlaceholder="Type to search accounts..."
                required
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewLiability}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" liability account`}
              />
              {longTermLiabilityLedgers.length === 0 && !ledgersLoading && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  No long-term liability accounts found. Create one in{" "}
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
                Principal Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={repayLoanFormData.principal_amount}
                onChange={(e) =>
                  setRepayLoanFormData({
                    ...repayLoanFormData,
                    principal_amount: e.target.value,
                  })
                }
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Interest Amount (Optional)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={repayLoanFormData.interest_amount}
                onChange={(e) =>
                  setRepayLoanFormData({
                    ...repayLoanFormData,
                    interest_amount: e.target.value,
                  })
                }
                placeholder="0.00"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Interest Expense Account {parseFloat(repayLoanFormData.interest_amount || "0") > 0 ? "*" : "(Optional)"}
              </label>
              <SearchableSelect
                options={expenseLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={repayLoanFormData.interest_expense_account_id || 0}
                onChange={(value) =>
                  setRepayLoanFormData({
                    ...repayLoanFormData,
                    interest_expense_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select interest expense account"
                searchPlaceholder="Type to search accounts..."
                required={parseFloat(repayLoanFormData.interest_amount || "0") > 0}
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewInterestExpense}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" interest expense account`}
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
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowRepayLoanDialog(false);
                setError(null);
              }}
              className="rounded-lg border border-zinc-300 bg-white px-6 py-2 font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTransactionMutation.isPending}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {createTransactionMutation.isPending ? "Repaying..." : "Repay Loan"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create Receiving Account Dialog */}
      <Dialog
        isOpen={showCreateReceivingAccountDialog}
        onClose={() => {
          setShowCreateReceivingAccountDialog(false);
          setError(null);
          setPendingReceivingAccountName("");
        }}
        title="Create Receiving Account"
        size="lg"
      >
        <form onSubmit={handleCreateReceivingAccount} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Name *
            </label>
            <input
              type="text"
              value={receivingAccountFormData.name}
              onChange={(e) =>
                setReceivingAccountFormData({ ...receivingAccountFormData, name: e.target.value })
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
              value={receivingAccountFormData.ledger_group_id || 0}
              onChange={(value) =>
                setReceivingAccountFormData({
                  ...receivingAccountFormData,
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
                setCreatingLedgerGroupFromForm("receiving");
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
                setShowCreateReceivingAccountDialog(false);
                setError(null);
                setPendingReceivingAccountName("");
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

      {/* Create Liability Account Dialog */}
      <Dialog
        isOpen={showCreateLiabilityDialog}
        onClose={() => {
          setShowCreateLiabilityDialog(false);
          setError(null);
          setPendingLiabilityName("");
        }}
        title="Create Liability Account"
        size="lg"
      >
        <form onSubmit={handleCreateLiability} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Liability Account Name *
            </label>
            <input
              type="text"
              value={liabilityFormData.name}
              onChange={(e) =>
                setLiabilityFormData({ ...liabilityFormData, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Bank Loan, Personal Loan, Credit Card"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Group *
            </label>
            <SearchableSelect
              options={longTermLiabilityGroups.map((group) => ({
                value: group.id,
                label: group.name,
                searchText: group.parent_ledger_group
                  ? `${group.name} ${group.parent_ledger_group.name}`
                  : group.name,
              }))}
              value={liabilityFormData.ledger_group_id || 0}
              onChange={(value) =>
                setLiabilityFormData({
                  ...liabilityFormData,
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
                setCreatingLedgerGroupFromForm("liability");
                setLedgerGroupFormData({
                  name: searchTerm,
                  parent_ledger_group_id: longTermLiabilitiesParent?.id || 0,
                  category: "other",
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
                setShowCreateLiabilityDialog(false);
                setError(null);
                setPendingLiabilityName("");
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
              {createLedgerMutation.isPending ? "Creating..." : "Create Liability Account"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create Interest Expense Account Dialog */}
      <Dialog
        isOpen={showCreateInterestExpenseDialog}
        onClose={() => {
          setShowCreateInterestExpenseDialog(false);
          setError(null);
          setPendingInterestExpenseName("");
        }}
        title="Create Interest Expense Account"
        size="lg"
      >
        <form onSubmit={handleCreateInterestExpense} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Interest Expense Account Name *
            </label>
            <input
              type="text"
              value={interestExpenseFormData.name}
              onChange={(e) =>
                setInterestExpenseFormData({ ...interestExpenseFormData, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Interest Expense, Loan Interest"
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
              value={interestExpenseFormData.ledger_group_id || 0}
              onChange={(value) =>
                setInterestExpenseFormData({
                  ...interestExpenseFormData,
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
                setCreatingLedgerGroupFromForm("interest");
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

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setShowCreateInterestExpenseDialog(false);
                setError(null);
                setPendingInterestExpenseName("");
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
              {createLedgerMutation.isPending ? "Creating..." : "Create Interest Expense Account"}
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

