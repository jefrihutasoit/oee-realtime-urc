"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import Toggle from "@/components/ui/Toggle";
import { useAuth } from "@/lib/auth";
import { ASSIGNABLE_ROLES, ROLE_LABELS, type Role, type User, type UserInput } from "@/types/auth";

interface UserFormModalProps {
  user?: User;
  /** The signed-in user cannot change their own role or deactivate themselves. */
  isSelf: boolean;
  onClose: () => void;
  onSubmit: (input: UserInput) => Promise<void>;
}

const inputCls =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:bg-slate-50";

export default function UserFormModal({ user, isSelf, onClose, onSubmit }: UserFormModalProps) {
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "OPERATOR");
  // Only an Engineering account can give the Engineering role.
  const isEngineering = useAuth().user?.role === "ENGINEERING";
  const roles = ASSIGNABLE_ROLES.filter((r) => r !== "ENGINEERING" || isEngineering);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !username.trim()) return setError("Name and username are required");
    if (!user && password.length < 6) return setError("Password must be at least 6 characters");
    if (user && password && password.length < 6) return setError("Password must be at least 6 characters");
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), username: username.trim(), role, isActive, ...(password ? { password } : {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user");
      setSaving(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={user ? `Edit ${user.name}` : "Add User"}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button type="submit" form="user-form" disabled={saving} className={buttonStyles.primary}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {user ? "Save Changes" : "Add User"}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={50}
            autoComplete="off"
            className={inputCls}
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={isSelf}
            className={inputCls}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">
          {user ? "New password" : "Password"}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={user ? "Leave empty to keep the password" : "At least 6 characters"}
            autoComplete="new-password"
            className={inputCls}
          />
        </label>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Active</p>
            <p className="text-xs text-slate-500">Inactive users cannot sign in.</p>
          </div>
          <Toggle label="Active" checked={isActive} onChange={(v) => !isSelf && setIsActive(v)} />
        </div>
      </form>
    </Modal>
  );
}
