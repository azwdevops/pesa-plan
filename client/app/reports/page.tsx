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
import { useParentLedgerGroups, useLedgers } from "@/lib/hooks/use-accounts";

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
  const { data: ledgerReport, isLoading: ledgerReportLoading } = useLedgerReport(
    selectedLedgerId,
    formatDateForAPI(ledgerStartDate),
    formatDateForAPI(ledgerEndDate)
  );
  const { data: parentGroups = [] } = useParentLedgerGroups();

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
              <div className="overflow-x-auto max-h-[60vh]">
                <table className="w-full text-sm border border-zinc-300 dark:border-zinc-500 border-separate border-spacing-0">
                  <thead className="border-b-2 border-zinc-300 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-800/50 sticky top-0">
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
    </div>
  );
}

