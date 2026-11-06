export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const startLogin = () => {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const returnPath = currentPath.startsWith("/login") ? "/" : currentPath;
  window.location.assign(`/login?next=${encodeURIComponent(returnPath)}`);
};
