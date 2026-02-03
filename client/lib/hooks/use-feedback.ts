"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFeedback,
  getFeedback,
  updateFeedback,
  FeedbackCreate,
  FeedbackUpdate,
  FeedbackType,
  FeedbackStatusFilter,
} from "@/lib/api/feedback";
import { useAuth } from "./use-auth";

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: (data: FeedbackCreate) => {
      if (!token) throw new Error("Not authenticated");
      return createFeedback(token, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
}

export function useUpdateFeedback() {
  const queryClient = useQueryClient();
  const { token } = useAuth();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FeedbackUpdate }) => {
      if (!token) throw new Error("Not authenticated");
      return updateFeedback(token, id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
    },
  });
}

export function useFeedback(
  feedbackType?: FeedbackType,
  status?: FeedbackStatusFilter
) {
  const { token } = useAuth();

  return useQuery({
    queryKey: ["feedback", feedbackType, status],
    queryFn: () => {
      if (!token) throw new Error("Not authenticated");
      return getFeedback(token, feedbackType, status);
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
  });
}

