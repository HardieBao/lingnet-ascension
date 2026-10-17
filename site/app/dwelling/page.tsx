import { env } from "cloudflare:workers";
import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { loadOwnProfile } from "@/lib/cultivator-profile";
import { equipmentCatalog } from "@/lib/equipment";
import { LEDGER_BALANCES_SQL } from "@/lib/ledger-history";
import { realmNames } from "@/lib/realms";
import { MODEL_CONTRACT } from "@/lib/model-budget";
import { ProfileSettings } from "./profile-settings";
import "./dwelling.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "我的洞府 | 灵网纪元" };

async function loadDwelling() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return null;
  const db = database();
  const [profile, balances, account, inventory] = await Promise.all([
    loadOwnProfile(db, cultivator),
    db.prepare(LEDGER_BALANCES_SQL).bind(cultivator.id).first<{ token: number; token_locked: number; cultivation: number; merit: number }>(),
    db.prepare("SELECT realm FROM cultivators WHERE id = ?").bind(cultivator.id).first<{ realm: string }>(),
    db.prepare("SELECT item_id, equipped_at FROM inventory WHERE cultivator_id = ? ORDER BY acquired_at, id")
      .bind(cultivator.id).all<{ item_id: string; equipped_at: number | null }>(),
  ]);
  return { profile, balances, realm: Object.entries(realmNames).find(([id]) => id === account?.realm)?.[1] ?? "待核对", inventory: inventory.results };
}

export default async function DwellingPage() {
  const data = await loadDwelling().catch(() => undefined);
  if (data === undefined) return <main className="dwelling-page"><Link href="/">返回任务大殿</Link><h1>洞府暂不可用</h1><p>档案或资源服务暂不可用，请稍后刷新。尚未确认的数据不记为零。</p></main>;
  if (!data) {
    const signIn = import.meta.env.DEV && !env.GITHUB_CLIENT_ID ? "/signin-with-chatgpt?return_to=/dwelling" : "/api/auth/github";
    return <main className="dwelling-page"><Link href="/">返回任务大殿</Link><h1>我的洞府</h1><p>登录后管理仅属于你的档案、游戏资源和装备。</p><a href={signIn}>登录后进入洞府</a></main>;
  }
  return <main className="dwelling-page">
    <Link href="/">返回任务大殿</Link>
    <header><h1>我的洞府</h1><p>管理档案与隐私，核对游戏资源。只有保存操作会修改档案。</p></header>
    <div className="dwelling-layout">
      <ProfileSettings initial={data.profile} />
      <div>
        <section className="dwelling-section" aria-labelledby="resources-title">
          <h2 id="resources-title">我的游戏资源</h2>
          <p>当前境界：{data.realm}。游戏 Token 不是模型额度，也不是现金。</p>
          <dl className="dwelling-resources">
            <div><dt>可用游戏 Token</dt><dd>{data.balances?.token.toLocaleString() ?? "未知"}</dd></div>
            <div><dt>冻结游戏 Token</dt><dd>{data.balances?.token_locked.toLocaleString() ?? "未知"}</dd></div>
            <div><dt>修为</dt><dd>{data.balances?.cultivation.toLocaleString() ?? "未知"}</dd></div>
            <div><dt>功德</dt><dd>{data.balances?.merit.toLocaleString() ?? "未知"}</dd></div>
          </dl>
          <nav className="dwelling-links" aria-label="我的历练"><Link href="/ledger">查看本人账本</Link><Link href="/my-results" prefetch={false}>查看本人纳入记录</Link><Link href="/">管理认领与提交</Link></nav>
        </section>
        <section className="dwelling-section" aria-labelledby="owned-title">
          <h2 id="owned-title">我的装备</h2>
          {data.inventory.length ? <ul className="dwelling-inventory">{data.inventory.map((item) => <li key={item.item_id}>
            <span>{equipmentCatalog.find((entry) => entry.id === item.item_id)?.name ?? "装备待核对"}</span><span>{item.equipped_at ? "已装备" : "已拥有，未装备"}</span>
          </li>)}</ul> : <p>尚未拥有装备。完成真实任务获得奖励后，可到装备阁查看工具。</p>}
          <Link href="/equipment">进入装备阁</Link>
        </section>
        <section className="dwelling-section" aria-labelledby="model-title">
          <h2 id="model-title">本命法器与功法</h2>
          <p>新认领的本命法器：Codex CLI · {MODEL_CONTRACT.id}。任务包限定总计 {MODEL_CONTRACT.tokenBudget.toLocaleString()} 模型 Token，单次输出至多 {MODEL_CONTRACT.maxOutputTokens.toLocaleString()}；旧认领仍以原契约为准。</p>
          <p>目前不开放任意模型切换。推理档位、补充提示和更严格输出上限在本机功法页配置，不能扩大任务范围或预算。</p>
          <p>模型用量：未知。本人保存的本机自报记录可在用量页核对，代理回执与真实费用需另行核验。</p>
          <Link href="/model-usage" prefetch={false}>查看与上传本人模型用量</Link>
          <p>功法与检查点保存在本机 Runner；此页不上传密钥、提示正文或检查点内容，不启动闭关。</p>
        </section>
      </div>
    </div>
  </main>;
}
