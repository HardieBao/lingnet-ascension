import Link from "next/link";
import { database } from "@/db/runtime";
import { loadContributionBoard } from "@/lib/contributions";
import { realmNames } from "@/lib/realms";
import "../community.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "贡献榜 | 灵网纪元" };
async function load(page: number) { return loadContributionBoard(database(), page); }
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, raw = params.page ?? "1";
  const valid = Object.keys(params).every((key) => key === "page") && typeof raw === "string" && /^[1-9]\d{0,5}$/.test(raw) && Number(raw) <= 100000;
  const data = valid ? await load(Number(raw)).catch(() => null) : null;
  return <main className="community-page"><Link href="/">返回任务大殿</Link><h1>贡献榜</h1>
    <p>只展示主动公开贡献的修士，按功德、纳入任务数排序。消费、游戏余额和模型用量不参与排名。</p>
    <nav><Link href="/dwelling" prefetch={false}>管理我的公开设置</Link><Link href="/sects" prefetch={false}>宗门与宗门贡献</Link></nav>
    {!valid ? <p>页码无效。<Link href="/leaderboard" prefetch={false}>返回第一页</Link></p> : !data ? <p role="status">贡献榜暂不可用，请稍后刷新。</p> : <>
      {!data.entries.length ? <p>本页暂无主动公开的贡献记录。</p> : <table className="community-table"><thead><tr><th>排名</th><th>修士</th><th>功德</th><th>纳入任务</th></tr></thead>
        <tbody>{data.entries.map((entry) => <tr key={entry.publicId}><td>{entry.position}</td><td><Link href={`/cultivators/${entry.publicId}`} prefetch={false}>{entry.daohao}</Link><br />{Object.entries(realmNames).find(([id]) => id === entry.realm)?.[1] ?? "境界待核对"}{entry.sectName ? <><br />{entry.sectName}</> : null}</td><td>{entry.merit}</td><td>{entry.results}</td></tr>)}</tbody>
      </table>}
      <nav aria-label="贡献榜分页">{data.page > 1 ? <Link href={`/leaderboard?page=${data.page - 1}`} prefetch={false}>上一页</Link> : null}
        <span>第 {data.page} 页</span>{data.nextPage ? <Link href={`/leaderboard?page=${data.nextPage}`} prefetch={false}>下一页</Link> : null}</nav>
    </>}
    <p className="community-muted">纳入任务数按平台已接受并合入的完整记录去重，公开版本成果以版本目录的核验结果为准。撤回公开后将从榜单隐藏。</p>
  </main>;
}
