import Link from "next/link";
import { database } from "@/db/runtime";
import { loadPublishedResults, publishedResultsQuery } from "@/lib/published-results";
import "../community.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "版本成果 | 灵网纪元" };
const labels = { verified: "已核验：这个固定版本中的文件与成果摘要一致", changed: "文件已变化：不计作此版本中仍有效的成果",
  "not-in-version": "合入提交不属于此版本", unavailable: "证据暂不可用，当前有效性未知", unfrozen: "版本未冻结或为预发布，尚无正式固定成果证据" };
async function load(query: { releaseId: number; page: number }) { return loadPublishedResults(database(), query.releaseId, query.page); }
export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, entry);
  const query = publishedResultsQuery(params), data = query ? await load(query).catch(() => null) : null;
  return <main className="community-page"><Link href="/">返回任务大殿</Link><h1>版本成果</h1>
    <p>按公开版本核对已接受的合入记录、提交归属与单文件摘要。不以演示数据补齐成果，不触发奖励。</p>
    <nav><Link href="/versions" prefetch={false}>选择公开版本</Link><Link href="/my-results" prefetch={false}>本人纳入记录</Link></nav>
    {!query ? <p>请从公开版本列表选择“核对版本成果”。</p> : !data ? <p role="status">版本或成果证据暂不可用，当前状态未知，不记作零。</p> : <>
      <h2>{data.version.tag}</h2><p>本页逐条核对，最多5条。只有标记“已核验”的记录具备该固定版本的文件证据。</p>
      <p>标签提交：<code>{data.version.commit ?? "未知"}</code> · {data.version.prerelease ? "预发布" : "正式版记录"} · {data.version.immutable ? "来源标记已冻结" : "冻结未确认"}</p>
      {!data.results.length ? <p>本页没有发布前已接受并合入的平台记录。</p> : data.results.map((result) => <article className="community-row" key={result.id}>
        <h3>{result.missionId} · {result.title}</h3><p>{labels[result.evidence]}</p>
        <p>贡献者：{result.publicId && result.daohao ? <Link href={`/cultivators/${result.publicId}`} prefetch={false}>{result.daohao}</Link> : "未公开个人关联"}</p>
        <p>合入提交：<a href={`https://github.com/HardieBao/lingnet-ascension/commit/${result.integratedCommit}`}>{result.integratedCommit}</a></p>
        <p>成果 SHA-256：<code>{result.artifactSha256}</code></p>
        {result.evidence === "verified" && data.version.commit && result.artifactPath ? <a href={`https://github.com/HardieBao/lingnet-ascension/blob/${data.version.commit}/${result.artifactPath}`}>查看该版本中的成果文件</a> : null}
      </article>)}
      <nav aria-label="版本成果分页">{data.page > 1 ? <Link href={`/results?release=${query.releaseId}&page=${data.page - 1}`} prefetch={false}>上一页</Link> : null}
        <span>第 {data.page} 页</span>{data.nextPage ? <Link href={`/results?release=${query.releaseId}&page=${data.nextPage}`} prefetch={false}>下一页</Link> : null}</nav>
    </>}
    <p className="community-muted">这是特定版本的文件证据，不证明当前主分支仍有效、独立审批已完成或整个版本可玩。个人关联仅在本人主动公开贡献时展示，撤回后隐藏。</p>
  </main>;
}
