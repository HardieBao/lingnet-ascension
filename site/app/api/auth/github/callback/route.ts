import { env } from "cloudflare:workers";
import { database } from "@/db/runtime";
import { canAccessPreview, createSession, sessionCookie } from "@/lib/auth";

function readCookie(header: string, name: string): string | undefined {
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const cookies = request.headers.get("cookie") ?? "";
  const savedState = readCookie(cookies, "lingnet_oauth_state");
  const verifier = readCookie(cookies, "lingnet_oauth_verifier");
  if (!state || !code || !savedState || !verifier || state !== savedState) {
    return Response.json({ error: "登录状态校验失败" }, { status: 400 });
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return Response.json({ error: "GitHub 登录尚未配置" }, { status: 503 });
  }

  const origin = env.PUBLIC_ORIGIN ?? url.origin;
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/github/callback`,
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) return Response.json({ error: "GitHub 授权失败" }, { status: 502 });
  const token = await tokenResponse.json() as { access_token?: string; error?: string };
  if (!token.access_token || token.error) return Response.json({ error: "GitHub 授权失败" }, { status: 502 });

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "LingNet-Ascension",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!userResponse.ok) return Response.json({ error: "无法读取 GitHub 身份" }, { status: 502 });
  const user = await userResponse.json() as { id?: number; login?: string; name?: string | null };
  if (typeof user.id !== "number" || !user.login) return Response.json({ error: "GitHub 身份不完整" }, { status: 502 });

  const id = `github:${user.id}`;
  if (!canAccessPreview(id)) {
    return Response.json({ error: "Pre-Alpha 受限预览暂仅向主理人开放，尚未开放社区登录。" }, { status: 403 });
  }
  await database().prepare(
    "INSERT INTO cultivators (id, provider, provider_id, handle, display_name, created_at) VALUES (?, 'github', ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET handle = excluded.handle, display_name = excluded.display_name"
  ).bind(id, String(user.id), user.login, user.name || user.login, Date.now()).run();

  const response = new Response(null, { status: 302, headers: { Location: origin } });
  const secure = origin.startsWith("https://");
  response.headers.append("Set-Cookie", sessionCookie(await createSession(id), secure));
  response.headers.append("Set-Cookie", `lingnet_oauth_state=; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
  response.headers.append("Set-Cookie", `lingnet_oauth_verifier=; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
  return response;
}
