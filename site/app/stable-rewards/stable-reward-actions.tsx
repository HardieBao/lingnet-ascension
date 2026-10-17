"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { artifactSafetyIssues } from "@/lib/artifact-safety";
import type { StableGrantOption } from "@/lib/stable-reward-workbench";

type RecordAction = { kind: "revoke" | "release"; record: {
  id: string; title: string; author: string; cultivator_id: string; token: number; cultivation: number; merit: number;
} };
type Props = { kind: "settle"; targets: StableGrantOption[] } | RecordAction;
const titles = { settle: "稳定奖励结算", revoke: "回滚追回", release: "独立追回复核" };
const buttons = { settle: "核验版本并结算稳定奖励", revoke: "核验回滚并追回", release: "独立复核并解除本次冻结" };
const descriptions = {
  settle: "核对两个相隔至少七天的不可变公开版本、同一成果摘要和当前主分支。通过后只结算原认领锁定的三资源奖励一次。",
  revoke: "核验当前主分支的成果确已回滚后，按现有余额追加抵消流水；不足部分记为欠账，并进入保护性冻结。历史不会改写。",
  release: "记录独立复核并解除此追回记录的复核冻结。欠账不会抹除，其他冻结和未清偿欠账仍会限制支出与突破。",
};

export function StableRewardActions(props: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState(props.kind === "settle" ? props.targets[0]?.submission_id ?? "" : "");
  const [firstTag, setFirstTag] = useState("");
  const [secondTag, setSecondTag] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const target = props.kind === "settle" ? props.targets.find((item) => item.submission_id === selection) ?? props.targets[0] : null;
  const recipient = props.kind === "settle" ? target : props.record;
  const amounts = props.kind === "settle" ? target?.reward : props.record;
  const reasonValid = reason.trim().length >= 20 && reason.trim().length <= 500 && artifactSafetyIssues(reason).length === 0;
  const tagValid = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(firstTag.trim()) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(secondTag.trim()) && firstTag.trim() !== secondTag.trim();
  const valid = reasonValid && (props.kind !== "settle" || !!target && tagValid);

  function requestConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && valid) setConfirm(true);
  }

  async function execute() {
    if (busy || !valid || !recipient) return;
    setBusy(true);
    setMessage("");
    try {
      const url = props.kind === "settle" ? "/api/stable-settlements"
        : `/api/stable-settlements/${props.record.id}/${props.kind === "revoke" ? "revoke" : "release-hold"}`;
      const body = props.kind === "settle"
        ? { submissionId: target!.submission_id, firstTag: firstTag.trim(), secondTag: secondTag.trim(), reason }
        : { reason };
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "操作未确认，请先核对记录。"); return; }
      setMessage(props.kind === "settle" ? "稳定奖励已记录，请核对结算历史和账本。"
        : props.kind === "revoke" ? "追回已记录，请核对抵消流水、欠账与保护性冻结。"
          : "独立复核已记录；未清偿欠账和其他冻结继续生效。");
      setReason("");
      router.refresh();
    } catch {
      setMessage("暂时无法确认结果。内容已保留，请先刷新核对记录，再决定是否重试。");
    } finally { setBusy(false); }
  }

  const reasonId = `stable-reason-${props.kind === "settle" ? "new" : props.record.id}`;
  return <form className="adjustment-form stable-reward-form" aria-label={titles[props.kind]} onSubmit={requestConfirmation}>
    <h3>{titles[props.kind]}</h3>
    <fieldset disabled={busy}>
      {props.kind === "settle" ? <>
        <div className="adjustment-field stable-reward-full"><Label htmlFor="stable-target">正式成果</Label>
          <select id="stable-target" className="adjustment-input stable-reward-select" value={target?.submission_id ?? ""}
            onChange={(event) => setSelection(event.target.value)} required>
            {props.targets.map((item) => <option key={item.submission_id} value={item.submission_id}>{item.mission_id} · {item.title} · {item.author}</option>)}
          </select>
          <p className="adjustment-help">锁定稳定奖励：游戏 Token {amounts?.token ?? 0} · 修为 {amounts?.cultivation ?? 0} · 功德 {amounts?.merit ?? 0}。待抵扣欠账按账本处理。</p>
        </div>
        <div className="adjustment-field"><Label htmlFor="stable-first-tag">首次公开版本标签</Label>
          <Input id="stable-first-tag" className="adjustment-input" value={firstTag} onChange={(event) => setFirstTag(event.target.value)} required maxLength={100} placeholder="例如 v0.1.0" /></div>
        <div className="adjustment-field"><Label htmlFor="stable-second-tag">至少七天后的公开版本标签</Label>
          <Input id="stable-second-tag" className="adjustment-input" value={secondTag} onChange={(event) => setSecondTag(event.target.value)} required maxLength={100} placeholder="例如 v0.2.0" /></div>
      </> : null}
      <div className="adjustment-field stable-reward-full"><Label htmlFor={reasonId}>独立核对理由</Label>
        <Textarea id={reasonId} className="adjustment-input" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={20} maxLength={500} rows={3} />
        <p className="adjustment-help">20–500 字，说明公开证据与处理依据；不填写密钥或私人凭据。</p>
      </div>
      <Button type="submit" disabled={busy || !valid}>{busy ? "正在核验并记录…" : buttons[props.kind]}</Button>
    </fieldset>
    <p className="adjustment-message" role="status" aria-live="polite">{message}</p>
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent className="adjustment-dialog"><AlertDialogHeader>
        <AlertDialogTitle>确认{titles[props.kind]}？</AlertDialogTitle>
        <AlertDialogDescription>{descriptions[props.kind]}</AlertDialogDescription>
      </AlertDialogHeader>
      <dl className="adjustment-confirm"><dt>正式成果</dt><dd>{recipient?.title}</dd>
        <dt>原作者</dt><dd>{recipient?.author} · {recipient?.cultivator_id}</dd>
        <dt>原锁定稳定奖励</dt><dd>游戏 Token {amounts?.token ?? 0} · 修为 {amounts?.cultivation ?? 0} · 功德 {amounts?.merit ?? 0}</dd>
        {props.kind === "settle" ? <><dt>公开版本</dt><dd>{firstTag.trim()} → {secondTag.trim()}</dd></> : null}
        <dt>处理理由</dt><dd>{reason}</dd>
      </dl><AlertDialogFooter><AlertDialogCancel>返回检查</AlertDialogCancel>
        <AlertDialogAction disabled={busy} onClick={() => void execute()}>确认核验并记录</AlertDialogAction>
      </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </form>;
}
