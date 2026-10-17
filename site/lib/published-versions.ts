const API = "https://api.github.com/repos/HardieBao/lingnet-ascension";
const HEADERS = { Accept: "application/vnd.github+json", "User-Agent": "LingNet-Ascension", "X-GitHub-Api-Version": "2022-11-28" };
const SHA = /^[a-f0-9]{40}$/i;

export type PublishedVersion = { releaseId: number; tag: string; publishedAt: number;
  prerelease: boolean; immutable: boolean | null; commit: string | null };
export type PublishedVersionsPage = { state: "available"; page: number; nextPage: number | null;
  versions: PublishedVersion[] } | { state: "unavailable" };

async function requestJson(url: string, fetcher: typeof fetch, limit: number): Promise<{ value: unknown; link: string | null }> {
  const response = await fetcher(url, { headers: HEADERS, redirect: "manual", signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.body) throw new Error("Public version evidence unavailable");
  const reader = response.body.getReader(), bytes = new Uint8Array(limit);
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > limit) { await reader.cancel(); throw new Error("Public version evidence too large"); }
    bytes.set(value, size); size += value.byteLength;
  }
  return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size))), link: response.headers.get("link") };
}

async function tagCommit(tag: string, fetcher: typeof fetch): Promise<string | null> {
  try {
    const { value } = await requestJson(`${API}/git/ref/tags/${encodeURIComponent(tag)}`, fetcher, 32768);
    if (!value || typeof value !== "object" || Array.isArray(value) || Reflect.get(value, "ref") !== `refs/tags/${tag}`) return null;
    let object: unknown = Reflect.get(value, "object");
    const seen = new Set<string>();
    for (let depth = 0; depth <= 4; depth++) {
      if (!object || typeof object !== "object" || Array.isArray(object)) return null;
      const sha: unknown = Reflect.get(object, "sha"), type: unknown = Reflect.get(object, "type");
      if (typeof sha !== "string" || !SHA.test(sha)) return null;
      const normalized = sha.toLowerCase();
      if (type === "commit") return normalized;
      if (type !== "tag" || depth === 4 || seen.has(normalized)) return null;
      seen.add(normalized);
      const result = await requestJson(`${API}/git/tags/${normalized}`, fetcher, 32768);
      if (!result.value || typeof result.value !== "object" || Array.isArray(result.value) ||
          typeof Reflect.get(result.value, "sha") !== "string" || Reflect.get(result.value, "sha").toLowerCase() !== normalized) return null;
      object = Reflect.get(result.value, "object");
    }
    return null;
  } catch { return null; }
}

export async function loadPublishedVersions(page = 1, fetcher: typeof fetch = fetch): Promise<PublishedVersionsPage> {
  if (!Number.isSafeInteger(page) || page < 1) return { state: "unavailable" };
  try {
    const { value, link } = await requestJson(`${API}/releases?per_page=5&page=${page}`, fetcher, 131072);
    if (!Array.isArray(value) || value.length > 5) return { state: "unavailable" };
    let nextPage: number | null = null;
    const next = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    if (next) {
      const target = new URL(next), expected = new URL(`${API}/releases`);
      const number = Number(target.searchParams.get("page"));
      if (target.origin !== expected.origin || target.pathname.toLowerCase() !== expected.pathname.toLowerCase() || target.username || target.password ||
          target.searchParams.get("per_page") !== "5" || !Number.isSafeInteger(number) || number !== page + 1) return { state: "unavailable" };
      nextPage = number;
    } else if (link && /rel="next"/.test(link)) return { state: "unavailable" };
    const versions: PublishedVersion[] = [];
    const ids = new Set<number>();
    for (const record of value) {
      if (!record || typeof record !== "object" || typeof record.draft !== "boolean") return { state: "unavailable" };
      if (record.draft) continue;
      const publishedAt = typeof record.published_at === "string" ? Date.parse(record.published_at) : NaN;
      if (!Number.isSafeInteger(record.id) || record.id < 1 || ids.has(record.id) || typeof record.tag_name !== "string" ||
          !record.tag_name || record.tag_name.length > 256 || [".", ".."].includes(record.tag_name) ||
          typeof record.prerelease !== "boolean" || !Number.isFinite(publishedAt) || publishedAt > Date.now()) return { state: "unavailable" };
      ids.add(record.id);
      versions.push({ releaseId: record.id, tag: record.tag_name, publishedAt, prerelease: record.prerelease,
        immutable: typeof record.immutable === "boolean" ? record.immutable : null,
        commit: await tagCommit(record.tag_name, fetcher) });
    }
    return { state: "available", page, nextPage, versions };
  } catch { return { state: "unavailable" }; }
}

export async function loadPublishedVersion(releaseId: number, fetcher: typeof fetch = fetch): Promise<PublishedVersion | null> {
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) return null;
  try {
    const { value } = await requestJson(`${API}/releases/${releaseId}`, fetcher, 131072);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>, tag = record.tag_name;
    const publishedAt = typeof record.published_at === "string" ? Date.parse(record.published_at) : NaN;
    if (record.id !== releaseId || record.draft !== false || typeof record.prerelease !== "boolean" ||
        typeof tag !== "string" || !tag || tag.length > 256 || [".", ".."].includes(tag) ||
        !Number.isFinite(publishedAt) || publishedAt > Date.now()) return null;
    return { releaseId, tag, publishedAt, prerelease: record.prerelease,
      immutable: typeof record.immutable === "boolean" ? record.immutable : null, commit: await tagCommit(tag, fetcher) };
  } catch { return null; }
}
