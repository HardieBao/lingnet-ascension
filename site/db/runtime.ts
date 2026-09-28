import { env } from "cloudflare:workers";

export function database(): D1Database {
  if (!env.DB) throw new Error("任务数据库暂不可用");
  return env.DB;
}

export async function artifactBytes(key: string): Promise<ArrayBuffer | null> {
  const record = await database().prepare("SELECT content, sha256 FROM artifact_payloads WHERE artifact_key = ?")
    .bind(key).first<{ content: string; sha256: string }>();
  if (record) {
    const bytes = new TextEncoder().encode(record.content);
    if (bytes.byteLength > 131072) throw new Error("成果超过存储限制");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== record.sha256) throw new Error("成果存储摘要不一致");
    return bytes.buffer;
  }
  // Read-only compatibility for pre-migration local data; no new R2 writes or deletions.
  if (!env.BUCKET) return null;
  const legacy = await env.BUCKET.get(key);
  return legacy && legacy.size <= 131072 ? legacy.arrayBuffer() : null;
}
