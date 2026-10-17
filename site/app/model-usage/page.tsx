import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { loadOwnUsageReports } from "@/lib/model-usage";
import { UsageUpload } from "../usage-upload";
import "../community.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的模型用量 | 灵网纪元" };
async function load(claim?: string, before?: string) {
  const actor = await getCurrentCultivator();
  return actor ? { signedIn: true, data: await loadOwnUsageReports(database(), actor.id, claim, before) } : { signedIn: false, data: null };
}
const amount = (value: number | null) => value === null ? "未知" : value.toLocaleString("zh-CN");
export default async function ModelUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, claim = params.claim, before = params.before;
  const match = typeof before === "string" ? /^(\d{1,16}):([a-f0-9-]{36})$/i.exec(before) : null;
  const valid = Object.keys(params).every((key) => ["claim", "before"].includes(key)) &&
    (claim === undefined || typeof claim === "string" && /^[a-f0-9-]{36}$/i.test(claim)) &&
    (before === undefined || !!match && Number.isSafeInteger(Number(match[1])));
  const result = valid ? await load(claim as string | undefined, before as string | undefined).catch(() => null) : null;
  return <main className="community-page"><Link href="/">返回任务大殿</Link><h1>我的模型用量</h1>
    <p>这里保存本人的数值观察与任务关联。模型Token、费用账单和游戏灵石分别核对；上传用量不会发奖或补充额度。</p>
    <nav><Link href="/dwelling" prefetch={false}>我的洞府</Link><Link href="/ledger" prefetch={false}>游戏资源账本</Link>
      {claim ? <Link href="/model-usage" prefetch={false}>查看全部本人用量</Link> : null}</nav>
    {!valid ? <p>用量查询参数无效，请返回本人用量列表。</p> : !result ? <p role="status">用量记录暂不可用，当前状态未知，不记作零。</p> : !result.signedIn
      ? <p><a href="/api/auth/github">登录后查看本人的模型用量</a></p> : <>
        <UsageUpload claimId={claim as string | undefined} />
        <section className="community-section"><h2>已保存的用量观察</h2>
          <p className="community-muted">每条记录是同一认领在某个时点的累计观察，不能相加。来源均为本机自报，平台尚未独立确认代理账单。</p>
          {!result.data?.reports.length ? <p>尚无已保存的用量报告；真实用量仍未知。</p> : result.data.reports.map(({ id, report, receivedAt }) => <article className="community-row" key={id}>
            <h3>{report.missionId} · {report.model.id}</h3><p>认领：<code>{report.claimId}</code></p>
            <p>来源：本机自报 · {report.budget.status === "observed" ? "已取得本机数值观察" : report.budget.status === "unavailable" ? "本机记录不可用" : "本机用量未知"}</p>
            <dl><dt>本机确认消耗（模型Token）</dt><dd>{amount(report.budget.knownSpent)}</dd>
              <dt>本机剩余额度</dt><dd>{amount(report.budget.remaining)}</dd><dt>尚未解明的预留额度</dt><dd>{amount(report.budget.reserved)}</dd>
              <dt>认领总模型额度</dt><dd>{amount(report.model.tokenBudget)}</dd></dl>
            <p>本机观察（UTC）：{new Date(report.observedAt).toISOString()}<br />平台接收（UTC）：{new Date(receivedAt).toISOString()}</p>
          </article>)}
          <nav aria-label="用量观察分页">{before ? <Link href={claim ? `/model-usage?claim=${claim}` : "/model-usage"} prefetch={false}>返回最新记录</Link> : null}
            {result.data?.nextCursor ? <Link href={`/model-usage?${claim ? `claim=${claim}&` : ""}before=${encodeURIComponent(result.data.nextCursor)}`} prefetch={false}>查看更早用量记录</Link> : null}</nav>
        </section>
      </>}
  </main>;
}
