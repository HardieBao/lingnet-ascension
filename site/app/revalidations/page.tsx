import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { REVALIDATION_AVAILABLE_TARGETS_SQL, REVALIDATION_WORKBENCH_SQL, revalidationTargetReport,
  type AvailableRevalidationTarget, type RevalidationWorkbenchRecord } from "@/lib/revalidations";
import { RevalidationSubmission } from "./revalidation-actions";
import { RevalidationRecords } from "./revalidation-records";

export const dynamic = "force-dynamic";

export default async function RevalidationsPage() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator || cultivator.provider !== "github") return <main className="review-page">
    <Link href="/">← 返回任务大殿</Link><h1>独立复验</h1><p>请先使用 GitHub 登录，再复验其他修士的正式成果。</p>
    <Link href="/api/auth/github">使用 GitHub 登录</Link>
  </main>;
  const db = database();
  const data = await Promise.all([
    db.prepare(REVALIDATION_AVAILABLE_TARGETS_SQL).bind(cultivator.id, cultivator.id).all<AvailableRevalidationTarget>(),
    db.prepare(`${REVALIDATION_WORKBENCH_SQL} WHERE r.cultivator_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 50`)
      .bind(cultivator.id).all<RevalidationWorkbenchRecord>(),
  ]).catch(() => null);
  if (!data) return <main className="review-page"><Link href="/">← 返回任务大殿</Link><h1>独立复验</h1>
    <p>复验记录暂不可用，请稍后刷新。</p></main>;
  const targets = data[0].results.filter((target) => revalidationTargetReport(target, cultivator.provider_id));
  return <main className="review-page">
    <Link href="/">← 返回任务大殿</Link><h1>独立复验</h1>
    <p>复跑其他修士已经合入的成果，留下可复查的观察。可信复跑结果由专用检查产生，报告还需独立维护者采纳；有效的失败复跑也可以被采纳。</p>
    <p>采纳记录用于独立复验资格，当前流程不自动增加游戏 Token、修为或功德。</p>
    <h2>可复验的正式成果</h2>
    {targets.length === 0 ? <div className="review-empty">目前没有可供你新提交复验报告的正式成果。本人作品、已有待审或已采纳报告不会重复列出。</div> : <>
      <ol className="revalidation-steps">
        <li>选择正式成果，按下方固定证据准备报告，填写自己的复跑观察。</li>
        <li>从仓库当前 main 建立报告 PR，只修改对应的 JSON 报告；验证器基线填入该 PR 的基线 SHA。</li>
        <li>等待「LingNet independent revalidation」运行完成，再在这里提交 PR 和运行地址。</li>
      </ol>
      {targets.map((target) => <article className="review-item" key={target.submission_id}>
        <div className="review-item-top"><span>{target.mission_id}</span><span>正式合入</span></div>
        <h3>{target.title}</h3><p>原作者：{target.author}</p>
        <a href={`https://github.com/HardieBao/lingnet-ascension/commit/${target.integrated_commit}`} target="_blank" rel="noopener noreferrer">查看固定成果提交</a>
        <details className="revalidation-evidence"><summary>准备报告草稿与固定证据</summary>
          <p>报告路径：<code>{`revalidations/${target.submission_id}.json`}</code></p>
          <p>草稿中的验证器基线和观察内容留空，请按实际 PR 基线与复跑结果填写；观察内容为 20–2,000 字。</p>
          <label>{target.mission_id} 报告草稿<textarea readOnly rows={13} defaultValue={JSON.stringify({
            version: 1, submissionId: target.submission_id, missionId: target.mission_id, artifactPath: target.artifact_path,
            integratedCommit: target.integrated_commit, artifactSha256: target.artifact_sha256,
            validatorBaseCommit: "", reporterGitHubId: cultivator.provider_id, findings: "",
          }, null, 2)} /></label>
        </details>
      </article>)}
      <RevalidationSubmission targets={targets.map(({ submission_id, mission_id, title }) => ({ submission_id, mission_id, title }))} />
    </>}
    <h2>我的复验记录</h2>
    {data[1].results.length === 0 ? <div className="review-empty">你还没有提交复验报告。</div>
      : <RevalidationRecords records={data[1].results} />}
  </main>;
}
