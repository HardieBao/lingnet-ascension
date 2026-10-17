"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function EquipmentActions({ itemId, itemName, price, catalogVersion, owned, equipped, affordable, signedIn, signInPath }: {
  itemId: string;
  itemName: string;
  price: number;
  catalogVersion: number;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
  signedIn: boolean;
  signInPath: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const purchaseButton = useRef<HTMLButtonElement>(null);

  async function act(url: string, body: object) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "操作失败，请刷新后重试。");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMessage("暂时无法确认操作结果，请先刷新库存和账本核对，不要反复确认。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return <Button asChild className="equipment-button"><a href={signInPath}>登录后购买</a></Button>;
  return <div className="equipment-action">
    {owned
      ? <Button variant="outline" className="equipment-button" disabled={busy} onClick={() => act(`/api/equipment/${itemId}/equip`, { equipped: !equipped })}>{equipped ? "卸下装备" : "装备"}</Button>
      : <Button ref={purchaseButton} className="equipment-button" disabled={busy || !affordable}
          aria-expanded={confirming} aria-controls={`purchase-${itemId}`}
          onClick={() => { setMessage(""); setConfirming(true); }}>{affordable ? "购买装备" : "Token 不足"}</Button>}
    {!owned && confirming ? <section className="equipment-confirmation" id={`purchase-${itemId}`} aria-labelledby={`purchase-title-${itemId}`}>
      <h3 id={`purchase-title-${itemId}`}>确认购买装备</h3>
      <p>{itemName} · 目录 v{catalogVersion}<br />将扣除 {price.toLocaleString()} 游戏 Token。</p>
      <p>购买后先入库存，需另行装备才启用效果。装备不能绕过审判或境界门槛。</p>
      <p>这一步不启动模型，不消费模型 Token 或确认真实模型费用。结果不明确时先核对库存和账本。</p>
      <div className="equipment-confirmation-actions">
        <Button variant="ghost" className="equipment-button" disabled={busy} onClick={() => {
          setConfirming(false); purchaseButton.current?.focus();
        }}>取消，暂不购买</Button>
        <Button className="equipment-button" disabled={busy || !affordable} onClick={async () => {
          if (await act("/api/equipment/purchase", { itemId, expectedPrice: price, catalogVersion })) setConfirming(false);
        }}>{busy ? "正在处理…" : "确认购买"}</Button>
      </div>
    </section> : null}
    {message ? <p className="equipment-error" role="status">{message}</p> : null}
    {message ? <Button variant="ghost" className="equipment-button" disabled={busy} onClick={() => router.refresh()}>刷新库存与账本</Button> : null}
  </div>;
}
