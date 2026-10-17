import { artifactSafetyIssues } from "./artifact-safety.ts";

export type Sect = { id: string; name: string; description: string; ownerId: string; state: string; createdAt: number; reviewReason: string | null };
export type SectMembership = { sectId: string; sectName: string; sectState: string; cultivatorId: string; daohao: string;
  state: string; public: number; revision: number; owner: number };

function fields(value: unknown, allowed: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key));
}
export function parseSectCreation(value: unknown) {
  if (!fields(value, ["name", "description"]) || typeof value.name !== "string" || typeof value.description !== "string") return null;
  const name = value.name.trim().normalize("NFKC"), description = value.description.trim();
  if (!name || Array.from(name).length > 40 || Array.from(description).length > 500 ||
      /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name + description) || artifactSafetyIssues(name + " " + description).length) return null;
  return { name, nameKey: name.toLowerCase(), description };
}
export function parseMembershipAction(value: unknown) {
  if (!fields(value, ["action", "cultivatorId", "revision", "public"]) ||
      !["join", "leave", "visibility", "accept", "reject", "remove"].includes(String(value.action))) return null;
  if (value.action === "join") return typeof value.public === "boolean" && value.cultivatorId === undefined && value.revision === undefined
    ? { action: "join" as const, public: value.public } : null;
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1) return null;
  if (value.action === "leave") return value.cultivatorId === undefined && value.public === undefined
    ? { action: "leave" as const, revision: Number(value.revision) } : null;
  if (value.action === "visibility") return value.cultivatorId === undefined && typeof value.public === "boolean"
    ? { action: "visibility" as const, revision: Number(value.revision), public: value.public } : null;
  return typeof value.cultivatorId === "string" && /^[a-zA-Z0-9_:.-]{1,160}$/.test(value.cultivatorId) && value.public === undefined
    ? { action: value.action as "accept" | "reject" | "remove", cultivatorId: value.cultivatorId, revision: Number(value.revision) } : null;
}
export function parseSectReview(value: unknown) {
  if (!fields(value, ["decision", "reason"]) || !["approve", "reject"].includes(String(value.decision)) || typeof value.reason !== "string") return null;
  const reason = value.reason.trim();
  if (reason.length < 8 || reason.length > 500 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(reason) || artifactSafetyIssues(reason).length) return null;
  return { decision: value.decision as "approve" | "reject", reason };
}

export async function loadOwnSectState(db: D1Database, actorId: string, maintainer: boolean) {
  const [owned, memberships, requests, pending] = await Promise.all([
    db.prepare("SELECT id,name,description,owner_id AS ownerId,state,created_at AS createdAt,review_reason AS reviewReason FROM sects WHERE owner_id=? ORDER BY created_at DESC LIMIT 30").bind(actorId).all<Sect>(),
    db.prepare(`SELECT sm.sect_id AS sectId,s.name AS sectName,s.state AS sectState,sm.cultivator_id AS cultivatorId,
      COALESCE(p.daohao,c.display_name) AS daohao,sm.state,sm.is_public AS public,sm.revision,s.owner_id=sm.cultivator_id AS owner
      FROM sect_memberships sm JOIN sects s ON s.id=sm.sect_id JOIN cultivators c ON c.id=sm.cultivator_id
      LEFT JOIN cultivator_profiles p ON p.cultivator_id=c.id WHERE sm.cultivator_id=? AND sm.state IN ('pending','active')`)
      .bind(actorId).all<SectMembership>(),
    db.prepare(`SELECT sm.sect_id AS sectId,s.name AS sectName,s.state AS sectState,sm.cultivator_id AS cultivatorId,
      COALESCE(p.daohao,c.display_name) AS daohao,sm.state,sm.is_public AS public,sm.revision,s.owner_id=sm.cultivator_id AS owner
      FROM sect_memberships sm JOIN sects s ON s.id=sm.sect_id JOIN cultivators c ON c.id=sm.cultivator_id
      LEFT JOIN cultivator_profiles p ON p.cultivator_id=c.id
      WHERE s.owner_id=? AND s.state='active' AND sm.state IN ('pending','active') ORDER BY sm.created_at,sm.cultivator_id LIMIT 100`)
      .bind(actorId).all<SectMembership>(),
    maintainer ? db.prepare("SELECT id,name,description,owner_id AS ownerId,state,created_at AS createdAt,review_reason AS reviewReason FROM sects WHERE state='pending' ORDER BY created_at,id LIMIT 100").all<Sect>() : Promise.resolve({ results: [] as Sect[] }),
  ]);
  return { owned: owned.results, memberships: memberships.results, requests: requests.results, pending: pending.results };
}

export async function createSect(db: D1Database, actorId: string, input: NonNullable<ReturnType<typeof parseSectCreation>>) {
  const id = crypto.randomUUID(), now = Date.now();
  const result = await db.batch([
    db.prepare(`INSERT INTO sects (id,name,name_key,description,owner_id,state,created_at,updated_at)
      SELECT ?,?,?,?,?,'pending',?,? WHERE NOT EXISTS (SELECT 1 FROM sect_memberships WHERE cultivator_id=? AND state IN ('pending','active'))`)
      .bind(id, input.name, input.nameKey, input.description, actorId, now, now, actorId),
    db.prepare(`INSERT INTO sect_memberships (sect_id,cultivator_id,state,is_public,revision,created_at,updated_at,changed_by)
      SELECT ?,?,'pending',0,1,?,?,? WHERE EXISTS (SELECT 1 FROM sects WHERE id=? AND owner_id=?)`)
      .bind(id, actorId, now, now, actorId, id, actorId),
  ]);
  return result[0].meta.changes === 1 ? id : null;
}

export async function reviewSect(db: D1Database, actorId: string, id: string, input: NonNullable<ReturnType<typeof parseSectReview>>) {
  const now = Date.now(), state = input.decision === "approve" ? "active" : "rejected";
  const result = await db.batch([
    db.prepare("UPDATE sects SET state=?,reviewed_by=?,review_reason=?,reviewed_at=?,updated_at=? WHERE id=? AND state='pending' AND owner_id!=?")
      .bind(state, actorId, input.reason, now, now, id, actorId),
    db.prepare(`UPDATE sect_memberships SET state=?,revision=revision+1,updated_at=?,changed_by=?
      WHERE sect_id=? AND state='pending' AND cultivator_id=(SELECT owner_id FROM sects WHERE id=?)
      AND EXISTS (SELECT 1 FROM sects WHERE id=? AND state=? AND reviewed_by=? AND reviewed_at=?)`)
      .bind(state === "active" ? "active" : "rejected", now, actorId, id, id, id, state, actorId, now),
  ]);
  return result[0].meta.changes === 1;
}

export async function changeMembership(db: D1Database, actorId: string, id: string, input: NonNullable<ReturnType<typeof parseMembershipAction>>) {
  const now = Date.now();
  if (input.action === "join") {
    const result = await db.prepare(`INSERT INTO sect_memberships (sect_id,cultivator_id,state,is_public,revision,created_at,updated_at,changed_by)
      SELECT ?,?,'pending',?,1,?,?,? WHERE EXISTS (SELECT 1 FROM sects WHERE id=? AND state='active')
      ON CONFLICT(sect_id,cultivator_id) DO UPDATE SET state='pending',is_public=excluded.is_public,revision=sect_memberships.revision+1,
        updated_at=excluded.updated_at,changed_by=excluded.changed_by WHERE sect_memberships.state IN ('left','rejected')`)
      .bind(id, actorId, input.public ? 1 : 0, now, now, actorId, id).run();
    return result.meta.changes === 1;
  }
  if (input.action === "visibility") {
    return (await db.prepare(`UPDATE sect_memberships SET is_public=?,revision=revision+1,updated_at=?,changed_by=?
      WHERE sect_id=? AND cultivator_id=? AND revision=? AND state IN ('pending','active') AND EXISTS(SELECT 1 FROM sects WHERE id=? AND state='active')`)
      .bind(input.public ? 1 : 0, now, actorId, id, actorId, input.revision, id).run()).meta.changes === 1;
  }
  if (input.action === "leave") {
    return (await db.prepare(`UPDATE sect_memberships SET state='left',is_public=0,revision=revision+1,updated_at=?,changed_by=?
      WHERE sect_id=? AND cultivator_id=? AND revision=? AND state IN ('pending','active')
      AND EXISTS(SELECT 1 FROM sects WHERE id=? AND owner_id!=? AND state='active')`)
      .bind(now, actorId, id, actorId, input.revision, id, actorId).run()).meta.changes === 1;
  }
  const from = input.action === "remove" ? "active" : "pending", to = input.action === "accept" ? "active" : input.action === "reject" ? "rejected" : "left";
  return (await db.prepare(`UPDATE sect_memberships SET state=?,is_public=CASE WHEN ?='active' THEN is_public ELSE 0 END,
    revision=revision+1,updated_at=?,changed_by=? WHERE sect_id=? AND cultivator_id=? AND cultivator_id!=? AND revision=? AND state=?
    AND EXISTS(SELECT 1 FROM sects WHERE id=? AND owner_id=? AND state='active')`)
    .bind(to, to, now, actorId, id, input.cultivatorId, actorId, input.revision, from, id, actorId).run()).meta.changes === 1;
}

export async function archiveSect(db: D1Database, actorId: string, id: string) {
  const now = Date.now();
  const result = await db.batch([
    db.prepare("UPDATE sects SET state='archived',updated_at=? WHERE id=? AND owner_id=? AND state IN ('pending','active')").bind(now, id, actorId),
    db.prepare(`UPDATE sect_memberships SET state='left',is_public=0,revision=revision+1,updated_at=?,changed_by=?
      WHERE sect_id=? AND state IN ('pending','active') AND EXISTS(SELECT 1 FROM sects WHERE id=? AND owner_id=? AND state='archived')`)
      .bind(now, actorId, id, id, actorId),
  ]);
  return result[0].meta.changes === 1;
}
