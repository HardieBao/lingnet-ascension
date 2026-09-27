import { parseRevalidationReport } from "./revalidation-report.ts";

export type RevalidationTarget = {
  submission_id: string; mission_id: string; author_id: string; author_github_id: string;
  artifact_path: string; integrated_commit: string; artifact_sha256: string;
};

export type RevalidationRecord = {
  id: string; submission_id: string; cultivator_id: string; pull_number: number; head_sha: string;
  ci_run_id: number; ci_run_attempt: number; validator_base_commit: string; integrated_commit: string;
  artifact_sha256: string; outcome: "passed" | "failed"; findings: string; created_at: number;
  decision: "accept" | "reject" | null; decided_by: string | null; reason: string | null; decided_at: number | null;
};

export const REVALIDATION_TARGET_SQL = `
  SELECT s.id AS submission_id, c.mission_id, s.cultivator_id AS author_id, author.provider_id AS author_github_id,
    CASE WHEN json_valid(c.reward_snapshot) THEN json_extract(c.reward_snapshot, '$.allowedPaths') END AS artifact_path,
    lower(s.integrated_commit) AS integrated_commit, lower(s.artifact_sha256) AS artifact_sha256
  FROM submissions s JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id
    JOIN missions m ON m.id = c.mission_id JOIN cultivators author ON author.id = s.cultivator_id
  WHERE s.id = ? AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done'
    AND s.integrated_at IS NOT NULL AND author.provider = 'github'
`;

export function revalidationTargetReport(target: RevalidationTarget, reporterGitHubId: string) {
  return parseRevalidationReport({ version: 1, submissionId: target.submission_id, missionId: target.mission_id,
    artifactPath: target.artifact_path, integratedCommit: target.integrated_commit, artifactSha256: target.artifact_sha256,
    validatorBaseCommit: target.integrated_commit, reporterGitHubId,
    findings: "仅校验正式成果身份、契约范围和摘要；实际复验观察必须来自可信报告。" });
}

export const REVALIDATION_INSERT_SQL = `
  INSERT INTO result_revalidations (id, submission_id, cultivator_id, pull_number, head_sha, ci_run_id, ci_run_attempt,
    validator_base_commit, integrated_commit, artifact_sha256, outcome, findings, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const REVALIDATION_DECISION_SQL = `
  INSERT INTO result_revalidation_decisions (revalidation_id, decision, decided_by, reason, decided_at)
  SELECT id, ?, ?, ?, ? FROM result_revalidations WHERE id = ?
    AND NOT EXISTS (SELECT 1 FROM result_revalidation_decisions WHERE revalidation_id = result_revalidations.id)
`;

export const REVALIDATION_RECORD_SQL = `
  SELECT r.*, d.decision, d.decided_by, d.reason, d.decided_at FROM result_revalidations r
  LEFT JOIN result_revalidation_decisions d ON d.revalidation_id = r.id
`;

export const INDEPENDENT_REVIEWS_COUNT_SUBQUERY = `(
  SELECT COUNT(DISTINCT c.mission_id) FROM result_revalidations r
    JOIN result_revalidation_decisions d ON d.revalidation_id = r.id AND d.decision = 'accept'
    JOIN submissions s ON s.id = r.submission_id
    JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id
    JOIN missions m ON m.id = c.mission_id
    JOIN cultivators reporter ON reporter.id = r.cultivator_id AND reporter.provider = 'github'
    JOIN cultivators adopter ON adopter.id = d.decided_by AND adopter.provider = 'github'
  WHERE r.cultivator_id = ? AND s.cultivator_id != r.cultivator_id
    AND d.decided_by != r.cultivator_id AND d.decided_by != s.cultivator_id
    AND s.state = 'accepted' AND c.state = 'completed' AND m.state = 'done' AND s.integrated_at IS NOT NULL
    AND r.integrated_commit = lower(s.integrated_commit) AND r.artifact_sha256 = lower(s.artifact_sha256)
)`;
