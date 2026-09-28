import { database } from "@/db/runtime";
import { clearSessionCookie, readSession } from "@/lib/auth";
import { rejectForeignMutation } from "@/lib/request-origin";

export async function POST(request: Request) {
  const foreign = rejectForeignMutation(request);
  if (foreign) return foreign;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("lingnet_session="))?.slice("lingnet_session=".length);
  const cultivatorId = await readSession(cookie);
  if (cultivatorId) {
    await database().prepare(
      "UPDATE cultivators SET session_version = session_version + 1 WHERE id = ?"
    ).bind(cultivatorId).run();
  }
  const response = new Response(null, { status: 303, headers: { Location: new URL("/", request.url).toString() } });
  response.headers.set("Set-Cookie", clearSessionCookie(new URL(request.url).protocol === "https:"));
  return response;
}
