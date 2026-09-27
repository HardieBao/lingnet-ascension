"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Realm } from "@/lib/realms";

type Assessment = {
  target: "qi" | "foundation" | "core" | null;
  eligible: boolean;
  missing: string[];
  rule: { cultivation: number; merit: number; token: number; formalResults: number } | null;
};

export function RealmActions({ current, assessment }: { current: Realm; assessment: Assessment }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function advance() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/realms/advance", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "qi" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "突破失败，请刷新后重试。");
        return;
      }
      router.refresh();
    } catch {
      setMessage("网络暂不可用，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  if (!assessment.target) return <p className="realm-hint">元婴及以上将在 MVP 后开放。</p>;
  return <div className="realm-actions">
    {current === "mortal" && assessment.eligible
      ? <Button className="realm-advance" disabled={busy} onClick={advance}>突破炼气 · 不消耗 Token</Button>
      : <p className="realm-hint">下一境界：{assessment.target === "qi" ? "炼气" : assessment.target === "foundation" ? "筑基" : "金丹"}。{assessment.target !== "qi" ? "专属渡劫尚未开放，不会预扣 Token。" : "完成新手悬赏后可突破。"}</p>}
    {assessment.missing.length > 0 ? <ul className="realm-missing">{assessment.missing.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
    {message ? <p className="realm-error" role="status">{message}</p> : null}
  </div>;
}
