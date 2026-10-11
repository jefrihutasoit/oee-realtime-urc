import type { Me, Permission } from "@/types/auth";

/** Pages open without signing in (guest view). */
const PUBLIC_PREFIXES = ["/dashboard"];

export const isPublicPath = (path: string) => PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Permission needed to open a page, by path prefix. Other pages need a signed-in user, except the public
 * dashboards. The backend checks the same permissions on every change.
 */
/** A path may need one permission, or any one of several. */
const ROUTE_PERMISSIONS: [string, Permission | Permission[]][] = [
  ["/settings/system", ["backup.manage", "database.manage", "appearance.manage"]],
  ["/settings/machines", "machines.manage"],
  ["/settings/status-definition", "status.manage"],
  ["/settings/backup", "backup.manage"],
  ["/settings/database", "database.manage"],
  ["/settings/gateway", "gateway.manage"],
  ["/simulator", "simulator.use"],
  ["/settings/shifts", "shift.manage"],
  ["/settings/layout", "layout.manage"],
  ["/settings/oee", "oee.settings"],
  ["/sku", "sku.manage"],
  ["/reject/types", "reject.types"],
  ["/reject/upload", "reject.submit"],
  ["/reject/manual", "reject.submit"],
  ["/downtime", "downtime.submit"],
  ["/users", "users.manage"],
];

export function routePermission(path: string) {
  return ROUTE_PERMISSIONS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? null;
}

export function canOpen(user: Me | null, path: string) {
  if (isPublicPath(path)) return true;
  if (!user) return false;
  const needed = routePermission(path);
  if (!needed) return true;
  return (Array.isArray(needed) ? needed : [needed]).some((p) => user.permissions.includes(p));
}
