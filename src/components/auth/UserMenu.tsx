"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, KeyRound, Loader2, LogIn, LogOut } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { changePassword, logout, useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/types/auth";

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none";

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 6) return setMessage({ text: "New password must be at least 6 characters", ok: false });
    if (next !== confirm) return setMessage({ text: "The new passwords do not match", ok: false });
    setBusy(true);
    try {
      await changePassword(current, next);
      setMessage({ text: "Password changed", ok: true });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to change password", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      size="sm"
      title="Change Password"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Close
          </button>
          <button type="submit" form="password-form" disabled={busy} className={buttonStyles.primary}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save
          </button>
        </>
      }
    >
      <form id="password-form" onSubmit={handleSubmit} className="space-y-3">
        {message && (
          <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {message.text}
          </p>
        )}
        {(
          [
            ["Current password", current, setCurrent, "current-password"],
            ["New password", next, setNext, "new-password"],
            ["Repeat new password", confirm, setConfirm, "new-password"],
          ] as const
        ).map(([label, value, setValue, auto]) => (
          <label key={label} className="block space-y-1.5 text-sm font-medium text-slate-700">
            {label}
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete={auto}
              className={inputCls}
            />
          </label>
        ))}
      </form>
    </Modal>
  );
}

/** Signed-in user (name and role) in the header, with change password and sign out; Sign in for guests. */
export default function UserMenu() {
  const { user, status } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!user) {
    if (status !== "anon") return null;
    return (
      <div className="flex items-center gap-2.5">
        <span className="hidden text-right md:block">
          <span className="block text-sm leading-tight font-medium text-slate-900">Guest</span>
          <span className="block text-xs text-slate-500">Dashboard only</span>
        </span>
        <Link
          href={`/login?next=${encodeURIComponent(pathname)}`}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1E6FD9] px-3 text-sm font-medium text-white hover:bg-[#185DB8]"
        >
          <LogIn size={16} />
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-md py-1 pr-1 pl-1 hover:bg-slate-100"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-[#1E3A5F] text-sm font-medium text-white">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-left md:block">
          <span className="block text-sm leading-tight font-medium text-slate-900">{user.name}</span>
          <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown size={16} className="hidden text-slate-500 md:block" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
          <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{user.username}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setPasswordOpen(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
          >
            <KeyRound size={16} /> Change password
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
      {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}
