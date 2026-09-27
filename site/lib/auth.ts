import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { database } from "@/db/runtime";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export type Cultivator = {
  id: string;
  provider: string;
  provider_id: string;
  handle: string;
  display_name: string;
};

const SESSION_COOKIE = "lingnet_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

export function canAccessPreview(cultivatorId: string): boolean {
  const previewId: unknown = Reflect.get(env, "PREVIEW_ONLY_GITHUB_ID");
  return previewId === undefined || typeof previewId === "string" && /^[1-9]\d*$/.test(previewId) &&
    cultivatorId === `github:${previewId}`;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)).buffer;
}

async function sessionKey(): Promise<CryptoKey> {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("登录密钥尚未配置");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSession(cultivatorId: string): Promise<string> {
  const account = await database().prepare(
    "SELECT session_version FROM cultivators WHERE id = ?"
  ).bind(cultivatorId).first<{ session_version: number }>();
  if (!account) throw new Error("修士账号不存在");
  const payload = base64url(new TextEncoder().encode(JSON.stringify({
    sub: cultivatorId,
    ver: account.session_version,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  })));
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(), new TextEncoder().encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}

export async function readSession(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC", await sessionKey(), decodeBase64url(parts[1]), new TextEncoder().encode(parts[0])
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[0])));
    if (typeof payload.sub !== "string" || !Number.isSafeInteger(payload.ver) ||
        typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) return null;
    if (!canAccessPreview(payload.sub)) return null;
    const account = await database().prepare(
      "SELECT session_version FROM cultivators WHERE id = ?"
    ).bind(payload.sub).first<{ session_version: number }>();
    if (!account || account.session_version !== payload.ver) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

function cookieValue(header: string, name: string): string | undefined {
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function getCurrentCultivator(): Promise<Cultivator | null> {
  const requestHeaders = await headers();
  const id = await readSession(cookieValue(requestHeaders.get("cookie") ?? "", SESSION_COOKIE));
  if (id) {
    return database().prepare(
      "SELECT id, provider, provider_id, handle, display_name FROM cultivators WHERE id = ?"
    ).bind(id).first<Cultivator>();
  }

  if (import.meta.env.DEV && !env.GITHUB_CLIENT_ID) {
    const local = await getChatGPTUser();
    if (!local) return null;
    const localId = `local:${local.userId}`;
    await database().prepare(
      "INSERT OR IGNORE INTO cultivators (id, provider, provider_id, handle, display_name, created_at) VALUES (?, 'local', ?, ?, ?, ?)"
    ).bind(localId, local.userId, local.email, local.displayName, Date.now()).run();
    return database().prepare(
      "SELECT id, provider, provider_id, handle, display_name FROM cultivators WHERE id = ?"
    ).bind(localId).first<Cultivator>();
  }
  return null;
}

export function sessionCookie(value: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function isMaintainer(cultivator: Cultivator): boolean {
  const maintainerId = env.MAINTAINER_GITHUB_ID ??
    (import.meta.env.DEV ? process.env.MAINTAINER_GITHUB_ID : undefined);
  return cultivator.provider === "github" && !!maintainerId && cultivator.provider_id === maintainerId;
}
