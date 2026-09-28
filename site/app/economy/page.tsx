import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { ECONOMY_AUDIT_SQL, economyAuditProblems, type EconomyAuditRow } from "@/lib/economy-audit";
import { currentTokenAdjustmentRole } from "@/lib/token-adjustment-auth";
import { TOKEN_ADJUSTMENTS_LIST_SQL, type TokenAdjustment } from "@/lib/token-adjustments";
import { AdjustmentConsole } from "./adjustment-console";

export const dynamic = "force-dynamic";
export const metadata = { title: "经济对账与调账 | 灵网纪元", description: "维护者对账与独立审批人的游戏 Token 调账复核。" };

type EconomyData = {
  forbidden: boolean;
  maintainer: boolean;
  role: "requester" | "approver" | null;
  viewerId: string;
  rows: EconomyAuditRow[];
  adjustments: TokenAdjustment[] | null;
};

async function loadEconomyAudit(): Promise<EconomyData> {
  const cultivator = await getCurrentCultivator();
  const maintainer = !!cultivator && isMaintainer(cultivator);
  const role = cultivator ? currentTokenAdjustmentRole(cultivator) : null;
  if (!cultivator || (!maintainer && !role)) {
    return { forbidden: true as const, maintainer: false, role: null, viewerId: "", rows: [] as EconomyAuditRow[], adjustments: null };
  }
  const db = database();
  const [rows, adjustments] = await Promise.all([
    maintainer ? db.prepare(ECONOMY_AUDIT_SQL).all<EconomyAuditRow>() : Promise.resolve({ results: [] as EconomyAuditRow[] }),
    role ? db.prepare(TOKEN_ADJUSTMENTS_LIST_SQL).all<TokenAdjustment>().then((result) => result.results).catch(() => {
      console.error("token adjustment history unavailable");
      return null;
    }) : Promise.resolve(null),
  ]);
  return { forbidden: false as const, maintainer, role, viewerId: cultivator.id, rows: rows.results, adjustments };
}

export default async function EconomyPage() {
  const data = await loadEconomyAudit().catch(() => null);
  if (!data) return <main className="unavailable"><h1>经济对账暂不可用</h1><p>数据服务正在恢复，请稍后刷新。</p></main>;
  if (data.forbidden) return <main className="unavailable"><h1>需要维护者或独立审批人权限</h1><p>此页只向指定账号开放。</p><Link href="/">返回任务大殿</Link></main>;
  const problems = economyAuditProblems(data.rows);
  const negative = problems.filter((row) => row.token_balance < 0 || row.locked_balance < 0 || row.cultivation_balance < 0 || row.merit_balance < 0).length;
  const mismatched = problems.filter((row) => row.locked_balance !== row.expected_locked).length;
  const invalid = problems.reduce((sum, row) => sum + row.invalid_snapshots, 0);
  const unknown = problems.reduce((sum, row) => sum + row.unknown_resources, 0);
  return <main className="ledger-page">
    <Link href="/">← 返回任务大殿</Link>
    <header><h1>{data.maintainer ? "经济对账与调账" : "Token 调账复核"}</h1><p>这里只处理游戏 Token，不是模型额度或真实资金。申请与批准由两个不同账号完成。</p></header>
    <AdjustmentConsole role={data.role} viewerId={data.viewerId} records={data.adjustments}
      targets={data.rows.map((row) => ({ id: row.cultivator_id, balance: row.token_balance }))} />
    {data.maintainer ? <>
    <h2 className="economy-audit-title">只读经济对账</h2>
    <div className="ledger-balances" aria-label="对账概况">
      <div><span>扫描账号</span><strong>{data.rows.length}</strong></div>
      <div><span>异常账号</span><strong>{problems.length}</strong></div>
      <div><span>负余额</span><strong>{negative}</strong></div>
      <div><span>冻结不一致</span><strong>{mismatched}</strong></div>
    </div>
    <p className="ledger-totals">无效任务快照 {invalid} · 未知资源事件 {unknown}。冻结预期包含有效任务押金与进行中的渡劫费用。</p>
    <section className="ledger-history" aria-label="对账异常">
      <h2>待核对项目</h2>
      {problems.length === 0 ? <p>当前扫描未发现上述异常；这不代表其他发布门禁已经通过。</p> : <ol>{problems.map((row) => <li key={row.cultivator_id}>
        <div><strong>{row.cultivator_id}</strong><b className="ledger-negative">需核对</b></div>
        <p>可用 Token {row.token_balance} · 冻结 Token {row.locked_balance} · 应冻结押金 {row.expected_locked}</p>
        <p>修为 {row.cultivation_balance} · 功德 {row.merit_balance}</p>
        <p>无效快照 {row.invalid_snapshots} · 未知资源事件 {row.unknown_resources}</p>
      </li>)}</ol>}
    </section>
    </> : null}
  </main>;
}
