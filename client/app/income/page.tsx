"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
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
import { useCreateTransaction } from "@/lib/hooks/use-transactions";
import type { LedgerCreate } from "@/lib/api/accounts";

export default function IncomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], isLoading: ledgersLoading } = useLedgers();
  const { data: groups = [] } = useLedgerGroups();
  const createTransactionMutation = useCreateTransaction();
  const createLedgerMutation = useCreateLedger();

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
  const [pendingLedgerName, setPendingLedgerName] = useState("");
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
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                Income
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Record and manage income transactions
              </p>
            </div>
            <button
              onClick={() => setShowPostIncomeDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              + Post Income
            </button>
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
    </div>
  );
}
