import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const cultivators = sqliteTable("cultivators", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  providerId: text("provider_id").notNull(),
  handle: text("handle").notNull(),
  displayName: text("display_name").notNull(),
  realm: text("realm").notNull().default("mortal"),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("idx_cultivators_provider").on(table.provider, table.providerId)]);

export const cultivatorProfiles = sqliteTable("cultivator_profiles", {
  cultivatorId: text("cultivator_id").primaryKey().references(() => cultivators.id),
  publicId: text("public_id").notNull().unique(),
  daohao: text("daohao").notNull(),
  isPublic: integer("is_public").notNull().default(0),
  revision: integer("revision").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  check("profile_daohao_length", sql`length(${table.daohao}) BETWEEN 1 AND 32`),
  check("profile_visibility", sql`${table.isPublic} IN (0, 1)`),
  check("profile_revision", sql`${table.revision} >= 1`),
]);

export const missions = sqliteTable("missions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  rank: text("rank").notNull(),
  branch: text("branch").notNull(),
  state: text("state").notNull(),
  baseCommit: text("base_commit").notNull(),
  allowedPaths: text("allowed_paths").notNull(),
  acceptance: text("acceptance").notNull(),
  rewardToken: integer("reward_token").notNull(),
  rewardCultivation: integer("reward_cultivation").notNull(),
  rewardMerit: integer("reward_merit").notNull(),
  deposit: integer("deposit").notNull().default(0),
  budgetTokens: integer("budget_tokens"),
  contractReady: integer("contract_ready").notNull().default(0),
  requiredRealm: text("required_realm").notNull().default("mortal"),
  requiredMerit: integer("required_merit").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const missionDependencies = sqliteTable("mission_dependencies", {
  missionId: text("mission_id").notNull().references(() => missions.id),
  prerequisiteId: text("prerequisite_id").notNull().references(() => missions.id),
}, (table) => [primaryKey({ columns: [table.missionId, table.prerequisiteId] })]);

export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(),
  missionId: text("mission_id").notNull().references(() => missions.id),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  state: text("state").notNull(),
  claimedAt: integer("claimed_at").notNull(),
  startedAt: integer("started_at"),
  expiresAt: integer("expires_at").notNull(),
  rewardSnapshot: text("reward_snapshot").notNull(),
}, (table) => [
  uniqueIndex("idx_claims_active_mission").on(table.missionId).where(sql`state IN ('claimed', 'running', 'submitted', 'review', 'approved')`),
  index("idx_claims_cultivator_state").on(table.cultivatorId, table.state),
]);

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull().references(() => claims.id),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  artifactKey: text("artifact_key").notNull(),
  artifactSha256: text("artifact_sha256").notNull(),
  state: text("state").notNull(),
  verdict: text("verdict"),
  reviewerId: text("reviewer_id"),
  reviewReason: text("review_reason"),
  integratedCommit: text("integrated_commit"),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
  integratedAt: integer("integrated_at"),
}, (table) => [index("idx_submissions_state").on(table.state)]);

export const artifactPayloads = sqliteTable("artifact_payloads", {
  artifactKey: text("artifact_key").primaryKey(),
  submissionId: text("submission_id").notNull().references(() => submissions.id),
  content: text("content").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_artifact_payload_submission").on(table.submissionId),
  check("artifact_payload_size", sql`length(CAST(${table.content} AS BLOB)) <= 131072`),
  check("artifact_payload_digest", sql`length(${table.sha256}) = 64`),
]);

export const ledgerEvents = sqliteTable("ledger_events", {
  id: text("id").primaryKey(),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  resource: text("resource").notNull(),
  delta: integer("delta").notNull(),
  sourceKey: text("source_key").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_ledger_source_resource").on(table.sourceKey, table.resource),
  index("idx_ledger_cultivator_resource").on(table.cultivatorId, table.resource),
]);

export const stableRewardSettlements = sqliteTable("stable_reward_settlements", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull().references(() => submissions.id),
  claimId: text("claim_id").notNull().references(() => claims.id),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  firstReleaseId: integer("first_release_id").notNull(),
  firstTag: text("first_tag").notNull(),
  firstCommit: text("first_commit").notNull(),
  firstPublishedAt: integer("first_published_at").notNull(),
  secondReleaseId: integer("second_release_id").notNull(),
  secondTag: text("second_tag").notNull(),
  secondCommit: text("second_commit").notNull(),
  secondPublishedAt: integer("second_published_at").notNull(),
  artifactSha256: text("artifact_sha256").notNull(),
  token: integer("token").notNull(),
  cultivation: integer("cultivation").notNull(),
  merit: integer("merit").notNull(),
  reviewedBy: text("reviewed_by").notNull().references(() => cultivators.id),
  reviewReason: text("review_reason").notNull(),
  settledAt: integer("settled_at").notNull(),
}, (table) => [
  uniqueIndex("idx_stable_settlement_submission").on(table.submissionId),
  uniqueIndex("idx_stable_settlement_claim").on(table.claimId),
  check("stable_settlement_versions", sql`${table.firstReleaseId} > 0 AND ${table.secondReleaseId} > 0 AND ${table.firstReleaseId} != ${table.secondReleaseId} AND ${table.firstTag} != ${table.secondTag} AND ${table.firstCommit} != ${table.secondCommit} AND ${table.secondPublishedAt} - ${table.firstPublishedAt} >= 604800000`),
  check("stable_settlement_rewards", sql`${table.token} >= 0 AND ${table.cultivation} >= 0 AND ${table.merit} >= 0 AND ${table.reviewedBy} != ${table.cultivatorId} AND length(${table.reviewReason}) BETWEEN 20 AND 500`),
]);

export const stableRewardRevocations = sqliteTable("stable_reward_revocations", {
  settlementId: text("settlement_id").primaryKey().references(() => stableRewardSettlements.id),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  mainCommit: text("main_commit").notNull(),
  tokenOffset: integer("token_offset").notNull(),
  cultivationOffset: integer("cultivation_offset").notNull(),
  meritOffset: integer("merit_offset").notNull(),
  tokenDebt: integer("token_debt").notNull(),
  cultivationDebt: integer("cultivation_debt").notNull(),
  meritDebt: integer("merit_debt").notNull(),
  revokedBy: text("revoked_by").notNull().references(() => cultivators.id),
  reason: text("reason").notNull(),
  revokedAt: integer("revoked_at").notNull(),
}, (table) => [
  check("stable_revocation_amounts", sql`${table.tokenOffset} >= 0 AND ${table.cultivationOffset} >= 0 AND ${table.meritOffset} >= 0 AND ${table.tokenDebt} >= 0 AND ${table.cultivationDebt} >= 0 AND ${table.meritDebt} >= 0`),
  check("stable_revocation_review", sql`${table.revokedBy} != ${table.cultivatorId} AND length(${table.reason}) BETWEEN 20 AND 500`),
]);

export const stableRewardRecoveryPayments = sqliteTable("stable_reward_recovery_payments", {
  creditEventId: text("credit_event_id").primaryKey().references(() => ledgerEvents.id),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  resource: text("resource").notNull(),
  amount: integer("amount").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  check("stable_recovery_payment_amount", sql`${table.amount} > 0 AND ${table.resource} IN ('token', 'cultivation', 'merit')`),
]);

export const stableRewardHoldReleases = sqliteTable("stable_reward_hold_releases", {
  settlementId: text("settlement_id").primaryKey().references(() => stableRewardRevocations.settlementId),
  reviewedBy: text("reviewed_by").notNull().references(() => cultivators.id),
  reason: text("reason").notNull(),
  reviewedAt: integer("reviewed_at").notNull(),
}, (table) => [check("stable_hold_release_reason", sql`length(${table.reason}) BETWEEN 20 AND 500`)]);

export const tokenAdjustmentRequests = sqliteTable("token_adjustment_requests", {
  id: text("id").primaryKey(),
  targetCultivatorId: text("target_cultivator_id").notNull().references(() => cultivators.id),
  delta: integer("delta").notNull(),
  reference: text("reference").notNull(),
  reason: text("reason").notNull(),
  requestedBy: text("requested_by").notNull().references(() => cultivators.id),
  requestedAt: integer("requested_at").notNull(),
}, (table) => [
  uniqueIndex("idx_token_adjustment_reference").on(table.targetCultivatorId, table.reference),
  check("token_adjustment_delta_range", sql`${table.delta} != 0 AND ${table.delta} BETWEEN -10000 AND 10000`),
  check("token_adjustment_reference_length", sql`length(${table.reference}) BETWEEN 1 AND 100`),
  check("token_adjustment_reason_length", sql`length(${table.reason}) BETWEEN 20 AND 500`),
]);

export const tokenAdjustmentDecisions = sqliteTable("token_adjustment_decisions", {
  requestId: text("request_id").primaryKey().references(() => tokenAdjustmentRequests.id),
  decision: text("decision").notNull(),
  decidedBy: text("decided_by").notNull().references(() => cultivators.id),
  reason: text("reason").notNull(),
  decidedAt: integer("decided_at").notNull(),
}, (table) => [
  check("token_adjustment_decision_kind", sql`${table.decision} IN ('approve', 'reject')`),
  check("token_adjustment_decision_reason_length", sql`length(${table.reason}) BETWEEN 1 AND 500`),
]);

export const inventory = sqliteTable("inventory", {
  id: text("id").primaryKey(),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  itemId: text("item_id").notNull(),
  acquiredAt: integer("acquired_at").notNull(),
  pricePaid: integer("price_paid").notNull().default(0),
  catalogVersion: integer("catalog_version").notNull().default(1),
  equippedAt: integer("equipped_at"),
}, (table) => [
  uniqueIndex("idx_inventory_cultivator_item").on(table.cultivatorId, table.itemId),
]);

export const realmEvents = sqliteTable("realm_events", {
  id: text("id").primaryKey(),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  fromRealm: text("from_realm").notNull(),
  toRealm: text("to_realm").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("idx_realm_events_target").on(table.cultivatorId, table.toRealm)]);

export const realmTrialContracts = sqliteTable("realm_trial_contracts", {
  missionId: text("mission_id").primaryKey().references(() => missions.id),
  targetRealm: text("target_realm").notNull(),
  durationMs: integer("duration_ms").notNull(),
}, (table) => [
  check("realm_trial_contract_target", sql`${table.targetRealm} IN ('foundation', 'core')`),
  check("realm_trial_contract_duration", sql`${table.durationMs} BETWEEN 60000 AND 259200000`),
]);

export const realmTrials = sqliteTable("realm_trials", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull().references(() => claims.id),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  fromRealm: text("from_realm").notNull(),
  targetRealm: text("target_realm").notNull(),
  fee: integer("fee").notNull(),
  baseCommit: text("base_commit").notNull(),
  state: text("state").notNull().default("active"),
  startedAt: integer("started_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  finishedAt: integer("finished_at"),
  finishReason: text("finish_reason"),
}, (table) => [
  uniqueIndex("idx_realm_trials_claim").on(table.claimId),
  uniqueIndex("idx_realm_trials_active_cultivator").on(table.cultivatorId).where(sql`state = 'active'`),
  check("realm_trial_fee", sql`(${table.fromRealm} = 'qi' AND ${table.targetRealm} = 'foundation' AND ${table.fee} = 500) OR (${table.fromRealm} = 'foundation' AND ${table.targetRealm} = 'core' AND ${table.fee} = 2000)`),
  check("realm_trial_base", sql`length(${table.baseCommit}) = 40`),
  check("realm_trial_state", sql`${table.state} IN ('active', 'passed', 'expired', 'withdrawn', 'failed', 'platform_failure')`),
  check("realm_trial_expiry", sql`${table.expiresAt} > ${table.startedAt}`),
  check("realm_trial_finish", sql`(${table.state} = 'active' AND ${table.finishedAt} IS NULL AND ${table.finishReason} IS NULL) OR (${table.state} != 'active' AND ${table.finishedAt} >= ${table.startedAt} AND length(${table.finishReason}) BETWEEN 1 AND 500)`),
]);

export const resultRevalidations = sqliteTable("result_revalidations", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull().references(() => submissions.id),
  cultivatorId: text("cultivator_id").notNull().references(() => cultivators.id),
  pullNumber: integer("pull_number").notNull(),
  headSha: text("head_sha").notNull(),
  ciRunId: integer("ci_run_id").notNull(),
  ciRunAttempt: integer("ci_run_attempt").notNull(),
  validatorBaseCommit: text("validator_base_commit").notNull(),
  integratedCommit: text("integrated_commit").notNull(),
  artifactSha256: text("artifact_sha256").notNull(),
  outcome: text("outcome").notNull(),
  findings: text("findings").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_revalidation_ci_run").on(table.ciRunId),
  index("idx_revalidation_author_target").on(table.cultivatorId, table.submissionId),
  check("revalidation_run", sql`${table.pullNumber} > 0 AND ${table.ciRunId} > 0 AND ${table.ciRunAttempt} > 0`),
  check("revalidation_shas", sql`length(${table.headSha}) = 40 AND ${table.headSha} NOT GLOB '*[^0-9a-f]*' AND length(${table.validatorBaseCommit}) = 40 AND ${table.validatorBaseCommit} NOT GLOB '*[^0-9a-f]*' AND length(${table.integratedCommit}) = 40 AND ${table.integratedCommit} NOT GLOB '*[^0-9a-f]*' AND length(${table.artifactSha256}) = 64 AND ${table.artifactSha256} NOT GLOB '*[^0-9a-f]*'`),
  check("revalidation_outcome", sql`${table.outcome} IN ('passed', 'failed')`),
  check("revalidation_findings", sql`length(${table.findings}) BETWEEN 20 AND 2000`),
]);

export const resultRevalidationDecisions = sqliteTable("result_revalidation_decisions", {
  revalidationId: text("revalidation_id").primaryKey().references(() => resultRevalidations.id),
  decision: text("decision").notNull(),
  decidedBy: text("decided_by").notNull().references(() => cultivators.id),
  reason: text("reason").notNull(),
  decidedAt: integer("decided_at").notNull(),
}, (table) => [
  check("revalidation_decision", sql`${table.decision} IN ('accept', 'reject')`),
  check("revalidation_decision_reason", sql`length(${table.reason}) BETWEEN 8 AND 500`),
]);
