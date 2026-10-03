import type { Tone } from "@milipay/shared/components/ui/StatusBadge";
import type { Role } from "@milipay/shared/types";

/**
 * Roles and what each may do (design handoff ROLES / PERMS), and the rules
 * the staff pages show. staff-admin and create-staff enforce the same rules
 * on the server.
 */

export const STAFF_ROLES: Record<"super_admin" | "admin" | "support" | "agent", { label: string; tone: Tone; desc: string }> = {
  super_admin: { label: "Super admin", tone: "fail", desc: "Everything, including administrators." },
  admin: { label: "Admin", tone: "info", desc: "Customers, merchants, transactions, operations and settings." },
  support: { label: "Support", tone: "warn", desc: "Tickets and read-only customer and payment views." },
  agent: { label: "Agent", tone: "ok", desc: "Registers customers and merchants in the field." },
};

export const roleMeta = (role: Role | string) => STAFF_ROLES[role as keyof typeof STAFF_ROLES] ?? { label: String(role), tone: "muted" as Tone, desc: "" };

/** What each role can do, as the portals and the server enforce it today. */
export const PERMISSIONS: [string, Role[]][] = [
  ["View customers and transactions", ["super_admin", "admin", "support", "agent"]],
  ["Register customers and merchants", ["super_admin", "admin", "agent"]],
  ["Approve or reject KYC", ["super_admin", "admin"]],
  ["Refund or mark delivered", ["super_admin", "admin"]],
  ["Manage merchants and terminals", ["super_admin", "admin"]],
  ["Answer support tickets", ["super_admin", "admin", "support"]],
  ["Invite and manage agents and support", ["super_admin", "admin"]],
  ["Invite and manage administrators", ["super_admin"]],
  ["Change limits, fees and security", ["super_admin", "admin"]],
];

const isAdminRole = (r: string | null | undefined) => r === "admin" || r === "super_admin";

/** Whether `me` may act on someone with `their` role (never on yourself). */
export function canManage(me: Role | undefined, their: Role, self: boolean): boolean {
  if (self || !isAdminRole(me)) return false;
  return me === "super_admin" || !isAdminRole(their);
}

/** The roles `me` may give someone. */
export function assignableRoles(me: Role | undefined): Role[] {
  if (me === "super_admin") return ["agent", "support", "admin", "super_admin"];
  if (me === "admin") return ["agent", "support"];
  return [];
}

/** "Chrome · Windows" from a user agent; "Unknown device" when there isn't one. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : /okhttp|Dart|Expo|ReactNative/i.test(ua)
              ? "App"
              : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

export const isPhoneUa = (ua: string | null | undefined) => /Android|iPhone|iPad|Mobile/.test(ua ?? "");
