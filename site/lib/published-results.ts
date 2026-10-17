import { loadPublishedVersion, type PublishedVersion } from "./published-versions.ts";
import { artifactPathForMission } from "./verifier.ts";
import { isCodeArtifactPath } from "./code-artifact.ts";

const API = "https://api.github.com/repos/HardieBao/lingnet-ascension";
type Evidence = "verified" | "changed" | "not-in-version" | "unavailable" | "unfrozen";
type ResultRecord = { id: string; missionId: string; title: string; rank: string; integratedCommit: string;
  artifactSha256: string; integratedAt: number; allowedPath: string; publicId: string | null; daohao: string | null };
type ProofInput = { integratedCommit: string; artifactSha256: string; artifactPath: string };

async function bounded(url: string, fetcher: typeof fetch, limit: number, raw = false) {
  const response = await fetcher(url, { headers: { Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "User-Agent": "LingNet-Ascension", "X-GitHub-Api-Version": "2022-11-28" }, redirect: "manual", signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.body) throw new Error("Public proof unavailable");
  const reader = response.body.getReader(), bytes = new Uint8Array(limit); let length = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    if (length + next.value.byteLength > limit) { await reader.cancel(); throw new Error("Public proof too large"); }
    bytes.set(next.value, length); length += next.value.byteLength;
  }
  return bytes.slice(0, length);
}

export async function verifyPublishedResult(version: PublishedVersion, input: ProofInput, fetcher: typeof fetch = fetch): Promise<Evidence> {
  if (version.immutable !== true || version.prerelease) return "unfrozen";
  if (!version.commit || !/^[a-f0-9]{40}$/i.test(version.commit) || !/^[a-f0-9]{40}$/i.test(input.integratedCommit) ||
      !/^[a-f0-9]{64}$/i.test(input.artifactSha256) || !/^[A-Za-z0-9_./-]+$/.test(input.artifactPath) ||
      input.artifactPath.startsWith("/") || input.artifactPath.split("/").some((segment) => ["", ".", ".."].includes(segment))) return "unavailable";
  try {
    const compare = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await bounded(
      `${API}/compare/${input.integratedCommit}...${version.commit}?per_page=1&page=2`, fetcher, 32768)));
    if (!compare || typeof compare !== "object" || !["ahead", "identical", "behind", "diverged"].includes(compare.status)) return "unavailable";
    if (!["ahead", "identical"].includes(compare.status)) return "not-in-version";
    const path = input.artifactPath.split("/").map(encodeURIComponent).join("/");
    const bytes = await bounded(`${API}/contents/${path}?ref=${version.commit}`, fetcher, 131072, true);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    return digest === input.artifactSha256.toLowerCase() ? "verified" : "changed";
  } catch { return "unavailable"; }
}

export async function loadPublishedResults(db: D1Database, releaseId: number, page: number, fetcher: typeof fetch = fetch) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error("Invalid result page");
  const version = await loadPublishedVersion(releaseId, fetcher);
  if (!version) return null;
  const rows = await db.prepare(`WITH qualified AS (
    SELECT s.id,m.id AS missionId,m.title,m.rank,lower(s.integrated_commit) AS integratedCommit,
      lower(s.artifact_sha256) AS artifactSha256,s.integrated_at AS integratedAt,
      CASE WHEN json_valid(c.reward_snapshot) THEN json_extract(c.reward_snapshot,'$.allowedPaths') ELSE NULL END AS allowedPath,
      CASE WHEN p.is_public=1 AND p.contributions_public=1 THEN p.public_id ELSE NULL END AS publicId,
      CASE WHEN p.is_public=1 AND p.contributions_public=1 THEN p.daohao ELSE NULL END AS daohao,
      ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY s.integrated_at DESC,s.id DESC) AS position
    FROM submissions s JOIN claims c ON c.id=s.claim_id AND c.cultivator_id=s.cultivator_id JOIN missions m ON m.id=c.mission_id
      LEFT JOIN cultivator_profiles p ON p.cultivator_id=s.cultivator_id
    WHERE s.state='accepted' AND c.state='completed' AND m.state='done'
      AND LENGTH(s.integrated_commit)=40 AND s.integrated_commit NOT GLOB '*[^0-9a-fA-F]*'
      AND LENGTH(s.artifact_sha256)=64 AND s.artifact_sha256 NOT GLOB '*[^0-9a-fA-F]*'
      AND TYPEOF(s.integrated_at)='integer' AND s.integrated_at BETWEEN 0 AND ?
  ) SELECT id,missionId,title,rank,integratedCommit,artifactSha256,integratedAt,allowedPath,publicId,daohao
    FROM qualified WHERE position=1 ORDER BY integratedAt DESC,id DESC LIMIT 6 OFFSET ?`)
    .bind(Math.min(Date.now(), version.publishedAt), (page - 1) * 5).all<ResultRecord>();
  const results = await Promise.all(rows.results.slice(0, 5).map(async ({ allowedPath, ...record }) => {
    const artifactPath = isCodeArtifactPath(allowedPath) ? allowedPath : artifactPathForMission(record.missionId);
    const evidence = artifactPath ? await verifyPublishedResult(version, { ...record, artifactPath }, fetcher) : "unavailable" as const;
    return { ...record, artifactPath, evidence };
  }));
  return { version, results, page, nextPage: rows.results.length > 5 ? page + 1 : null, source: "fixed-version-file-evidence" as const };
}

export function publishedResultsQuery(params: URLSearchParams) {
  if ([...params.keys()].some((key) => !["release", "page"].includes(key)) || params.getAll("release").length !== 1 || params.getAll("page").length > 1) return null;
  const release = params.get("release") ?? "", page = params.get("page") ?? "1";
  return /^[1-9]\d{0,15}$/.test(release) && Number.isSafeInteger(Number(release)) && /^[1-9]\d{0,5}$/.test(page) && Number(page) <= 100000
    ? { releaseId: Number(release), page: Number(page) } : null;
}
