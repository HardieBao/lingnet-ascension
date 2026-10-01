"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isCodeArtifactPath } from "@/lib/code-artifact";
import type { ClaimOffer } from "@/lib/claim-quote";

type ClaimSummary = { id: string; state: string; expires_at: number };

export function MissionActions({
  claimOffer,
  missionId,
  missionState,
  occupiedState,
  signedIn,
  signInPath,
  claim,
  atClaimLimit,
  accessReason,
  artifactPath,
  lockReason,
}: {
  claimOffer: ClaimOffer | null;
  missionId: string;
  missionState: string;
  occupiedState: string | null;
  signedIn: boolean;
  signInPath: string;
  claim: ClaimSummary | null;
  atClaimLimit: boolean;
  accessReason: string | null;
  artifactPath: string | null;
  lockReason: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [artifact, setArtifact] = useState<File | null>(null);
  const [pullNumber, setPullNumber] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const releaseButton = useRef<HTMLButtonElement>(null);
  const codeTask = isCodeArtifactPath(artifactPath);
  const validPullNumber = /^[1-9]\d*$/.test(pullNumber.trim()) && Number.isSafeInteger(Number(pullNumber.trim()));

  async function act(url: string, body?: BodyInit, contentType?: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        body,
        headers: contentType ? { "Content-Type": contentType } : undefined,
      });
      const data = await response.json() as {
        error?: string;
        submission?: { verdict?: { passed: boolean; checks: Array<{ passed: boolean; detail: string }> } };
      };
      if (!response.ok) {
        setMessage(data.error || "操作失败，请重试。");
        return false;
      }
      if (data.submission?.verdict && !data.submission.verdict.passed) {
        setMessage("天道审判未通过：" + data.submission.verdict.checks.filter((check: { passed: boolean }) => !check.passed).map((check: { detail: string }) => check.detail).join("；"));
      } else {
        setMessage("操作完成，状态已更新。");
      }
      router.refresh();
      return true;
    } catch {
      setMessage("网络暂不可用，请检查连接后重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (missionState === "done") return <p className="action-status">本悬赏已纳入正式成果。</p>;
  if (claim?.state === "frozen" || occupiedState === "frozen") return <p className="action-status">成果已冻结，等待独立复核。冻结期间仍占用认领席位，不能重跑、提交或主动释放；原租约和押金按复核规则处理。</p>;
  if (missionState !== "open" || !claim && lockReason) return <p className="action-status">{lockReason}</p>;
  if (!claim && occupiedState) return <p className="action-status">{occupiedState === "approved" ? "成果已批准，等待合入公开仓库。" : "此悬赏已有修士认领。"}</p>;
  if (!signedIn) {
    return <><Button asChild className="claim-button"><a href={signInPath}>登录后认领悬赏</a></Button><p className="detail-note">使用 GitHub 身份登录，模型凭据仍留在本机。</p></>;
  }
  if (!claim && accessReason) return <p className="action-status">{accessReason}</p>;
  if (!claim && atClaimLimit) return <p className="action-status">认领席位已满，请从「我的在途悬赏」查看占用记录。冻结任务须等待独立复核，不能主动释放。</p>;
  if (!claim && !claimOffer) return <p className="action-status">认领契约暂不可用，请刷新后核对。</p>;

  return (
    <div className="mission-actions">
      {!claim ? <Button className="claim-button" data-claim-quote={claimOffer?.quote} disabled={busy} aria-expanded={confirming}
        aria-controls="claim-confirmation" onClick={() => { setMessage(""); setConfirming(true); }}>认领悬赏</Button> : null}
      {!claim && confirming && claimOffer ? <section className="claim-confirmation" id="claim-confirmation" aria-labelledby="claim-confirmation-title">
        <h3 id="claim-confirmation-title">核对本次新认领</h3>
        <p>{missionId} · {claimOffer.title}</p>
        <dl>
          <div><dt>任务品阶</dt><dd>{claimOffer.rank}</dd></div>
          <div><dt>固定基线</dt><dd><code>{claimOffer.base_commit.slice(0, 8)}</code></dd></div>
          <div><dt>交付范围</dt><dd><code>{claimOffer.allowed_paths}</code></dd></div>
          <div><dt>游戏押金</dt><dd>冻结 {claimOffer.deposit} 游戏 Token</dd></div>
          <div><dt>模型额度</dt><dd>{claimOffer.model.id}<br />总计 {claimOffer.model.tokenBudget.toLocaleString()} 模型 Token，单次输出最多 {claimOffer.model.maxOutputTokens.toLocaleString()}</dd></div>
          <div><dt>独立接受奖励</dt><dd>{claimOffer.reward_token} 游戏 Token · {claimOffer.reward_cultivation} 修为 · {claimOffer.reward_merit} 功德</dd></div>
        </dl>
        <p>认领占用一个席位，须在 20 分钟内开始闭关。旧认领的租约、模型额度和提交资格不会恢复；本次按新认领重新核验。</p>
        <p>这一步不启动模型，也不确认模型费用。模型 Token 不是游戏灵石或现金价格上限；真实调用仍须先核验代理契约，并在本机单独确认费用。</p>
        <div className="claim-confirmation-actions">
          <Button className="claim-button" disabled={busy} onClick={async () => {
            if (await act("/api/claims", JSON.stringify({ missionId, quote: claimOffer.quote }), "application/json")) setConfirming(false);
          }}>{busy ? "正在认领…" : "核对并认领"}</Button>
          <Button variant="ghost" className="claim-button secondary-action" disabled={busy} onClick={() => { setConfirming(false); setMessage(""); }}>取消，暂不认领</Button>
        </div>
      </section> : null}
      {claim?.state === "claimed" ? <>
        <p className="action-status">已认领，请在 20 分钟内开跑。</p>
        <Button className="claim-button" disabled={busy} onClick={() => act(`/api/claims/${claim.id}/start`)}>开始闭关</Button>
      </> : null}
      {claim?.state === "running" ? <>
        <p className="action-status">闭关中 · 租约有效至 {new Date(claim.expires_at).toLocaleTimeString("zh-CN")}</p>
        <p className="detail-note">新认领按任务包锁定总额度 30,000 模型 Token，单次输出最多 2,048；重试共用余额。这不是游戏 Token，也不是现金价格上限。旧版无预算任务包只能离线预检，请释放后重新认领。</p>
        <p className="detail-note">把下方九个 Runner 文件下载到同一目录，先运行 <code>node runner.mjs doctor</code>，按提示准备 Docker 隔离镜像。只有代理限额契约已核验，且确认承担模型费用后，才可运行 <code>node --env-file=.env.local runner.mjs run 任务包.json --ack-model-costs</code>。密钥只供本机可信网关使用，不交给模型或上传平台；当前代理尚未核验，真实调用默认关闭。</p>
        <p className="detail-note">v4 任务包支持元神印记：每位修士本机共用 1 槽，储物袋后 2 槽；基础保留 24 小时，护心符每认领可在失败后延长一次 24 小时。用 <code>node runner.mjs checkpoints 任务包.json</code> 查看，恢复命令为 <code>node --env-file=.env.local runner.mjs resume 任务包.json 检查点编号 --ack-model-costs</code>。每个印记只能恢复一次，不延长租约、不补模型额度；只恢复限定产物并重建上下文，不保存私人会话。用量不明时仍停止模型调用。</p>
        <p className="detail-note">功法基础 1 槽，传功玉简后 2 槽。运行 <code>node runner.mjs preset-ui 任务包.json</code>，在它给出的本机地址创建、导入导出或明确删除功法；此页不启动模型，也不需要私密环境配置。在终端输入 stop 或按 Ctrl+C 停止，已存功法保留。已有 <code>preset-save</code>、<code>presets</code> 命令继续可用。实际运行仍须手动追加 <code>--preset 功法编号</code>（放在费用确认参数前）；不允许密钥、任意命令或提高任务预算。</p>
        {codeTask
          ? <p className="detail-note code-task-note">Runner 仅产出指定文件。装备演算阵盘后会自动执行本地测试、类型、lint和构建；也可用 <code>node runner.mjs preflight 任务包.json 成果文件</code> 手动预检。固定基线缺少可信检查配置时不能开检。把成果提交到本仓库的 Fork，向 main 发起只修改该文件的 PR；仍须远端可信 CI 通过，再填写 PR 编号并等待独立复核。本地或PR通过都不等于正式奖励。</p>
          : <p className="detail-note">装备演算阵盘后，Runner 会在生成成果后自动执行本地结构预检。修改成果后也可运行 <code>node runner.mjs preflight 任务包.json 成果.md</code>；本地通过仍需服务端独立审判和宗门复核。</p>}
        <a href={`/api/claims/${claim.id}/manifest`} download>下载任务包</a>
        <a href="/runner.mjs" download>下载本地 Runner</a>
        <a href="/runner-sandbox.mjs" download>下载隔离执行模块</a>
        <a href="/runner-workspace.mjs" download>下载限额工作区模块</a>
        <a href="/budget-gateway.mjs" download>下载本机预算网关</a>
        <a href="/runner-checkpoints.mjs" download>下载检查点恢复模块</a>
        <a href="/runner-presets.mjs" download>下载功法预设模块</a>
        <a href="/runner-preset-workbench.mjs" download>下载本机功法管理模块</a>
        <a href="/runner-preset-ui.mjs" download>下载本机功法页面</a>
        <a href="/runner.Dockerfile" download>下载隔离镜像构建文件</a>
        {codeTask ? <>
          <label className="upload-field" htmlFor="code-pr-number">GitHub PR 编号
            <input id="code-pr-number" type="text" inputMode="numeric" autoComplete="off" maxLength={12}
              aria-describedby="code-pr-hint" value={pullNumber} onChange={(event) => setPullNumber(event.target.value)}
              placeholder="例如 27" />
          </label>
          <p id="code-pr-hint" className="detail-note code-task-note">仅接受本人提交、文件范围符合认领契约且可信 CI 已通过的 PR。</p>
          <Button className="claim-button" disabled={busy || !validPullNumber} onClick={() =>
            act("/api/code-submissions", JSON.stringify({ claimId: claim.id, pullNumber: Number(pullNumber.trim()) }), "application/json")
          }>提交代码成果复核</Button>
        </> : <>
          <label className="upload-field">上传 {artifactPath ?? "任务成果"} Markdown
            <input type="file" accept=".md,text/markdown" onChange={(event) => setArtifact(event.target.files?.[0] ?? null)} />
          </label>
          <Button className="claim-button" disabled={busy || !artifact} onClick={() => {
            if (!artifact) return;
            const form = new FormData();
            form.set("claimId", claim.id);
            form.set("artifact", artifact);
            void act("/api/submissions", form);
          }}>提交天道审判</Button>
        </>}
        <Button ref={releaseButton} variant="ghost" className="claim-button secondary-action" disabled={busy}
          aria-expanded={releasing === claim.id} aria-controls="release-confirmation"
          onClick={() => { setMessage(""); setReleasing(claim.id); }}>释放任务</Button>
        {releasing === claim.id ? <section className="claim-confirmation release-confirmation" id="release-confirmation" aria-labelledby="release-confirmation-title">
          <h3 id="release-confirmation-title">确认释放本次认领</h3>
          <p>{missionId} · 本次认领将结束，不能再向平台提交成果。成功释放后退回游戏押金，不发任务奖励；已用模型额度不会补回。</p>
          <p>请先停止本机 Runner。平台释放不会替你停止模型程序。</p>
          <p>若结果不明确，请先刷新核对认领和账本，不要反复确认。</p>
          <div className="claim-confirmation-actions">
            <Button variant="ghost" className="claim-button secondary-action" disabled={busy} onClick={() => {
              setReleasing(null); releaseButton.current?.focus();
            }}>继续闭关，不释放</Button>
            <Button className="claim-button" disabled={busy} onClick={async () => {
              if (await act(`/api/claims/${claim.id}/release`)) setReleasing(null);
            }}>{busy ? "正在处理…" : "确认释放本次认领"}</Button>
            {message ? <Button variant="ghost" className="claim-button secondary-action" disabled={busy}
              onClick={() => router.refresh()}>刷新认领与账本</Button> : null}
          </div>
        </section> : null}
      </> : null}
      {claim?.state === "review" || claim?.state === "submitted" ? <p className="action-status">{codeTask ? "PR 来源与可信 CI 已核验，等待宗门复核；合入前不发放正式奖励。" : "机器结构检查已通过，等待宗门复核；此时尚未发放奖励。"}</p> : null}
      {claim?.state === "approved" ? <p className="action-status">宗门已批准，等待成果合入公开仓库；正式奖励尚未结算。</p> : null}
      {message ? <p className="action-message" role="status">{message}</p> : null}
    </div>
  );
}
