import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTransaction,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  TransactionCreate,
  TransactionUpdate,
  TransactionType,
} from "@/lib/api/transactions";
import { useAuth } from "./use-auth";

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: (data: TransactionCreate) => {
      if (!token) throw new Error("Not authenticated");
      return createTransaction(token, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useTransactions(
  transactionType?: TransactionType,
  limit: number = 100,
  offset: number = 0
) {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["transactions", transactionType, limit, offset],
    queryFn: () => {
      if (!token) throw new Error("Not authenticated");
      return getTransactions(token, transactionType, limit, offset);
    },
    enabled: !!token,
    staleTime: 2 * 60 * 1000, // 2 minutes for transactions (more dynamic)
    refetchOnMount: false,
  });
}

export function useTransaction(transactionId: number) {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["transactions", transactionId],
    queryFn: () => {
      if (!token) throw new Error("Not authenticated");
      return getTransaction(token, transactionId);
    },
    enabled: !!token && !!transactionId,
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: ({ transactionId, data }: { transactionId: number; data: TransactionUpdate }) => {
      if (!token) throw new Error("Not authenticated");
      return updateTransaction(token, transactionId, data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions", data.id] });
      queryClient.invalidateQueries({ queryKey: ["ledger-report"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: (transactionId: number) => {
      if (!token) throw new Error("Not authenticated");
      return deleteTransaction(token, transactionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-report"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
    },
  });
}


