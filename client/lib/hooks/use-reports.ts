import { useQuery } from "@tanstack/react-query";
import { getTrialBalance, getLedgerReport } from "@/lib/api/reports";
import { useAuth } from "./use-auth";

export function useTrialBalance(startDate: string, endDate: string) {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["trial-balance", startDate, endDate],
    queryFn: () => {
      if (!token) throw new Error("Not authenticated");
      return getTrialBalance(token, startDate, endDate);
    },
    enabled: !!token && !!startDate && !!endDate,
  });
}

export function useLedgerReport(
  ledgerId: number | null,
  startDate: string,
  endDate: string
) {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["ledger-report", ledgerId, startDate, endDate],
    queryFn: () => {
      if (!token || !ledgerId) throw new Error("Not authenticated or ledger not selected");
      return getLedgerReport(token, ledgerId, startDate, endDate);
    },
    enabled: !!token && !!ledgerId && !!startDate && !!endDate,
  });
}

