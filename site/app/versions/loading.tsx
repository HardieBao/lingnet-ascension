import "./versions.css";

export default function VersionsLoading() {
  return <main className="versions-page" aria-busy="true"><h1>公开版本</h1><p role="status">正在读取公开版本来源…</p><p>尚未确认的记录不记作零，不启动模型或结算奖励。</p></main>;
}
