import { handleApiResponse } from "../api-utils";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_URL environment variable is required");
}

export type TransactionType = "MONEY_RECEIVED" | "MONEY_PAID" | "JOURNAL";
export type EntryType = "DEBIT" | "CREDIT";

export interface TransactionItem {
  ledger_id: number;
  entry_type: EntryType;
  amount: number;
}

export interface Transaction {
  id: number;
  user_id: number;
  transaction_date: string;
  reference: string | null;
  transaction_type: TransactionType;
  total_amount: number;
  created_at: string;
  updated_at: string | null;
}

export interface TransactionItemResponse {
  id: number;
  transaction_id: number;
  ledger_id: number;
  entry_type: EntryType;
  amount: number;
  created_at: string;
}

export interface TransactionWithItems extends Transaction {
  items: TransactionItemResponse[];
}

export interface TransactionCreate {
  transaction_date: string;
  reference?: string | null;
  transaction_type: TransactionType;
  total_amount: number;
  items: TransactionItem[];
}

export async function createTransaction(
  token: string,
  data: TransactionCreate
): Promise<Transaction> {
  const response = await fetch(`${API_BASE_URL}/api/v1/transactions/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (handleApiResponse(response)) {
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to create transaction");
  }

  return response.json();
}

export async function getTransactions(
  token: string,
  transaction_type?: TransactionType,
  limit: number = 100,
  offset: number = 0
): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (transaction_type) params.append("transaction_type", transaction_type);
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());

  const response = await fetch(
    `${API_BASE_URL}/api/v1/transactions/?${params.toString()}`,
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
    throw new Error("Failed to fetch transactions");
  }

  return response.json();
}

export async function getTransaction(
  token: string,
  transactionId: number
): Promise<TransactionWithItems> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/transactions/${transactionId}`,
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
    throw new Error("Failed to fetch transaction");
  }

  return response.json();
}


