"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

function referenceNumber(value: string, kind: "pull" | "run") {
  const text = value.trim();
  const match = /^[1-9]\d*$/.test(text) ? text : (kind === "pull"
    ? /^https:\/\/github\.com\/HardieBao\/lingnet-ascension\/pull\/([1-9]\d*)\/?$/
    : /^https:\/\/github\.com\/HardieBao\/lingnet-ascension\/actions\/runs\/([1-9]\d*)\/?$/).exec(text)?.[1];
  const number = Number(match);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function RevalidationSubmission({ targets }: {
  targets: Array<{ submission_id: string; mission_id: string; title: string }>;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(targets[0]?.submission_id ?? "");
  const [pull, setPull] = useState("");
  const [run, setRun] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submissionId = targets.some((target) => target.submission_id === selection) ? selection : targets[0]?.submission_id;
  const pullNumber = referenceNumber(pull, "pull");
  const runId = referenceNumber(run, "run");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !submissionId || !pullNumber || !runId) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/revalidations", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId, pullNumber, runId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "报告未确认，请核对复验记录。"); return; }
      setMessage("复验报告已进入待采纳队列。");
      setPull("");
      setRun("");
      router.refresh();
    } catch {
      setMessage("暂时无法确认提交结果。请先刷新复验记录，确认未提交后再重试。");
    } finally { setBusy(false); }
  }

  return <form className="review-actions revalidation-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <legend>提交复验报告</legend>
      <label>正式成果<select value={submissionId} onChange={(event) => setSelection(event.target.value)}>
        {targets.map((target) => <option key={target.submission_id} value={target.submission_id}>{target.mission_id} · {target.title}</option>)}
      </select></label>
      <label>报告 PR 地址或编号<input value={pull} onChange={(event) => setPull(event.target.value)} maxLength={160}
        placeholder="https://github.com/HardieBao/lingnet-ascension/pull/…" required
        aria-describedby="revalidation-pull-help" aria-invalid={Boolean(pull.trim() && !pullNumber)} /></label>
      <p id="revalidation-pull-help">{pull.trim() && !pullNumber
        ? "请填写本仓库报告 PR 的完整地址，或正整数编号。" : "例如报告 PR #7 可填写 7。"}</p>
      <label>专用复验运行地址或编号<input value={run} onChange={(event) => setRun(event.target.value)} maxLength={180}
        placeholder="https://github.com/HardieBao/lingnet-ascension/actions/runs/…" required
        aria-describedby="revalidation-run-help" aria-invalid={Boolean(run.trim() && !runId)} /></label>
      <p id="revalidation-run-help">{run.trim() && !runId
        ? "请填写本仓库专用复验运行的完整地址，或正整数编号。" : "运行编号在 GitHub Actions 运行地址的末尾。"}</p>
      <p>使用本仓库的报告 PR 和「LingNet independent revalidation」运行；报告采纳前保持 PR 开放。</p>
      <Button type="submit" disabled={busy || !submissionId || !pullNumber || !runId}>{busy ? "正在核验来源…" : "核验并提交报告"}</Button>
    </fieldset>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}

export function RevalidationDecision({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(decision: "accept" | "reject") {
    if (busy || reason.trim().length < 8 || reason.trim().length > 500) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/revalidations/${id}/decision`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setMessage(result.error ?? "决定未确认，请刷新记录。"); return; }
      router.refresh();
    } catch {
      setMessage("暂时无法确认处理结果。请先刷新记录，确认尚未处理后再重试。");
    } finally { setBusy(false); }
  }

  return <div className="review-actions">
    <label>复验处理理由<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3}
      minLength={8} maxLength={500} placeholder="说明报告是否有可复查的证据；不要粘贴密钥或私人凭据" disabled={busy} /></label>
    <div>
      <Button disabled={busy || reason.trim().length < 8} onClick={() => decide("accept")}>采纳复验报告</Button>
      <Button variant="outline" disabled={busy || reason.trim().length < 8} onClick={() => decide("reject")}>驳回复验报告</Button>
    </div>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
