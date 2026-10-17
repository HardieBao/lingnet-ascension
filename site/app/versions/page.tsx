import Link from "next/link";
import { loadPublishedVersions } from "@/lib/published-versions";
import { versionsPageNumber } from "@/lib/published-versions-http";
import "./versions.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "公开版本 | 灵网纪元" };

const direction = `<!-- THESIS: Browse actual public Release observations, never substitute demo progress or approval.
OWN-WORLD: Existing dark green read surface, mint links, flat rows and readable system type.
STORY: Identify publication flags and tag evidence, follow a fixed source link or page, distinguish empty from unavailable.
FIRST VIEWPORT: Scope and page controls above a linear version list; narrow screens keep the same reading order.
FORM: versions-read-extension, precisely scoped incumbent-world companion without new composition or paid design.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->`;

export default async function VersionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const page = Object.keys(params).some((key) => key !== "page") ? null : versionsPageNumber(params.page);
  const result = page === null ? null : await loadPublishedVersions(page);
  return <main className="versions-page">
    <template dangerouslySetInnerHTML={{ __html: direction }} />
    <Link href="/" prefetch={false}>返回任务大殿</Link>
    <header><h1>公开版本</h1><p>读取本项目已公开的 GitHub Release，区分正式版、预发布版与标签证据。这里只浏览记录，不创建版本或结算奖励。</p></header>
    <form className="versions-controls" action="/versions" method="get">
      <label htmlFor="versions-page-number">页码<input id="versions-page-number" name="page" type="number" min="1" step="1" defaultValue={page ?? 1} required /></label>
      <button type="submit">查看此页</button>
    </form>
    {result === null ? <section className="versions-state"><h2>页码无效</h2><p>请输入单个正整数页码。没有读取其他版本或修改记录。</p><Link href="/versions" prefetch={false}>返回第一页</Link></section> :
      result.state === "unavailable" ? <section className="versions-state" role="status"><h2>暂不能读取公开版本</h2><p>版本来源暂不可用，当前状态未知，不记作零。请稍后重新读取。</p><Link href={`/versions?page=${page}`} prefetch={false}>重新读取此页</Link></section> : <>
        <p className="versions-summary">第{result.page}页，每页最多5条公开记录。不是完整成果计数或“三周版本”验收结果。</p>
        {result.versions.length === 0 ? <section className="versions-state"><h2>本页没有公开版本记录</h2><p>不使用合成任务、普通 Git 标签或本地演示补齐版本。可查看仓库的公开记录，或返回任务大殿。</p></section> :
          <section aria-label="公开版本列表">{result.versions.map((version) => <article className="version-row" key={version.releaseId}>
            <h2>{version.tag}</h2>
            <div className="version-flags"><span>{version.prerelease ? "预发布版" : "正式版记录"}</span><span>{version.immutable === null ? "冻结状态未知" : version.immutable ? "GitHub标记已冻结" : "未冻结，标签可能变化"}</span></div>
            <p>发布时间（UTC）：<time dateTime={new Date(version.publishedAt).toISOString()}>{new Date(version.publishedAt).toISOString().replace("T", " ").slice(0, 19)}</time></p>
            {version.commit ? <><p>本次核对的标签提交：<code>{version.commit}</code></p><a href={`https://github.com/HardieBao/lingnet-ascension/commit/${version.commit}`}>查看此提交源码</a></> : <p className="versions-warning">标签提交暂无法核验；不以主分支或猜测值替代。</p>}
            <a href={`https://github.com/HardieBao/lingnet-ascension/releases/tag/${encodeURIComponent(version.tag)}`}>查看GitHub版本记录</a>
            <Link href={`/results?release=${version.releaseId}`} prefetch={false}>核对版本成果</Link>
          </article>)}</section>}
        <nav className="versions-pagination" aria-label="版本分页">
          {result.page > 1 ? <Link href={`/versions?page=${result.page - 1}`} prefetch={false}>上一页</Link> : <span>已在第一页</span>}
          {result.nextPage ? <Link href={`/versions?page=${result.nextPage}`} prefetch={false}>下一页</Link> : <span>来源未提供下一页</span>}
        </nav>
      </>}
    <footer><p>版本元数据不等于可玩构建、独立审阅或成果有效性证明。未冻结标签的提交只是本次观察，不是发布时的固定提交；请进入版本成果逐条核对。本页不披露平台账户、余额、正文或复核理由。</p><a href="https://github.com/HardieBao/lingnet-ascension/releases">查看仓库公开版本</a></footer>
  </main>;
}
