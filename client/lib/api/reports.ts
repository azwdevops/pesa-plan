import { handleApiResponse } from "../api-utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_URL environment variable is required");
}

export interface TrialBalanceItem {
  ledger_id: number;
  ledger_name: string;
  ledger_group_name: string;
  parent_group_name: string;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

export interface TrialBalanceResponse {
  start_date: string;
  end_date: string;
  items: TrialBalanceItem[];
  total_opening_debit: number;
  total_opening_credit: number;
  total_period_debit: number;
  total_period_credit: number;
  total_closing_debit: number;
  total_closing_credit: number;
  is_balanced: boolean;
}

export async function getTrialBalance(
  token: string,
  startDate: string,
  endDate: string
): Promise<TrialBalanceResponse> {
  const params = new URLSearchParams();
  params.append("start_date", startDate);
  params.append("end_date", endDate);

  const response = await fetch(
    `${API_BASE_URL}/api/v1/reports/trial-balance?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (handleApiResponse(response)) {
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch trial balance");
  }

  return response.json();
}

export interface LedgerEntry {
  transaction_id: number;
  transaction_date: string;
  reference: string | null;
  transaction_type: string;
  entry_type: string;
  amount: number;
  running_balance: number;
}

export interface LedgerReportResponse {
  ledger_id: number;
  ledger_name: string;
  ledger_group_name: string;
  parent_group_name: string;
  start_date: string;
  end_date: string;
  opening_balance: number;
  closing_balance: number;
  entries: LedgerEntry[];
  total_debit: number;
  total_credit: number;
}

export async function getLedgerReport(
  token: string,
  ledgerId: number,
  startDate: string,
  endDate: string
): Promise<LedgerReportResponse> {
  const params = new URLSearchParams();
  params.append("ledger_id", ledgerId.toString());
  params.append("start_date", startDate);
  params.append("end_date", endDate);

  const response = await fetch(
    `${API_BASE_URL}/api/v1/reports/ledger?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (handleApiResponse(response)) {
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to fetch ledger report");
  }

  return response.json();
}

