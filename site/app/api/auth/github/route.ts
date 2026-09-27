import { env } from "cloudflare:workers";

export async function GET(request: Request) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET) {
    return Response.json({ error: "GitHub 登录尚未配置" }, { status: 503 });
  }
  const origin = env.PUBLIC_ORIGIN ?? new URL(request.url).origin;
  const state = crypto.randomUUID();
  const verifier = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${origin}/api/auth/github/callback`);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  const secure = origin.startsWith("https://");
  const response = new Response(null, { status: 302, headers: { Location: authorize.toString() } });
  response.headers.append("Set-Cookie", `lingnet_oauth_state=${state}; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`);
  response.headers.append("Set-Cookie", `lingnet_oauth_verifier=${verifier}; Path=/api/auth/github; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`);
  return response;
}
