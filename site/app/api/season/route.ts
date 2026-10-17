import { database } from "@/db/runtime";
import { seasonProgressResponse } from "@/lib/season-progress";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return seasonProgressResponse(request, database);
}

export async function HEAD(request: Request) {
  return seasonProgressResponse(request, database);
}
