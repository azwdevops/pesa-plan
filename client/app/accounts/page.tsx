"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Dialog } from "@/components/Dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  useParentLedgerGroups,
  useLedgerGroups,
  useSpendingTypes,
  useCreateSpendingType,
  useLedgers,
  useCreateLedger,
  useUpdateLedger,
  useDeleteLedger,
  useCreateLedgerGroup,
  useUpdateLedgerGroup,
  useDeleteLedgerGroup,
} from "@/lib/hooks/use-accounts";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSidebar } from "@/contexts/SidebarContext";
import { DropdownMenu } from "@/components/DropdownMenu";
import type {
  LedgerCreate,
  LedgerGroupCreate,
  Ledger,
  LedgerGroup,
} from "@/lib/api/accounts";

export default function AccountsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const { data: parentGroups = [] } = useParentLedgerGroups();
  const { data: groups = [] } = useLedgerGroups();
  const { data: spendingTypes = [] } = useSpendingTypes();
  const { data: ledgers = [], isLoading: ledgersLoading } = useLedgers();
  const createLedgerMutation = useCreateLedger();
  const updateLedgerMutation = useUpdateLedger();
  const deleteLedgerMutation = useDeleteLedger();
  const createSpendingTypeMutation = useCreateSpendingType();
  const createLedgerGroupMutation = useCreateLedgerGroup();
  const updateLedgerGroupMutation = useUpdateLedgerGroup();
  const deleteLedgerGroupMutation = useDeleteLedgerGroup();

  const [showForm, setShowForm] = useState(false);
  const [showSpendingTypeForm, setShowSpendingTypeForm] = useState(false);
  const [showLedgerGroupForm, setShowLedgerGroupForm] = useState(false);
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [editingLedgerGroup, setEditingLedgerGroup] = useState<LedgerGroup | null>(null);
  const [deletingLedger, setDeletingLedger] = useState<Ledger | null>(null);
  const [deletingLedgerGroup, setDeletingLedgerGroup] = useState<LedgerGroup | null>(null);
  const [pendingLedgerGroupName, setPendingLedgerGroupName] = useState("");
  const [creatingLedgerGroupFromForm, setCreatingLedgerGroupFromForm] = useState(false);
  const [formData, setFormData] = useState<LedgerCreate>({
    name: "",
    ledger_group_id: 0,
    spending_type_id: null,
  });
  const [spendingTypeFormData, setSpendingTypeFormData] = useState({
    name: "",
  });
  const [ledgerGroupFormData, setLedgerGroupFormData] = useState<LedgerGroupCreate>({
    name: "",
    parent_ledger_group_id: 0,
    category: "other",
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Account name is required");
      return;
    }

    if (!formData.ledger_group_id) {
      setError("Please select a ledger group");
      return;
    }

    try {
      if (editingLedger) {
        await updateLedgerMutation.mutateAsync({ id: editingLedger.id, data: formData });
        setEditingLedger(null);
      } else {
        await createLedgerMutation.mutateAsync(formData);
      }
      setShowForm(false);
      setFormData({
        name: "",
        ledger_group_id: 0,
        spending_type_id: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
    }
  };

  const handleSpendingTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!spendingTypeFormData.name.trim()) {
      setError("Spending type name is required");
      return;
    }

    try {
      await createSpendingTypeMutation.mutateAsync({
        name: spendingTypeFormData.name,
      });
      setShowSpendingTypeForm(false);
      setSpendingTypeFormData({
        name: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create spending type");
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
      if (editingLedgerGroup) {
        await updateLedgerGroupMutation.mutateAsync({ id: editingLedgerGroup.id, data: ledgerGroupFormData });
        setEditingLedgerGroup(null);
      } else {
        const newLedgerGroup = await createLedgerGroupMutation.mutateAsync(ledgerGroupFormData);
        
        // If creating from the ledger form, automatically select the newly created ledger group
        if (creatingLedgerGroupFromForm) {
          setFormData({
            ...formData,
            ledger_group_id: newLedgerGroup.id,
          });
          setCreatingLedgerGroupFromForm(false);
        }
      }
      setShowLedgerGroupForm(false);
      setLedgerGroupFormData({
        name: "",
        parent_ledger_group_id: 0,
        category: "other",
      });
      setPendingLedgerGroupName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save ledger group");
    }
  };

  const handleEditLedger = (ledger: Ledger) => {
    setEditingLedger(ledger);
    setFormData({
      name: ledger.name,
      ledger_group_id: ledger.ledger_group_id,
      spending_type_id: ledger.spending_type_id,
    });
    setShowForm(true);
  };

  const handleEditLedgerGroup = (group: LedgerGroup) => {
    setEditingLedgerGroup(group);
    setLedgerGroupFormData({
      name: group.name,
      parent_ledger_group_id: group.parent_ledger_group_id,
      category: group.category,
    });
    setShowLedgerGroupForm(true);
  };

  const handleDeleteLedger = async () => {
    if (!deletingLedger) return;
    try {
      await deleteLedgerMutation.mutateAsync(deletingLedger.id);
      setDeletingLedger(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    }
  };

  const handleDeleteLedgerGroup = async () => {
    if (!deletingLedgerGroup) return;
    try {
      await deleteLedgerGroupMutation.mutateAsync(deletingLedgerGroup.id);
      setDeletingLedgerGroup(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete ledger group");
    }
  };

  // Get the selected ledger group to check if spending category should be shown
  // Show spending category if parent ledger group is Expenditure, Fixed Assets, or Current Assets
  const selectedGroup = groups.find((g) => g.id === formData.ledger_group_id);
  const parentGroup = selectedGroup?.parent_ledger_group;
  const shouldShowSpendingCategory = parentGroup
    ? (() => {
        const parentNameLower = parentGroup.name.toLowerCase();
        return (
          parentNameLower.includes("expenditure") ||
          parentNameLower.includes("fixed assets") ||
          parentNameLower.includes("current assets")
        );
      })()
    : false;

  // Group ledgers by ledger group
  const ledgersByGroup = ledgers.reduce((acc, ledger) => {
    const groupId = ledger.ledger_group_id;
    if (!acc[groupId]) {
      acc[groupId] = [];
    }
    acc[groupId].push(ledger);
    return acc;
  }, {} as Record<number, typeof ledgers>);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950" suppressHydrationWarning>
      <Header onMenuClick={toggleSidebar} isSidebarOpen={isSidebarOpen} />
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
            Accounts
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Manage your chart of accounts
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLedgerGroupForm(true)}
            className="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            + Add Ledger Group
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            + Add Account
          </button>
        </div>
      </div>

      <Dialog
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Create New Account"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Account Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  placeholder="e.g., M-Pesa, Equity Bank"
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
                  value={formData.ledger_group_id || 0}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      ledger_group_id: typeof value === "number" ? value : parseInt(value as string),
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

              {shouldShowSpendingCategory && (
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
                    value={formData.spending_type_id || 0}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
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
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={createLedgerMutation.isPending || updateLedgerMutation.isPending}
                className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {createLedgerMutation.isPending || updateLedgerMutation.isPending
                  ? "Saving..."
                  : editingLedger
                  ? "Update Account"
                  : "Create Account"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </form>
      </Dialog>

      {/* Create Ledger Group Dialog */}
      <Dialog
        isOpen={showLedgerGroupForm}
        onClose={() => {
          setShowLedgerGroupForm(false);
          setEditingLedgerGroup(null);
          setCreatingLedgerGroupFromForm(false);
          setLedgerGroupFormData({
            name: "",
            parent_ledger_group_id: 0,
            category: "other",
          });
          setPendingLedgerGroupName("");
        }}
        title={editingLedgerGroup ? "Edit Ledger Group" : "Create Ledger Group"}
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

          <div className="flex gap-4">
              <button
                type="submit"
                disabled={createLedgerGroupMutation.isPending || updateLedgerGroupMutation.isPending}
                className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {createLedgerGroupMutation.isPending || updateLedgerGroupMutation.isPending
                  ? "Saving..."
                  : editingLedgerGroup
                  ? "Update Ledger Group"
                  : "Create Ledger Group"}
              </button>
            <button
              type="button"
              onClick={() => setShowLedgerGroupForm(false)}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      </Dialog>

      {/* Create Spending Type Dialog */}
      <Dialog
        isOpen={showSpendingTypeForm}
        onClose={() => setShowSpendingTypeForm(false)}
        title="Create Spending Type"
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
                : "Create Spending Type"}
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

      {/* Ledger Groups List */}
      <div className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Ledger Groups
        </h2>
        {groups.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              No ledger groups yet. Create your first ledger group to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {groups.map((group) => (
              <div
                key={group.id}
                className="relative rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="absolute right-1 top-1">
                  <DropdownMenu
                    items={[
                      {
                        label: "Edit",
                        onClick: () => handleEditLedgerGroup(group),
                      },
                      {
                        label: "Delete",
                        onClick: () => setDeletingLedgerGroup(group),
                        danger: true,
                      },
                    ]}
                  />
                </div>
                <div className="pr-8">
                  <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                    {group.name}
                  </h3>
                  {group.parent_ledger_group && (
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {group.parent_ledger_group.name}
                    </p>
                  )}
                  <div className="mt-2">
                    <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                      {group.category}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {(ledgersByGroup[group.id] || []).length} account(s)
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accounts List */}
      <div>
        <h2 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Accounts
        </h2>
        {ledgersLoading ? (
          <div className="text-center text-zinc-600 dark:text-zinc-400">
            Loading accounts...
          </div>
        ) : ledgers.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              No accounts yet. Create your first account to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {ledgers.map((ledger) => {
              const ledgerGroup = groups.find((g) => g.id === ledger.ledger_group_id);
              return (
                <div
                  key={ledger.id}
                  className="relative rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="absolute right-1 top-1">
                    <DropdownMenu
                      items={[
                        {
                          label: "Edit",
                          onClick: () => handleEditLedger(ledger),
                        },
                        {
                          label: "Delete",
                          onClick: () => setDeletingLedger(ledger),
                          danger: true,
                        },
                      ]}
                    />
                  </div>
                  <div className="pr-8">
                    <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      {ledger.name}
                    </h3>
                    {ledgerGroup && (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {ledgerGroup.name}
                      </p>
                    )}
                    {ledger.spending_type && (
                      <div className="mt-2">
                        <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200">
                          {ledger.spending_type.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialogs */}
      <Dialog
        isOpen={!!deletingLedger}
        onClose={() => setDeletingLedger(null)}
        title="Delete Account"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-zinc-700 dark:text-zinc-300">
            Are you sure you want to delete the account "{deletingLedger?.name}"? This action cannot be undone.
          </p>
          <div className="flex gap-4">
            <button
              onClick={handleDeleteLedger}
              disabled={deleteLedgerMutation.isPending}
              className="rounded-lg bg-red-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
            >
              {deleteLedgerMutation.isPending ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={() => setDeletingLedger(null)}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        isOpen={!!deletingLedgerGroup}
        onClose={() => setDeletingLedgerGroup(null)}
        title="Delete Ledger Group"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-zinc-700 dark:text-zinc-300">
            Are you sure you want to delete the ledger group "{deletingLedgerGroup?.name}"? This action cannot be undone.
          </p>
          <div className="flex gap-4">
            <button
              onClick={handleDeleteLedgerGroup}
              disabled={deleteLedgerGroupMutation.isPending}
              className="rounded-lg bg-red-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600"
            >
              {deleteLedgerGroupMutation.isPending ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={() => setDeletingLedgerGroup(null)}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      </Dialog>
      </div>
      </main>
    </div>
  );
}

