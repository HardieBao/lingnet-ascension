import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/db/runtime";
import { loadPublicProfile } from "@/lib/cultivator-profile";
import { realmNames } from "@/lib/realms";
import "../../dwelling/dwelling.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "公开修士档案 | 灵网纪元" };

export default async function PublicCultivatorPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const profile = await loadPublicProfile(database(), publicId).catch(() => undefined);
  if (profile === undefined) return <main className="dwelling-page"><h1>档案暂不可用</h1><p>请稍后刷新；这不代表档案已公开或已关闭。</p><Link href="/">返回任务大殿</Link></main>;
  if (!profile) notFound();
  const realm = Object.entries(realmNames).find(([id]) => id === profile.realm)?.[1] ?? "境界待核对";
  return <main className="dwelling-page"><Link href="/">返回任务大殿</Link><header><h1>{profile.daohao}</h1><p>当前境界：{realm}</p></header>
    <p>这是本人主动公开的道号与境界。本站不在这张档案中展示余额、模型费用、提交正文或复核理由。</p>
  </main>;
}
