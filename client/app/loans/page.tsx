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

export default function LoansPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], isLoading: ledgersLoading } = useLedgers();
  const { data: groups = [] } = useLedgerGroups();
  const createTransactionMutation = useCreateTransaction();
  const createLedgerMutation = useCreateLedger();

  // Filter ledgers: asset ledgers (for receiving account), expense ledgers (for interest), and all ledgers (for liability)
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
  // All ledgers can be used for liability (user chooses)
  const allLedgers = ledgers;

  const [showPostLoanDialog, setShowPostLoanDialog] = useState(false);
  const [showCreateReceivingAccountDialog, setShowCreateReceivingAccountDialog] = useState(false);
  const [showCreateLiabilityDialog, setShowCreateLiabilityDialog] = useState(false);
  const [showCreateInterestExpenseDialog, setShowCreateInterestExpenseDialog] = useState(false);
  const [pendingReceivingAccountName, setPendingReceivingAccountName] = useState("");
  const [pendingLiabilityName, setPendingLiabilityName] = useState("");
  const [pendingInterestExpenseName, setPendingInterestExpenseName] = useState("");
  const [formData, setFormData] = useState({
    transaction_date: new Date(),
    receiving_account_id: 0,
    liability_account_id: 0,
    interest_expense_account_id: 0,
    principal_amount: "",
    interest_amount: "",
  });
  const [receivingAccountFormData, setReceivingAccountFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: assetGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [liabilityFormData, setLiabilityFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: groups[0]?.id || 0,
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
        reference: null,
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
        ledger_group_id: groups[0]?.id || 0,
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
      ledger_group_id: groups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateLiabilityDialog(true);
  };

  const handleCreateNewInterestExpense = (searchTerm: string) => {
    setPendingInterestExpenseName(searchTerm);
    setInterestExpenseFormData({
      name: searchTerm,
      ledger_group_id: expenseGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateInterestExpenseDialog(true);
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
                Loans
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Record and manage loan transactions
              </p>
            </div>
            <button
              onClick={() => setShowPostLoanDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              + Record Loan
            </button>
          </div>

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
                options={allLedgers.map((ledger) => ({
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
              {allLedgers.length === 0 && !ledgersLoading && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  No accounts found. Create one in{" "}
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
              options={groups.map((group) => ({
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
    </div>
  );
}

