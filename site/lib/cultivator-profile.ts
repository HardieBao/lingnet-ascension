import type { Cultivator } from "./auth";

export type CultivatorProfile = {
  daohao: string;
  public: boolean;
  contributionsPublic: boolean;
  revision: number;
  publicId: string | null;
};

export type ProfileUpdate = Pick<CultivatorProfile, "daohao" | "public" | "revision" | "contributionsPublic">;

export function parseProfileUpdate(value: unknown): ProfileUpdate | null {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !["daohao", "public", "revision", "contributionsPublic"].includes(key))) return null;
  const name: unknown = Reflect.get(value, "daohao");
  const visible: unknown = Reflect.get(value, "public");
  const revision: unknown = Reflect.get(value, "revision");
  const contributions: unknown = Reflect.get(value, "contributionsPublic");
  if (typeof name !== "string" || typeof visible !== "boolean" ||
      (contributions !== undefined && typeof contributions !== "boolean") || contributions === true && visible !== true ||
      typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return null;
  const daohao = name.trim();
  if (!daohao || Array.from(daohao).length > 32 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(daohao)) return null;
  return { daohao, public: visible, revision, contributionsPublic: contributions === true };
}

export async function saveOwnProfile(db: D1Database, cultivatorId: string, input: ProfileUpdate): Promise<boolean> {
  const statement = input.revision === 0
    ? db.prepare("INSERT OR IGNORE INTO cultivator_profiles (cultivator_id, public_id, daohao, is_public, contributions_public, revision, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
      .bind(cultivatorId, crypto.randomUUID(), input.daohao, input.public ? 1 : 0, input.contributionsPublic ? 1 : 0, Date.now())
    : db.prepare("UPDATE cultivator_profiles SET daohao = ?, is_public = ?, contributions_public = ?, revision = revision + 1, updated_at = ? WHERE cultivator_id = ? AND revision = ?")
      .bind(input.daohao, input.public ? 1 : 0, input.contributionsPublic ? 1 : 0, Date.now(), cultivatorId, input.revision);
  return (await statement.run()).meta.changes === 1;
}

export async function loadOwnProfile(db: D1Database, cultivator: Pick<Cultivator, "id" | "display_name">): Promise<CultivatorProfile> {
  const row = await db.prepare(
    "SELECT daohao, is_public, contributions_public, revision, public_id FROM cultivator_profiles WHERE cultivator_id = ?"
  ).bind(cultivator.id).first<{ daohao: string; is_public: number; contributions_public: number; revision: number; public_id: string }>();
  return row
    ? { daohao: row.daohao, public: row.is_public === 1, contributionsPublic: row.is_public === 1 && row.contributions_public === 1, revision: row.revision, publicId: row.public_id }
    : { daohao: cultivator.display_name, public: false, contributionsPublic: false, revision: 0, publicId: null };
}

export async function loadPublicProfile(db: D1Database, publicId: string): Promise<{ daohao: string; realm: string } | null> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(publicId)) return null;
  return db.prepare(
    "SELECT p.daohao, c.realm FROM cultivator_profiles p JOIN cultivators c ON c.id = p.cultivator_id WHERE p.public_id = ? AND p.is_public = 1"
  ).bind(publicId).first<{ daohao: string; realm: string }>();
}
