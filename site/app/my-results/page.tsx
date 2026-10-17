import { env } from "cloudflare:workers";
import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { loadOwnResults } from "@/lib/own-results";
import "./my-results.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "本人纳入记录 | 灵网纪元" };

const direction = `<!-- THESIS: Read only the signed-in cultivator's qualified integration records, not a public ranking or audit history.
OWN-WORLD: Incumbent dark green reading surface, mint links, flat rows and readable system type.
STORY: Understand record scope, read one's latest record per task, page earlier or return to the dwelling.
FIRST VIEWPORT: Private scope and reread action above a linear task list, with hashes disclosed on demand.
FORM: own-results-read-extension, a precisely scoped incumbent-world companion without paid design.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->`;

async function loadPage(params: Record<string, string | string[] | undefined>) {
  const actor = await getCurrentCultivator();
  if (!actor) return { state: "logged-out" as const };
  if (Object.keys(params).some((key) => key !== "before") || Array.isArray(params.before)) return { state: "invalid" as const };
  const records = await loadOwnResults(database(), actor.id, params.before);
  return records.error ? { state: "invalid" as const } : { state: "available" as const, ...records };
}

export default async function MyResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const data = await loadPage(params).catch(() => ({ state: "unavailable" as const }));
  const current = typeof params.before === "string" ? `/my-results?before=${encodeURIComponent(params.before)}` : "/my-results";
  const signIn = import.meta.env.DEV && !env.GITHUB_CLIENT_ID ? "/signin-with-chatgpt?return_to=/my-results" : "/api/auth/github";
  return <main className="my-results-page">
    <template dangerouslySetInnerHTML={{ __html: direction }} />
    <Link href="/dwelling" prefetch={false}>返回我的洞府</Link>
    <header><h1>本人纳入记录</h1><p>仅本人登录后可读。每个任务展示当前符合条件的最新一条纳入记录，不是完整审计历史或公开贡献榜。</p></header>
    {data.state === "logged-out" ? <section className="my-results-state"><h2>先登录，再查看</h2><p>不展示其他修士的记录、档案、余额或复核理由。</p><a href={signIn}>登录后查看本人纳入记录</a></section> :
      data.state === "invalid" ? <section className="my-results-state"><h2>分页参数无效</h2><p>只接受单个更早记录位置；没有读取其他修士的记录。</p><Link href="/my-results" prefetch={false}>返回最新记录</Link></section> :
      data.state === "unavailable" ? <section className="my-results-state" role="status"><h2>暂不能读取本人纳入记录</h2><p>数据来源暂不可用，当前状态未知，不记作零。请稍后重新读取。</p><a href={current}>重新读取此页</a></section> : <>
        <div className="my-results-controls"><p>本页{data.results.length}条，每页最多30条。按纳入时间、记录编号从新到旧排列。</p><a href={current}>重新读取此页</a></div>
        {data.results.length === 0 ? <section className="my-results-state"><h2>本页没有符合条件的纳入记录</h2><p>任务和认领完成、本人提交被接受，且提交号、文件摘要与纳入时间完整，才会出现在这里。不用演示记录补齐。</p></section> :
          <section aria-label="本人纳入记录列表">{data.results.map((record) => <article className="my-result-row" key={record.id}>
            <h2>{record.title}</h2><p>{record.rank} · 任务编号：<code>{record.missionId}</code></p>
            <p>纳入时间（UTC）：<time dateTime={new Date(record.integratedAt).toISOString()}>{new Date(record.integratedAt).toISOString().replace("T", " ").slice(0, 19)}</time></p>
            <details><summary>查看提交号与文件摘要</summary><dl>
              <div><dt>记录编号</dt><dd><code>{record.id}</code></dd></div>
              <div><dt>纳入提交号</dt><dd><code>{record.integratedCommit}</code></dd></div>
              <div><dt>文件 SHA-256 摘要</dt><dd><code>{record.artifactSha256}</code></dd></div>
            </dl></details>
          </article>)}</section>}
        <nav className="my-results-pagination" aria-label="本人记录分页">
          {params.before !== undefined ? <Link href="/my-results" prefetch={false}>返回最新记录</Link> : <span>当前为最新记录</span>}
          {data.nextCursor ? <Link href={`/my-results?before=${encodeURIComponent(data.nextCursor)}`} prefetch={false}>查看更早记录</Link> : <span>没有更早的符合条件记录</span>}
        </nav>
      </>}
    <footer><p>这里只读取平台纳入记录，未重新核验公开版本或文件当前内容，也不结算奖励。记录变动后分页内容可能变化；本页不证明“25个社区成果”或 MVP 已通过验收。</p></footer>
  </main>;
}
