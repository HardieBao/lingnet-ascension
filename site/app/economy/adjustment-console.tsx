"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { TokenAdjustment } from "@/lib/token-adjustments";

type Target = { id: string; balance: number };
const numberFormat = new Intl.NumberFormat("zh-CN", { signDisplay: "always" });
const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });

function RequestForm({ targets }: { targets: Target[] }) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function requestAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const delta = Number(fields.get("delta"));
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 10000) {
      setMessage("调整额须为 -10,000 至 10,000 的非零整数。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/token-adjustments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCultivatorId: targetId, delta, reference: fields.get("reference"), reason: fields.get("reason") }),
      });
      const result = await response.json() as { error?: string; adjustment?: { id: string } };
      if (!response.ok) {
        setMessage(result.error || "申请未保存，请保留内容并重试。");
        return;
      }
      form.reset();
      setTargetId("");
      setMessage(`申请已保存，等待独立审批。编号：${result.adjustment?.id ?? "请查看下方记录"}`);
      router.refresh();
    } catch {
      setMessage("网络暂不可用。内容已保留，请重试前核对下方记录是否已有这笔业务引用。");
    } finally {
      setBusy(false);
    }
  }

  return <form className="adjustment-form" onSubmit={requestAdjustment}>
    <h3>发起调账申请</h3>
    <p className="adjustment-help">正数补发、负数扣回；本次只保存申请，不会立即改账。</p>
    <fieldset disabled={busy}>
      <div className="adjustment-field">
        <Label htmlFor="adjustment-target">目标修士编号</Label>
        <Select name="targetCultivatorId" value={targetId} onValueChange={setTargetId} required>
          <SelectTrigger id="adjustment-target" className="adjustment-input" aria-describedby="adjustment-target-hint">
            <SelectValue placeholder="选择要调整的修士" />
          </SelectTrigger>
          <SelectContent position="popper">{targets.map((target) => <SelectItem key={target.id} value={target.id}>
            {target.id} · 当前 {target.balance.toLocaleString("zh-CN")} Token
          </SelectItem>)}</SelectContent>
        </Select>
        <p id="adjustment-target-hint" className="adjustment-help">选择内部账号编号；余额供核对，提交时服务端会重新检查。</p>
      </div>
      <div className="adjustment-field">
        <Label htmlFor="adjustment-delta">游戏 Token 调整额</Label>
        <Input id="adjustment-delta" name="delta" type="number" step={1} min={-10000} max={10000} required className="adjustment-input" aria-describedby="adjustment-delta-hint" />
        <p id="adjustment-delta-hint" className="adjustment-help">单笔最多 ±10,000，不能为 0；扣回不能导致负余额。</p>
      </div>
      <div className="adjustment-field">
        <Label htmlFor="adjustment-reference">业务引用</Label>
        <Input id="adjustment-reference" name="reference" required maxLength={100} className="adjustment-input" aria-describedby="adjustment-reference-hint" />
        <p id="adjustment-reference-hint" className="adjustment-help">填写可追溯的任务、事件或申诉编号；同一修士不能重复使用。</p>
      </div>
      <div className="adjustment-field">
        <Label htmlFor="adjustment-reason">申请理由与证据</Label>
        <Textarea id="adjustment-reason" name="reason" required minLength={20} maxLength={500} rows={4} className="adjustment-input" aria-describedby="adjustment-reason-hint" />
        <p id="adjustment-reason-hint" className="adjustment-help">20–500 字，说明金额依据和可复核证据；不要填写密钥或私人信息。</p>
      </div>
      <Button type="submit" disabled={busy || !targetId}>{busy ? "正在保存申请…" : "提交申请，等待审批"}</Button>
    </fieldset>
    <p className="adjustment-message" role="status" aria-live="polite">{message}</p>
  </form>;
}

function DecisionForm({ record }: { record: TokenAdjustment }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function decide(choice: "approve" | "reject") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/token-adjustments/${record.id}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: choice, reason }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "决定未保存，请刷新记录后重试。");
        return;
      }
      setMessage(choice === "approve" ? "批准已记录，游戏 Token 流水已追加。" : "驳回已记录，没有产生调账流水。");
      router.refresh();
    } catch {
      setMessage("网络暂不可用。理由已保留，请先刷新核对是否已完成审批，再决定是否重试。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="adjustment-decision">
    <Label htmlFor={`decision-${record.id}`}>独立复核理由</Label>
    <Textarea id={`decision-${record.id}`} value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} rows={3} className="adjustment-input" disabled={busy} />
    <div className="adjustment-buttons">
      <Button type="button" disabled={busy || !reason.trim()} onClick={() => setDecision("approve")}>检查并批准</Button>
      <Button type="button" variant="outline" disabled={busy || !reason.trim()} onClick={() => setDecision("reject")}>检查并驳回</Button>
    </div>
    <p className="adjustment-message" role="status" aria-live="polite">{message}</p>
    <AlertDialog open={decision !== null} onOpenChange={(open) => { if (!open) setDecision(null); }}>
      <AlertDialogContent className="adjustment-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{decision === "approve" ? "确认批准游戏 Token 调账？" : "确认驳回这笔申请？"}</AlertDialogTitle>
          <AlertDialogDescription>{decision === "approve"
            ? "批准会立即追加账本事件。历史不能改写；纠正需要另发申请。"
            : "驳回不会改变余额，但本申请将不能再次审批。"}</AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="adjustment-confirm">
          <dt>目标修士</dt><dd>{record.target_cultivator_id}</dd>
          <dt>调整额</dt><dd>{numberFormat.format(record.delta)} 游戏 Token</dd>
          <dt>业务引用</dt><dd>{record.reference}</dd>
          <dt>复核理由</dt><dd>{reason}</dd>
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel>返回检查</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={() => { if (decision) void decide(decision); }}>
            {decision === "approve" ? "确认批准并入账" : "确认驳回，不改账"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

export function AdjustmentConsole({ role, viewerId, records, targets }: {
  role: "requester" | "approver" | null; viewerId: string; records: TokenAdjustment[] | null; targets: Target[];
}) {
  if (!role) return <section className="adjustment-section"><h2>双人调账尚未开放</h2><p>需配置两个不同的指定 GitHub 账号并完成职责确认；当前不提供申请或审批操作。</p></section>;
  if (!records) return <section className="adjustment-section"><h2>调账记录暂不可用</h2><p>申请与审批入口暂时关闭；对账内容不受影响。请稍后刷新重试。</p></section>;
  return <section className="adjustment-section" aria-labelledby="adjustments-title">
    <h2 id="adjustments-title">双人游戏 Token 调账</h2>
    <p>{role === "requester" ? "你的职责：发起有证据的申请，不能批准。" : "你的职责：独立核对申请并决定，不能发起申请或自批。"}</p>
    {role === "requester" ? <RequestForm targets={targets} /> : null}
    <div className="adjustment-history">
      <h3>最近调账记录</h3><p className="adjustment-help">显示最近 50 笔，不是完整审计导出。</p>
      {records.length === 0 ? <p>暂无调账申请。</p> : <ol>{records.map((record) => <li key={record.id}>
        <div className="adjustment-record-heading"><strong>{numberFormat.format(record.delta)} 游戏 Token</strong>
          <span>{record.decision === "approve" ? "已批准" : record.decision === "reject" ? "已驳回" : "待审批"}</span></div>
        <dl className="adjustment-record">
          <dt>目标修士</dt><dd>{record.target_cultivator_id}</dd>
          <dt>业务引用</dt><dd>{record.reference}</dd>
          <dt>申请理由</dt><dd>{record.reason}</dd>
          <dt>申请人 / 时间</dt><dd>{record.requested_by} · {dateFormat.format(record.requested_at)}</dd>
          <dt>申请编号</dt><dd>{record.id}</dd>
          {record.decision ? <><dt>审批人 / 时间</dt><dd>{record.decided_by} · {record.decided_at ? dateFormat.format(record.decided_at) : "时间待核对"}</dd>
            <dt>复核理由</dt><dd>{record.decision_reason}</dd></> : null}
        </dl>
        {role === "approver" && !record.decision ? record.requested_by === viewerId
          ? <p>这是你曾发起的申请，不能自行审批。</p> : <DecisionForm record={record} /> : null}
      </li>)}</ol>}
    </div>
  </section>;
}
