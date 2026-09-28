"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function EquipmentActions({ itemId, owned, equipped, affordable, signedIn, signInPath }: {
  itemId: string;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
  signedIn: boolean;
  signInPath: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
        return;
      }
      router.refresh();
    } catch {
      setMessage("网络暂不可用，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return <Button asChild className="equipment-button"><a href={signInPath}>登录后购买</a></Button>;
  return <div className="equipment-action">
    {owned
      ? <Button variant="outline" className="equipment-button" disabled={busy} onClick={() => act(`/api/equipment/${itemId}/equip`, { equipped: !equipped })}>{equipped ? "卸下装备" : "装备"}</Button>
      : <Button className="equipment-button" disabled={busy || !affordable} onClick={() => act("/api/equipment/purchase", { itemId })}>{affordable ? "购买装备" : "Token 不足"}</Button>}
    {message ? <p className="equipment-error" role="status">{message}</p> : null}
  </div>;
}
