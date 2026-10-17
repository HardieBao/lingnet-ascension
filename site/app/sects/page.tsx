import Link from "next/link";
import { database } from "@/db/runtime";
import { getCurrentCultivator, isMaintainer } from "@/lib/auth";
import { loadSectBoard } from "@/lib/contributions";
import { loadOwnSectState } from "@/lib/sects";
import { SectActions } from "./sect-actions";
import "../community.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "宗门 | 灵网纪元" };
async function load() {
  const actor = await getCurrentCultivator(), db = database();
  const [sects, own] = await Promise.all([loadSectBoard(db), actor ? loadOwnSectState(db, actor.id, isMaintainer(actor)) : null]);
  return { actor, sects, own };
}
export default async function SectsPage() {
  const data = await load().catch(() => null);
  return <main className="community-page"><Link href="/">返回任务大殿</Link><h1>宗门</h1>
    <p>围绕真实任务协作。每位修士同时加入或申请一个宗门，退出后保留个人贡献。</p>
    <nav><Link href="/leaderboard" prefetch={false}>贡献榜</Link><Link href="/dwelling" prefetch={false}>我的洞府与隐私设置</Link></nav>
    {!data ? <section className="community-section"><h2>宗门记录暂不可用</h2><p>请稍后刷新，当前数据状态未知。</p></section> : <>
      <section className="community-section"><h2>宗门目录与贡献</h2><p className="community-muted">仅统计同时公开宗门关联及个人贡献的成员，按功德、纳入任务数排序。最多展示100个宗门；私密成员不计入这些公开统计。</p>
        {!data.sects.length ? <p>尚无通过审核的宗门。</p> : data.sects.map((sect) => <article className="community-row" key={sect.id}>
          <h3>{sect.name}</h3><p>{sect.description || "暂无简介"}</p><p>公开贡献成员 {sect.publicMembers} · 功德 {sect.merit} · 纳入任务 {sect.results}</p>
          {data.actor && !data.own?.memberships.length ? <SectActions kind="join" id={sect.id} /> : null}
        </article>)}
        {!data.actor ? <a href="/api/auth/github">登录后申请加入或创建宗门</a> : null}
      </section>
      {data.own ? <>
        <section className="community-section"><h2>我的宗门与申请</h2>
          {!data.own.memberships.length ? <p>尚无当前成员关系或待处理申请。</p> : data.own.memberships.map((member) => <article className="community-row" key={member.sectId}>
            <h3>{member.sectName}</h3><p>{member.state === "active" ? member.owner ? "宗主" : "已加入" : "申请待审核"} · {member.public ? "关联已设为公开" : "关联仅本人和宗主可见"}</p>
            {member.state === "active" ? <SectActions kind="membership" id={member.sectId} revision={member.revision} visibility={!!member.public} owner={!!member.owner} /> : !member.owner
              ? <SectActions kind="membership" id={member.sectId} revision={member.revision} visibility={!!member.public} owner={false} /> : <p>正在等待另一位平台维护者审核。</p>}
          </article>)}
        </section>
        <section className="community-section"><h2>创建与管理</h2>
          {!data.own.memberships.length && !data.own.owned.some((sect) => ["pending", "active"].includes(sect.state)) ? <SectActions kind="create" /> : null}
          {data.own.owned.map((sect) => <article className="community-row" key={sect.id}><h3>{sect.name}</h3>
            <p>状态：{({ pending: "待审核", active: "已开放", rejected: "已驳回", archived: "已归档" } as Record<string, string>)[sect.state] ?? "未知"}</p>
            {sect.reviewReason ? <p>审核理由：{sect.reviewReason}</p> : null}
            {["pending", "active"].includes(sect.state) ? <SectActions kind="archive" id={sect.id} /> : null}
            {data.own?.requests.filter((member) => member.sectId === sect.id && !member.owner).map((member) => <div className="community-row" key={member.cultivatorId}>
              <h3>{member.daohao}</h3><p>{member.state === "pending" ? "加入申请" : "当前成员"} · {member.public ? "关联公开" : "关联私密"}</p>
              <SectActions kind="decision" id={sect.id} cultivatorId={member.cultivatorId} revision={member.revision} active={member.state === "active"} />
            </div>)}
          </article>)}
        </section>
        {data.actor && isMaintainer(data.actor) ? <section className="community-section"><h2>平台创建审核</h2>
          {!data.own.pending.length ? <p>没有待审核的创建申请。</p> : data.own.pending.map((sect) => <article className="community-row" key={sect.id}>
            <h3>{sect.name}</h3><p>{sect.description}</p>{sect.ownerId === data.actor?.id ? <p>本人创建的宗门须由另一位维护者审核。</p> : <SectActions kind="review" id={sect.id} />}
          </article>)}
        </section> : null}
      </> : null}
    </>}
  </main>;
}
