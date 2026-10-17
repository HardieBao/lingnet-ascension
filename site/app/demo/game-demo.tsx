"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createDemoState, demoAction, DEMO_REWARDS, type DemoAction, type DemoPhase, type DemoRank } from "@/lib/demo-game";
import { equipmentCatalog } from "@/lib/equipment";
import { assessBreakthrough, realmNames } from "@/lib/realms";
import { MODEL_CONTRACT } from "@/lib/model-budget";
import "./demo.css";

const phases: Record<DemoPhase, string> = { claimed: "已认领", generated: "模拟推演完成", submitted: "已模拟提交", verified: "模拟审判通过", reviewed: "模拟复核接受", completed: "已模拟纳入并结算" };
const nextActions: Partial<Record<DemoPhase, { type: "run" | "submit" | "judge" | "review" | "settle"; label: string }>> = {
  claimed: { type: "run", label: "模拟 Runner 推演" }, generated: { type: "submit", label: "模拟提交产物" },
  submitted: { type: "judge", label: "模拟天道审判" }, verified: { type: "review", label: "模拟维护者乙复核" },
  reviewed: { type: "settle", label: "模拟纳入与结算" },
};
const taskNames: Record<DemoRank, string> = { "黄阶": "合成任务：整理一份贡献说明", "玄阶": "合成任务：补齐交互与验证", "地阶": "合成任务：实现模块与回归" };

export function GameDemo() {
  const [state, setState] = useState(createDemoState);
  const [tab, setTab] = useState("任务历练");
  const [confirmItem, setConfirmItem] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [guild, setGuild] = useState(false);
  const active = !!state.claim && state.claim.phase !== "completed";
  const next = assessBreakthrough(state.realm, { ...state, trialPassed: true });
  const action = state.claim ? nextActions[state.claim.phase] : undefined;
  const equipped = state.items.filter((item) => item.equipped).map((item) => item.itemId);
  const leaderboard = [{ name: "演示修士甲（你）", merit: state.merit, results: state.formalResults },
    { name: "演示修士乙（合成）", merit: 10, results: 2 }].sort((a, b) => b.merit - a.merit || b.results - a.results);
  function act(input: DemoAction) { setState((current) => demoAction(current, input)); }
  function fastComplete() {
    setState((current) => {
      let result = current;
      for (const type of ["run", "submit", "judge", "review", "settle"] as const) result = demoAction(result, { type });
      return result;
    });
  }
  return <main className="demo-page">
    <div className="demo-disclosure"><strong>模拟演示 · 非生产 MVP</strong><span>全部账号、任务、审批、用量、账本和版本均为合成数据。没有真实模型调用、数据库或 GitHub 操作。</span></div>
    <header className="demo-heading"><div><h1>灵网纪元</h1><p>认领、闭关、结算、装备、渡劫。先体验一条完整玩法。</p></div><div><Button variant="outline" onClick={() => setResetting(true)}>重置演示</Button></div></header>
    {resetting ? <section className="demo-reset" aria-label="确认重置"><p>清除本页全部模拟进度？真实账号与数据不会受影响。</p><Button variant="outline" onClick={() => setResetting(false)}>取消重置</Button><Button onClick={() => { setState(createDemoState()); setGuild(false); setConfirmItem(null); setResetting(false); }}>确认重置模拟数据</Button></section> : null}
    <div className="demo-layout">
      <aside className="demo-cultivator"><h2>演示修士甲</h2><p className="demo-realm" data-testid="demo-realm">{realmNames[state.realm]}</p><p>本页临时状态，刷新会重置。</p>
        <dl><div><dt>模拟可用游戏 Token</dt><dd data-testid="demo-token">{state.token.toLocaleString()}</dd></div><div><dt>模拟冻结游戏 Token</dt><dd data-testid="demo-locked">{state.tokenLocked.toLocaleString()}</dd></div><div><dt>模拟修为</dt><dd>{state.cultivation.toLocaleString()}</dd></div><div><dt>模拟功德</dt><dd>{state.merit.toLocaleString()}</dd></div><div><dt>已纳入演示产物</dt><dd data-testid="demo-results">{state.formalResults}</dd></div></dl>
        <p>游戏 Token 不等于模型额度或现金。没有充值、交易或提现。</p>
        <h3>境界进度</h3><ol className="demo-realms">{Object.entries(realmNames).map(([id, name]) => <li key={id} aria-current={id === state.realm ? "step" : undefined}>{name}{id === state.realm ? " · 当前" : ""}</li>)}</ol>
        {state.realm === "core" ? <p>金丹模拟体验已完成。真实发布验收仍未完成，元婴及以上锁定。</p> : <><p>下一境界：{next.target ? realmNames[next.target] : "锁定"}</p><ul className="demo-missing">{next.missing.map((item) => <li key={item}>{item}</li>)}</ul><Button className="demo-realm-action" disabled={active || !next.eligible} onClick={() => act({ type: next.rule?.trial ? "trial" : "advance" })}>{next.rule?.trial ? "开始模拟渡劫" : "模拟突破炼气"}</Button></>}
        <p>渡劫只冻结模拟游戏 Token；未成功退出全额解冻，成功才消费费用。</p>
      </aside>
      <div className="demo-workspace">
        <nav className="demo-tabs" aria-label="演示功能">{["任务历练", "装备洞府", "宗门榜单", "版本与账本"].map((name) => <button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
        <div className="demo-mobile-summary"><p>演示修士甲 · {realmNames[state.realm]}<br />模拟游戏 Token：{state.token}可用 / {state.tokenLocked}冻结</p>{state.realm !== "core" ? <Button disabled={active || !next.eligible} onClick={() => act({ type: next.rule?.trial ? "trial" : "advance" })}>{next.rule?.trial ? "开始模拟渡劫" : "模拟突破炼气"}</Button> : <p>金丹模拟体验已完成。</p>}</div>
        <p className="demo-message" role="status" aria-live="polite">{state.message}</p>
        {tab === "任务历练" ? <section aria-labelledby="demo-task-title"><h2 id="demo-task-title">任务历练</h2><p>先完成黄阶并突破炼气，再完成3次玄阶达到筑基资格。筑基后完成5次地阶、模拟复验另一修士成果，再体验金丹渡劫。可逐步操作，也可快速播放当前合成任务。</p>
          {!active ? <div className="demo-offers">{(["黄阶", "玄阶", "地阶"] as const).map((rank) => {
            const locked = rank === "玄阶" && state.realm === "mortal" || rank === "地阶" && (state.realm === "mortal" || state.realm === "qi");
            const reward = DEMO_REWARDS[rank];
            return <article key={rank}><div><h3>{taskNames[rank]}</h3><p>{rank} · 模拟基础奖励 {reward.token}游戏 Token / {reward.cultivation}修为 / {reward.merit}功德，另有模拟纳入奖励。</p></div><Button disabled={locked} onClick={() => act({ type: "claim", rank })}>{locked ? "境界未解锁" : `认领${rank}演示任务`}</Button></article>;
          })}</div> : null}
          {state.claim ? <div className="demo-current"><h3>{state.claim.trial ? `${realmNames[state.claim.trial]} · 模拟渡劫` : `${state.claim.rank} · 当前合成任务`}</h3><p data-testid="demo-phase">{phases[state.claim.phase]}</p><p>本次模拟模型用量：{state.claim.modelUsed.toLocaleString()} / {MODEL_CONTRACT.tokenBudget.toLocaleString()}模型 Token；单次输出上限 {MODEL_CONTRACT.maxOutputTokens}。真实模型未调用。</p><p>模拟额度随失败保留，不靠游戏 Token 补充。模拟维护者乙是合成角色，不代表真人独立批准。</p>
            <div className="demo-actions">{action ? <Button onClick={() => act({ type: action.type })}>{action.label}</Button> : null}{active ? <Button variant="outline" onClick={fastComplete}>快速播放当前模拟任务链</Button> : null}{active ? <Button variant="outline" onClick={() => act({ type: "withdraw" })}>退出并全额解冻</Button> : null}</div>
            {state.claim.phase === "submitted" ? <Button variant="outline" onClick={() => act({ type: "judge", failure: true })}>注入模拟审判失败</Button> : null}
            {state.claim.phase === "completed" ? <Button variant="outline" onClick={() => act({ type: "settle" })}>验证重复结算不重复发奖</Button> : null}
          </div> : <p className="demo-empty">选择一项已解锁的合成任务开始。认领本身不启动真实模型，也不发奖励。</p>}
          {state.realm === "foundation" && !state.independentReviews ? <div className="demo-current"><h3>金丹前置：模拟独立复验</h3><p>模拟核对另一位合成修士的成果；作者不能复验自己的提交。此处不创建真实复验报告或奖励。</p><Button disabled={active} onClick={() => act({ type: "revalidate", author: "other" })}>模拟采纳另一修士的复验</Button></div> : null}
        </section> : null}
        {tab === "装备洞府" ? <section><h2>装备洞府</h2><p>价格沿用当前目录。购买入库与装备分开，不改变审判结果。这里的效果只作模拟面板预览，不执行真实 Runner。</p><p>当前模拟检查点槽：{equipped.includes("storage-bag") ? 2 : 1}；功法槽：{equipped.includes("teaching-slip") ? 2 : 1}。本演示按单任务操作，不模拟并发 Runner。</p>
          <div className="demo-offers">{equipmentCatalog.map((item) => { const owned = state.items.find((entry) => entry.itemId === item.id); return <article key={item.id}><div><h3>{item.name}</h3><p>{item.price}模拟游戏 Token · {item.effect}</p><p>{item.boundary}</p><p>{owned ? owned.equipped ? "模拟已装备" : "模拟已拥有，未装备" : "模拟未拥有"}</p></div><div className="demo-actions">{owned ? <Button variant="outline" onClick={() => act({ type: "equip", itemId: item.id })}>{owned.equipped ? `卸下${item.name}` : `装备${item.name}`}</Button> : <Button disabled={state.token < item.price} onClick={() => setConfirmItem(item.id)}>购买{item.name}</Button>}
            {confirmItem === item.id && !owned ? <div className="demo-purchase"><p>确认使用{item.price}模拟游戏 Token 购买{item.name}？不启动模型，不修改真实账号。</p><Button variant="outline" onClick={() => setConfirmItem(null)}>取消购买</Button><Button onClick={() => { act({ type: "buy", itemId: item.id }); setConfirmItem(null); }}>确认模拟购买</Button></div> : null}</div></article>; })}</div>
        </section> : null}
        {tab === "宗门榜单" ? <section><h2>演示宗门与天骄榜</h2><p>全部合成角色。排序只按模拟功德、模拟纳入产物，不按消费。不会创建真实宗门或成员记录。</p><Button variant="outline" onClick={() => setGuild(!guild)}>{guild ? "退出模拟宗门" : "加入模拟宗门"}</Button><p>{guild ? "你已加入演示宗门 · 灵网试炼。退出不会删除个人模拟贡献。" : "尚未加入演示宗门。"}</p><table className="demo-ranking"><thead><tr><th>合成修士</th><th>模拟功德</th><th>模拟产物</th></tr></thead><tbody>{leaderboard.map((entry) => <tr key={entry.name}><td>{entry.name}</td><td>{entry.merit}</td><td>{entry.results}</td></tr>)}</tbody></table></section> : null}
        {tab === "版本与账本" ? <section><h2>演示版本与账本</h2><p>这只是当前浏览器的模拟批次，不是公开 Release，不代表三周运行或25个真实社区成果。</p><p>当前模拟纳入：{state.formalResults}项；真实社区成果不由此页面统计。</p><ol className="demo-ledger">{state.ledger.map((entry, index) => <li key={index}>{entry}</li>)}</ol></section> : null}
      </div>
    </div>
    <footer>本地可玩演示。刷新或重置会清除模拟进度；真实 MVP 门槛、审批、费用与生产状态不因此改变。</footer>
  </main>;
}
