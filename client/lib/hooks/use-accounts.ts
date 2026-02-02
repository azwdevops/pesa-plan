"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getParentLedgerGroups,
  createParentLedgerGroup,
  getLedgerGroups,
  createLedgerGroup,
  updateLedgerGroup,
  deleteLedgerGroup,
  getSpendingTypes,
  createSpendingType,
  createLedger,
  updateLedger,
  deleteLedger,
  getLedgers,
  LedgerCreate,
  ParentLedgerGroupCreate,
  LedgerGroupCreate,
  SpendingTypeCreate,
} from "@/lib/api/accounts";
import { useAuth } from "./use-auth";

export function useParentLedgerGroups() {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["parentLedgerGroups"],
    queryFn: () => getParentLedgerGroups(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
  });
}

export function useCreateParentLedgerGroup() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ParentLedgerGroupCreate) =>
      createParentLedgerGroup(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parentLedgerGroups"] });
    },
  });
}

export function useLedgerGroups(parent_group_id?: number) {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["ledgerGroups", parent_group_id],
    queryFn: () => getLedgerGroups(token!, parent_group_id),
    enabled: !!token,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
  });
}

export function useCreateLedgerGroup() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LedgerGroupCreate) => createLedgerGroup(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgerGroups"] });
    },
  });
}

export function useLedgers() {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["ledgers"],
    queryFn: () => getLedgers(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
  });
}

export function useSpendingTypes() {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["spendingTypes"],
    queryFn: () => getSpendingTypes(token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: false,
  });
}

export function useCreateSpendingType() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SpendingTypeCreate) => createSpendingType(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spendingTypes"] });
    },
  });
}

export function useCreateLedger() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LedgerCreate) => createLedger(token!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    },
  });
}

export function useUpdateLedger() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: LedgerCreate }) =>
      updateLedger(token!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    },
  });
}

export function useDeleteLedger() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteLedger(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    },
  });
}

export function useUpdateLedgerGroup() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: LedgerGroupCreate }) =>
      updateLedgerGroup(token!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgerGroups"] });
    },
  });
}

export function useDeleteLedgerGroup() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteLedgerGroup(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledgerGroups"] });
    },
  });
}

