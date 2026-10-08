"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import Modal, { buttonStyles } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { usersApi, type RolesResponse } from "@/lib/users-api";
import {
  FIXED_PERMISSIONS,
  MANAGED_ROLES,
  ROLE_LABELS,
  type ManagedRole,
  type Permission,
  type RolePermissions,
  type User,
  type UserInput,
} from "@/types/auth";
import UserFormModal from "./UserFormModal";

type FormState = { mode: "create" } | { mode: "edit"; user: User } | null;

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const byName = (a: User, b: User) => a.name.localeCompare(b.name);

/** Permissions per role as a matrix of checkboxes. */
function RolePermissionsEditor({ data, onSaved }: { data: RolesResponse; onSaved: (roles: RolePermissions) => void }) {
  const [draft, setDraft] = useState<RolePermissions>(data.roles);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(data.roles);

  function toggle(role: ManagedRole, key: Permission) {
    setMessage(null);
    setDraft((d) => ({
      ...d,
      [role]: d[role].includes(key) ? d[role].filter((p) => p !== key) : [...d[role], key],
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await usersApi.saveRoles(draft);
      setDraft(saved);
      onSaved(saved);
      setMessage({ text: "Role permissions saved. They apply at the users' next action.", ok: true });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to save", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div>
          <h3 className="font-semibold text-slate-900">Role Permissions</h3>
          <p className="text-sm text-slate-500">
            What each role can do. The dashboards are open to every role. Machine settings, status definition, backup
            &amp; restore and the simulator are only for the Engineering account.
          </p>
        </div>
        <button type="button" onClick={save} disabled={!changed || saving} className={buttonStyles.primary}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Permissions
        </button>
      </div>
      {message && (
        <p className={`mx-4 mb-3 rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
      <div className="overflow-x-auto border-t border-slate-100">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Permission</th>
              {MANAGED_ROLES.map((r) => (
                <th key={r} className="w-28 px-4 py-2 text-center font-medium">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.permissions.map((p, i) => {
              const groupRow = i === 0 || data.permissions[i - 1].group !== p.group;
              return [
                groupRow && (
                  <tr key={`g-${p.group}`} className="border-t border-slate-100 bg-slate-50/50">
                    <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      {p.group}
                    </td>
                  </tr>
                ),
                <tr key={p.key} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{p.label}</td>
                  {MANAGED_ROLES.map((r) => {
                    const fixed = FIXED_PERMISSIONS[r]?.includes(p.key) ?? false;
                    return (
                      <td key={r} className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={fixed || draft[r].includes(p.key)}
                          disabled={fixed}
                          onChange={() => toggle(r, p.key)}
                          aria-label={`${ROLE_LABELS[r]}: ${p.label}`}
                          title={fixed ? "Admin always keeps user management" : undefined}
                          className="size-4 accent-[#1E6FD9]"
                        />
                      </td>
                    );
                  })}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function UserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<RolesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  useEffect(() => {
    Promise.all([usersApi.list(), usersApi.roles()])
      .then(([u, r]) => {
        setUsers(u);
        setRoles(r);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleSubmit(input: UserInput) {
    if (form?.mode === "edit") {
      const updated = await usersApi.update(form.user.id, input);
      setUsers((list) => list?.map((u) => (u.id === updated.id ? updated : u)).sort(byName) ?? null);
    } else {
      const created = await usersApi.create(input);
      setUsers((list) => [...(list ?? []), created].sort(byName));
    }
    setForm(null);
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await usersApi.remove(deleting.id);
      setUsers((list) => list?.filter((u) => u.id !== deleting.id) ?? null);
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">User Management</h2>
          <p className="text-sm text-slate-500">Users who can sign in, and what each role can do.</p>
        </div>
        <button type="button" onClick={() => setForm({ mode: "create" })} className={buttonStyles.primary}>
          <Plus size={16} />
          Add User
        </button>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Username</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Last sign in</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!users ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {error ? "—" : <Loader2 size={18} className="mx-auto animate-spin" />}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {u.name}
                    {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{u.username}</td>
                  <td className="px-4 py-2.5 text-slate-700">{ROLE_LABELS[u.role]}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{u.lastLoginAt ? dateFmt.format(new Date(u.lastLoginAt)) : "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setForm({ mode: "edit", user: u })}
                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-[#1E6FD9]"
                        aria-label={`Edit ${u.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      {u.id !== me?.id && (
                        <button
                          type="button"
                          onClick={() => setDeleting(u)}
                          className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${u.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {roles && <RolePermissionsEditor data={roles} onSaved={(r) => setRoles({ ...roles, roles: r })} />}

      {form && (
        <UserFormModal
          key={form.mode === "edit" ? form.user.id : "new"}
          user={form.mode === "edit" ? form.user : undefined}
          isSelf={form.mode === "edit" && form.user.id === me?.id}
          onClose={() => setForm(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleting && (
        <Modal
          size="sm"
          title="Delete User"
          onClose={() => !busyDelete && setDeleting(null)}
          footer={
            <>
              <button type="button" onClick={() => setDeleting(null)} disabled={busyDelete} className={buttonStyles.secondary}>
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={busyDelete} className={buttonStyles.danger}>
                {busyDelete && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Delete user <strong className="text-slate-900">{deleting.name}</strong> ({deleting.username})? They are
            signed out at once.
          </p>
        </Modal>
      )}
    </div>
  );
}
