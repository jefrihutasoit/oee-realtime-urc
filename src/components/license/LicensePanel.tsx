"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Check, Copy, FileKey, Loader2, ShieldAlert, Upload } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { installLicense } from "@/lib/license";
import type { LicenseStatus } from "@/types/license";

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Copies text; falls back to a selected input where the Clipboard API is unavailable (plain http on the LAN). */
async function copyText(text: string, input: HTMLInputElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!input) return false;
    input.select();
    return document.execCommand("copy");
  }
}

/**
 * Hardware ID, license state and license import. Used on the lock screen (no license) and in
 * System Management → License. Only the Engineering account can import.
 */
export default function LicensePanel({ data }: { data: LicenseStatus }) {
  const { user } = useAuth();
  const isEngineering = user?.role === "ENGINEERING";
  const idInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const lic = data.license;

  async function copy() {
    if (await copyText(data.hardwareId, idInput.current)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await installLicense(await file.text());
      setDone(true);
      // Coming from the lock screen: reload so the live connection (refused while unlicensed) starts again.
      if (!data.licensed) setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-surface p-4">
        <p className="text-sm font-semibold text-slate-900">Hardware ID</p>
        <p className="mt-0.5 text-xs text-slate-500">Provide this ID when requesting a license.</p>
        <div className="mt-3 flex gap-2">
          <input
            ref={idInput}
            readOnly
            value={data.hardwareId}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Hardware ID"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-lg font-semibold tracking-wider text-slate-900"
          />
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:border-(--brand) hover:text-(--brand)"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-surface p-4">
        <div className="flex items-start gap-3">
          {data.licensed ? (
            <BadgeCheck size={22} className="mt-0.5 shrink-0 text-emerald-600" />
          ) : (
            <ShieldAlert size={22} className="mt-0.5 shrink-0 text-red-600" />
          )}
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${data.licensed ? "text-emerald-700" : "text-red-700"}`}>
              {data.licensed ? "Licensed" : "Not licensed"}
            </p>
            {!data.licensed && data.error && <p className="text-sm text-slate-600">{data.error}</p>}
            {lic && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">Licensee</dt>
                <dd className="text-slate-900">{lic.licensee || "—"}</dd>
                <dt className="text-slate-500">Valid until</dt>
                <dd className="text-slate-900">
                  {lic.expiresAt ? dateFmt.format(new Date(`${lic.expiresAt}T00:00:00`)) : "Permanent"}
                </dd>
                <dt className="text-slate-500">Issued</dt>
                <dd className="text-slate-900">{lic.issuedAt ? dateTimeFmt.format(new Date(lic.issuedAt)) : "—"}</dd>
                <dt className="text-slate-500">License ID</dt>
                <dd className="font-mono text-xs break-all text-slate-600">{lic.licenseId}</dd>
              </dl>
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          {isEngineering ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".lic,application/json"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-(--brand) px-4 py-2 text-sm font-medium text-white hover:bg-(--brand-hover) disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {data.licensed ? "Replace license…" : "Import license…"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                <FileKey size={12} className="mr-1 inline" />
                Choose the license file (.lic).
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              {!user ? (
                <Link href="/login" className="font-medium text-(--brand) hover:underline">
                  Sign in to import a license
                </Link>
              ) : (
                <>Contact your administrator to install the license.</>
              )}
            </p>
          )}
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {done && data.licensed && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">License installed.</p>
          )}
        </div>
      </section>
    </div>
  );
}
