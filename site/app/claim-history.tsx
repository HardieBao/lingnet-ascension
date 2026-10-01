import Link from "next/link";
import type { ClaimHistoryPage } from "@/lib/claims";

const labels: Record<string, string> = {
  claimed: "待开跑", running: "闭关中", submitted: "已提交", review: "待复核",
  approved: "待合入", frozen: "冻结待复核", expired: "已到期", released: "已释放",
  rejected: "已驳回", completed: "已完成",
};

function displayTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function ClaimHistory({ history, query, paged }: { history: ClaimHistoryPage; query: Record<string, string>; paged: boolean }) {
  const { claims, nextCursor, error } = history;
  return <details className="claim-history" id="claim-history" key={query.claimsBefore ?? "latest"} open={paged || !!error}>
    <summary>我的认领记录</summary>
    <p>每页 30 条，按认领时间从新到旧排列；时间为北京时间。查看历史不会恢复租约或模型额度。</p>
    {error ? <p role="alert">{error}</p> : null}
    {claims.length === 0 && !error ? <p>{paged ? "这一页没有记录，可返回最新记录。" : "还没有认领记录。先选择悬赏，核对条件后再认领。"}</p> : <ol>
      {claims.map((claim) => <li key={claim.id}>
        <div className="claim-record-heading"><strong>{claim.mission_id}</strong><span>{labels[claim.state] ?? "状态未识别"}</span></div>
        <dl>
          <div><dt>原认领编号</dt><dd><code>{claim.id}</code></dd></div>
          <div><dt>认领时间</dt><dd>{displayTime(claim.claimed_at)}</dd></div>
          <div><dt>租约截止</dt><dd>{displayTime(claim.expires_at)}</dd></div>
        </dl>
        {claim.state === "expired" ? <p>原认领已到期，不能继续提交或恢复。押金按原记录解冻；到账情况请核对账本。重新认领须满足当前任务与账号条件。</p> : null}
        {claim.state === "frozen" ? <p>冻结仍占用认领席位，须等待独立复核，不能主动释放或靠到期自动恢复。</p> : null}
        {["released", "rejected", "completed"].includes(claim.state) ? <p>此认领已结束，不能从这条历史继续提交。结算情况请核对账本。</p> : null}
        <div className="claim-record-links"><Link href={{ pathname: "/", query: { mission: claim.mission_id } }}>查看当前悬赏</Link><Link href="/ledger">核对押金与奖励流水</Link></div>
      </li>)}
    </ol>}
    <nav className="claim-record-links" aria-label="认领记录翻页">
      {nextCursor ? <Link href={{ pathname: "/", query: { ...query, claimsBefore: nextCursor }, hash: "claim-history" }}>更早记录</Link> : null}
      {paged || error ? <Link href={{ pathname: "/", query: Object.fromEntries(Object.entries(query).filter(([key]) => key !== "claimsBefore")), hash: "claim-history" }}>返回最新记录</Link> : null}
    </nav>
  </details>;
}
