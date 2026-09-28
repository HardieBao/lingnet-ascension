"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { realmNames, type Realm, type assessBreakthrough } from "@/lib/realms";
import type { RealmTrial, RealmTrialOffer } from "@/lib/realm-trials";

type TrialView = {
  realm: Realm; trials: RealmTrial[]; offers: RealmTrialOffer[];
  progress: { token: number; cultivation: number; merit: number; formalResults: number; independentReviews: number };
  next: ReturnType<typeof assessBreakthrough>;
  entry: { eligible: boolean; missing: string[] } | null;
};
type Confirmation = { operation: "start"; offer: RealmTrialOffer } | { operation: "finish" | "withdraw"; trial: RealmTrial };
const stateNames: Record<string, string> = { active: "进行中", passed: "已通过", withdrawn: "已退出", expired: "已到期", failed: "未通过", platform_failure: "平台故障中止" };
const name = (realm: string) => realmNames[realm as Realm] ?? "境界待核对";
const time = (timestamp: number) => new Date(timestamp).toLocaleString("zh-CN");

export function TrialPanel() {
  const router = useRouter();
  const requestLock = useRef(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<TrialView | null>(null);
  const [selectedClaim, setSelectedClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reason, setReason] = useState("");

  async function readView() {
    const response = await fetch("/api/trials", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const result = await response.json() as TrialView & { error?: string };
    if (!response.ok) throw new Error(result.error || "渡劫记录暂不可用。");
    setView(result);
    setSelectedClaim((previous) => result.offers.some((offer) => offer.claim_id === previous) ? previous : result.offers[0]?.claim_id ?? "");
  }

  async function refresh() {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    setMessage("");
    try { await readView(); }
    catch (error) { setView(null); setMessage(error instanceof Error && error.name === "Error" ? error.message : "记录读取失败，请核对网络与登录后重新刷新；没有执行开始或退出。"); }
    finally { requestLock.current = false; setBusy(false); }
  }

  async function act() {
    if (!confirmation || requestLock.current) return;
    const action = confirmation;
    requestLock.current = true;
    setBusy(true);
    setMessage("");
    const url = action.operation === "start" ? "/api/trials" : `/api/trials/${action.trial.id}/${action.operation}`;
    const body = action.operation === "start" ? { claimId: action.offer.claim_id } : action.operation === "withdraw" ? { reason: reason.trim() } : {};
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) { setMessage(result.error || "操作未确认，请核对最新记录后再决定是否重试。"); await readView(); return; }
      await readView();
      setConfirmation(null);
      setReason("");
      setMessage(result.message || "服务端已确认操作，最新状态见下方记录。");
      router.refresh();
    } catch {
      setView(null);
      setMessage("操作结果未确认，可能已被服务端处理。请先核对记录、余额与境界，不要直接重复提交。");
    } finally { requestLock.current = false; setBusy(false); }
  }

  const active = view?.trials.find((trial) => trial.state === "active");
  const offer = view?.offers.find((item) => item.claim_id === selectedClaim);
  const canConfirm = !!view && !!confirmation && (confirmation.operation === "start"
    ? !!view.entry?.eligible && view.offers.some((item) => item.claim_id === confirmation.offer.claim_id)
    : view.trials.some((trial) => trial.id === confirmation.trial.id && trial.state === "active") && (confirmation.operation !== "withdraw" || reason.trim().length >= 1 && reason.trim().length <= 500));
  const confirmationFee = confirmation?.operation === "start" ? confirmation.offer.fee : confirmation?.trial.fee;

  return <>
    <Sheet open={open} onOpenChange={(value) => { setOpen(value); if (value) void refresh(); }}>
      <SheetTrigger asChild><Button variant="outline" className="realm-advance">渡劫资格与记录</Button></SheetTrigger>
      <SheetContent className="trial-panel" showCloseButton={false}>
        <SheetHeader className="trial-header">
          <SheetTitle>渡劫与记录</SheetTitle>
          <SheetDescription>{view ? `${name(view.realm)} · ${view.next.target ? `下一境界 ${name(view.next.target)}` : "金丹之后尚未开放"}` : "读取本人资格与记录"} · Pre-Alpha</SheetDescription>
          <SheetClose asChild><Button variant="ghost" className="trial-close" aria-label="关闭渡劫侧栏">关闭</Button></SheetClose>
        </SheetHeader>
        <div className="trial-body" aria-busy={busy}>
          <p className="trial-note">成功才扣除冻结费用。退出、到期或其他未成功结算全额解冻，模型调用费用不退款。关闭侧栏不会取消渡劫。</p>
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>{busy ? "正在核对记录…" : "刷新资格、余额与记录"}</Button>
          {!view ? <p role="status">{busy ? "正在读取你的渡劫记录…" : "记录尚未读取，不能开始或结算渡劫。"}</p> : <>
            <dl className="trial-balances"><div><dt>可用游戏 Token</dt><dd>{view.progress.token.toLocaleString()}</dd></div><div><dt>当前渡劫冻结</dt><dd>{(active?.fee ?? 0).toLocaleString()}</dd></div></dl>
            <section className="trial-section" aria-labelledby="trial-qualification">
              <h3 id="trial-qualification">突破资格</h3>
              <dl className="trial-facts"><dt>修为</dt><dd>{view.progress.cultivation.toLocaleString()} / {view.next.rule?.cultivation.toLocaleString() ?? "—"}</dd><dt>功德</dt><dd>{view.progress.merit} / {view.next.rule?.merit ?? "—"}</dd><dt>正式成果</dt><dd>{view.progress.formalResults} / {view.next.rule?.formalResults ?? "—"}</dd><dt>已采纳独立复验</dt><dd>{view.progress.independentReviews}{view.next.target === "core" ? " / 1" : ""}</dd></dl>
              {!active && (view.entry ?? view.next).missing.length ? <ul>{(view.entry ?? view.next).missing.map((missing) => <li key={missing}>{missing}</li>)}</ul> : null}
              {view.realm === "mortal" ? <p>凡人到炼气使用境界天梯的免费突破入口，不需要渡劫。</p> : null}
            </section>
            {active ? <section className="trial-section" aria-labelledby="trial-active">
              <h3 id="trial-active">{name(active.target_realm)}渡劫进行中</h3>
              <dl className="trial-facts"><dt>关联认领</dt><dd><code>{active.claim_id}</code></dd><dt>固定基线</dt><dd><code>{active.base_commit}</code></dd><dt>开始时间</dt><dd>{time(active.started_at)}</dd><dt>截止时间</dt><dd>{time(active.expires_at)}</dd><dt>冻结费用</dt><dd>{active.fee.toLocaleString()} 游戏 Token</dd></dl>
              <p>费用已冻结，无需再次支付；其余资格在结算时由服务端重新核对。提交文件或 CI 通过不等于正式成果，仍需独立复核与正式集成。</p>
              <div className="trial-buttons"><Button disabled={busy} onClick={() => { setMessage(""); setConfirmation({ operation: "finish", trial: active }); }}>核对成果并尝试结算</Button><Button variant="outline" disabled={busy} onClick={() => { setMessage(""); setReason(""); setConfirmation({ operation: "withdraw", trial: active }); }}>退出本次渡劫</Button></div>
            </section> : <section className="trial-section" aria-labelledby="trial-offers">
              <h3 id="trial-offers">已开跑的专属悬赏</h3>
              {view.offers.length ? <>
                <Label htmlFor="trial-offer">选择本人认领</Label>
                <NativeSelect id="trial-offer" value={selectedClaim} disabled={busy} onChange={(event) => setSelectedClaim(event.target.value)}>{view.offers.map((item) => <NativeSelectOption key={item.claim_id} value={item.claim_id}>{item.mission_id} · {item.title}</NativeSelectOption>)}</NativeSelect>
                {offer ? <p>{name(offer.target_realm)} · 冻结 {offer.fee.toLocaleString()} 游戏 Token · 契约时限 {Math.ceil(offer.duration_ms / 60_000)} 分钟；不延长原认领租约。</p> : null}
                <Button disabled={busy || !view.entry?.eligible || !offer} onClick={() => { if (offer) { setMessage(""); setConfirmation({ operation: "start", offer }); } }}>开始渡劫{offer ? ` · 冻结 ${offer.fee.toLocaleString()}` : ""}</Button>
              </> : <p>暂无可开始的专属认领。契约与资格就绪后，从任务大殿认领并开跑；不会自动创建任务或冻结费用。</p>}
            </section>}
            <section className="trial-section" aria-labelledby="trial-history"><h3 id="trial-history">最近最多 30 条本人记录</h3>
              {view.trials.length ? <ol className="trial-history">{view.trials.map((trial) => <li key={trial.id}><div className="trial-record-heading"><strong>{name(trial.target_realm)}渡劫</strong><span>{stateNames[trial.state] ?? "状态待核对"}</span></div><p>{trial.fee.toLocaleString()} 游戏 Token · {trial.state === "active" ? "冻结中" : trial.state === "passed" ? "已扣除" : ["withdrawn", "expired", "failed", "platform_failure"].includes(trial.state) ? "已全额解冻" : "费用待核对"}</p><p>{time(trial.started_at)}{trial.finished_at ? ` — ${time(trial.finished_at)}` : ""}</p><code>{trial.id}</code>{trial.finish_reason ? <p>{trial.finish_reason}</p> : null}</li>)}</ol> : <p>暂无渡劫记录。</p>}
            </section>
          </>}
          <p className="trial-message" role="status">{message}</p>
          <Link href="/ledger">到游戏账本核对冻结与结算流水 →</Link>
        </div>
      </SheetContent>
    </Sheet>
    <AlertDialog open={!!confirmation} onOpenChange={(value) => { if (!value && !busy) setConfirmation(null); }}>
      <AlertDialogContent className="trial-confirm">
        <AlertDialogHeader><AlertDialogTitle>{confirmation?.operation === "start" ? "确认开始渡劫？" : confirmation?.operation === "withdraw" ? "退出本次渡劫？" : "确认核对并结算？"}</AlertDialogTitle><AlertDialogDescription>
          {confirmation?.operation === "start" ? <>{confirmation.offer.mission_id} · {confirmation.offer.title}。目标{name(confirmation.offer.target_realm)}，冻结 {confirmation.offer.fee.toLocaleString()} 游戏 Token；开始后 {Math.ceil(confirmation.offer.duration_ms / 60_000)} 分钟内形成正式成果，不延长原认领租约。成功后才扣费，未成功全额解冻；真实模型费用另由你承担。</> : confirmation?.operation === "withdraw" ? <>本次 {confirmationFee?.toLocaleString()} 游戏 Token 全额解冻，保留退出记录。原悬赏认领仍保留；再次挑战需要新认领，并重新满足资格。</> : <>服务端核对本次专属认领按时形成的正式成果、独立复核与资格。只有满足条件才突破并扣除已冻结的 {confirmationFee?.toLocaleString()} 游戏 Token，不会重复收费。</>}
        </AlertDialogDescription></AlertDialogHeader>
        {confirmation?.operation === "withdraw" ? <div className="trial-reason"><Label htmlFor="trial-withdraw-reason">退出原因（1–500 字）</Label><Textarea id="trial-withdraw-reason" value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} aria-describedby="trial-reason-count" /><small id="trial-reason-count">{reason.trim().length} / 500</small></div> : null}
        {message ? <p className="trial-message" role="status">{message}</p> : null}
        {confirmation?.operation === "withdraw" && reason.trim().length < 1 ? <p>请填写至少 1 字的退出原因。</p> : !view || !canConfirm ? <p>请先核对最新记录。所选认领、资格或渡劫状态可能已变化。</p> : null}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>返回，不执行操作</AlertDialogCancel><Button variant="outline" disabled={busy} onClick={() => void refresh()}>核对最新记录</Button><Button disabled={busy || !canConfirm} onClick={() => void act()}>{busy ? "正在处理，请勿重复提交…" : confirmation?.operation === "start" ? "确认冻结并开始" : confirmation?.operation === "withdraw" ? "确认退出并解冻" : "确认结算渡劫"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
