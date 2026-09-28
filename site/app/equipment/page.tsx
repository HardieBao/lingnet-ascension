import { env } from "cloudflare:workers";
import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator } from "@/lib/auth";
import { EQUIPMENT_CATALOG_VERSION, equipmentCatalog } from "@/lib/equipment";
import { EquipmentActions } from "./equipment-actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "装备阁 | 灵网纪元",
  description: "用任务奖励购买并装备赛博修仙工具。",
};

type OwnedItem = { item_id: string; equipped_at: number | null };

async function loadEquipmentData() {
  const cultivator = await getCurrentCultivator();
  if (!cultivator) return { cultivator: null, balance: null, owned: new Map<string, OwnedItem>() };
  const db = database();
  const [balance, inventory] = await Promise.all([
    db.prepare(
      "SELECT COALESCE(SUM(delta), 0) AS balance FROM ledger_events WHERE cultivator_id = ? AND resource = 'token'"
    ).bind(cultivator.id).first<{ balance: number }>(),
    db.prepare(
      "SELECT item_id, equipped_at FROM inventory WHERE cultivator_id = ?"
    ).bind(cultivator.id).all<OwnedItem>(),
  ]);
  return { cultivator, balance: balance?.balance ?? 0, owned: new Map(inventory.results.map((item) => [item.item_id, item])) };
}

export default async function EquipmentPage() {
  const data = await loadEquipmentData().catch(() => null);
  if (!data) return <main className="unavailable"><h1>装备阁暂不可用</h1><p>账本服务正在恢复，请稍后刷新。</p></main>;
  const { cultivator, balance, owned } = data;
  const signInPath = import.meta.env.DEV && !env.GITHUB_CLIENT_ID
    ? "/signin-with-chatgpt?return_to=/equipment"
    : "/api/auth/github";

  return <main className="equipment-page">
    <Link className="equipment-back" href="/">← 返回任务大殿</Link>
    <div className="equipment-heading">
      <div><h1>装备阁</h1><p>把正式任务奖励换成修炼工具。每件装备只可拥有一件。</p></div>
      <div className="equipment-balance"><span>可用灵石</span><strong>{balance === null ? "—" : balance.toLocaleString()}</strong><small>游戏 Token · 不可交易</small></div>
    </div>
    <p className="equipment-preview">当前为 Pre-Alpha：购买、入库和装备状态可以体验；装备效果尚未全部接入任务流程，正式开放前会逐项验证。</p>
    <div className="equipment-list" aria-label="第一赛季装备目录">
      {equipmentCatalog.map((item) => {
        const ownedItem = owned.get(item.id);
        return <article className="equipment-item" key={item.id}>
          <div className="equipment-info">
            <span className="equipment-version">第一赛季 · 目录 v{EQUIPMENT_CATALOG_VERSION}</span>
            <h2>{item.name}</h2>
            <p>{item.effect}</p>
            <small>{item.boundary}</small>
          </div>
          <div className="equipment-trade">
            <div className="equipment-price"><strong>{item.price.toLocaleString()}</strong><span>Token</span></div>
            <span className="equipment-owned">{ownedItem ? ownedItem.equipped_at ? "已装备" : "已拥有" : "未拥有"}</span>
            <EquipmentActions
              itemId={item.id}
              owned={!!ownedItem}
              equipped={!!ownedItem?.equipped_at}
              affordable={balance !== null && balance >= item.price}
              signedIn={!!cultivator}
              signInPath={signInPath}
            />
          </div>
        </article>;
      })}
    </div>
    <p className="equipment-foot">灵石不足？<Link href="/">去任务大殿完成真实悬赏</Link>。装备不会改变天道审判或宗门复核结果。</p>
  </main>;
}
