import Link from "next/link";
import { database } from "@/db/runtime";
import { loadSeasonProgress } from "@/lib/season-progress";
import "./season.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "赛季进度 | 灵网纪元" };

const direction = `<!-- THESIS: Read platform task observations, never substitute them for public outcomes or MVP approval.
OWN-WORLD: Existing dark green read surface, mint links, flat definition rows and readable system type.
STORY: See task states and deduplicated integration records, understand their limits, return to tasks or public versions.
FIRST VIEWPORT: Season scope and refresh link above two plain record sections; mobile keeps the same reading order.
FORM: season-read-extension, a narrowly scoped companion in the incumbent world, no new design generation.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->`;

export default async function SeasonPage() {
  const progress = await loadSeasonProgress(database);
  return <main className="season-page">
    <template dangerouslySetInnerHTML={{ __html: direction }} />
    <Link href="/" prefetch={false}>返回任务大殿</Link>
    <header><h1>灵网初开 · 赛季进度</h1><p>观察平台任务记录和纳入记录。这里不创建任务、不结算奖励，也不展示修士余额、消费或模型用量。</p><a href="/season">重新读取赛季进度</a></header>
    {progress.state === "unavailable" ? <section className="season-state" role="status"><h2>暂不能读取赛季进度</h2><p>数据来源暂不可用，当前状态未知，不记作零。请稍后重新读取。</p></section> : <>
      {progress.missionStates.total === 0 ? <p className="season-empty">尚无平台任务记录。本页不会用本地演示或合成任务补齐；已核对的空记录显示为零。</p> : null}
      <div className="season-records">
        <section aria-labelledby="season-missions-title"><h2 id="season-missions-title">平台任务记录</h2>
          <dl className="season-counts">{[["任务记录总数", progress.missionStates.total], ["标记开放", progress.missionStates.open],
            ["标记阻塞", progress.missionStates.blocked], ["标记完成", progress.missionStates.done], ["其他状态", progress.missionStates.other]]
            .map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
          <p>这些是数据库中的任务状态。“标记开放”不代表任务包、资格、租约和席位均可认领；“标记完成”不等于公开版本成果。</p>
        </section>
        <section aria-labelledby="season-integration-title"><h2 id="season-integration-title">平台纳入记录</h2>
          <dl className="season-counts"><div><dt>记录完整的任务纳入</dt><dd>{progress.recordedIntegrations}</dd></div></dl>
          <p>按不同任务去重：任务完成、认领完成、作者相符、提交被接受，并有完整提交号和已发生的纳入时间。重复记录不增加数量。</p>
          <p>这里只读取平台记录，未重新核验公开版本或文件当前内容；不是“25个社区成果”的验收计数。</p>
        </section>
      </div>
    </>}
    <footer><p>公开可玩版本、真实社区成果、两类真人渡劫和连续三周发布仍需各自证据。赛季页面不构成 MVP 放行；宗门与个人榜单尚未接入，不据此公开个人贡献数据。</p><Link href="/versions" prefetch={false}>查看公开版本记录</Link></footer>
  </main>;
}
