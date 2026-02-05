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

export default function CurrentAssetsPage() {
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

  // Find "Current Assets" parent group
  const currentAssetsParent = parentGroups.find(
    (pg) => pg.name === "Current Assets"
  );

  // Filter ledger groups that belong to "Current Assets"
  const currentAssetGroups = groups.filter(
    (group) => group.parent_ledger_group_id === currentAssetsParent?.id
  );

  // Filter ledgers: asset ledgers (for paying account)
  const assetGroups = groups.filter(
    (group) =>
      group.category === "bank_accounts" ||
      group.category === "cash_accounts"
  );

  const assetLedgers = ledgers.filter((ledger) =>
    assetGroups.some((group) => group.id === ledger.ledger_group_id)
  );

  const [showRecordAssetDialog, setShowRecordAssetDialog] = useState(false);
  const [showCreateAssetAccountDialog, setShowCreateAssetAccountDialog] = useState(false);
  const [showCreatePayingAccountDialog, setShowCreatePayingAccountDialog] = useState(false);
  const [showLedgerGroupForm, setShowLedgerGroupForm] = useState(false);
  const [pendingAssetAccountName, setPendingAssetAccountName] = useState("");
  const [pendingPayingAccountName, setPendingPayingAccountName] = useState("");
  const [pendingLedgerGroupName, setPendingLedgerGroupName] = useState("");
  const [creatingLedgerGroupFromForm, setCreatingLedgerGroupFromForm] = useState<"asset" | "paying" | null>(null);
  const [ledgerGroupFormData, setLedgerGroupFormData] = useState<LedgerGroupCreate>({
    name: "",
    parent_ledger_group_id: 0,
    category: "other",
  });
  const [formData, setFormData] = useState({
    transaction_date: new Date(),
    asset_account_id: 0,
    paying_account_id: 0,
    amount: "",
    reference: "",
  });
  const [assetAccountFormData, setAssetAccountFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: currentAssetGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [payingAccountFormData, setPayingAccountFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: assetGroups[0]?.id || 0,
    spending_type_id: null,
  });
  const [error, setError] = useState<string | null>(null);

  // Filter to only current asset ledgers
  const currentAssetLedgers = ledgers.filter((ledger) =>
    currentAssetGroups.some((group) => group.id === ledger.ledger_group_id)
  );

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

  const handleRecordAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.asset_account_id) {
      setError("Please select an asset account");
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

    const amount = parseFloat(formData.amount);
    const transactionDate = formatDateForAPI(formData.transaction_date);

    // Build transaction items for asset purchase:
    // Debit: Asset account (increases asset)
    // Credit: Paying account (decreases asset - cash/bank)
    const items = [
      {
        ledger_id: formData.asset_account_id,
        entry_type: "DEBIT" as const,
        amount: amount,
      },
      {
        ledger_id: formData.paying_account_id,
        entry_type: "CREDIT" as const,
        amount: amount,
      },
    ];

    try {
      // Create transaction with double-entry accounting for asset purchase:
      // Debit: Asset account (increases asset)
      // Credit: Paying account (decreases asset - cash/bank)
      await createTransactionMutation.mutateAsync({
        transaction_date: transactionDate,
        reference:
          formData.reference && formData.reference.trim() !== ""
            ? formData.reference.trim()
            : null,
        transaction_type: "JOURNAL",
        total_amount: amount,
        items: items,
      });

      // Reset form and close dialog
      setFormData({
        transaction_date: new Date(),
        asset_account_id: 0,
        paying_account_id: 0,
        amount: "",
        reference: "",
      });
      setShowRecordAssetDialog(false);
      alert("Asset purchase recorded successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record asset purchase");
    }
  };

  const handleCreateAssetAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!assetAccountFormData.name.trim()) {
      setError("Asset account name is required");
      return;
    }

    if (!assetAccountFormData.ledger_group_id) {
      setError("Please select a ledger group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(assetAccountFormData);
      
      // Set the newly created ledger as the selected asset account
      setFormData({
        ...formData,
        asset_account_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setAssetAccountFormData({
        name: "",
        ledger_group_id: currentAssetGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreateAssetAccountDialog(false);
      setPendingAssetAccountName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset account");
    }
  };

  const handleCreatePayingAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!payingAccountFormData.name.trim()) {
      setError("Account name is required");
      return;
    }

    if (!payingAccountFormData.ledger_group_id) {
      setError("Please select an account group");
      return;
    }

    try {
      const newLedger = await createLedgerMutation.mutateAsync(payingAccountFormData);
      
      // Set the newly created ledger as the selected paying account
      setFormData({
        ...formData,
        paying_account_id: newLedger.id,
      });

      // Reset ledger form and close dialog
      setPayingAccountFormData({
        name: "",
        ledger_group_id: assetGroups[0]?.id || 0,
        spending_type_id: null,
      });
      setShowCreatePayingAccountDialog(false);
      setPendingPayingAccountName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    }
  };

  const handleCreateNewAssetAccount = (searchTerm: string) => {
    setPendingAssetAccountName(searchTerm);
    setAssetAccountFormData({
      name: searchTerm,
      ledger_group_id: currentAssetGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreateAssetAccountDialog(true);
  };

  const handleCreateNewPayingAccount = (searchTerm: string) => {
    setPendingPayingAccountName(searchTerm);
    setPayingAccountFormData({
      name: searchTerm,
      ledger_group_id: assetGroups[0]?.id || 0,
      spending_type_id: null,
    });
    setShowCreatePayingAccountDialog(true);
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
      if (creatingLedgerGroupFromForm === "asset") {
        setAssetAccountFormData({
          ...assetAccountFormData,
          ledger_group_id: newLedgerGroup.id,
        });
      } else if (creatingLedgerGroupFromForm === "paying") {
        setPayingAccountFormData({
          ...payingAccountFormData,
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

  // Fetch all transactions with items to calculate asset balances
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

  // Calculate asset balances (for assets: debit - credit)
  const assetsByLedger = useMemo(() => {
    const ledgerBalances = new Map<number, number>();

    // Process all transactions to calculate balances
    if (transactionsWithItems.length > 0) {
      transactionsWithItems.forEach((transaction) => {
        transaction.items.forEach((item) => {
          // Check if this ledger is a current asset ledger
          const ledger = ledgers.find(l => l.id === item.ledger_id);
          if (ledger && currentAssetLedgers.some(ca => ca.id === ledger.id)) {
            const amount =
              typeof item.amount === "string"
                ? parseFloat(item.amount)
                : Number(item.amount) || 0;

            const existing = ledgerBalances.get(item.ledger_id) || 0;
            // For assets: DEBIT increases balance, CREDIT decreases balance
            if (item.entry_type === "DEBIT") {
              ledgerBalances.set(item.ledger_id, existing + amount);
            } else if (item.entry_type === "CREDIT") {
              ledgerBalances.set(item.ledger_id, existing - amount);
            }
          }
        });
      });
    }

    // Calculate total assets (for percentage calculation)
    const totalAssets = Array.from(ledgerBalances.values())
      .filter(balance => balance > 0) // Only show positive balances
      .reduce((sum, balance) => sum + balance, 0);

    // Build result array with ledger names, only including positive balances
    const result = Array.from(ledgerBalances.entries())
      .filter(([_, balance]) => balance > 0) // Only show positive balances
      .map(([ledgerId, balance]) => {
        const ledger = ledgers.find(l => l.id === ledgerId);
        return {
          ledger_id: ledgerId,
          name: ledger?.name || `Ledger ${ledgerId}`,
          value: balance,
          percentage: totalAssets > 0 ? (balance / totalAssets) * 100 : 0,
        };
      })
      .sort((a, b) => b.value - a.value); // Sort by balance descending

    return result;
  }, [transactionsWithItems, ledgers, currentAssetLedgers]);

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
                Current Assets
              </h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                View and manage current asset balances
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
                onClick={() => setShowRecordAssetDialog(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                + Record Asset Purchase
              </button>
            </div>
          </div>

          {/* Current Assets by Ledger Chart */}
          {assetsByLedger.length > 0 ? (
            <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 md:p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  Current Assets by Ledger
                </h2>
              </div>

              <div className="flex flex-col">
                <div className="h-[450px] sm:h-[550px] md:h-[650px] lg:h-[700px] xl:h-[750px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 15, bottom: 10, left: 15 }}>
                      <Pie
                        data={assetsByLedger}
                        cx="50%"
                        cy="40%"
                        labelLine={true}
                        label={(props: any) => {
                          const entry = assetsByLedger[props.index];
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
                        {assetsByLedger.map((entry, index) => (
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
                  {assetsByLedger.map((entry, index) => (
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
          ) : (
            <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-zinc-600 dark:text-zinc-400">
                No current assets found. Create asset accounts in{" "}
                <a
                  href="/accounts"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Accounts
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Record Asset Purchase Dialog */}
      <Dialog
        isOpen={showRecordAssetDialog}
        onClose={() => {
          setShowRecordAssetDialog(false);
          setError(null);
        }}
        title="Record Asset Purchase"
        size="lg"
      >
        <form onSubmit={handleRecordAsset} className="space-y-4">
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
                placeholder="What is this asset purchase about?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Asset Account *
              </label>
              <SearchableSelect
                options={currentAssetLedgers.map((ledger) => ({
                  value: ledger.id,
                  label: ledger.name,
                  searchText: ledger.name,
                }))}
                value={formData.asset_account_id || 0}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    asset_account_id:
                      typeof value === "number" ? value : parseInt(value as string),
                  })
                }
                placeholder="Select asset account"
                searchPlaceholder="Type to search asset accounts..."
                required
                className="w-full"
                allowClear
                onCreateNew={handleCreateNewAssetAccount}
                createNewLabel={(searchTerm) => `Create "${searchTerm}" asset account`}
              />
              {currentAssetLedgers.length === 0 && !ledgersLoading && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  No current asset accounts found. Create one in{" "}
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
                onCreateNew={handleCreateNewPayingAccount}
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
                setShowRecordAssetDialog(false);
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
              {createTransactionMutation.isPending ? "Recording..." : "Record Purchase"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create Asset Account Dialog */}
      <Dialog
        isOpen={showCreateAssetAccountDialog}
        onClose={() => {
          setShowCreateAssetAccountDialog(false);
          setError(null);
          setPendingAssetAccountName("");
        }}
        title="Create Current Asset Account"
        size="lg"
      >
        <form onSubmit={handleCreateAssetAccount} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Name *
            </label>
            <input
              type="text"
              value={assetAccountFormData.name}
              onChange={(e) =>
                setAssetAccountFormData({ ...assetAccountFormData, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="e.g., Inventory, Accounts Receivable"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Ledger Group *
            </label>
            <SearchableSelect
              options={currentAssetGroups.map((group) => ({
                value: group.id,
                label: group.name,
                searchText: group.parent_ledger_group
                  ? `${group.name} ${group.parent_ledger_group.name}`
                  : group.name,
              }))}
              value={assetAccountFormData.ledger_group_id || 0}
              onChange={(value) =>
                setAssetAccountFormData({
                  ...assetAccountFormData,
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
                setCreatingLedgerGroupFromForm("asset");
                setLedgerGroupFormData({
                  name: searchTerm,
                  parent_ledger_group_id: currentAssetsParent?.id || 0,
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
                setShowCreateAssetAccountDialog(false);
                setError(null);
                setPendingAssetAccountName("");
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

      {/* Create Paying Account Dialog */}
      <Dialog
        isOpen={showCreatePayingAccountDialog}
        onClose={() => {
          setShowCreatePayingAccountDialog(false);
          setError(null);
          setPendingPayingAccountName("");
        }}
        title="Create Paying Account"
        size="lg"
      >
        <form onSubmit={handleCreatePayingAccount} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Account Name *
            </label>
            <input
              type="text"
              value={payingAccountFormData.name}
              onChange={(e) =>
                setPayingAccountFormData({ ...payingAccountFormData, name: e.target.value })
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
              value={payingAccountFormData.ledger_group_id || 0}
              onChange={(value) =>
                setPayingAccountFormData({
                  ...payingAccountFormData,
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
                setCreatingLedgerGroupFromForm("paying");
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
                setShowCreatePayingAccountDialog(false);
                setError(null);
                setPendingPayingAccountName("");
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

