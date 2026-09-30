import type { RevalidationWorkbenchRecord } from "@/lib/revalidations";
import { RevalidationDecision } from "./revalidation-actions";

export function RevalidationRecords({ records, reviewerId }: {
  records: RevalidationWorkbenchRecord[]; reviewerId?: string;
}) {
  return records.map((record) => <article className="review-item" key={record.id}>
    <div className="review-item-top"><span>{record.mission_id} · {record.decision === "accept" ? "已采纳" : record.decision === "reject" ? "已驳回" : "待采纳"}</span>
      <time>{new Date(record.created_at).toLocaleString("zh-CN")}</time></div>
    <h3>{record.title}</h3>
    <p>复验人：{record.reporter} · 可信复跑结果：{record.outcome === "passed" ? "原成果通过复跑" : "原成果复跑失败"}</p>
    <p className="revalidation-findings">{record.findings}</p>
    <div className="revalidation-links">
      <a href={`https://github.com/HardieBao/lingnet-ascension/pull/${record.pull_number}`} target="_blank" rel="noopener noreferrer">查看报告 PR</a>
      <a href={`https://github.com/HardieBao/lingnet-ascension/actions/runs/${record.ci_run_id}/attempts/${record.ci_run_attempt}`} target="_blank" rel="noopener noreferrer">查看专用复验运行</a>
    </div>
    {record.reason ? <p>处理理由：{record.reason}</p> : null}
    {reviewerId && !record.decision ? (reviewerId === record.cultivator_id || reviewerId === record.author_id
      ? <p>你是复验人或原成果作者，需要其他独立维护者处理这份报告。</p>
      : <RevalidationDecision id={record.id} />) : null}
  </article>);
}
