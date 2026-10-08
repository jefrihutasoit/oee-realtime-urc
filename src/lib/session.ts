// The session token of the signed-in user, kept in this browser. Separate from auth.ts so the API
// client can read it without importing the auth store.

const KEY = "oee.session";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the session lasts until the page is reloaded.
  }
}

let onUnauthorized: () => void = () => {};

/** Called by the API client when the backend rejects the session (expired, signed out, user disabled). */
export const sessionExpired = () => onUnauthorized();
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};
