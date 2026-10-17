"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ClaimLeasePanel({ id, expiresAt }: { id: string; expiresAt: number }) {
  const router = useRouter();
  const [observed, setObserved] = useState(expiresAt), [automatic, setAutomatic] = useState(false);
  const [message, setMessage] = useState("尚未从此页面续期。"), [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false), inFlight = useRef(false);
  const latest = Math.max(expiresAt, observed);
  useEffect(() => {
    const timer = setInterval(() => setExpired(Date.now() >= latest), 1000);
    return () => clearInterval(timer);
  }, [latest]);
  const renew = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const response = await fetch(`/api/claims/${id}/heartbeat`, { method: "POST" });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || Reflect.get(data, "id") !== id || !Number.isSafeInteger(Reflect.get(data, "expiresAt"))) {
        setAutomatic(false);
        setMessage(response.status === 409 ? "认领已失效或达到品阶时限，请刷新核对；不能恢复已过期认领。" : "续期未确认，自动续期已暂停，请刷新核对平台状态。");
        return;
      }
      setObserved(Reflect.get(data, "expiresAt")); setExpired(false);
      setMessage("平台已确认租约。重新下载任务包后，新截止时间才会用于后续本机启动或恢复；同一认领继续共用原模型额度。");
    } catch { setAutomatic(false); setMessage("平台连接中断，租约续期未知；本机 Runner 的状态需在本机页面核对。"); }
    finally { inFlight.current = false; setBusy(false); }
  }, [id]);
  useEffect(() => {
    if (!automatic || expired) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void renew(); }, 180000);
    return () => clearInterval(timer);
  }, [automatic, expired, renew]);
  return <section className="claim-confirmation" aria-label="平台租约">
    <h3>平台租约</h3><p>有效至 {new Date(latest).toLocaleString("zh-CN")}。{expired ? "本页观察已到期，请刷新核对。" : "续期不超过当前任务品阶的最长时限。"}</p>
    <label><input type="checkbox" checked={automatic} disabled={expired} onChange={(event) => { setAutomatic(event.target.checked); if (event.target.checked) void renew(); }} /> 页面可见时每3分钟自动续期</label>
    <p className="detail-note">这不是模型活跃证明。关闭页面或切到后台不保证续期；已运行的任务包不会被网页自动改写。续期不退款、不发奖、不补额度。</p>
    <div className="claim-confirmation-actions"><Button className="claim-button" disabled={busy || expired} onClick={() => void renew()}>核对并续期</Button>
      <Button variant="ghost" className="claim-button secondary-action" onClick={() => router.refresh()}>只读刷新平台状态</Button></div>
    <p role="status">{message}</p>
  </section>;
}
