import type {
  AuditInput,
  Finding,
  PlanCode,
  WorkspaceRole,
  WorkspaceType,
} from "../../../supabase/functions/_shared/domain";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  is_platform_admin: boolean;
  deletion_requested_at: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  slug: string;
  role: WorkspaceRole;
  plan_code: PlanCode;
  created_at: string;
}

export interface Usage {
  seats: number;
  clients: number;
  active_audits: number;
  storage_bytes: number;
}

export interface AuditListItem {
  id: string;
  name: string;
  currency: string;
  status: "draft" | "ready" | "running" | "complete" | "archived" | "failed";
  current_run_id: string | null;
  updated_at: string;
  finding_count?: number;
}

export interface AuditDetail extends AuditInput {
  id: string;
  name: string;
  status: AuditListItem["status"];
  workspaceId: string;
  findings: Finding[];
  updatedAt: string;
}

export interface DataSource {
  id: string;
  provider: "quickbooks" | "stripe";
  status: "connected" | "needs_reauth" | "syncing" | "error" | "disconnected";
  external_account_name: string | null;
  last_synced_at: string | null;
  last_error_code: string | null;
}

export interface AdminMetrics {
  users: number;
  workspaces: number;
  paid_workspaces: number;
  failed_syncs: number;
  failed_webhooks: number;
  pending_deletions: number;
}
