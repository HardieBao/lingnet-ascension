type MissionStateCounts = { total: number; open: number; blocked: number; done: number; other: number };
export type SeasonProgress = { state: "available"; scope: "platform-records"; season: "灵网初开";
  missionStates: MissionStateCounts; recordedIntegrations: number } | { state: "unavailable" };

const SEASON_PROGRESS_SQL = `
  SELECT COUNT(*) AS total,
    COALESCE(SUM(state = 'open'), 0) AS open,
    COALESCE(SUM(state = 'blocked'), 0) AS blocked,
    COALESCE(SUM(state = 'done'), 0) AS done,
    COALESCE(SUM(state NOT IN ('open', 'blocked', 'done')), 0) AS other,
    COALESCE(SUM(CASE WHEN state = 'done' AND EXISTS (
      SELECT 1 FROM claims c JOIN submissions s ON s.claim_id = c.id AND s.cultivator_id = c.cultivator_id
      WHERE c.mission_id = missions.id AND c.state = 'completed' AND s.state = 'accepted'
        AND LENGTH(s.integrated_commit) = 40 AND s.integrated_commit NOT GLOB '*[^0-9a-f]*'
        AND TYPEOF(s.integrated_at) = 'integer' AND s.integrated_at BETWEEN 0 AND ?
    ) THEN 1 ELSE 0 END), 0) AS recordedIntegrations
  FROM missions
`;

export async function loadSeasonProgress(getDatabase: () => D1Database): Promise<SeasonProgress> {
  try {
    const counts = await getDatabase().prepare(SEASON_PROGRESS_SQL).bind(Date.now())
      .first<MissionStateCounts & { recordedIntegrations: number }>();
    if (!counts) return { state: "unavailable" };
    const { recordedIntegrations, ...missionStates } = counts;
    return { state: "available", scope: "platform-records", season: "灵网初开", missionStates, recordedIntegrations };
  } catch {
    return { state: "unavailable" };
  }
}

export async function seasonProgressResponse(request: Request, getDatabase: () => D1Database): Promise<Response> {
  const respond = (value: unknown, status: number) => {
    const response = Response.json(value, { status, headers: {
      "Cache-Control": "no-store", ...(status === 405 ? { Allow: "GET, HEAD" } : {}),
    } });
    return request.method === "HEAD" ? new Response(null, { status, headers: response.headers }) : response;
  };
  if (!["GET", "HEAD"].includes(request.method)) return respond({ error: "赛季进度接口只读" }, 405);
  if (new URL(request.url).search) return respond({ error: "赛季进度不接受筛选参数" }, 400);
  const progress = await loadSeasonProgress(getDatabase);
  return respond(progress, progress.state === "available" ? 200 : 503);
}
