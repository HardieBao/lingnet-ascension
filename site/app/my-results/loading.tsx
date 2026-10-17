import "./my-results.css";

export default function MyResultsLoading() {
  return <main className="my-results-page" aria-busy="true"><h1>本人纳入记录</h1><p role="status">正在核对登录与本人记录…</p><p>尚未确认的数据不记作零，不启动模型或结算奖励。</p></main>;
}
