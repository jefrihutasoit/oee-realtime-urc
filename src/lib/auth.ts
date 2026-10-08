"use client";

import { useSyncExternalStore } from "react";
import { apiRequest } from "@/lib/api";
import { getToken, setToken, setUnauthorizedHandler } from "@/lib/session";
import type { LoginResult, Me, Permission } from "@/types/auth";

/**
 * Who is signed in, as a small external store: checked once with GET /auth/me when the app starts,
 * then changed by login, logout and expired sessions.
 */
export interface AuthState {
  status: "loading" | "anon" | "user";
  user: Me | null;
}

const LOADING: AuthState = { status: "loading", user: null };
let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

const signedOut = () => set({ status: "anon", user: null });

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  setUnauthorizedHandler(() => {
    setToken(null);
    signedOut();
  });
  if (!getToken()) return signedOut();
  apiRequest<Me>("/auth/me")
    .then((user) => set({ status: "user", user }))
    .catch(() => {
      setToken(null);
      signedOut();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

export function useAuth() {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

export async function login(username: string, password: string) {
  const result = await apiRequest<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(result.token);
  set({ status: "user", user: result.user });
}

export async function logout() {
  await apiRequest("/auth/logout", { method: "POST" }).catch(() => {});
  setToken(null);
  signedOut();
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiRequest<{ ok: true }>("/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });

/** Whether the signed-in user has the permission. */
export const can = (user: Me | null, permission: Permission) => !!user?.permissions.includes(permission);

/** Permission check for components. */
export function useCan(permission: Permission) {
  return can(useAuth().user, permission);
}
