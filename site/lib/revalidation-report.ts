import { artifactPathForMission } from "./verifier.ts";

export type RevalidationReport = {
  version: 1;
  submissionId: string;
  missionId: string;
  artifactPath: string;
  integratedCommit: string;
  artifactSha256: string;
  validatorBaseCommit: string;
  reporterGitHubId: string;
  findings: string;
  kind: "document" | "code";
};

export function parseRevalidationReport(input: unknown): RevalidationReport | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const { submissionId, missionId, artifactPath, integratedCommit, artifactSha256, validatorBaseCommit, reporterGitHubId } = value;
  const findings = typeof value.findings === "string" ? value.findings.trim() : "";
  if (value.version !== 1 || typeof submissionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId) ||
      typeof missionId !== "string" || !/^[A-Z][A-Z0-9-]{1,63}$/.test(missionId) ||
      typeof artifactPath !== "string" || artifactPath.length > 240 || artifactPath.split("/").includes("..") ||
      typeof integratedCommit !== "string" || !/^[a-f0-9]{40}$/i.test(integratedCommit) ||
      typeof artifactSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(artifactSha256) ||
      typeof validatorBaseCommit !== "string" || !/^[a-f0-9]{40}$/i.test(validatorBaseCommit) ||
      typeof reporterGitHubId !== "string" || !/^[1-9]\d*$/.test(reporterGitHubId) ||
      !Number.isSafeInteger(Number(reporterGitHubId)) || findings.length < 20 || findings.length > 2000) return null;
  const documentPath = artifactPathForMission(missionId);
  const kind = documentPath ? "document" : "code";
  if (documentPath ? artifactPath !== documentPath : !/^site\/(?:app|lib|db|public)\/[A-Za-z0-9_./-]+$/.test(artifactPath)) return null;
  return { version: 1, submissionId: submissionId.toLowerCase(), missionId, artifactPath,
    integratedCommit: integratedCommit.toLowerCase(), artifactSha256: artifactSha256.toLowerCase(),
    validatorBaseCommit: validatorBaseCommit.toLowerCase(), reporterGitHubId, findings, kind };
}
