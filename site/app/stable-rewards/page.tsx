import { env } from "cloudflare:workers";
import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { isRecoveryReviewer, lockedStableReward, STABLE_GRANT_TARGETS_SQL, STABLE_SETTLEMENT_RECORDS_SQL,
  type StableGrantTarget, type StableGrantOption, type StableSettlementRecord } from "@/lib/stable-reward-workbench";
import { StableRewardActions } from "./stable-reward-actions";
import "./stable-rewards.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "稳定奖励与回滚复核 | 灵网纪元", description: "指定维护者的稳定游戏奖励核验与独立追回复核。" };
const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" });

export default async function StableRewardsPage() {
  const cultivator = await getCurrentCultivator();
  const maintainer = !!cultivator && isMaintainer(cultivator);
  const recoveryReviewer = !!cultivator && isRecoveryReviewer(cultivator, Reflect.get(env, "RECOVERY_APPROVER_GITHUB_ID"));
  if (!cultivator || (!maintainer && !recoveryReviewer)) return <main className="ledger-page">
    <Link href="/">← 返回任务大殿</Link><h1>需要维护者或独立追回复核人权限</h1><p>此页只向已配置的指定账号开放。</p>
  </main>;
  const enabled = Reflect.get(env, "ENABLE_STABLE_SETTLEMENTS") === "true";
  const db = database();
  const recordsQuery = db.prepare(`${STABLE_SETTLEMENT_RECORDS_SQL}
    ${maintainer ? "" : "WHERE r.settlement_id IS NOT NULL AND (h.settlement_id IS NULL OR h.reviewed_by = ?)"}
    ORDER BY t.settled_at DESC, t.id DESC LIMIT 50`);
  const data = await Promise.all([
    maintainer && enabled ? db.prepare(STABLE_GRANT_TARGETS_SQL).bind(cultivator.id).all<StableGrantTarget>()
      : Promise.resolve({ results: [] as StableGrantTarget[] }),
    maintainer ? recordsQuery.all<StableSettlementRecord>() : recordsQuery.bind(cultivator.id).all<StableSettlementRecord>(),
  ]).catch(() => null);
  const targets: StableGrantOption[] = (data?.[0].results ?? []).flatMap((target) => {
    const reward = lockedStableReward(target.reward_snapshot);
    if (!reward) return [];
    const { submission_id, mission_id, title, author, cultivator_id } = target;
    return [{ submission_id, mission_id, title, author, cultivator_id, reward }];
  });
  return <main className="ledger-page stable-reward-page">
    <Link href="/">← 返回任务大殿</Link>
    <header><h1>稳定奖励与回滚复核</h1><p>这里核对游戏 Token、修为与功德的稳定奖励及追回记录。模型额度和真实费用不在此流程内。</p></header>
    {!enabled ? <section className="adjustment-section"><h2>稳定奖励结算尚未开放</h2>
      <p>新奖励结算入口关闭；已有记录的追回和独立复核仍按各自权限处理。</p></section> : null}
    {!data ? <section className="adjustment-section"><h2>稳定奖励记录暂不可用</h2>
      <p>记录服务尚未就绪，操作入口暂时关闭。请稍后刷新或由维护者核对发布状态。</p></section> : <>
      {maintainer && enabled ? <section className="adjustment-section"><h2>核对新的稳定奖励</h2>
        <p>只列出其他人的正式成果及原认领锁定的稳定奖励。公开版本时间、摘要和当前主分支仍由提交接口重新核验。</p>
        {targets.length ? <StableRewardActions kind="settle" targets={targets} />
          : <p>目前没有可新结算的正式成果；本人作品、已结算成果和缺少锁定快照的旧认领不会列出。</p>}
      </section> : null}
      <section className="stable-reward-history" aria-label="稳定奖励结算与追回记录">
        <h2>{maintainer ? "结算与追回记录" : "待独立复核与本人已处理记录"}</h2>
        <p>显示最近 50 条相关记录，完整资源流水在账本中保留。</p>
        {data[1].results.length === 0 ? <div className="review-empty">暂无相关稳定奖励记录。</div> : data[1].results.map((record) => {
          const revoked = !!record.revocation_id;
          const released = !!record.hold_released_by;
          const selfRecovery = record.cultivator_id === cultivator.id || record.revoked_by === cultivator.id;
          const actionRecord = { id: record.id, title: record.title, author: record.author, cultivator_id: record.cultivator_id,
            token: record.token, cultivation: record.cultivation, merit: record.merit };
          return <article className="review-item stable-reward-record" key={record.id}>
            <div className="review-item-top"><span>{record.mission_id} · {revoked ? released ? "本次复核冻结已解除" : "已追回 · 待独立复核" : "已结算"}</span>
              <time>{dateFormat.format(record.settled_at)}</time></div>
            <h3>{record.title}</h3><p>原作者：{record.author} · {record.cultivator_id}</p>
            <dl className="stable-reward-amounts"><div><dt>游戏 Token</dt><dd>{record.token}</dd></div>
              <div><dt>修为</dt><dd>{record.cultivation}</dd></div><div><dt>功德</dt><dd>{record.merit}</dd></div></dl>
            <p>原结算理由：{record.review_reason}</p>
            <details className="stable-reward-evidence"><summary>查看公开版本与结算来源</summary>
              <dl className="adjustment-record"><dt>结算编号</dt><dd>{record.id}</dd>
                <dt>正式成果编号</dt><dd>{record.submission_id}</dd>
                <dt>首次版本</dt><dd><a href={`https://github.com/HardieBao/lingnet-ascension/releases/tag/${encodeURIComponent(record.first_tag)}`} target="_blank" rel="noopener noreferrer">{record.first_tag}</a> · {record.first_commit}</dd>
                <dt>后续版本</dt><dd><a href={`https://github.com/HardieBao/lingnet-ascension/releases/tag/${encodeURIComponent(record.second_tag)}`} target="_blank" rel="noopener noreferrer">{record.second_tag}</a> · {record.second_commit}</dd>
                <dt>原核对者</dt><dd>{record.reviewed_by}</dd>
              </dl>
            </details>
            {revoked ? <>
              <p>追回理由：{record.revoke_reason}</p>
              <p>已抵消：游戏 Token {record.token_offset} · 修为 {record.cultivation_offset} · 功德 {record.merit_offset}。</p>
              <p>当前账号待抵扣欠账：游戏 Token {record.token_outstanding} · 修为 {record.cultivation_outstanding} · 功德 {record.merit_outstanding}。</p>
              <p>{released ? `本次独立复核已记录：${record.hold_reason}` : "此追回记录仍处于保护性冻结，等待独立复核。"}</p>
              <p>解除本次复核冻结不抹除欠账；其他冻结和未清偿欠账继续限制支出与突破。</p>
              {recoveryReviewer && !released ? selfRecovery
                ? <p>你是原作者或执行追回者，需要其他独立追回复核人处理。</p>
                : <StableRewardActions kind="release" record={actionRecord} /> : null}
            </> : maintainer ? record.cultivator_id === cultivator.id
              ? <p>这是你本人获得的稳定奖励，不能自行核对追回。</p>
              : <StableRewardActions kind="revoke" record={actionRecord} /> : null}
          </article>;
        })}
      </section>
    </>}
  </main>;
}
