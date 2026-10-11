import { env } from "cloudflare:workers";
import type { Cultivator } from "@/lib/auth";
import { tokenAdjustmentRole } from "@/lib/token-adjustments";
import { isInvitationBeta } from "@/lib/beta-access";

export function currentTokenAdjustmentRole(cultivator: Cultivator) {
  if (isInvitationBeta(env)) return null;
  const maintainerId = env.MAINTAINER_GITHUB_ID ??
    (import.meta.env.DEV ? process.env.MAINTAINER_GITHUB_ID : undefined);
  const approverId = env.FINANCE_APPROVER_GITHUB_ID ??
    (import.meta.env.DEV ? process.env.FINANCE_APPROVER_GITHUB_ID : undefined);
  return tokenAdjustmentRole(cultivator, maintainerId, approverId);
}
