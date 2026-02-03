"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Dialog } from "@/components/Dialog";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSidebar } from "@/contexts/SidebarContext";
import { useCreateFeedback, useFeedback, useUpdateFeedback } from "@/lib/hooks/use-feedback";
import type { FeedbackType, FeedbackStatusFilter } from "@/lib/api/feedback";

export default function FeedbackPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen, toggleSidebar } = useSidebar();
  const createFeedbackMutation = useCreateFeedback();
  const updateFeedbackMutation = useUpdateFeedback();
  const [statusFilter, setStatusFilter] = useState<FeedbackStatusFilter>("pending");
  const { data: feedbackList = [], refetch: refetchFeedback } = useFeedback(undefined, statusFilter);

  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [selectedType, setSelectedType] = useState<FeedbackType | null>(null);
  const [formData, setFormData] = useState({
    feedback_type: "feature_request" as FeedbackType,
    title: "",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Don't show loading screen if we're just checking auth - only show if actually loading
  if (!isAuthenticated && !isLoading) {
    return null; // Will redirect, don't render anything
  }

  const handleOpenDialog = (type: FeedbackType) => {
    setSelectedType(type);
    setFormData({
      feedback_type: type,
      title: "",
      description: "",
    });
    setError(null);
    setSuccess(null);
    setShowSubmitDialog(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }

    if (!formData.description.trim()) {
      setError("Description is required");
      return;
    }

    try {
      await createFeedbackMutation.mutateAsync({
        feedback_type: formData.feedback_type,
        title: formData.title.trim(),
        description: formData.description.trim(),
      });

      // Reset form and show success
      setFormData({
        feedback_type: formData.feedback_type,
        title: "",
        description: "",
      });
      setSuccess(
        formData.feedback_type === "feature_request"
          ? "Feature request submitted successfully!"
          : "Bug report submitted successfully!"
      );
      
      // Refetch feedback list
      await refetchFeedback();

      // Close dialog after a short delay
      setTimeout(() => {
        setShowSubmitDialog(false);
        setSuccess(null);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback");
    }
  };

  const handleMarkResolved = async (feedbackId: number, isResolved: boolean) => {
    try {
      await updateFeedbackMutation.mutateAsync({
        id: feedbackId,
        data: { is_resolved: isResolved },
      });
      await refetchFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update feedback");
    }
  };

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
              Feedback & Support
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Request a feature or report a bug to help us improve Pesa Plan
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mb-8 flex gap-4">
            <button
              onClick={() => handleOpenDialog("feature_request")}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-center transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span className="text-2xl">💡</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                Request a Feature
              </span>
            </button>

            <button
              onClick={() => handleOpenDialog("bug_report")}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-center transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span className="text-2xl">🐛</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                Report a Bug
              </span>
            </button>
          </div>

          {/* Status Filter */}
          <div className="mb-6 flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Filter:
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setStatusFilter("pending")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === "pending"
                    ? "bg-blue-600 text-white dark:bg-blue-500"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setStatusFilter("resolved")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === "resolved"
                    ? "bg-blue-600 text-white dark:bg-blue-500"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                Resolved
              </button>
              <button
                onClick={() => setStatusFilter("all")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === "all"
                    ? "bg-blue-600 text-white dark:bg-blue-500"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                All
              </button>
            </div>
          </div>

          {/* Previous Submissions */}
          {feedbackList.length > 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                Your Submissions
              </h2>
              <div className="space-y-4">
                {feedbackList.map((feedback) => (
                  <div
                    key={feedback.id}
                    className={`rounded-lg border p-4 ${
                      feedback.is_resolved
                        ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                        : "border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {feedback.feedback_type === "feature_request" ? "💡" : "🐛"}
                        </span>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {feedback.title}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            feedback.feedback_type === "feature_request"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {feedback.feedback_type === "feature_request"
                            ? "Feature Request"
                            : "Bug Report"}
                        </span>
                        {feedback.is_resolved && (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Resolved
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">
                          {new Date(feedback.created_at).toLocaleDateString()}
                        </span>
                        {!feedback.is_resolved && (
                          <button
                            onClick={() => handleMarkResolved(feedback.id, true)}
                            disabled={updateFeedbackMutation.isPending}
                            className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-500 dark:hover:bg-green-600"
                          >
                            Mark as Resolved
                          </button>
                        )}
                        {feedback.is_resolved && (
                          <button
                            onClick={() => handleMarkResolved(feedback.id, false)}
                            disabled={updateFeedbackMutation.isPending}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                          >
                            Mark as Pending
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      {feedback.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-center text-zinc-600 dark:text-zinc-400">
                {statusFilter === "pending"
                  ? "No pending feedback submissions."
                  : statusFilter === "resolved"
                  ? "No resolved feedback submissions."
                  : "No feedback submissions yet."}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Submit Feedback Dialog */}
      <Dialog
        isOpen={showSubmitDialog}
        onClose={() => {
          setShowSubmitDialog(false);
          setError(null);
          setSuccess(null);
        }}
        title={
          selectedType === "feature_request"
            ? "Request a Feature"
            : "Report a Bug"
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              required
              placeholder={
                selectedType === "feature_request"
                  ? "e.g., Add export to PDF functionality"
                  : "e.g., Transaction not saving correctly"
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
              rows={6}
              placeholder={
                selectedType === "feature_request"
                  ? "Please describe the feature you'd like to see. Include details about how it would work and why it would be useful."
                  : "Please describe the bug you encountered. Include steps to reproduce, what you expected to happen, and what actually happened."
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200">
              {success}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setShowSubmitDialog(false);
                setError(null);
                setSuccess(null);
              }}
              className="rounded-lg border border-zinc-300 px-6 py-2 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createFeedbackMutation.isPending}
              className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {createFeedbackMutation.isPending
                ? "Submitting..."
                : selectedType === "feature_request"
                ? "Submit Feature Request"
                : "Submit Bug Report"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

