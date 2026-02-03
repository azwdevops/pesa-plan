/**
 * Utility function to handle API responses and check for 401 errors.
 * If a 401 is detected, it logs out the user by clearing auth data and redirecting to login.
 * Returns true if 401 was handled, false otherwise.
 */
export function handleApiResponse(response: Response): boolean {
  if (response.status === 401) {
    // Clear auth data from localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem("pesa_plan_token");
      localStorage.removeItem("pesa_plan_user");
      // Redirect to login page
      window.location.href = "/login";
    }
    return true;
  }
  return false;
}

