"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { parseProfileUpdate, type CultivatorProfile } from "@/lib/cultivator-profile";

export function ProfileSettings({ initial }: { initial: CultivatorProfile }) {
  const [profile, setProfile] = useState(initial);
  const [daohao, setDaohao] = useState(initial.daohao);
  const [visible, setVisible] = useState(initial.public);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [signedOut, setSignedOut] = useState(false);

  async function requestProfile(save: boolean) {
    const input = { daohao, public: visible, revision: profile.revision };
    if (save && !parseProfileUpdate(input)) { setMessage("道号须为1–32个字，不能包含控制字符。"); return; }
    setBusy(true);
    setMessage(save ? "正在保存…" : "正在读取当前档案…");
    try {
      const response = await fetch("/api/profile", { cache: "no-store", ...(save ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      } : {}) });
      const result: unknown = await response.json();
      if (!response.ok) {
        const error: unknown = result && typeof result === "object" ? Reflect.get(result, "error") : null;
        setMessage(typeof error === "string" ? error : "操作未完成，请核对当前档案。");
        setSignedOut(response.status === 401);
        if (!save || response.status !== 400 && response.status !== 403) setUnconfirmed(true);
        return;
      }
      const row: unknown = result && typeof result === "object" ? Reflect.get(result, "profile") : null;
      if (!row || typeof row !== "object") throw new Error("Invalid profile response");
      const name: unknown = Reflect.get(row, "daohao");
      const publicValue: unknown = Reflect.get(row, "public");
      const revision: unknown = Reflect.get(row, "revision");
      const publicId: unknown = Reflect.get(row, "publicId");
      if (typeof name !== "string" || typeof publicValue !== "boolean" || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 ||
          !(publicId === null || typeof publicId === "string" && /^[0-9a-f-]{36}$/.test(publicId))) throw new Error("Invalid profile response");
      const current = { daohao: name, public: publicValue, revision, publicId };
      setProfile(current); setDaohao(current.daohao); setVisible(current.public);
      setUnconfirmed(false); setSignedOut(false);
      setMessage(save ? `已保存，当前${current.public ? "公开道号与境界" : "仅本人可见"}。`
        : `已核对当前档案：${current.public ? "公开道号与境界" : "仅本人可见"}。请重新确认后再修改。`);
    } catch {
      setUnconfirmed(true);
      setMessage("暂时无法确认结果。请先只读刷新档案核对，不要重复保存。");
    } finally { setBusy(false); }
  }

  return <section className="dwelling-section" aria-labelledby="profile-title">
    <h2 id="profile-title">道号与隐私</h2>
    <p>当前：{profile.public ? "道号与境界已公开" : "仅本人可见"}。修改字段不会自动保存。</p>
    <form onSubmit={(event) => { event.preventDefault(); if (!busy && !unconfirmed) void requestProfile(true); }}>
      <fieldset disabled={busy || unconfirmed} aria-label="档案设置">
        <label className="profile-name">道号
          <input value={daohao} maxLength={64} required autoComplete="nickname" aria-describedby="daohao-help"
            onChange={(event) => setDaohao(event.target.value)} />
        </label>
        <p id="daohao-help">1–32个字，不改变 GitHub 登录身份。</p>
        <label className="profile-visibility"><input type="checkbox" checked={visible} aria-describedby="profile-privacy-help"
          onChange={(event) => setVisible(event.target.checked)} />公开我的道号与境界</label>
        <p id="profile-privacy-help">只公开这两项。余额、模型费用、认领记录、提交正文和复核理由仍仅在原有授权范围内可见。关闭后停止本站新增公开展示，已被他人复制的信息无法撤回。</p>
        <p>保存时将{visible ? "公开道号与境界" : "设为仅本人可见"}；不启动模型，也不扣除游戏 Token。</p>
      </fieldset>
      <div className="profile-actions">
        <Button type="submit" disabled={busy || unconfirmed}>{busy ? "正在处理…" : "保存道号与隐私"}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void requestProfile(false)}>只读刷新档案核对</Button>
      </div>
      <p className="profile-message" role="status" aria-live="polite">{message}</p>
      {signedOut ? <a href="/api/auth/github">重新登录后核对</a> : null}
    </form>
    {profile.public && profile.publicId ? <a href={`/cultivators/${profile.publicId}`} target="_blank" rel="noreferrer">查看公开的道号与境界（新窗口）</a> : null}
  </section>;
}
