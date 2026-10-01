import { env } from "cloudflare:workers";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { expireClaims, getClaimHistory } from "@/lib/claims";
import { claimQuote } from "@/lib/claim-quote";
import { MODEL_CONTRACT } from "@/lib/model-budget";
import { isCodeArtifactPath } from "@/lib/code-artifact";
import { BASE_ACTIVE_CLAIM_LIMIT, HEAVENLY_MIRROR_ID, SPLIT_MIND_ACTIVE_CLAIM_LIMIT, SPLIT_MIND_PENDANT_ID } from "@/lib/equipment";
import { missionAccessReason } from "@/lib/mission-eligibility";
import { HALL_STATUS_LABELS, selectMissionHall, type HallSearchParams } from "@/lib/mission-hall";
import { MISSION_FAILURE_SUMMARY_SQL, type MissionFailureSummary } from "@/lib/mission-history";
import { listMissions } from "@/lib/missions";
import { getRealmState } from "@/lib/realm-state";
import { realmNames, type Realm } from "@/lib/realms";
import { officialTokenBonus } from "@/lib/rewards";
import { isRecoveryReviewer } from "@/lib/stable-reward-workbench";
import { artifactPathForMission } from "@/lib/verifier";
import { MissionActions } from "./mission-actions";
import { ClaimHistory } from "./claim-history";
import { RealmActions } from "./realm-actions";

export const dynamic = "force-dynamic";

type ActiveClaim = { id: string; mission_id: string; state: string; expires_at: number };

async function loadHomeData(params: HallSearchParams) {
  await expireClaims();
  const missions = await listMissions();
  const cultivator = await getCurrentCultivator();
  const db = database();
  const [activeClaims, occupiedRows, realmState, equippedItems, claimHistory] = await Promise.all([
    cultivator
      ? db.prepare(
          "SELECT id, mission_id, state, expires_at FROM claims WHERE cultivator_id = ? AND state IN ('claimed', 'running', 'submitted', 'review', 'approved', 'frozen') ORDER BY claimed_at DESC LIMIT 2"
        ).bind(cultivator.id).all<ActiveClaim>().then((rows) => rows.results)
      : Promise.resolve([] as ActiveClaim[]),
    db.prepare(
      "SELECT mission_id, state FROM claims WHERE state IN ('claimed', 'running', 'submitted', 'review', 'approved', 'frozen')"
    ).all<{ mission_id: string; state: string }>(),
    cultivator ? getRealmState(cultivator.id) : Promise.resolve(null),
    cultivator ? db.prepare(
      "SELECT item_id FROM inventory WHERE cultivator_id = ? AND item_id IN (?, ?) AND equipped_at IS NOT NULL"
    ).bind(cultivator.id, SPLIT_MIND_PENDANT_ID, HEAVENLY_MIRROR_ID)
      .all<{ item_id: string }>().then((rows) => rows.results.map((row) => row.item_id)) : Promise.resolve([] as string[]),
    cultivator ? getClaimHistory(cultivator.id, params.claimsBefore) : Promise.resolve({ claims: [], nextCursor: null, error: null }),
  ]);
  const activeByMission = new Map(activeClaims.map((claim) => [claim.mission_id, claim]));
  const equipped = new Set(equippedItems);
  const claimLimit = equipped.has(SPLIT_MIND_PENDANT_ID) ? SPLIT_MIND_ACTIVE_CLAIM_LIMIT : BASE_ACTIVE_CLAIM_LIMIT;
  const occupied = new Map(occupiedRows.results.map((row) => [row.mission_id, row.state]));
  const balances = realmState?.balances ?? {};
  const completedCount = realmState?.progress.formalResults ?? 0;
  const cultivation = balances.cultivation ?? 0;
  const merit = balances.merit ?? 0;
  const realm = realmState?.name ?? "凡人";
  const realmGoal = realmState?.next.rule?.cultivation ?? cultivation;
  const hall = selectMissionHall(missions, occupied, realmState?.realm ?? null, merit, params);
  const visibleMissions = hall.visible.map(({ mission }) => mission);
  const selected = visibleMissions.find((mission) => mission.id === params.mission)
    ?? visibleMissions.find((mission) => activeByMission.has(mission.id))
    ?? hall.visible.find(({ status }) => status === "available")?.mission
    ?? visibleMissions[0] ?? null;
  const mirrorHistory = selected && equipped.has(HEAVENLY_MIRROR_ID)
    ? await db.prepare(MISSION_FAILURE_SUMMARY_SQL).bind(selected.id).first<MissionFailureSummary>()
    : null;
  const openCount = hall.openCount;
  const signInPath = import.meta.env.DEV && !env.GITHUB_CLIENT_ID
    ? "/signin-with-chatgpt?return_to=/"
    : "/api/auth/github";
  const claimOffer = selected ? { title: selected.title, rank: selected.rank, base_commit: selected.base_commit,
    allowed_paths: selected.allowed_paths, deposit: selected.deposit, reward_token: selected.reward_token,
    reward_cultivation: selected.reward_cultivation, reward_merit: selected.reward_merit,
    quote: await claimQuote(selected), model: MODEL_CONTRACT } : null;
  return { missions, hall, cultivator, activeClaims, activeByMission, claimLimit, occupied, balances, completedCount, cultivation, merit, realm, realmGoal, realmState, selected, mirrorHistory, openCount, signInPath, claimHistory, claimOffer };
}

export default async function Home({ searchParams }: { searchParams: Promise<HallSearchParams> }) {
  const params = await searchParams;
  const data = await loadHomeData(params).catch(() => null);
  if (!data) return <main className="unavailable"><h1>任务大殿暂不可用</h1><p>数据服务正在恢复，请稍后刷新。</p></main>;
  const { missions, hall, cultivator, activeClaims, activeByMission, claimLimit, occupied, balances, completedCount, cultivation, merit, realm, realmGoal, realmState, selected, mirrorHistory, openCount, signInPath, claimHistory, claimOffer } = data;
  const waitingOn = selected?.prerequisites.filter((prerequisite) => !prerequisite.integrated) ?? [];
  const lockReason = !selected?.contract_ready
    ? "任务包与独立验收器尚未就绪，维护者发布后才能认领。"
    : waitingOn.length > 0
      ? `等待 ${waitingOn.map((prerequisite) => prerequisite.id).join("、")} 的正式成果。`
      : selected.state !== "open" ? "悬赏暂未开放，请等待维护者确认。" : null;
  const accessReason = realmState && selected ? missionAccessReason(realmState.realm, merit, selected.required_realm, selected.required_merit) : null;
  const mirrorChildren = mirrorHistory && selected ? missions.filter((item) => item.prerequisites.some((prerequisite) => prerequisite.id === selected.id)) : [];
  return (
      <main className="shell">
        <aside className="side-panel">
          <Link className="brand" href="/" aria-label="灵网纪元首页">
            <span className="brand-mark" aria-hidden="true">灵</span>
            <span><strong>灵网纪元</strong><small>灵网初开 · 第一赛季</small></span>
          </Link>
          <div className="guest-panel">
            <span className="guest-avatar" aria-hidden="true">{cultivator ? "修" : "凡"}</span>
            <div><small className="eyebrow">{cultivator ? realm : "访客修士"}</small><strong>{cultivator?.display_name ?? "尚未登录"}</strong><p>{cultivator ? "继续修炼，完成真实悬赏。" : "登录后认领悬赏，查看修炼进度。"}</p></div>
          </div>
          <div className="resource-list" aria-label="修士资源">
            <div className="resource-row"><span>Token</span><b>{cultivator ? (balances.token ?? 0).toLocaleString() : "—"}</b><small>游戏灵石</small></div>
            <div className="resource-row"><span>修为</span><b>{cultivator ? cultivation.toLocaleString() : "—"}</b><small>境界经验</small></div>
            <div className="resource-row"><span>功德</span><b>{cultivator ? merit.toLocaleString() : "—"}</b><small>贡献信誉</small></div>
          </div>
          <nav className="side-nav" aria-label="主导航">
            <Link className="active" href="/">任务大殿 <span>{String(openCount).padStart(2, "0")}</span></Link>
            <a href="#season">秘境图谱</a>
            <a href="#realm">境界天梯</a>
            <Link href="/equipment">装备阁</Link>
            {cultivator ? <Link href="/ledger">我的账本</Link> : null}
            {cultivator?.provider === "github" ? <Link href="/revalidations">独立复验</Link> : null}
            {cultivator && isMaintainer(cultivator) ? <Link href="/review">宗门复核</Link> : null}
            {cultivator && isMaintainer(cultivator) ? <Link href="/economy">经济对账</Link> : null}
            {cultivator && (isMaintainer(cultivator) || isRecoveryReviewer(cultivator, Reflect.get(env, "RECOVERY_APPROVER_GITHUB_ID"))) ? <Link href="/stable-rewards">稳定奖励复核</Link> : null}
            <a href="#rules">修炼法则</a>
          </nav>
          <div className="side-foot">模型凭据留在本机 · 当前为 Pre-Alpha<br /><a href="https://github.com/HardieBao/lingnet-ascension/tree/pre-alpha-2026-09-27" target="_blank" rel="noopener noreferrer">查看对应源码 · AGPL-3.0</a></div>
        </aside>

        <section className="main-panel">
          <header className="topbar">
            <div className="breadcrumb">万象天网 <span>/</span> 宗门悬赏</div>
            <Badge variant="outline" className="top-status">灵网初开 · Pre-Alpha</Badge>
          </header>
          <div className="content">
            <div className="section-heading">
              <div><p className="eyebrow">TASK HALL · 第一赛季</p><h1>任务大殿</h1><p className="intro">Pre-Alpha 受限预览，暂仅主理人可登录验收；真实模型调用与双人调账关闭，尚非正式 MVP。</p></div>
              <div className="season-count"><strong>{String(openCount).padStart(2, "0")}<span>/ 61</span></strong><small>当前开放</small></div>
            </div>
            <div className="stat-strip" id="season">
              <div><span>赛季目标</span><strong>25</strong><small>正式成果</small></div>
              <div><span>当前阶段</span><strong>纵向切片</strong><small>第 1 阶段</small></div>
              <div><span>开放悬赏</span><strong>{openCount}</strong><small>可认领任务</small></div>
              <div><span>结算规则</span><strong>三账本</strong><small>Token · 修为 · 功德</small></div>
            </div>
            <div className="list-head">
              <div><h2>宗门悬赏</h2><p>任务完成后，由天道审判与宗门复核决定是否纳入。</p></div>
              <span className="list-count">筛选结果 {hall.visible.length} / {missions.length} 项</span>
            </div>
            <form key={JSON.stringify(hall.filters)} className="hall-filters" action="/" method="get" aria-label="筛选悬赏">
              <label>编号或标题<input name="q" defaultValue={hall.filters.q} maxLength={80} placeholder="例如 GOV-001" /></label>
              <label>品阶<select name="rank" defaultValue={hall.filters.rank}><option value="">全部品阶</option>{["黄阶", "玄阶", "地阶", "天阶"].map((rank) => <option key={rank}>{rank}</option>)}</select></label>
              <label>任务线<select name="branch" defaultValue={hall.filters.branch}><option value="">全部任务线</option>{hall.branches.map((branch) => <option key={branch}>{branch}</option>)}</select></label>
              <label>任务格状态<select name="status" defaultValue={hall.filters.status}><option value="">全部状态</option>{Object.entries(HALL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>最高模型 Token<input name="budget" type="number" min={0} step={1} defaultValue={hall.filters.budget} placeholder="不限" aria-describedby="hall-filter-hint" /></label>
              <div className="hall-filter-actions"><button type="submit">应用筛选</button><Link href="/">清空筛选</Link></div>
            </form>
            <p className="hall-filter-hint" id="hall-filter-hint">预算筛选只统计已记录的模型 Token，不是游戏灵石或现金价格。列表显示任务格状态，认领仍须满足账号门槛、席位和押金余额；以服务端核验为准。</p>
            {hall.error ? <p className="hall-filter-error" role="alert">{hall.error}</p> : null}
            {activeClaims.length > 0 ? <div className="hall-own-claims"><span>我的在途悬赏（含冻结）：</span>{activeClaims.map((claim) => <Link key={claim.id} href={{ pathname: "/", query: { mission: claim.mission_id } }}>{claim.mission_id}</Link>)}<small>点击清除筛选并查看原认领；不会新建认领。</small></div> : null}
            <div className="mission-table">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>悬赏</TableHead><TableHead>任务线</TableHead><TableHead>品阶</TableHead><TableHead>模型 Token 预算</TableHead><TableHead>游戏奖励</TableHead><TableHead>状态</TableHead>
                </TableRow></TableHeader>
                <TableBody>{hall.visible.map(({ mission, status }) => (
                  <TableRow key={mission.id}>
                    <TableCell className="mission-name"><Link href={{ pathname: "/", query: { ...hall.filters, mission: mission.id } }} aria-current={selected?.id === mission.id ? "true" : undefined}><small>{mission.id}</small><strong>{mission.title}</strong></Link></TableCell>
                    <TableCell>{mission.branch}</TableCell>
                    <TableCell><Badge variant="outline" className={mission.rank === "黄阶" ? "rank-yellow" : mission.rank === "玄阶" ? "rank-blue" : "rank-purple"}>{mission.rank}</Badge></TableCell>
                    <TableCell>{mission.budget_tokens !== null ? mission.budget_tokens.toLocaleString() : "未记录"}</TableCell>
                    <TableCell>{mission.reward_token} Token · {mission.reward_cultivation} 修为</TableCell>
                    <TableCell><span className={status === "available" ? "state-ready" : "state-locked"}>{HALL_STATUS_LABELS[status]}</span></TableCell>
                  </TableRow>
                ))}{hall.visible.length === 0 ? <TableRow><TableCell colSpan={6} className="hall-empty">没有匹配的悬赏。调整条件或<Link href="/">清空筛选</Link>查看全部任务。</TableCell></TableRow> : null}</TableBody>
              </Table>
            </div>
            {cultivator ? <ClaimHistory history={claimHistory} query={{ ...hall.filters, ...(selected ? { mission: selected.id } : {}), ...(typeof params.claimsBefore === "string" ? { claimsBefore: params.claimsBefore } : {}) }} paged={!!params.claimsBefore} /> : null}
            <div className="notice" id="rules"><strong>修炼法则</strong><span>算力消耗是你本机模型使用的 Token；游戏 Token 是不可提现、不可交易的灵石。任务奖励由成果质量决定。</span></div>
          </div>
        </section>

        <aside className="detail-panel" data-mirror={mirrorHistory ? "equipped" : undefined}>
          {selected ? <>
          <div className="detail-top"><span className="eyebrow">SELECTED MISSION</span><Badge className={selected.rank === "黄阶" ? "rank-yellow" : selected.rank === "玄阶" ? "rank-blue" : "rank-purple"} variant="outline">{selected.rank}</Badge></div>
          <h2>{selected.title}</h2>
          <p>{selected.description}</p>
          <dl className="mission-facts">
            <div><dt>任务编号</dt><dd>{selected.id}</dd></div>
            {cultivator ? <div><dt>认领席位</dt><dd>{activeClaims.length}/{claimLimit}</dd></div> : null}
            <div><dt>最低境界</dt><dd>{realmNames[selected.required_realm as Realm] ?? "配置异常"}</dd></div>
            <div><dt>最低功德</dt><dd>{selected.required_merit}</dd></div>
            <div><dt>前置成果</dt><dd>{selected.prerequisites.length === 0 ? "无" : selected.prerequisites.map((prerequisite) => <span className="prerequisite-item" key={prerequisite.id} title={prerequisite.title}>{prerequisite.id} · {prerequisite.integrated ? "已纳入" : "待正式纳入"}</span>)}</dd></div>
            <div><dt>固定基线</dt><dd>{selected.base_commit.slice(0, 8)}</dd></div>
            <div><dt>模型 Token 预算</dt><dd>{selected.budget_tokens !== null ? selected.budget_tokens.toLocaleString() : "未记录"}</dd></div>
            <div><dt>任务押金</dt><dd>{selected.deposit} Token</dd></div>
            <div><dt>独立复核接受</dt><dd>{selected.reward_token} Token<br />{selected.reward_cultivation} 修为 · {selected.reward_merit} 功德</dd></div>
            <div><dt>正式合入追加</dt><dd>{officialTokenBonus(selected.rank)} Token</dd></div>
            <div><dt>审核方式</dt><dd>天道审判 + 宗门复核</dd></div>
          </dl>
          {mirrorHistory ? <section className="heavenly-mirror" aria-label="天机镜情报">
            <h3>天机镜 · 任务因果图</h3>
            <ol className="mirror-chain">
              <li><small>前置成果</small>{selected.prerequisites.length > 0 ? selected.prerequisites.map((item) => <Link key={item.id} href={{ pathname: "/", query: { mission: item.id } }}>{item.id} · {item.integrated ? "已纳入" : "待纳入"}</Link>) : <span>无</span>}</li>
              <li><small>当前悬赏</small><strong>{selected.id}</strong></li>
              <li><small>后续悬赏</small>{mirrorChildren.length > 0 ? mirrorChildren.map((item) => <Link key={item.id} href={{ pathname: "/", query: { mission: item.id } }}>{item.id} · {item.state === "open" ? "开放" : item.state === "done" ? "已完成" : "锁定"}</Link>) : <span>无</span>}</li>
            </ol>
            <p>历史记录：要求修订 {mirrorHistory.revision_requests} 次 · 驳回 {mirrorHistory.rejected_submissions} 次 · 租约过期 {mirrorHistory.expired_claims} 次</p>
            <small>仅显示状态汇总，不展示复核材料或隐藏测试。</small>
          </section> : null}
          <MissionActions
            key={`${selected.id}:${claimOffer?.quote ?? "unavailable"}`}
            claimOffer={claimOffer}
            missionId={selected.id}
            missionState={selected.state}
            occupiedState={occupied.get(selected.id) ?? null}
            signedIn={!!cultivator}
            signInPath={signInPath}
            claim={activeByMission.get(selected.id) ?? null}
            atClaimLimit={activeClaims.length >= claimLimit}
            accessReason={accessReason}
            artifactPath={artifactPathForMission(selected.id) ??
              (isCodeArtifactPath(selected.allowed_paths) ? selected.allowed_paths : null)}
            lockReason={lockReason}
          />
          </> : <div className="hall-empty-detail"><h2>先选择一张悬赏</h2><p>当前筛选没有匹配结果，不显示其他悬赏的认领操作。</p><Link href="/">清空筛选，查看全部悬赏</Link></div>}
          <div className="realm-card" id="realm">
            <div className="realm-title"><span>境界图谱</span><strong>{realm}</strong></div>
            <Progress value={realmGoal > 0 ? Math.min(100, Math.floor(cultivation / realmGoal * 100)) : 0} aria-label="下一境界修为进度" />
            <p>{cultivator ? `修为 ${cultivation} · 功德 ${merit} · 正式成果 ${completedCount}` : "登录后查看你的境界进度。"}</p>
            {realmState ? <RealmActions current={realmState.realm} assessment={realmState.next} /> : null}
          </div>
        </aside>
      </main>
  );
}
