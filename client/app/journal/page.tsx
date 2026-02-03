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
import type { TransactionItem } from "@/lib/api/transactions";

interface JournalItem {
  ledger_id: number;
  entry_type: "DEBIT" | "CREDIT";
  debit_amount: string;
  credit_amount: string;
}

export default function JournalPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], isLoading: ledgersLoading, refetch: refetchLedgers } = useLedgers();
  const { data: groups = [] } = useLedgerGroups();
  const { token } = useAuth();
  const createTransactionMutation = useCreateTransaction();
  const createLedgerMutation = useCreateLedger();
  
  const [showPostJournalDialog, setShowPostJournalDialog] = useState(false);
  const [showCreateLedgerDialog, setShowCreateLedgerDialog] = useState(false);
  const [pendingLedgerName, setPendingLedgerName] = useState("");
  const [formData, setFormData] = useState({
    transaction_date: new Date(),
    reference: "",
  });
  const [journalItems, setJournalItems] = useState<JournalItem[]>([
    { ledger_id: 0, entry_type: "DEBIT", debit_amount: "", credit_amount: "" },
  ]);
  const [ledgerFormData, setLedgerFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: groups[0]?.id || 0,
    spending_type_id: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Format date to YYYY-MM-DD without timezone issues
  const formatDateForAPI = (date: Date | null): string => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Calculate totals
  const totalDebits = journalItems.reduce((sum, item) => {
    if (item.entry_type === "DEBIT") {
      const amount = parseFloat(item.debit_amount) || 0;
      return sum + amount;
    }
    return sum;
  }, 0);

  const totalCredits = journalItems.reduce((sum, item) => {
    if (item.entry_type === "CREDIT") {
      const amount = parseFloat(item.credit_amount) || 0;
      return sum + amount;
    }
    return sum;
  }, 0);

  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01; // Allow small floating point differences
  const balanceDifference = totalDebits - totalCredits;

  const handleAddItem = () => {
    setJournalItems([...journalItems, { ledger_id: 0, entry_type: "DEBIT", debit_amount: "", credit_amount: "" }]);
  };

  const handleRemoveItem = (index: number) => {
    if (journalItems.length > 1) {
      setJournalItems(journalItems.filter((_, i) => i !== index));
    }
  };

  const handleUpdateItem = (index: number, field: keyof JournalItem, value: number | string) => {
    const updated = [...journalItems];
    const item = { ...updated[index] };
    
    if (field === "entry_type") {
      // When changing entry type, clear the opposite amount
      item.entry_type = value as "DEBIT" | "CREDIT";
      if (value === "DEBIT") {
        item.credit_amount = "";
      } else {
        item.debit_amount = "";
      }
    } else {
      item[field] = value;
    }
    
    updated[index] = item;
    setJournalItems(updated);
  };

  const handlePostJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.transaction_date) {
      setError("Please select a transaction date");
      return;
    }

    // Validate all items
    for (let i = 0; i < journalItems.length; i++) {
      const item = journalItems[i];
      if (!item.ledger_id) {
        setError(`Please select a ledger for row ${i + 1}`);
        return;
      }
      if (item.entry_type === "DEBIT") {
        if (!item.debit_amount || parseFloat(item.debit_amount) <= 0) {
          setError(`Please enter a valid debit amount for row ${i + 1}`);
          return;
        }
      } else {
        if (!item.credit_amount || parseFloat(item.credit_amount) <= 0) {
          setError(`Please enter a valid credit amount for row ${i + 1}`);
          return;
        }
      }
    }

    // Validate balance
    if (!isBalanced) {
      setError(`Debits and Credits must balance. Difference: KSh ${Math.abs(balanceDifference).toFixed(2)}`);
      return;
    }

    const transactionDate = formatDateForAPI(formData.transaction_date);

    // Build transaction items
    const items: TransactionItem[] = [];

    journalItems.forEach((item) => {
      if (item.entry_type === "DEBIT") {
        items.push({
          ledger_id: item.ledger_id,
          entry_type: "DEBIT",
          amount: parseFloat(item.debit_amount),
        });
      } else {
        items.push({
          ledger_id: item.ledger_id,
          entry_type: "CREDIT",
          amount: parseFloat(item.credit_amount),
        });
      }
    });

    try {
      await createTransactionMutation.mutateAsync({
        transaction_date: transactionDate,
        reference: formData.reference || null,
        transaction_type: "JOURNAL",
        total_amount: totalDebits, // Use debit total (same as credit total)
        items: items,
      });

      // Reset form
      setFormData({
        transaction_date: new Date(),
        reference: "",
      });
      setJournalItems([{ ledger_id: 0, entry_type: "DEBIT", debit_amount: "", credit_amount: "" }]);
      setShowPostJournalDialog(false);
      alert("Journal entry posted successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post journal entry");
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
      
      // Reset ledger form and close dialog
      setLedgerFormData({
        name: "",
        ledger_group_id: groups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateLedgerDialog(false);
      setPendingLedgerName("");
      await refetchLedgers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ledger");
    }
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

  // Don't show loading screen if we're just checking auth - only show if actually loading
  if (!isAuthenticated && !isLoading) {
    return null; // Will redirect, don't render anything
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
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                Journal Entries
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Post journal entries with multiple debits and credits
              </p>
            </div>
            <button
              onClick={() => setShowPostJournalDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              + Post Journal Entry
            </button>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              About Journal Entries
            </h2>
            <div className="space-y-3 text-zinc-600 dark:text-zinc-400">
              <p>
                Journal entries allow you to record complex transactions with multiple debits and credits.
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>You can add multiple debit entries and multiple credit entries</li>
                <li>The total of all debits must equal the total of all credits</li>
                <li>This ensures double-entry accounting principles are maintained</li>
                <li>Use journal entries for adjusting entries, corrections, and complex transactions</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Post Journal Entry Dialog */}
      <Dialog
        isOpen={showPostJournalDialog}
        onClose={() => {
          setShowPostJournalDialog(false);
          setError(null);
        }}
        title="Post Journal Entry"
        size="xl"
      >
        <form onSubmit={handlePostJournal} className="space-y-6">
          {/* Journal Entries Table */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Journal Entries
              </h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                + Add Row
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                    <th className="px-4 py-5 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Ledger *
                    </th>
                    <th className="px-4 py-5 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Entry Type *
                    </th>
                    <th className="px-4 py-5 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Debit
                    </th>
                    <th className="px-4 py-5 text-left text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Credit
                    </th>
                    <th className="px-4 py-5 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {journalItems.map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-zinc-200 dark:border-zinc-700"
                    >
                      <td className="px-4 py-5">
                        <SearchableSelect
                          options={ledgers.map((ledger) => ({
                            value: ledger.id,
                            label: ledger.name,
                            searchText: ledger.name,
                          }))}
                          value={item.ledger_id || 0}
                          onChange={(value) =>
                            handleUpdateItem(
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
                      <td className="px-4 py-5">
                        <select
                          value={item.entry_type}
                          onChange={(e) =>
                            handleUpdateItem(
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
                      <td className="px-4 py-5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.entry_type === "DEBIT" ? item.debit_amount : ""}
                          onChange={(e) =>
                            handleUpdateItem(index, "debit_amount", e.target.value)
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
                      <td className="px-4 py-5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.entry_type === "CREDIT" ? item.credit_amount : ""}
                          onChange={(e) =>
                            handleUpdateItem(index, "credit_amount", e.target.value)
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
                      <td className="px-4 py-5 text-center">
                        {journalItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
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
                    <td colSpan={2} className="px-4 py-5 text-right text-zinc-700 dark:text-zinc-300">
                      Totals:
                    </td>
                    <td className="px-4 py-5 text-green-600 dark:text-green-400">
                      KSh {totalDebits.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                        useGrouping: true,
                      })}
                    </td>
                    <td className="px-4 py-5 text-red-600 dark:text-red-400">
                      KSh {totalCredits.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                        useGrouping: true,
                      })}
                    </td>
                    <td className="px-4 py-5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Balance Summary */}
          <div className="relative z-0 rounded-lg border-2 border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Balance Status:
              </span>
              <span
                className={`text-sm font-semibold ${
                  isBalanced
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {isBalanced
                  ? "✓ Balanced"
                  : `Out of Balance: KSh ${Math.abs(balanceDifference).toFixed(2)}`}
              </span>
            </div>
            {!isBalanced && (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                {balanceDifference > 0
                  ? "Credits need to be increased or debits decreased"
                  : "Debits need to be increased or credits decreased"}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="relative z-0 flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
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
                popperPlacement="top-start"
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Reference (Optional)
              </label>
              <input
                type="text"
                value={formData.reference}
                onChange={(e) =>
                  setFormData({ ...formData, reference: e.target.value })
                }
                placeholder="e.g., Adjustment, Correction"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowPostJournalDialog(false);
                  setError(null);
                }}
                className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTransactionMutation.isPending || !isBalanced}
                className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {createTransactionMutation.isPending ? "Posting..." : "Post Journal Entry"}
              </button>
            </div>
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
              placeholder="e.g., Office Supplies, Rent Expense"
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

