import { publishedVersionsResponse } from "@/lib/published-versions-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return publishedVersionsResponse(request);
}

export async function HEAD(request: Request) {
  return publishedVersionsResponse(request);
}
