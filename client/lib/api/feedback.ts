const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_URL environment variable is required");
}

import { handleApiResponse } from "../api-utils";

export type FeedbackType = "feature_request" | "bug_report";

export interface Feedback {
  id: number;
  user_id: number;
  feedback_type: FeedbackType;
  title: string;
  description: string;
  is_resolved: boolean;
  created_at: string;
}

export interface FeedbackCreate {
  feedback_type: FeedbackType;
  title: string;
  description: string;
}

export interface FeedbackUpdate {
  is_resolved: boolean;
}

export type FeedbackStatusFilter = "pending" | "resolved" | "all";

export async function createFeedback(
  token: string,
  data: FeedbackCreate
): Promise<Feedback> {
  const response = await fetch(`${API_BASE_URL}/api/v1/feedback/`, {
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
    throw new Error(error.detail || "Failed to submit feedback");
  }

  return response.json();
}

export async function getFeedback(
  token: string,
  feedback_type?: FeedbackType,
  status?: FeedbackStatusFilter
): Promise<Feedback[]> {
  const params = new URLSearchParams();
  if (feedback_type) params.append("feedback_type", feedback_type);
  if (status) params.append("status", status);

  const response = await fetch(
    `${API_BASE_URL}/api/v1/feedback/?${params.toString()}`,
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
    throw new Error("Failed to fetch feedback");
  }

  return response.json();
}

export async function updateFeedback(
  token: string,
  feedbackId: number,
  data: FeedbackUpdate
): Promise<Feedback> {
  const response = await fetch(`${API_BASE_URL}/api/v1/feedback/${feedbackId}`, {
    method: "PUT",
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
    throw new Error(error.detail || "Failed to update feedback");
  }

  return response.json();
}

