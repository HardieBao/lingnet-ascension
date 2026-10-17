"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseUsageReport } from "@/lib/model-usage";
import { Button } from "@/components/ui/button";

export function UsageUpload({ claimId }: { claimId?: string }) {
  const router = useRouter(), sending = useRef(false);
  const [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false), [message, setMessage] = useState("");
  async function upload() {
    if (!file || sending.current || uncertain) return;
    sending.current = true; setBusy(true); setMessage("");
    try {
      if (file.size > 4096) { setMessage("用量报告须不超过4KiB。"); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(await file.text()); } catch { setMessage("请选择Runner导出的JSON用量报告。"); return; }
      const report = parseUsageReport(parsed);
      if (!report || claimId && report.claimId !== claimId) { setMessage("报告格式或认领编号不匹配，请重新导出；不会上传其他字段。"); return; }
      const response = await fetch("/api/model-usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = data && typeof data === "object" ? Reflect.get(data, "error") : null;
        setMessage(typeof error === "string" ? error : "上传未完成，请核对记录。");
        if (response.status >= 500) setUncertain(true);
        return;
      }
      setMessage("用量报告已保存，来源为本机自报，等待独立核验。"); setFile(null); router.refresh();
    } catch { setUncertain(true); setMessage("上传结果未知，请先查看已保存记录，核对后再尝试。"); }
    finally { sending.current = false; setBusy(false); }
  }
  const history = claimId ? `/model-usage?claim=${claimId}` : "/model-usage";
  return <section className="claim-confirmation" aria-label="上传模型用量">
    <h3>上传模型用量</h3>
    <p className="detail-note">在原Runner目录运行 <code>node runner.mjs usage-report 任务包.json 报告.json</code>，再选择报告。保存数值与任务关联，来源标为本机自报；代理账单和真实性需另行核验。</p>
    <label className="upload-field">选择用量报告<input type="file" accept=".json,application/json" disabled={busy || uncertain}
      onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage(""); }} /></label>
    <div className="claim-confirmation-actions"><Button className="claim-button" disabled={!file || busy || uncertain} onClick={() => void upload()}>{busy ? "正在上传…" : "上传用量报告"}</Button>
      <Link href={history} prefetch={false}>核对已保存记录</Link>
      {uncertain ? <Button variant="ghost" className="claim-button secondary-action" onClick={() => { setUncertain(false); setMessage(""); }}>已核对记录，允许重试</Button> : null}</div>
    <p role="status">{message}</p>
  </section>;
}
