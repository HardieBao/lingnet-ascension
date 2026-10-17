"use client";

import { useState } from "react";

type Props = { kind: "create" } | { kind: "join"; id: string } |
  { kind: "membership"; id: string; revision: number; visibility: boolean; owner: boolean } |
  { kind: "decision"; id: string; cultivatorId: string; revision: number; active: boolean } |
  { kind: "review" | "archive"; id: string };

export function SectActions(props: Props) {
  const [name, setName] = useState(""), [description, setDescription] = useState(""), [reason, setReason] = useState("");
  const [visible, setVisible] = useState(props.kind === "membership" && props.visibility);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  async function act(operation: string) {
    if (busy || uncertain) return;
    let path = "/api/sects", input: object = { name, description };
    if (props.kind === "review") { path += `/${props.id}/review`; input = { decision: operation, reason }; }
    if (props.kind === "archive") { path += `/${props.id}/archive`; input = { confirm: "archive" }; }
    if (props.kind === "join") { path += `/${props.id}/members`; input = { action: "join", public: visible }; }
    if (props.kind === "membership") {
      path += `/${props.id}/members`;
      input = { action: operation, revision: props.revision, ...(operation === "visibility" ? { public: visible } : {}) };
    }
    if (props.kind === "decision") { path += `/${props.id}/members`; input = { action: operation, cultivatorId: props.cultivatorId, revision: props.revision }; }
    setBusy(true); setMessage("正在处理…");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) {
        const error = data && typeof data === "object" ? Reflect.get(data, "error") : null;
        setMessage(typeof error === "string" ? error : "操作未完成，请刷新核对。");
        if (![400, 401, 403].includes(response.status)) setUncertain(true);
        return;
      }
      window.location.reload();
    } catch { setUncertain(true); setMessage("操作结果未确认，请刷新页面核对。"); }
    finally { setBusy(false); }
  }
  const button = (label: string, operation: string) => <button type="button" disabled={busy || uncertain} onClick={() => void act(operation)}>{label}</button>;
  return <div className="community-form">
    {props.kind === "create" ? <form onSubmit={(event) => { event.preventDefault(); void act("create"); }}>
      <label>宗门名称<input value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} disabled={busy || uncertain} /></label>
      <label>宗门简介<textarea value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} disabled={busy || uncertain} /></label>
      <p className="community-muted">名称1–40字，简介最多500字；通过平台维护者审核后公开。创建者成为宗主，只能管理成员，没有成果审批或调账权限。</p>
      <button type="submit" disabled={busy || uncertain}>提交创建申请</button>
    </form> : null}
    {props.kind === "join" || props.kind === "membership" ? <>
      <label className="community-check"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} disabled={busy || uncertain} />公开我的宗门关联</label>
      <p className="community-muted">成员关系默认私密；宗主可查看申请人的道号并管理成员。贡献同时在洞府选择公开后，才计入公开宗门榜。</p>
      <div className="community-actions">{button(props.kind === "join" ? "申请加入" : "保存公开设置", props.kind === "join" ? "join" : "visibility")}
        {props.kind === "membership" && !props.owner ? <button type="button" disabled={busy || uncertain} onClick={() => setConfirming("leave")}>退出或取消申请</button> : null}</div>
    </> : null}
    {props.kind === "decision" ? <div className="community-actions">{props.active
      ? <button type="button" disabled={busy || uncertain} onClick={() => setConfirming("remove")}>移除成员</button>
      : <>{button("接受加入", "accept")}{button("拒绝申请", "reject")}</>}</div> : null}
    {props.kind === "review" ? <>
      <label>审核理由<textarea value={reason} minLength={8} maxLength={500} required disabled={busy || uncertain} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="community-actions">{button("批准创建", "approve")}{button("驳回创建", "reject")}</div>
    </> : null}
    {props.kind === "archive" ? <button type="button" disabled={busy || uncertain} onClick={() => setConfirming("archive")}>归档宗门</button> : null}
    {confirming ? <section className="community-confirm" aria-label="确认宗门操作"><p>{confirming === "archive"
      ? "确认归档这个宗门？当前成员将退出、停止接受申请；历史成果和游戏资产保留。"
      : "确认结束这项成员关系或申请？个人成果和游戏资产保留。"}</p>
      <div className="community-actions">{button("确认操作", confirming)}<button type="button" disabled={busy || uncertain} onClick={() => setConfirming(null)}>取消</button></div>
    </section> : null}
    <p className="community-status" role="status">{message}</p>
    {uncertain ? <button type="button" onClick={() => window.location.reload()}>刷新页面核对结果</button> : null}
  </div>;
}
