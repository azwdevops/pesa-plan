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
  useSpendingTypes,
  useCreateSpendingType,
} from "@/lib/hooks/use-accounts";
import { useCreateTransaction } from "@/lib/hooks/use-transactions";
import type { LedgerCreate } from "@/lib/api/accounts";

export default function ExpensesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], isLoading: ledgersLoading } = useLedgers();
  const { data: groups = [] } = useLedgerGroups();
  const { data: spendingTypes = [] } = useSpendingTypes();
  const createTransactionMutation = useCreateTransaction();
  const createLedgerMutation = useCreateLedger();
  const createSpendingTypeMutation = useCreateSpendingType();

  // Filter ledgers: expense ledgers, asset ledgers (for paying account), and charge ledgers
  const expenseGroups = groups.filter(
    (group) => group.category === "expenses"
  );
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
  const [pendingLedgerName, setPendingLedgerName] = useState("");
  const [pendingAssetLedgerName, setPendingAssetLedgerName] = useState("");
  const [pendingChargeLedgerName, setPendingChargeLedgerName] = useState("");
  const [spendingTypeFormData, setSpendingTypeFormData] = useState({
    name: "",
  });
  const [formData, setFormData] = useState({
    transaction_date: new Date(),
    expense_ledger_id: 0,
    paying_account_id: 0,
    charge_ledger_id: 0,
    charge_amount: "",
    amount: "",
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
        reference: null,
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
                Expenses
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Record and manage expense transactions
              </p>
            </div>
            <button
              onClick={() => setShowPostExpenseDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              + Post Expense
            </button>
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
    </div>
  );
}

