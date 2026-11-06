export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the direct Google OAuth flow from a user action.
export const startLogin = () => {
  window.location.href = "/api/auth/google/start";
};
