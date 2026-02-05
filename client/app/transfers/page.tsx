"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  useCreateLedgerGroup,
  useParentLedgerGroups,
} from "@/lib/hooks/use-accounts";
import { useCreateTransaction } from "@/lib/hooks/use-transactions";
import type { LedgerCreate, LedgerGroupCreate } from "@/lib/api/accounts";

export default function TransfersPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: ledgers = [], isLoading: ledgersLoading } = useLedgers();
  const { data: groups = [] } = useLedgerGroups();
  const { data: parentGroups = [] } = useParentLedgerGroups();
  const createTransactionMutation = useCreateTransaction();
  const createLedgerMutation = useCreateLedger();
  const createLedgerGroupMutation = useCreateLedgerGroup();

  // Filter ledgers: asset ledgers (bank accounts and cash accounts) and charge ledgers
  const assetGroups = groups.filter(
    (group) =>
      group.category === "bank_accounts" ||
      group.category === "cash_accounts"
  );
  const chargeGroups = groups.filter(
    (group) => group.category === "bank_charges"
  );

  const assetLedgers = ledgers.filter((ledger) =>
    assetGroups.some((group) => group.id === ledger.ledger_group_id)
  );
  const chargeLedgers = ledgers.filter((ledger) =>
    chargeGroups.some((group) => group.id === ledger.ledger_group_id)
  );

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showCreateFromAccountDialog, setShowCreateFromAccountDialog] = useState(false);
  const [showCreateToAccountDialog, setShowCreateToAccountDialog] = useState(false);
  const [showCreateChargeLedgerDialog, setShowCreateChargeLedgerDialog] = useState(false);
  const [showLedgerGroupForm, setShowLedgerGroupForm] = useState(false);
  const [pendingFromAccountName, setPendingFromAccountName] = useState("");
  const [pendingToAccountName, setPendingToAccountName] = useState("");
  const [pendingChargeLedgerName, setPendingChargeLedgerName] = useState("");
  const [pendingLedgerGroupName, setPendingLedgerGroupName] = useState("");
  const [creatingLedgerGroupFromForm, setCreatingLedgerGroupFromForm] = useState<"from" | "to" | "charge" | null>(null);
  const [ledgerGroupFormData, setLedgerGroupFormData] = useState<LedgerGroupCreate>({
    name: "",
    parent_ledger_group_id: 0,
    category: "other",
  });
  const [formData, setFormData] = useState({
    transaction_date: new Date(),
    from_account_id: 0,
    to_account_id: 0,
    charge_ledger_id: 0,
    charge_amount: "",
    amount: "",
    reference: "",
  });
  const [fromAccountFormData, setFromAccountFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: assetGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [toAccountFormData, setToAccountFormData] = useState<LedgerCreate>({
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

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.from_account_id) {
      setError("Please select a transfer from account");
      return;
    }

    if (!formData.to_account_id) {
      setError("Please select a transfer to account");
      return;
    }

    if (formData.from_account_id === formData.to_account_id) {
      setError("Transfer from and to accounts must be different");
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

    // Build transaction items for transfer:
    // Dr: Transfer to account (destination)
    // Dr: Transaction charges (if applicable)
    // Cr: Transfer from account (source - amount + charges)
    const items: Array<{
      ledger_id: number;
      entry_type: "DEBIT" | "CREDIT";
      amount: number;
    }> = [];

    // Debit: Transfer to account (destination)
    items.push({
      ledger_id: formData.to_account_id,
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

    // Credit: Transfer from account (source) - total of transfer amount + charge
    const totalCreditAmount = amount + chargeAmount;
    items.push({
      ledger_id: formData.from_account_id,
      entry_type: "CREDIT",
      amount: totalCreditAmount,
    });

    try {
      await createTransactionMutation.mutateAsync({
        transaction_date: transactionDate,
        reference:
          formData.reference && formData.reference.trim() !== ""
            ? formData.reference.trim()
            : null,
        transaction_type: "JOURNAL",
        total_amount: totalCreditAmount,
        items: items,
      });

      // Reset form and close dialog
      setFormData({
        transaction_date: new Date(),
        from_account_id: 0,
        to_account_id: 0,
        charge_ledger_id: 0,
        charge_amount: "",
        amount: "",
        reference: "",
      });
      setShowTransferDialog(false);
      alert("Transfer recorded successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record transfer");
    }
  };

  const handleCreateFromAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fromAccountFormData.name.trim()) {
      setError("Account name is required");
      return;
    }

    if (!fromAccountFormData.ledger_group_id) {
      setError("Please select an account group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(fromAccountFormData);
      
      // Set the newly created ledger as the selected from account
      setFormData({
        ...formData,
        from_account_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setFromAccountFormData({
        name: "",
        ledger_group_id: assetGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateFromAccountDialog(false);
      setPendingFromAccountName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    }
  };

  const handleCreateToAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!toAccountFormData.name.trim()) {
      setError("Account name is required");
      return;
    }

    if (!toAccountFormData.ledger_group_id) {
      setError("Please select an account group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(toAccountFormData);
      
      // Set the newly created ledger as the selected to account
      setFormData({
        ...formData,
        to_account_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setToAccountFormData({
        name: "",
        ledger_group_id: assetGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateToAccountDialog(false);
      setPendingToAccountName("");
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
      if (creatingLedgerGroupFromForm === "from") {
        setFromAccountFormData({
          ...fromAccountFormData,
          ledger_group_id: newLedgerGroup.id,
        });
      } else if (creatingLedgerGroupFromForm === "to") {
        setToAccountFormData({
          ...toAccountFormData,
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
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                Transfers
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                Record transfers between accounts
              </p>
            </div>
            <button
              onClick={() => setShowTransferDialog(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              + Transfer Funds
            </button>
          </div>

        </div>
      </main>

      {/* Transfer Dialog */}
      <Dialog
        isOpen={showTransferDialog}
        onClose={() => {
          setShowTransferDialog(false);
          setError(null);
        }}
        title="Transfer Funds"
        size="lg"
      >
        <form onSubmit={handleTransfer} className="space-y-4">
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
                placeholder="What is this transfer about?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Transfer From *
              </label>
              <SearchableSelect
                options={assetLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.from_account_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    from_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select account to transfer from"
                searchPlaceholder="Type to search accounts..."
                required
                className="w-full"
                allowClear
                onCreateNew={(searchTerm) => {
                  setPendingFromAccountName(searchTerm);
                  setFromAccountFormData({
                    name: searchTerm,
                    ledger_group_id: assetGroups[0]?.id || 0,
                    spending_type_id: null,
                  });
                  setShowCreateFromAccountDialog(true);
                }}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" account`}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Transfer To *
              </label>
              <SearchableSelect
                options={assetLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.to_account_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    to_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select account to transfer to"
                searchPlaceholder="Type to search accounts..."
                required
                className="w-full"
                allowClear
                onCreateNew={(searchTerm) => {
                  setPendingToAccountName(searchTerm);
                  setToAccountFormData({
                    name: searchTerm,
                    ledger_group_id: assetGroups[0]?.id || 0,
                    spending_type_id: null,
                  });
                  setShowCreateToAccountDialog(true);
                }}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" account`}
              />
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
                onCreateNew={(searchTerm) => {
                  setPendingChargeLedgerName(searchTerm);
                  setChargeLedgerFormData({
                    name: searchTerm,
                    ledger_group_id: chargeGroups[0]?.id || 0,
                    spending_type_id: null,
                  });
                  setShowCreateChargeLedgerDialog(true);
                }}
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
                setShowTransferDialog(false);
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
              {createTransactionMutation.isPending ? "Recording..." : "Record Transfer"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create From Account Dialog */}
      <Dialog
        isOpen={showCreateFromAccountDialog}
        onClose={() => {
          setShowCreateFromAccountDialog(false);
          setError(null);
        }}
        title="Create Account"
        size="md"
      >
        <form onSubmit={handleCreateFromAccount} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Name *
            </label>
            <input
              type="text"
              value={fromAccountFormData.name}
              onChange={(e) =>
                setFromAccountFormData({
                  ...fromAccountFormData,
                  name: e.target.value,
                })
              }
              required
              placeholder="Enter account name"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
                searchText: group.name,
              }))}
              value={fromAccountFormData.ledger_group_id || 0}
              onChange={(value) =>
                setFromAccountFormData({
                  ...fromAccountFormData,
                  ledger_group_id:
                    typeof value === "number" ? value : parseInt(value as string),
                })
              }
              placeholder="Select account group"
              searchPlaceholder="Type to search groups..."
              required
              className="w-full"
              onCreateNew={(searchTerm) => {
                setPendingLedgerGroupName(searchTerm);
                setCreatingLedgerGroupFromForm("from");
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
                setShowCreateFromAccountDialog(false);
                setError(null);
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

      {/* Create To Account Dialog */}
      <Dialog
        isOpen={showCreateToAccountDialog}
        onClose={() => {
          setShowCreateToAccountDialog(false);
          setError(null);
        }}
        title="Create Account"
        size="md"
      >
        <form onSubmit={handleCreateToAccount} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Name *
            </label>
            <input
              type="text"
              value={toAccountFormData.name}
              onChange={(e) =>
                setToAccountFormData({
                  ...toAccountFormData,
                  name: e.target.value,
                })
              }
              required
              placeholder="Enter account name"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
                searchText: group.name,
              }))}
              value={toAccountFormData.ledger_group_id || 0}
              onChange={(value) =>
                setToAccountFormData({
                  ...toAccountFormData,
                  ledger_group_id:
                    typeof value === "number" ? value : parseInt(value as string),
                })
              }
              placeholder="Select account group"
              searchPlaceholder="Type to search groups..."
              required
              className="w-full"
              onCreateNew={(searchTerm) => {
                setPendingLedgerGroupName(searchTerm);
                setCreatingLedgerGroupFromForm("to");
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
                setShowCreateToAccountDialog(false);
                setError(null);
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

      {/* Create Charge Ledger Dialog */}
      <Dialog
        isOpen={showCreateChargeLedgerDialog}
        onClose={() => {
          setShowCreateChargeLedgerDialog(false);
          setError(null);
        }}
        title="Create Transaction Charges Ledger"
        size="md"
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
                setChargeLedgerFormData({
                  ...chargeLedgerFormData,
                  name: e.target.value,
                })
              }
              required
              placeholder="Enter ledger name"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
                searchText: group.name,
              }))}
              value={chargeLedgerFormData.ledger_group_id || 0}
              onChange={(value) =>
                setChargeLedgerFormData({
                  ...chargeLedgerFormData,
                  ledger_group_id:
                    typeof value === "number" ? value : parseInt(value as string),
                })
              }
              placeholder="Select ledger group"
              searchPlaceholder="Type to search groups..."
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

