import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { IntegrationActions, ReviewActions } from "./review-actions";

export const dynamic = "force-dynamic";

type ReviewItem = {
  id: string;
  mission_id: string;
  title: string;
  author: string;
  created_at: number;
  verdict: string;
};

type ApprovedItem = {
  id: string;
  mission_id: string;
  title: string;
  author: string;
  review_reason: string;
  verdict: string | null;
};

function pullRequestUrl(verdict: string | null): string | null {
  try {
    const source = (JSON.parse(verdict ?? "null") as { source?: { kind?: string; url?: string } } | null)?.source;
    return source?.kind === "github-pr" &&
      /^https:\/\/github\.com\/HardieBao\/lingnet-ascension\/pull\/[1-9]\d*$/.test(source.url ?? "")
      ? source.url! : null;
  } catch {
    return null;
  }
}

export default async function ReviewPage() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator || !isMaintainer(cultivator)) {
    return <main className="review-page"><Link href="/">← 返回任务大殿</Link><h1>需要维护者权限</h1><p>宗门复核由指定维护者完成。</p></main>;
  }
  const db = database();
  const [pending, approved] = await Promise.all([
    db.prepare(
      "SELECT s.id, c.mission_id, m.title, u.display_name AS author, s.created_at, s.verdict FROM submissions s JOIN claims c ON c.id = s.claim_id JOIN missions m ON m.id = c.mission_id JOIN cultivators u ON u.id = s.cultivator_id WHERE s.state = 'awaiting_review' ORDER BY s.created_at ASC"
    ).all<ReviewItem>(),
    db.prepare(
      "SELECT s.id, c.mission_id, m.title, u.display_name AS author, s.review_reason, s.verdict FROM submissions s JOIN claims c ON c.id = s.claim_id JOIN missions m ON m.id = c.mission_id JOIN cultivators u ON u.id = s.cultivator_id WHERE s.state = 'approved' ORDER BY s.reviewed_at ASC"
    ).all<ApprovedItem>(),
  ]);
  return <main className="review-page">
    <Link href="/">← 返回任务大殿</Link>
    <h1>宗门复核</h1>
    <p>天道审判已通过的成果仍需判断真实价值、来源与产品方向。作者不能复核自己的成果。</p>
    <h2>待复核</h2>
    {pending.results.length === 0 ? <div className="review-empty">目前没有待复核成果。</div> : pending.results.map((item) => {
      const verdict = JSON.parse(item.verdict) as { checks: Array<{ name: string; passed: boolean }> };
      const prUrl = pullRequestUrl(item.verdict);
      return <article className="review-item" key={item.id}>
        <div className="review-item-top"><span>{item.mission_id}</span><time>{new Date(item.created_at).toLocaleString("zh-CN")}</time></div>
        <h2>{item.title}</h2>
        <p>提交者：{item.author} · 机器检查 {verdict.checks.filter((check) => check.passed).length}/{verdict.checks.length} 通过</p>
        {prUrl ? <a href={prUrl} target="_blank" rel="noopener noreferrer">查看 GitHub PR</a> : null}
        <a href={`/api/submissions/${item.id}/artifact`} target="_blank" rel="noopener noreferrer">{prUrl ? "查看核验记录" : "打开成果原文"}</a>
        <ReviewActions submissionId={item.id} />
      </article>;
    })}
    <h2>已批准 · 待合入</h2>
    <p>维护者先将成果人工合入仓库 main 分支，再填入合入提交的完整 SHA。平台会核对文件内容，确认后才结算正式成果。</p>
    {approved.results.length === 0 ? <div className="review-empty">目前没有待合入成果。</div> : approved.results.map((item) => {
      const prUrl = pullRequestUrl(item.verdict);
      return <article className="review-item" key={item.id}>
        <div className="review-item-top"><span>{item.mission_id}</span><span>待合入</span></div>
        <h3>{item.title}</h3>
        <p>提交者：{item.author} · 复核理由：{item.review_reason}</p>
        {prUrl ? <a href={prUrl} target="_blank" rel="noopener noreferrer">查看已批准的 GitHub PR</a> : null}
        <a href={`/api/submissions/${item.id}/artifact`} target="_blank" rel="noopener noreferrer">{prUrl ? "查看核验记录" : "打开已审查成果"}</a>
        <IntegrationActions submissionId={item.id} />
      </article>
    })}
  </main>;
}
