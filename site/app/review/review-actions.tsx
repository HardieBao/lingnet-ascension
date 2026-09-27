"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ReviewActions({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(decision: "accept" | "revise" | "reject") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/reviews/${submissionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "复核失败，请重试。");
        return;
      }
      router.refresh();
    } catch {
      setMessage("网络暂不可用，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="review-actions">
    <label>复核理由<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="说明接受或要求修改的依据" /></label>
    <div>
      <Button disabled={busy || reason.trim().length < 8} onClick={() => decide("accept")}>批准待合入</Button>
      <Button variant="outline" disabled={busy || reason.trim().length < 8} onClick={() => decide("revise")}>要求修订</Button>
      <Button variant="ghost" disabled={busy || reason.trim().length < 8} onClick={() => decide("reject")}>驳回</Button>
    </div>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}

export function IntegrationActions({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [commit, setCommit] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function integrate() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/integrations/${submissionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commit: commit.trim() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "合入确认失败，请重试。");
        return;
      }
      router.refresh();
    } catch {
      setMessage("暂时无法核对仓库，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="review-actions">
    <label>合入提交 SHA<input value={commit} onChange={(event) => setCommit(event.target.value)} maxLength={40} placeholder="main 分支中的 40 位提交 SHA" /></label>
    <Button disabled={busy || !/^[a-f0-9]{40}$/i.test(commit.trim())} onClick={integrate}>核对并结算正式成果</Button>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
