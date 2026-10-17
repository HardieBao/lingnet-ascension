export type PublicContribution = { publicId: string; daohao: string; realm: string; merit: number; results: number; position: number; sectName: string | null };

// Display-only evidence. Never substitutes for the realm/reward eligibility queries.
export const PUBLIC_CONTRIBUTION_CTE = `WITH public_contributions AS (
  SELECT c.id AS cultivatorId, p.public_id AS publicId, p.daohao, c.realm,
    MAX(0, COALESCE((SELECT SUM(l.delta) FROM ledger_events l WHERE l.cultivator_id=c.id AND l.resource='merit'), 0)) AS merit,
    (SELECT COUNT(DISTINCT m.id) FROM submissions s
      JOIN claims cl ON cl.id=s.claim_id AND cl.cultivator_id=s.cultivator_id
      JOIN missions m ON m.id=cl.mission_id
      WHERE s.cultivator_id=c.id AND s.state='accepted' AND cl.state='completed' AND m.state='done'
        AND LENGTH(s.integrated_commit)=40 AND s.integrated_commit NOT GLOB '*[^0-9a-fA-F]*'
        AND LENGTH(s.artifact_sha256)=64 AND s.artifact_sha256 NOT GLOB '*[^0-9a-fA-F]*'
        AND TYPEOF(s.integrated_at)='integer' AND s.integrated_at BETWEEN 0 AND ?) AS results
  FROM cultivators c JOIN cultivator_profiles p ON p.cultivator_id=c.id
  WHERE p.is_public=1 AND p.contributions_public=1
)`;

export async function loadContributionBoard(db: D1Database, page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error("榜单页码无效");
  const rows = await db.prepare(`${PUBLIC_CONTRIBUTION_CTE}
    SELECT publicId, daohao, realm, merit, results, ROW_NUMBER() OVER (ORDER BY merit DESC, results DESC, publicId) AS position,
      (SELECT s.name FROM sect_memberships sm JOIN sects s ON s.id=sm.sect_id
       WHERE sm.cultivator_id=public_contributions.cultivatorId AND sm.state='active' AND sm.is_public=1 AND s.state='active') AS sectName
    FROM public_contributions ORDER BY merit DESC, results DESC, publicId LIMIT 31 OFFSET ?`)
    .bind(Date.now(), (page - 1) * 30).all<PublicContribution>();
  return { entries: rows.results.slice(0, 30), page, nextPage: rows.results.length > 30 ? page + 1 : null };
}

export async function loadSectBoard(db: D1Database) {
  return (await db.prepare(`${PUBLIC_CONTRIBUTION_CTE}
    SELECT s.id, s.name, s.description, COUNT(p.cultivatorId) AS publicMembers,
      COALESCE(SUM(p.merit),0) AS merit, COALESCE(SUM(p.results),0) AS results
    FROM sects s LEFT JOIN sect_memberships sm ON sm.sect_id=s.id AND sm.state='active' AND sm.is_public=1
    LEFT JOIN public_contributions p ON p.cultivatorId=sm.cultivator_id
    WHERE s.state='active' GROUP BY s.id
    ORDER BY merit DESC, results DESC, s.name_key, s.id LIMIT 100`)
    .bind(Date.now()).all<{ id: string; name: string; description: string; publicMembers: number; merit: number; results: number }>()).results;
}
