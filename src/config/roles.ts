export type RoleKey = "cfo" | "west_sales_lead" | "ops_viewer";

export interface Role {
  key: RoleKey;
  label: string;
  description: string;
  metrics: string[] | "*";
  regions: string[] | "*";
  seePii: boolean;
}

export const roles: Record<RoleKey, Role> = {
  cfo: {
    key: "cfo",
    label: "CFO",
    description: "Full entitlement across every metric and region, customer names visible.",
    metrics: "*",
    regions: "*",
    seePii: true,
  },
  west_sales_lead: {
    key: "west_sales_lead",
    label: "West sales lead",
    description: "Every metric, West region only, customer names visible.",
    metrics: "*",
    regions: ["West"],
    seePii: true,
  },
  ops_viewer: {
    key: "ops_viewer",
    label: "Ops viewer",
    description: "Sales and units only, all regions, customer names redacted.",
    metrics: ["sales", "quantity"],
    regions: "*",
    seePii: false,
  },
};

export const DEFAULT_ROLE: RoleKey = "cfo";

export function getRole(key: string | undefined): Role {
  return roles[(key as RoleKey) ?? DEFAULT_ROLE] ?? roles[DEFAULT_ROLE];
}

export function roleAllowsMetric(role: Role, metric: string): boolean {
  return role.metrics === "*" || role.metrics.includes(metric);
}

export function roleAllowsRegion(role: Role, region: string): boolean {
  return role.regions === "*" || role.regions.includes(region);
}

export function assertInScope(role: Role, metric: string, region: string): void {
  if (!roleAllowsMetric(role, metric)) {
    throw new Error(`Role "${role.label}" is not entitled to the ${metric} metric`);
  }
  if (!roleAllowsRegion(role, region)) {
    throw new Error(`Role "${role.label}" is not entitled to the ${region} region`);
  }
}

export function redactAccountName(name: string): string {
  if (!name) return name;
  return `Account ${"•".repeat(4)}`;
}
