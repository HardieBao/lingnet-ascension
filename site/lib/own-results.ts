export type OwnResult = { id: string; missionId: string; title: string; rank: string;
  integratedCommit: string; artifactSha256: string; integratedAt: number };

export async function loadOwnResults(db: D1Database, ownerId: string, before?: string) {
  const match = before === undefined ? null : /^(\d{1,16}):([^\r\n]{1,128})$/.exec(before);
  if (before !== undefined && (!match || !Number.isSafeInteger(Number(match[1])))) {
    return { results: [] as OwnResult[], nextCursor: null, error: "成果分页参数无效，请返回最新记录" };
  }
  const time = match ? Number(match[1]) : null;
  const rows = await db.prepare(`
    WITH qualified AS (
      SELECT s.id, m.id AS missionId, m.title, m.rank, lower(s.integrated_commit) AS integratedCommit,
        lower(s.artifact_sha256) AS artifactSha256, s.integrated_at AS integratedAt,
        ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY s.integrated_at DESC, s.id DESC) AS position
      FROM submissions s JOIN claims c ON c.id = s.claim_id AND c.cultivator_id = s.cultivator_id
        JOIN missions m ON m.id = c.mission_id
      WHERE s.cultivator_id = ? AND c.state = 'completed' AND m.state = 'done' AND s.state = 'accepted'
        AND LENGTH(s.integrated_commit) = 40 AND s.integrated_commit NOT GLOB '*[^0-9a-fA-F]*'
        AND LENGTH(s.artifact_sha256) = 64 AND s.artifact_sha256 NOT GLOB '*[^0-9a-fA-F]*'
        AND TYPEOF(s.integrated_at) = 'integer' AND s.integrated_at BETWEEN 0 AND ?
    )
    SELECT id, missionId, title, rank, integratedCommit, artifactSha256, integratedAt FROM qualified
    WHERE position = 1 AND (? IS NULL OR integratedAt < ? OR (integratedAt = ? AND id < ?))
    ORDER BY integratedAt DESC, id DESC LIMIT 31
  `).bind(ownerId, Date.now(), time, time, time, match?.[2] ?? null).all<OwnResult>();
  const results = rows.results.slice(0, 30), last = results.at(-1);
  return { results, nextCursor: rows.results.length > 30 && last ? `${last.integratedAt}:${last.id}` : null, error: null };
}
