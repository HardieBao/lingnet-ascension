import "./season.css";

export default function SeasonLoading() {
  return <main className="season-page" aria-busy="true"><h1>赛季进度</h1><p role="status">正在读取平台记录。未确认的数据保持未知，不显示为零。</p></main>;
}
