import { apiRequest } from "@/lib/api";
import type { PERMISSIONS, RolePermissions, User, UserInput } from "@/types/auth";

export interface RolesResponse {
  roles: RolePermissions;
  permissions: (typeof PERMISSIONS)[number][];
}

export const usersApi = {
  list: () => apiRequest<User[]>("/users"),
  create: (input: UserInput) => apiRequest<User>("/users", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<UserInput>) =>
    apiRequest<User>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => apiRequest<{ ok: true }>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  roles: () => apiRequest<RolesResponse>("/users/roles"),
  saveRoles: (roles: RolePermissions) =>
    apiRequest<RolePermissions>("/users/roles", { method: "PUT", body: JSON.stringify(roles) }),
};
