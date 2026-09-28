import { env } from "cloudflare:workers";
import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { LEDGER_BALANCES_SQL, LEDGER_EVENTS_SQL, LEDGER_PAGE_SIZE, ledgerSourceLabel } from "@/lib/ledger-history";
import { recoveryState } from "@/lib/recovery-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的账本 | 灵网纪元", description: "查看游戏 Token、修为和功德的来源记录。" };

type LedgerEvent = { id: string; resource: string; delta: number; source_key: string; created_at: number };
type LedgerBalances = { token: number; token_locked: number; cultivation: number; merit: number; token_in: number; token_out: number };

const resourceNames: Record<string, string> = { token: "Token", token_locked: "冻结 Token", cultivation: "修为", merit: "功德" };

async function loadLedger(before?: string, beforeId?: string) {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return { cultivator: null, balances: null, recovery: null, events: [] as LedgerEvent[], next: null };
  const parsedBefore = typeof before === "string" && /^\d{1,16}$/.test(before) ? Number(before) : null;
  const cursorAt = parsedBefore !== null && Number.isSafeInteger(parsedBefore) && typeof beforeId === "string" && beforeId.length > 0 && beforeId.length <= 100
    ? parsedBefore : null;
  const cursorId = cursorAt === null ? null : beforeId!;
  const db = database();
  const [balances, page, recovery] = await Promise.all([
    db.prepare(LEDGER_BALANCES_SQL).bind(cultivator.id).first<LedgerBalances>(),
    db.prepare(LEDGER_EVENTS_SQL).bind(cultivator.id, cursorAt, cursorAt, cursorAt, cursorId, LEDGER_PAGE_SIZE + 1).all<LedgerEvent>(),
    recoveryState(db, cultivator.id),
  ]);
  const events = page.results.slice(0, LEDGER_PAGE_SIZE);
  const last = events.at(-1);
  const next = page.results.length > LEDGER_PAGE_SIZE && last ? { before: String(last.created_at), beforeId: last.id } : null;
  return { cultivator, balances, recovery, events, next };
}

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ before?: string; beforeId?: string }> }) {
  const { before, beforeId } = await searchParams;
  const data = await loadLedger(before, beforeId).catch(() => null);
  if (!data) return <main className="unavailable"><h1>账本暂不可用</h1><p>数据服务正在恢复，请稍后刷新。</p></main>;
  if (!data.cultivator) {
    const signInPath = import.meta.env.DEV && !env.GITHUB_CLIENT_ID
      ? "/signin-with-chatgpt?return_to=/ledger" : "/api/auth/github";
    return <main className="ledger-page"><Link href="/">← 返回任务大殿</Link><h1>我的账本</h1><p>登录后查看仅属于你的资源流水。</p><a href={signInPath}>登录查看账本</a></main>;
  }
  const { balances, recovery, events, next } = data;
  const debt = recovery?.debt;
  const hasDebt = !!debt && Object.values(debt).some((value) => value > 0);
  return <main className="ledger-page">
    <Link href="/">← 返回任务大殿</Link>
    <header><p className="eyebrow">CULTIVATION LEDGER</p><h1>我的账本</h1><p>游戏资源逐笔记录来源；本机模型 Token 与真实费用不在此账本内。</p></header>
    {recovery?.hold || hasDebt ? <section className="ledger-recovery" aria-label="奖励回滚状态">
      <h2>{recovery.hold ? "奖励回滚，账户暂时冻结" : "回滚欠账待抵扣"}</h2>
      <p>{recovery.hold
        ? "独立复核完成前，暂不能购买装备、领取新奖励或突破境界。"
        : "后续游戏资源入账会先抵扣欠账；欠账清零前仍不能购买装备或突破境界。"}</p>
      <p>待抵扣：游戏 Token {debt?.token ?? 0} · 修为 {debt?.cultivation ?? 0} · 功德 {debt?.merit ?? 0}。</p>
      <p>如需核对，请在项目 Issue 中联系维护者；历史流水不会删除。</p>
    </section> : null}
    <div className="ledger-balances" aria-label="当前资源余额">
      <div><span>可用 Token</span><strong>{balances?.token ?? 0}</strong></div>
      <div><span>冻结 Token</span><strong>{balances?.token_locked ?? 0}</strong></div>
      <div><span>修为</span><strong>{balances?.cultivation ?? 0}</strong></div>
      <div><span>功德</span><strong>{balances?.merit ?? 0}</strong></div>
    </div>
    <p className="ledger-totals">Token 累计入账 {balances?.token_in ?? 0} · 累计出账 {balances?.token_out ?? 0}；退款属于入账，不等于新铸币。</p>
    <section className="ledger-history" aria-label="资源变动记录">
      <h2>资源变动</h2>
      {events.length === 0 ? <p>暂无更多账本事件。</p> : <ol>{events.map((event) => <li key={event.id}>
        <div><strong>{resourceNames[event.resource] ?? event.resource}</strong><b className={event.delta >= 0 ? "ledger-positive" : "ledger-negative"}>{event.delta >= 0 ? "+" : ""}{event.delta}</b></div>
        <p>{ledgerSourceLabel(event.source_key)} · {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(event.created_at)}</p>
        <code>{event.source_key}</code>
      </li>)}</ol>}
    </section>
    {next ? <Link className="ledger-more" href={{ pathname: "/ledger", query: next }}>查看更早记录</Link> : null}
  </main>;
}
