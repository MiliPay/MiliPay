import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_STATES } from "../supabase/functions/_shared/website";
import {
  WEBSITE_STATES,
  csvCell,
  formatLocalPhone,
  internationalPhone,
  leadStatusStyle,
  locationErrors,
  locationsInState,
  moveId,
  nextStatuses,
  statusActionLabel,
  waitlistCsv,
  waitlistPageLabel,
  type AgentLocation,
} from "../packages/shared/src/features/website/admin";
import { newLeadsOf } from "../packages/shared/src/features/navCounts/useNavCounts";

/**
 * Admin console, Website: the leads the marketing website collects, the app
 * waitlist and the "Find an agent" list. Only admins reach any of it, every
 * change is audited, and the waitlist export is logged by the server.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const SQL = read("supabase/migrations/20261014110000_website_admin.sql");
const fn = (name: string) => {
  const body = SQL.slice(SQL.indexOf(`FUNCTION public.${name}(`));
  return body.slice(0, body.indexOf("$$;"));
};

const RPCS = [...SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.(admin_\w+)\(/g)].map((m) => m[1]);

describe("who can call it", () => {
  it("defines the console's RPCs", () => {
    expect([...RPCS].sort()).toEqual(
      [
        "admin_agent_applications",
        "admin_agent_locations",
        "admin_export_waitlist",
        "admin_merchant_leads",
        "admin_reorder_agent_locations",
        "admin_save_agent_location",
        "admin_set_agent_application_status",
        "admin_set_agent_location_active",
        "admin_set_merchant_lead_status",
        "admin_waitlist",
        "admin_website_summary",
      ].sort(),
    );
  });

  it("every RPC is SECURITY DEFINER with a fixed search_path and asserts admin before anything else", () => {
    for (const name of RPCS) {
      const body = fn(name);
      expect(body, name).toMatch(/SECURITY DEFINER SET search_path = public/);
      const begin = body.slice(body.indexOf("\nBEGIN") + 1);
      expect(begin.split("\n")[1].trim(), name).toBe("PERFORM public.assert_admin();");
    }
  });

  it("every function is revoked from PUBLIC and anon, and granted only to authenticated", () => {
    for (const name of RPCS) {
      expect(SQL, name).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`));
      expect(SQL, name).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated;`));
    }
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.website_state_ok\(text\) FROM PUBLIC, anon;/);
  });

  it("opens none of the tables to browsers", () => {
    expect(SQL).not.toMatch(/GRANT [A-Z, ]+ ON (TABLE )?public\.(website_waitlist|merchant_leads|agent_applications|agent_locations)/);
    expect(SQL).not.toMatch(/CREATE POLICY/);
  });
});

describe("what is audited", () => {
  it("status changes need a note and write it to the row and the audit log", () => {
    for (const [name, category] of [
      ["admin_set_merchant_lead_status", "Merchants"],
      ["admin_set_agent_application_status", "Staff"],
    ]) {
      const body = fn(name);
      expect(body, name).toMatch(/length\(trim\(coalesce\(p_note, ''\)\)\) < 3/);
      expect(body, name).toMatch(/status_note = left\(trim\(p_note\), 1000\)/);
      expect(body, name).toContain(`log_audit_event('${category}'`);
    }
    expect(fn("admin_set_merchant_lead_status")).toMatch(/'new', 'contacted', 'approved', 'declined'/);
    expect(fn("admin_set_agent_application_status")).toMatch(/'new', 'contacted', 'trained', 'declined'/);
  });

  it("the waitlist export is logged by the server, not trusted to the page", () => {
    expect(fn("admin_export_waitlist")).toContain("log_audit_event('Customers', 'exported app waitlist'");
    expect(read("packages/shared/src/pages/website/WaitlistPage.tsx")).not.toContain("logAudit");
  });

  it("every change to an agent location is audited; hiding or relisting needs a reason", () => {
    expect(fn("admin_save_agent_location")).toContain("'published agent location'");
    expect(fn("admin_save_agent_location")).toContain("'edited agent location'");
    expect(fn("admin_set_agent_location_active")).toMatch(/length\(trim\(coalesce\(p_reason, ''\)\)\) < 3/);
    expect(fn("admin_set_agent_location_active")).toContain("log_audit_event('Staff'");
    expect(fn("admin_reorder_agent_locations")).toContain("'reordered agent locations'");
  });

  it("only uses audit categories the audit log accepts", () => {
    const allowed = ["Auth", "Customers", "Sign-ups", "Transactions", "Merchants", "Terminals", "Staff", "Support", "Settings", "Alerts"];
    const used = [...SQL.matchAll(/log_audit_event\('([^']+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(5);
    for (const c of used) expect(allowed).toContain(c);
  });

  it("a reorder must name every location in the state exactly once", () => {
    const body = fn("admin_reorder_agent_locations");
    expect(body).toMatch(/cardinality\(p_ids\) <> cardinality\(v_have\)/);
    expect(body).toMatch(/count\(DISTINCT x\) FROM unnest\(p_ids\) x\) <> cardinality\(v_have\)/);
    expect(body).toMatch(/NOT \(p_ids <@ v_have\)/);
  });
});

describe("states", () => {
  it("the console, the SQL check and the website's /agents?state= use the same list", () => {
    expect([...WEBSITE_STATES]).toEqual([...ALL_STATES]);
    const list = fn("website_state_ok").match(/ARRAY\[([\s\S]*?)\]::text\[\]/)![1];
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...ALL_STATES]);
    expect(SQL).toMatch(/CHECK \(public\.website_state_ok\(state\)\)/);
  });
});

describe("leads", () => {
  it("statuses read as words with a tone", () => {
    expect(leadStatusStyle("merchants", "approved")).toEqual(["Approved", "ok"]);
    expect(leadStatusStyle("agents", "trained")).toEqual(["Trained", "ok"]);
    expect(leadStatusStyle("agents", "new")).toEqual(["New", "info"]);
    expect(leadStatusStyle("merchants", "declined")).toEqual(["Declined", "muted"]);
  });

  it("the drawer offers every other status, the natural next step first", () => {
    expect(nextStatuses("merchants", "new")).toEqual(["contacted", "approved", "declined"]);
    expect(nextStatuses("merchants", "contacted")).toEqual(["approved", "declined", "new"]);
    expect(nextStatuses("agents", "declined")).toEqual(["contacted", "trained", "new"]);
    expect(nextStatuses("agents", "new")).not.toContain("approved");
    expect(statusActionLabel("contacted")).toBe("Mark contacted");
    expect(statusActionLabel("new")).toBe("Reopen");
  });

  it("phones", () => {
    expect(formatLocalPhone("08031234567")).toBe("0803 123 4567");
    expect(internationalPhone("08031234567")).toBe("+2348031234567");
    expect(formatLocalPhone("12345")).toBe("12345");
  });

  it("the Leads badge adds both queues and stays blank when the summary failed", () => {
    expect(newLeadsOf({ data: { newMerchantLeads: 2, newAgentApplications: 3 }, error: null })).toBe(5);
    expect(newLeadsOf({ data: null, error: { message: "Administrators only." } })).toBeNull();
    expect(newLeadsOf(null)).toBeNull();
  });
});

describe("waitlist", () => {
  it("names the page someone joined from", () => {
    expect(waitlistPageLabel("/")).toBe("Home");
    expect(waitlistPageLabel("/personal?ref=x")).toBe("Personal");
    expect(waitlistPageLabel("/find-an-agent")).toBe("Find an agent");
    expect(waitlistPageLabel(null)).toBe("Unknown");
  });

  it("the CSV quotes every cell and defuses spreadsheet formulas", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell(null)).toBe('""');
    const csv = waitlistCsv([{ phone: "08031234567", page: "/business", createdAt: "2026-10-14T09:00:00Z", notifiedAt: null }]);
    expect(csv.split("\r\n")).toEqual([
      '"Phone","Joined from","Joined (UTC)","Launch SMS sent (UTC)"',
      '"0803 123 4567","Business","2026-10-14T09:00:00Z",""',
    ]);
  });

  it("phones in the CSV can't be read as numbers, so a spreadsheet keeps the leading 0", () => {
    const [, row] = waitlistCsv([{ phone: "07061234567", page: null, createdAt: "", notifiedAt: null }]).split("\r\n");
    const phone = row.split(",")[0].slice(1, -1);
    expect(phone).toBe("0706 123 4567");
    expect(phone.startsWith("0")).toBe(true);
    expect(Number.isNaN(Number(phone))).toBe(true);
  });
});

describe("agent locations", () => {
  const loc = (id: string, state: string, position: number, name = id): AgentLocation => ({
    id,
    name,
    address: "Shop 1",
    state,
    hours: null,
    active: true,
    position,
    createdAt: "",
    updatedAt: "",
  });

  it("lists a state as the website does: by position, then name", () => {
    const rows = [loc("c", "Lagos", 1), loc("a", "Lagos", 0, "Zed"), loc("b", "Lagos", 0, "Abe"), loc("x", "Kano", 0)];
    expect(locationsInState(rows, "Lagos").map((l) => l.id)).toEqual(["b", "a", "c"]);
  });

  it("moves one place up or down, and not past either end", () => {
    expect(moveId(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("the form checks what the server checks", () => {
    expect(locationErrors({ name: "Chidi Phones", address: "Shop 14, Computer Village", state: "Lagos", hours: "" })).toEqual({});
    const e = locationErrors({ name: " ", address: "x", state: "FCT", hours: "x".repeat(121) });
    expect(Object.keys(e).sort()).toEqual(["address", "hours", "name", "state"]);
    const body = fn("admin_save_agent_location");
    expect(body).toMatch(/length\(v_name\) < 2 OR length\(v_name\) > 120/);
    expect(body).toMatch(/length\(v_address\) < 5 OR length\(v_address\) > 300/);
    expect(body).toMatch(/length\(coalesce\(v_hours, ''\)\) > 120/);
  });
});

describe("the console", () => {
  it("routes the three pages and puts them under a Website nav group", () => {
    const app = read("AdminPanel/src/app/App.tsx");
    for (const p of ["website/leads", "website/waitlist", "website/agents"]) expect(app).toContain(`path="${p}"`);
    const nav = read("packages/shared/src/pages/dashboard/DashboardLayout.tsx");
    expect(nav).toMatch(/title: "Website"/);
    expect(nav).toContain("WEBSITE_ROUTES.leads");
  });
});
