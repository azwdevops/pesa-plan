"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Dialog } from "@/components/Dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSidebar } from "@/contexts/SidebarContext";
import { useTrialBalance, useLedgerReport } from "@/lib/hooks/use-reports";
import { useParentLedgerGroups, useLedgers, useLedgerGroups } from "@/lib/hooks/use-accounts";
import { useUpdateTransaction, useDeleteTransaction, useTransaction } from "@/lib/hooks/use-transactions";
import { useCreateLedger, useCreateLedgerGroup } from "@/lib/hooks/use-accounts";
import { getTransaction } from "@/lib/api/transactions";
import type { TransactionWithItems, TransactionUpdate, TransactionItem } from "@/lib/api/transactions";
import type { LedgerCreate, LedgerGroupCreate } from "@/lib/api/accounts";
import Link from "next/link";

type PeriodType = "first_quarter" | "second_quarter" | "half_year" | "year" | "custom";

export default function ReportsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const [showTrialBalanceDialog, setShowTrialBalanceDialog] = useState(false);
  const [showTrialBalanceResults, setShowTrialBalanceResults] = useState(false);
  const [showLedgerReportDialog, setShowLedgerReportDialog] = useState(false);
  const [showLedgerReportResults, setShowLedgerReportResults] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>("first_quarter");
  const [ledgerPeriodType, setLedgerPeriodType] = useState<PeriodType>("first_quarter");
  const [year, setYear] = useState(new Date().getFullYear());
  const [ledgerYear, setLedgerYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [ledgerStartDate, setLedgerStartDate] = useState<Date | null>(null);
  const [ledgerEndDate, setLedgerEndDate] = useState<Date | null>(null);
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null);
  const { data: ledgers = [] } = useLedgers();
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<TransactionUpdate | null>(null);
  const [editItems, setEditItems] = useState<Array<{
    ledger_id: number;
    entry_type: "DEBIT" | "CREDIT";
    amount: number | string;
  }>>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [showCreateLedgerDialog, setShowCreateLedgerDialog] = useState(false);
  const [showLedgerGroupForm, setShowLedgerGroupForm] = useState(false);
  const [pendingLedgerName, setPendingLedgerName] = useState("");
  const [pendingLedgerGroupName, setPendingLedgerGroupName] = useState("");
  const [creatingLedgerGroupFromForm, setCreatingLedgerGroupFromForm] = useState(false);
  const [ledgerGroupFormData, setLedgerGroupFormData] = useState<LedgerGroupCreate>({
    name: "",
    parent_ledger_group_id: 0,
    category: "other",
  });
  const [ledgerFormData, setLedgerFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: 0,
    spending_type_id: null,
  });
  const { data: groups = [] } = useLedgerGroups();
  const { data: parentGroups = [] } = useParentLedgerGroups();
  const createLedgerMutation = useCreateLedger();
  const createLedgerGroupMutation = useCreateLedgerGroup();
  const updateTransactionMutation = useUpdateTransaction();
  const deleteTransactionMutation = useDeleteTransaction();
  const { token } = useAuth();

  // Initialize dates when dialog opens
  useEffect(() => {
    if (showTrialBalanceDialog && periodType !== "custom") {
      // Recalculate dates when dialog opens to ensure correct year
      const currentYear = year || new Date().getFullYear();
      calculateDates(periodType, currentYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTrialBalanceDialog, periodType, year]);

  useEffect(() => {
    if (showLedgerReportDialog && ledgerPeriodType !== "custom") {
      const currentYear = ledgerYear || new Date().getFullYear();
      calculateLedgerDates(ledgerPeriodType, currentYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLedgerReportDialog, ledgerPeriodType, ledgerYear]);

  // Format date to YYYY-MM-DD without timezone issues
  const formatDateForAPI = (date: Date | null): string => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const { data: trialBalance, isLoading: trialBalanceLoading } = useTrialBalance(
    formatDateForAPI(startDate),
    formatDateForAPI(endDate)
  );
  const ledgerReportQuery = useLedgerReport(
    selectedLedgerId,
    formatDateForAPI(ledgerStartDate),
    formatDateForAPI(ledgerEndDate)
  );
  const { data: ledgerReport, isLoading: ledgerReportLoading } = ledgerReportQuery;
  const refetchLedgerReport = ledgerReportQuery.refetch;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Don't show loading screen if we're just checking auth - only show if actually loading
  if (!isAuthenticated && !isLoading) {
    return null; // Will redirect, don't render anything
  }

  // Calculate dates based on period type and year
  const calculateDates = (period: PeriodType, selectedYear: number) => {
    let start: Date;
    let end: Date;

    switch (period) {
      case "first_quarter":
        start = new Date(selectedYear, 0, 1); // January 1 of selected year
        end = new Date(selectedYear, 2, 31); // March 31 of selected year
        break;
      case "second_quarter":
        start = new Date(selectedYear, 3, 1); // April 1 of selected year
        end = new Date(selectedYear, 5, 30); // June 30 of selected year
        break;
      case "half_year":
        start = new Date(selectedYear, 0, 1); // January 1 of selected year
        end = new Date(selectedYear, 5, 30); // June 30 of selected year
        break;
      case "year":
        start = new Date(selectedYear, 0, 1); // January 1 of selected year
        end = new Date(selectedYear, 11, 31); // December 31 of selected year
        break;
      default:
        return;
    }

    // Ensure dates are set correctly without timezone issues
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    setStartDate(start);
    setEndDate(end);
  };

  const handlePeriodChange = (period: PeriodType) => {
    setPeriodType(period);
    if (period !== "custom") {
      calculateDates(period, year);
    } else {
      setStartDate(null);
      setEndDate(null);
    }
  };

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    if (periodType !== "custom") {
      calculateDates(periodType, newYear);
    }
  };

  const handleGenerateTrialBalance = () => {
    if (periodType === "custom") {
      if (!startDate || !endDate) {
        alert("Please select both start and end dates");
        return;
      }
    }
    setShowTrialBalanceDialog(false);
    setShowTrialBalanceResults(true);
  };

  // Calculate dates for ledger report
  const calculateLedgerDates = (period: PeriodType, selectedYear: number) => {
    let start: Date;
    let end: Date;

    switch (period) {
      case "first_quarter":
        start = new Date(selectedYear, 0, 1);
        end = new Date(selectedYear, 2, 31);
        break;
      case "second_quarter":
        start = new Date(selectedYear, 3, 1);
        end = new Date(selectedYear, 5, 30);
        break;
      case "half_year":
        start = new Date(selectedYear, 0, 1);
        end = new Date(selectedYear, 5, 30);
        break;
      case "year":
        start = new Date(selectedYear, 0, 1);
        end = new Date(selectedYear, 11, 31);
        break;
      default:
        return;
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    setLedgerStartDate(start);
    setLedgerEndDate(end);
  };

  const handleLedgerPeriodChange = (period: PeriodType) => {
    setLedgerPeriodType(period);
    if (period !== "custom") {
      calculateLedgerDates(period, ledgerYear);
    } else {
      setLedgerStartDate(null);
      setLedgerEndDate(null);
    }
  };

  const handleLedgerYearChange = (newYear: number) => {
    setLedgerYear(newYear);
    if (ledgerPeriodType !== "custom") {
      calculateLedgerDates(ledgerPeriodType, newYear);
    }
  };

  const handleGenerateLedgerReport = () => {
    if (!selectedLedgerId) {
      alert("Please select a ledger");
      return;
    }
    if (ledgerPeriodType === "custom") {
      if (!ledgerStartDate || !ledgerEndDate) {
        alert("Please select both start and end dates");
        return;
      }
    }
    setShowLedgerReportDialog(false);
    setShowLedgerReportResults(true);
  };

  const handleEditTransaction = async (transactionId: number) => {
    if (!token) return;
    try {
      const transaction = await getTransaction(token, transactionId);
      const items = transaction.items.map(item => ({
        ledger_id: item.ledger_id,
        entry_type: item.entry_type,
        amount: Number(item.amount),
      }));
      setEditFormData({
        transaction_date: transaction.transaction_date,
        reference: transaction.reference,
        transaction_type: transaction.transaction_type,
      });
      setEditItems(items);
      setEditingTransactionId(transactionId);
      setEditError(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to load transaction");
    }
  };

  const handleDeleteTransaction = (transactionId: number) => {
    setDeletingTransactionId(transactionId);
  };

  const confirmDeleteTransaction = async () => {
    if (!deletingTransactionId) return;
    try {
      await deleteTransactionMutation.mutateAsync(deletingTransactionId);
      setDeletingTransactionId(null);
      await refetchLedgerReport();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to delete transaction");
    }
  };

  // Calculate totals for edit items
  const editTotalDebits = editItems.reduce((sum, item) => {
    if (item.entry_type === "DEBIT") {
      const amount = typeof item.amount === "string" ? parseFloat(item.amount) || 0 : item.amount;
      return sum + amount;
    }
    return sum;
  }, 0);

  const editTotalCredits = editItems.reduce((sum, item) => {
    if (item.entry_type === "CREDIT") {
      const amount = typeof item.amount === "string" ? parseFloat(item.amount) || 0 : item.amount;
      return sum + amount;
    }
    return sum;
  }, 0);

  const editIsBalanced = Math.abs(editTotalDebits - editTotalCredits) < 0.01;
  const editBalanceDifference = editTotalDebits - editTotalCredits;

  const handleAddEditItem = () => {
    setEditItems([...editItems, { ledger_id: 0, entry_type: "DEBIT", amount: "" }]);
  };

  const handleRemoveEditItem = (index: number) => {
    if (editItems.length > 1) {
      setEditItems(editItems.filter((_, i) => i !== index));
    }
  };

  const handleUpdateEditItem = (index: number, field: keyof typeof editItems[0], value: number | string | "DEBIT" | "CREDIT") => {
    const updated = [...editItems];
    const item = { ...updated[index] };
    
    if (field === "entry_type") {
      item.entry_type = value as "DEBIT" | "CREDIT";
    } else if (field === "ledger_id") {
      item.ledger_id = typeof value === "number" ? value : parseInt(value as string);
    } else if (field === "amount") {
      item.amount = value;
    }
    
    updated[index] = item;
    setEditItems(updated);
  };

  const handleCreateNewLedger = (searchTerm: string) => {
    setPendingLedgerName(searchTerm);
    setLedgerFormData({
      name: searchTerm,
      ledger_group_id: groups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateLedgerDialog(true);
  };

  const handleCreateLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!ledgerFormData.name.trim()) {
      setEditError("Ledger name is required");
      return;
    }

    if (!ledgerFormData.ledger_group_id) {
      setEditError("Please select a ledger group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(ledgerFormData);
      
      // Reset ledger form and close dialog
      setLedgerFormData({
        name: "",
        ledger_group_id: groups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateLedgerDialog(false);
      setPendingLedgerName("");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to create ledger");
    }
  };

  const handleLedgerGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!ledgerGroupFormData.name.trim()) {
      setEditError("Ledger group name is required");
      return;
    }

    if (!ledgerGroupFormData.parent_ledger_group_id) {
      setEditError("Please select a parent ledger group");
      return;
    }

    try {
      const newLedgerGroup = await createLedgerGroupMutation.mutateAsync(ledgerGroupFormData);
      
      // Auto-select the newly created ledger group
      setLedgerFormData({
        ...ledgerFormData,
        ledger_group_id: newLedgerGroup.id,
      });
      
      setShowLedgerGroupForm(false);
      setLedgerGroupFormData({
        name: "",
        parent_ledger_group_id: 0,
        category: "other",
      });
      setPendingLedgerGroupName("");
      setCreatingLedgerGroupFromForm(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to create ledger group");
    }
  };

  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransactionId || !editFormData) return;

    setEditError(null);

    // Validate all items
    for (let i = 0; i < editItems.length; i++) {
      const item = editItems[i];
      if (!item.ledger_id) {
        setEditError(`Please select a ledger for row ${i + 1}`);
        return;
      }
      const amount = typeof item.amount === "string" ? parseFloat(item.amount) : item.amount;
      if (!amount || amount <= 0) {
        setEditError(`Please enter a valid amount for row ${i + 1}`);
        return;
      }
    }

    // Validate balance
    if (!editIsBalanced) {
      setEditError(`Transaction is not balanced. Difference: KSh ${Math.abs(editBalanceDifference).toFixed(2)}`);
      return;
    }

    // Convert items to TransactionItem format
    const transactionItems: TransactionItem[] = editItems.map(item => ({
      ledger_id: item.ledger_id,
      entry_type: item.entry_type,
      amount: typeof item.amount === "string" ? parseFloat(item.amount) : item.amount,
    }));

    try {
      await updateTransactionMutation.mutateAsync({
        transactionId: editingTransactionId,
        data: {
          ...editFormData,
          items: transactionItems,
        },
      });
      setEditingTransactionId(null);
      setEditFormData(null);
      setEditItems([]);
      setEditError(null);
      await refetchLedgerReport();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update transaction");
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

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
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              Reports
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Financial reports and analysis
            </p>
          </div>

          {/* Report Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Trial Balance Card */}
            <div
              onClick={() => setShowTrialBalanceDialog(true)}
              className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <span className="text-2xl">⚖️</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Trial Balance
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Verify transaction balancing
                  </p>
                </div>
              </div>
            </div>

            {/* Ledger Report Card */}
            <div
              onClick={() => setShowLedgerReportDialog(true)}
              className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                  <span className="text-2xl">📋</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Ledger Report
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    View account transactions
                  </p>
                </div>
              </div>
            </div>

            {/* Placeholder for future reports */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 opacity-50 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <span className="text-2xl">📊</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Balance Sheet
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Coming soon
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-6 opacity-50 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <span className="text-2xl">📈</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    Profit & Loss
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Coming soon
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Trial Balance Results Dialog */}
      <Dialog
        isOpen={showTrialBalanceResults && !!trialBalance}
        onClose={() => {
          setShowTrialBalanceResults(false);
        }}
        title="Trial Balance"
        size="xl"
      >
        {trialBalanceLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-600 dark:text-zinc-400">Loading trial balance...</p>
          </div>
        ) : trialBalance ? (
          <div className="space-y-4">
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {new Date(trialBalance.start_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}{" "}
              to{" "}
              {new Date(trialBalance.end_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </div>

            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-sm border border-zinc-300 dark:border-zinc-500 border-separate border-spacing-0">
                <thead className="border-b-2 border-zinc-300 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-800/50 sticky top-0">
                  <tr>
                    <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r-2 border-zinc-300 dark:border-zinc-500">
                      Ledger
                    </th>
                    <th colSpan={2} className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                      Opening Balance
                    </th>
                    <th colSpan={2} className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                      Net Transactions
                    </th>
                    <th colSpan={2} className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Closing Balance
                    </th>
                  </tr>
                  <tr>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                      Dr
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                      Cr
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                      Dr
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                      Cr
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                      Dr
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Cr
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Create a map of parent group name to sort_order
                    const parentGroupSortOrder = new Map<string, number>();
                    parentGroups.forEach((group) => {
                      // Use sort_order if available, otherwise use a default based on name
                      const sortOrder = group.sort_order ?? 
                        (group.name === "Fixed Assets" ? 1 :
                         group.name === "Current Assets" ? 2 :
                         group.name === "Current Liabilities" ? 3 :
                         group.name === "Long Term Liabilities" ? 4 :
                         group.name === "Capital & Reserves" ? 5 :
                         group.name === "Income" ? 6 :
                         group.name === "Expenditure" ? 7 : 999);
                      parentGroupSortOrder.set(group.name, sortOrder);
                    });

                    // Group items by parent group, then by ledger group
                    const grouped: Record<string, Record<string, typeof trialBalance.items>> = {};
                    
                    trialBalance.items.forEach((item) => {
                      if (!grouped[item.parent_group_name]) {
                        grouped[item.parent_group_name] = {};
                      }
                      if (!grouped[item.parent_group_name][item.ledger_group_name]) {
                        grouped[item.parent_group_name][item.ledger_group_name] = [];
                      }
                      grouped[item.parent_group_name][item.ledger_group_name].push(item);
                    });

                    const rows: React.ReactElement[] = [];
                    let rowKey = 0;

                    // Calculate totals for each level
                    const calculateGroupTotals = (items: typeof trialBalance.items) => {
                      return items.reduce(
                        (acc, item) => ({
                          opening_debit: acc.opening_debit + (item.opening_debit || 0),
                          opening_credit: acc.opening_credit + (item.opening_credit || 0),
                          period_debit: acc.period_debit + (item.period_debit || 0),
                          period_credit: acc.period_credit + (item.period_credit || 0),
                          closing_debit: acc.closing_debit + (item.closing_debit || 0),
                          closing_credit: acc.closing_credit + (item.closing_credit || 0),
                        }),
                        {
                          opening_debit: 0,
                          opening_credit: 0,
                          period_debit: 0,
                          period_credit: 0,
                          closing_debit: 0,
                          closing_credit: 0,
                        }
                      );
                    };

                    // Sort parent groups by sort_order, then by name
                    // Also handle groups that might not be in parentGroups yet
                    const sortedParentGroups = Object.entries(grouped).sort(([nameA], [nameB]) => {
                      const sortOrderA = parentGroupSortOrder.get(nameA) ?? 
                        (nameA === "Fixed Assets" ? 1 :
                         nameA === "Current Assets" ? 2 :
                         nameA === "Current Liabilities" ? 3 :
                         nameA === "Long Term Liabilities" ? 4 :
                         nameA === "Capital & Reserves" ? 5 :
                         nameA === "Income" ? 6 :
                         nameA === "Expenditure" ? 7 : 999);
                      const sortOrderB = parentGroupSortOrder.get(nameB) ?? 
                        (nameB === "Fixed Assets" ? 1 :
                         nameB === "Current Assets" ? 2 :
                         nameB === "Current Liabilities" ? 3 :
                         nameB === "Long Term Liabilities" ? 4 :
                         nameB === "Capital & Reserves" ? 5 :
                         nameB === "Income" ? 6 :
                         nameB === "Expenditure" ? 7 : 999);
                      if (sortOrderA !== sortOrderB) {
                        return sortOrderA - sortOrderB;
                      }
                      return nameA.localeCompare(nameB);
                    });

                    sortedParentGroups.forEach(([parentGroupName, ledgerGroups]) => {
                      // Parent group header row
                      const parentItems = Object.values(ledgerGroups).flat();
                      const parentTotals = calculateGroupTotals(parentItems);
                      
                      rows.push(
                        <tr
                          key={`parent-${rowKey++}`}
                          className="bg-blue-50 dark:bg-blue-900/20 font-semibold border-t-2 border-b-2 border-zinc-300 dark:border-zinc-500"
                        >
                          <td className="px-4 py-3 border-r border-zinc-300 dark:border-zinc-500">
                            <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                              {parentGroupName}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-blue-900 dark:text-blue-100 border-r border-zinc-300 dark:border-zinc-500">
                            {parentTotals.opening_debit > 0
                              ? Number(parentTotals.opening_debit).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-blue-900 dark:text-blue-100 border-r border-zinc-300 dark:border-zinc-500">
                            {parentTotals.opening_credit > 0
                              ? Number(parentTotals.opening_credit).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-blue-900 dark:text-blue-100 border-r border-zinc-300 dark:border-zinc-500">
                            {parentTotals.period_debit > 0
                              ? Number(parentTotals.period_debit).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-blue-900 dark:text-blue-100 border-r border-zinc-300 dark:border-zinc-500">
                            {parentTotals.period_credit > 0
                              ? Number(parentTotals.period_credit).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-blue-900 dark:text-blue-100 border-r border-zinc-300 dark:border-zinc-500">
                            {parentTotals.closing_debit > 0
                              ? Number(parentTotals.closing_debit).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-blue-900 dark:text-blue-100">
                            {parentTotals.closing_credit > 0
                              ? Number(parentTotals.closing_credit).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })
                              : "-"}
                          </td>
                        </tr>
                      );

                      // Ledger groups within parent group
                      Object.entries(ledgerGroups).forEach(([ledgerGroupName, items]) => {
                        const groupTotals = calculateGroupTotals(items);
                        
                        // Ledger group header row
                        rows.push(
                          <tr
                            key={`group-${rowKey++}`}
                            className="bg-green-50 dark:bg-green-900/20 font-medium border-t border-b border-zinc-300 dark:border-zinc-500"
                          >
                            <td className="px-4 py-2 border-r border-zinc-300 dark:border-zinc-500">
                              <div className="text-sm font-medium text-green-900 dark:text-green-100 pl-6">
                                {ledgerGroupName}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-green-900 dark:text-green-100 border-r border-zinc-300 dark:border-zinc-500">
                              {groupTotals.opening_debit > 0
                                ? Number(groupTotals.opening_debit).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    useGrouping: true,
                                  })
                                : "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-green-900 dark:text-green-100 border-r border-zinc-300 dark:border-zinc-500">
                              {groupTotals.opening_credit > 0
                                ? Number(groupTotals.opening_credit).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    useGrouping: true,
                                  })
                                : "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-green-900 dark:text-green-100 border-r border-zinc-300 dark:border-zinc-500">
                              {groupTotals.period_debit > 0
                                ? Number(groupTotals.period_debit).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    useGrouping: true,
                                  })
                                : "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-green-900 dark:text-green-100 border-r border-zinc-300 dark:border-zinc-500">
                              {groupTotals.period_credit > 0
                                ? Number(groupTotals.period_credit).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    useGrouping: true,
                                  })
                                : "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-green-900 dark:text-green-100 border-r border-zinc-300 dark:border-zinc-500">
                              {groupTotals.closing_debit > 0
                                ? Number(groupTotals.closing_debit).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    useGrouping: true,
                                  })
                                : "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-green-900 dark:text-green-100">
                              {groupTotals.closing_credit > 0
                                ? Number(groupTotals.closing_credit).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                    useGrouping: true,
                                  })
                                : "-"}
                            </td>
                          </tr>
                        );

                        // Individual ledgers within ledger group
                        items.forEach((item) => {
                          rows.push(
                            <tr
                              key={item.ledger_id}
                              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-b-2 border-zinc-300 dark:border-zinc-500"
                            >
                              <td className="px-4 py-2 border-r border-zinc-300 dark:border-zinc-500">
                                <div className="text-sm text-zinc-900 dark:text-zinc-100 pl-12">
                                  {item.ledger_name}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                                {item.opening_debit > 0
                                  ? Number(item.opening_debit).toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                      useGrouping: true,
                                    })
                                  : "-"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                                {item.opening_credit > 0
                                  ? Number(item.opening_credit).toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                      useGrouping: true,
                                    })
                                  : "-"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                                {item.period_debit > 0
                                  ? Number(item.period_debit).toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                      useGrouping: true,
                                    })
                                  : "-"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                                {item.period_credit > 0
                                  ? Number(item.period_credit).toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                      useGrouping: true,
                                    })
                                  : "-"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                                {item.closing_debit > 0
                                  ? Number(item.closing_debit).toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                      useGrouping: true,
                                    })
                                  : "-"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-sm text-zinc-900 dark:text-zinc-100">
                                {item.closing_credit > 0
                                  ? Number(item.closing_credit).toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                      useGrouping: true,
                                    })
                                  : "-"}
                              </td>
                            </tr>
                          );
                        });
                      });
                    });

                    return rows;
                  })()}
                  <tr className="border-t-2 border-b-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-500 dark:bg-zinc-800/50 sticky bottom-0">
                    <td className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                      Total
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                      {(() => {
                        const value = trialBalance.total_opening_debit ?? 0;
                        return value === 0 ? "-" : Number(value).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          useGrouping: true,
                        });
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                      {(() => {
                        const value = trialBalance.total_opening_credit ?? 0;
                        return value === 0 ? "-" : Number(value).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          useGrouping: true,
                        });
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                      {(() => {
                        const value = trialBalance.total_period_debit ?? 0;
                        return value === 0 ? "-" : Number(value).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          useGrouping: true,
                        });
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                      {(() => {
                        const value = trialBalance.total_period_credit ?? 0;
                        return value === 0 ? "-" : Number(value).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          useGrouping: true,
                        });
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                      {(() => {
                        const value = trialBalance.total_closing_debit ?? 0;
                        return value === 0 ? "-" : Number(value).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          useGrouping: true,
                        });
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <span
                        className={
                          trialBalance.is_balanced
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }
                      >
                        {(() => {
                          const value = trialBalance.total_closing_credit ?? 0;
                          return value === 0 ? "-" : Number(value).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            useGrouping: true,
                          });
                        })()}
                      </span>
                    </td>
                  </tr>
                  <tr className="bg-zinc-100 dark:bg-zinc-800">
                    <td colSpan={7} className="px-4 py-2 text-center text-sm">
                      <span
                        className={
                          trialBalance.is_balanced
                            ? "text-green-600 dark:text-green-400 font-semibold"
                            : "text-red-600 dark:text-red-400 font-semibold"
                        }
                      >
                        {trialBalance.is_balanced
                          ? "✓ Trial Balance is Balanced"
                          : "✗ Trial Balance is Unbalanced"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-600 dark:text-zinc-400">No data available</p>
          </div>
        )}
      </Dialog>

      {/* Trial Balance Period Selection Dialog */}
      <Dialog
        isOpen={showTrialBalanceDialog}
        onClose={() => {
          setShowTrialBalanceDialog(false);
        }}
        title="Trial Balance - Select Period"
        size="lg"
      >
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Period *
            </label>
            <select
              value={periodType}
              onChange={(e) => handlePeriodChange(e.target.value as PeriodType)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="first_quarter">First Quarter</option>
              <option value="second_quarter">Second Quarter</option>
              <option value="half_year">Half Year</option>
              <option value="year">Year</option>
              <option value="custom">Custom Date</option>
            </select>
          </div>

          {periodType !== "custom" ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Year *
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => handleYearChange(parseInt(e.target.value))}
                min="2000"
                max="2100"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Start Date *
                </label>
                <DatePicker
                  selected={startDate}
                  onChange={(date: Date | null) => setStartDate(date)}
                  dateFormat="dd/MM/yyyy"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  popperPlacement="bottom-start"
                  popperClassName="react-datepicker-popper-no-backdrop"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  End Date *
                </label>
                <DatePicker
                  selected={endDate}
                  onChange={(date: Date | null) => setEndDate(date)}
                  dateFormat="dd/MM/yyyy"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  popperPlacement="bottom-start"
                  popperClassName="react-datepicker-popper-no-backdrop"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setShowTrialBalanceDialog(false);
                setShowTrialBalanceResults(false);
              }}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerateTrialBalance}
              disabled={
                (periodType === "custom" && (!startDate || !endDate)) ||
                trialBalanceLoading
              }
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {trialBalanceLoading ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Ledger Report Period Selection Dialog */}
      <Dialog
        isOpen={showLedgerReportDialog}
        onClose={() => {
          setShowLedgerReportDialog(false);
        }}
        title="Ledger Report - Select Period"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Select Ledger *
            </label>
            <SearchableSelect
              options={ledgers.map((ledger) => ({
                value: ledger.id,
                label: ledger.name,
                searchText: ledger.name,
              }))}
              value={selectedLedgerId || 0}
              onChange={(value) =>
                setSelectedLedgerId(
                  typeof value === "number" ? value : parseInt(value as string)
                )
              }
              placeholder="Select a ledger"
              searchPlaceholder="Type to search ledgers..."
              required
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Period *
            </label>
            <select
              value={ledgerPeriodType}
              onChange={(e) => handleLedgerPeriodChange(e.target.value as PeriodType)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="first_quarter">First Quarter</option>
              <option value="second_quarter">Second Quarter</option>
              <option value="half_year">Half Year</option>
              <option value="year">Year</option>
              <option value="custom">Custom Date</option>
            </select>
          </div>

          {ledgerPeriodType !== "custom" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Year *
              </label>
              <input
                type="number"
                value={ledgerYear}
                onChange={(e) => handleLedgerYearChange(parseInt(e.target.value))}
                min="2000"
                max="2100"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          )}

          {ledgerPeriodType === "custom" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Start Date *
                </label>
                <DatePicker
                  selected={ledgerStartDate}
                  onChange={(date: Date | null) => setLedgerStartDate(date)}
                  dateFormat="dd/MM/yyyy"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  required
                  popperPlacement="bottom-start"
                  popperClassName="react-datepicker-popper-no-backdrop"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  End Date *
                </label>
                <DatePicker
                  selected={ledgerEndDate}
                  onChange={(date: Date | null) => setLedgerEndDate(date)}
                  dateFormat="dd/MM/yyyy"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  required
                  popperPlacement="bottom-start"
                  popperClassName="react-datepicker-popper-no-backdrop"
                />
              </div>
            </div>
          )}

          {ledgerPeriodType !== "custom" && ledgerStartDate && ledgerEndDate && (
            <div className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              <p>
                Period:{" "}
                {ledgerStartDate.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}{" "}
                to{" "}
                {ledgerEndDate.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => setShowLedgerReportDialog(false)}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateLedgerReport}
              disabled={ledgerReportLoading}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {ledgerReportLoading ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Ledger Report Results Dialog */}
      <Dialog
        isOpen={showLedgerReportResults}
        onClose={() => {
          setShowLedgerReportResults(false);
        }}
        title={`Ledger Report - ${ledgerReport?.ledger_name || ""}`}
        size="xl"
      >
        {ledgerReportLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-600 dark:text-zinc-400">Loading ledger report...</p>
          </div>
        ) : ledgerReport ? (
          <div className="space-y-4">
            {/* Report Header */}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Ledger</p>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {ledgerReport.ledger_name}
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {ledgerReport.parent_group_name} &gt; {ledgerReport.ledger_group_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">Period</p>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {new Date(ledgerReport.start_date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}{" "}
                    to{" "}
                    {new Date(ledgerReport.end_date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Opening Balance</p>
                <p className={`text-lg font-semibold ${
                  (ledgerReport.opening_balance ?? 0) >= 0
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-red-600 dark:text-red-400"
                }`}>
                  KSh {Number(ledgerReport.opening_balance ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    useGrouping: true,
                  })}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Total Debit</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  KSh {Number(ledgerReport.total_debit ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    useGrouping: true,
                  })}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Total Credit</p>
                <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                  KSh {Number(ledgerReport.total_credit ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    useGrouping: true,
                  })}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Closing Balance</p>
                <p className={`text-lg font-semibold ${
                  (ledgerReport.closing_balance ?? 0) >= 0
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-red-600 dark:text-red-400"
                }`}>
                  KSh {Number(ledgerReport.closing_balance ?? 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                    useGrouping: true,
                  })}
                </p>
              </div>
            </div>

            {/* Transactions Table */}
            {ledgerReport.entries.length > 0 ? (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[50vh] -mx-6 px-6">
                  <table className="w-full min-w-[800px] text-sm border border-zinc-300 dark:border-zinc-500 border-separate border-spacing-0">
                    <thead className="border-b-2 border-zinc-300 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-800/50 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                          Reference
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                          Type
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                          Debit
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300 border-r border-zinc-300 dark:border-zinc-500">
                          Credit
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                          Balance
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening Balance Row */}
                      <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-300 dark:border-zinc-500">
                        <td colSpan={3} className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                          Opening Balance
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-400 border-r border-zinc-300 dark:border-zinc-500">-</td>
                        <td className="px-4 py-3 text-right text-sm text-zinc-600 dark:text-zinc-400 border-r border-zinc-300 dark:border-zinc-500">-</td>
                        <td className={`px-4 py-3 text-right text-sm font-semibold ${
                          (ledgerReport.opening_balance ?? 0) >= 0
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {Number(ledgerReport.opening_balance ?? 0).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            useGrouping: true,
                          })}
                        </td>
                        <td className="px-4 py-3 text-center">-</td>
                      </tr>
                      {ledgerReport.entries.map((entry, index) => (
                        <tr
                          key={`${entry.transaction_id}-${index}`}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-b border-zinc-300 dark:border-zinc-500"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 border-r border-zinc-300 dark:border-zinc-500">
                            {new Date(entry.transaction_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 border-r border-zinc-300 dark:border-zinc-500">
                            {entry.reference || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 border-r border-zinc-300 dark:border-zinc-500">
                            {entry.transaction_type}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-green-600 dark:text-green-400 border-r border-zinc-300 dark:border-zinc-500">
                            {entry.entry_type === "DEBIT"
                              ? Number(entry.amount).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })
                              : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-red-600 dark:text-red-400 border-r border-zinc-300 dark:border-zinc-500">
                            {entry.entry_type === "CREDIT"
                              ? Number(entry.amount).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })
                              : "-"}
                          </td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${
                            (entry.running_balance ?? 0) >= 0
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-red-600 dark:text-red-400"
                          }`}>
                            {Number(entry.running_balance ?? 0).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                              useGrouping: true,
                            })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEditTransaction(entry.transaction_id)}
                                className="rounded p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
                                title="Edit transaction"
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteTransaction(entry.transaction_id)}
                                className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                                title="Delete transaction"
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4 overflow-y-auto max-h-[50vh] -mx-6 px-6">
                  {/* Opening Balance Card */}
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Opening Balance</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">Debit</span>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">-</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">Credit</span>
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">-</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-zinc-300 dark:border-zinc-500">
                        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Balance</span>
                        <span className={`text-sm font-semibold ${
                          (ledgerReport.opening_balance ?? 0) >= 0
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          KSh {Number(ledgerReport.opening_balance ?? 0).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                            useGrouping: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transaction Cards */}
                  {ledgerReport.entries.map((entry, index) => (
                    <div
                      key={`${entry.transaction_id}-${index}`}
                      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {new Date(entry.transaction_date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </p>
                          {entry.reference && (
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                              Ref: {entry.reference}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditTransaction(entry.transaction_id)}
                            className="rounded p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
                            title="Edit transaction"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteTransaction(entry.transaction_id)}
                            className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                            title="Delete transaction"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">Type</span>
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">{entry.transaction_type}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">Debit</span>
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            {entry.entry_type === "DEBIT"
                              ? `KSh ${Number(entry.amount).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })}`
                              : "-"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">Credit</span>
                          <span className="text-sm font-medium text-red-600 dark:text-red-400">
                            {entry.entry_type === "CREDIT"
                              ? `KSh ${Number(entry.amount).toLocaleString("en-US", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                  useGrouping: true,
                                })}`
                              : "-"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-zinc-300 dark:border-zinc-500">
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Balance</span>
                          <span className={`text-sm font-semibold ${
                            (entry.running_balance ?? 0) >= 0
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-red-600 dark:text-red-400"
                          }`}>
                            KSh {Number(entry.running_balance ?? 0).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                              useGrouping: true,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-800">
                <p className="text-zinc-600 dark:text-zinc-400">
                  No transactions found for this ledger in the selected period.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-600 dark:text-zinc-400">No data available</p>
          </div>
        )}
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog
        isOpen={editingTransactionId !== null}
        onClose={() => {
          setEditingTransactionId(null);
          setEditFormData(null);
          setEditItems([]);
          setEditError(null);
        }}
        title="Edit Transaction"
        size="xl"
      >
        {editFormData ? (
          <form onSubmit={handleUpdateTransaction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Transaction Date *
                </label>
                <DatePicker
                  selected={editFormData.transaction_date ? new Date(editFormData.transaction_date) : null}
                  onChange={(date: Date | null) => {
                    if (date) {
                      setEditFormData({
                        ...editFormData,
                        transaction_date: formatDateForAPI(date),
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
                  Reference
                </label>
                <input
                  type="text"
                  value={editFormData.reference || ""}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, reference: e.target.value || null })
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  placeholder="Optional reference"
                />
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Transaction Items *
                </label>
                <button
                  type="button"
                  onClick={handleAddEditItem}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  + Add Entry
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Ledger
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Type
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        DR
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        CR
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((item, index) => (
                      <tr
                        key={index}
                        className="border-b border-zinc-200 dark:border-zinc-700"
                      >
                        <td className="px-4 py-3">
                          <SearchableSelect
                            options={ledgers.map((ledger) => ({
                              value: ledger.id,
                              label: ledger.name,
                              searchText: ledger.name,
                            }))}
                            value={item.ledger_id || 0}
                            onChange={(value) =>
                              handleUpdateEditItem(
                                index,
                                "ledger_id",
                                typeof value === "number" ? value : parseInt(value as string)
                              )
                            }
                            placeholder="Select ledger"
                            searchPlaceholder="Type to search ledgers..."
                            required
                            className="w-full min-w-[200px] relative"
                            allowClear
                            onCreateNew={handleCreateNewLedger}
                            createNewLabel={(searchTerm) => `Create "${searchTerm}" ledger`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={item.entry_type}
                            onChange={(e) =>
                              handleUpdateEditItem(
                                index,
                                "entry_type",
                                e.target.value as "DEBIT" | "CREDIT"
                              )
                            }
                            required
                            className="w-full min-w-[120px] rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          >
                            <option value="DEBIT">DR</option>
                            <option value="CREDIT">CR</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.entry_type === "DEBIT" ? (typeof item.amount === "string" ? item.amount : item.amount.toString()) : ""}
                            onChange={(e) =>
                              handleUpdateEditItem(index, "amount", e.target.value)
                            }
                            disabled={item.entry_type === "CREDIT"}
                            placeholder="0.00"
                            className={`w-full min-w-[120px] rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${
                              item.entry_type === "CREDIT"
                                ? "cursor-not-allowed bg-zinc-100 opacity-50 dark:bg-zinc-900"
                                : "bg-white"
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.entry_type === "CREDIT" ? (typeof item.amount === "string" ? item.amount : item.amount.toString()) : ""}
                            onChange={(e) =>
                              handleUpdateEditItem(index, "amount", e.target.value)
                            }
                            disabled={item.entry_type === "DEBIT"}
                            placeholder="0.00"
                            className={`w-full min-w-[120px] rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${
                              item.entry_type === "DEBIT"
                                ? "cursor-not-allowed bg-zinc-100 opacity-50 dark:bg-zinc-900"
                                : "bg-white"
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {editItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEditItem(index)}
                              className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                              title="Remove row"
                            >
                              <svg
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-800">
                      <td colSpan={2} className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                        Totals:
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                        KSh {editTotalDebits.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          useGrouping: true,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">
                        KSh {editTotalCredits.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                          useGrouping: true,
                        })}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Balance Summary */}
            <div className="rounded-lg border-2 border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Balance Status:
                </span>
                <span
                  className={`text-sm font-semibold ${
                    editIsBalanced
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {editIsBalanced
                    ? "✓ Balanced"
                    : `Out of Balance: KSh ${Math.abs(editBalanceDifference).toFixed(2)}`}
                </span>
              </div>
              {!editIsBalanced && (
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {editBalanceDifference > 0
                    ? "Credits need to be increased or debits decreased"
                    : "Debits need to be increased or credits decreased"}
                </p>
              )}
            </div>

            {editError && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                {editError}
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  setEditingTransactionId(null);
                  setEditFormData(null);
                  setEditItems([]);
                  setEditError(null);
                }}
                className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateTransactionMutation.isPending || !editIsBalanced}
                className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {updateTransactionMutation.isPending ? "Updating..." : "Update Transaction"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-zinc-600 dark:text-zinc-400">Loading transaction...</p>
          </div>
        )}
      </Dialog>

      {/* Create Ledger Dialog */}
      <Dialog
        isOpen={showCreateLedgerDialog}
        onClose={() => {
          setShowCreateLedgerDialog(false);
          setEditError(null);
          setPendingLedgerName("");
        }}
        title="Create Ledger"
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
              options={groups.map((group) => ({
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
                setCreatingLedgerGroupFromForm(true);
                setLedgerGroupFormData({
                  name: searchTerm,
                  parent_ledger_group_id: 0,
                  category: "other",
                });
                setShowLedgerGroupForm(true);
              }}
              createNewLabel={(searchTerm) => `Create "${searchTerm}" ledger group`}
            />
          </div>

          {editError && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {editError}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setShowCreateLedgerDialog(false);
                setEditError(null);
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
          setCreatingLedgerGroupFromForm(false);
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

          {editError && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {editError}
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
                setCreatingLedgerGroupFromForm(false);
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={deletingTransactionId !== null}
        onClose={() => {
          setDeletingTransactionId(null);
          setEditError(null);
        }}
        title="Delete Transaction"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-zinc-700 dark:text-zinc-300">
            Are you sure you want to delete this transaction? This action cannot be undone.
          </p>

          {editError && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {editError}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setDeletingTransactionId(null);
                setEditError(null);
              }}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteTransaction}
              disabled={deleteTransactionMutation.isPending}
              className="rounded-lg bg-red-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
            >
              {deleteTransactionMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

