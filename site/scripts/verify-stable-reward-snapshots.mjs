import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Agreed public seam: claim → downloaded reward contract. Local synthetic accounts only.
const site=resolve(dirname(fileURLToPath(import.meta.url)),".."),server=join(site,"dist","server");
const temporary=await mkdtemp(join(tmpdir(),"lingnet-stable-snapshots-")),secret="synthetic-stable-snapshot-session";
const paths=(await readdir(server,{recursive:true})).filter(path=>/\.(?:m?js)$/.test(path))
  .sort((a,b)=>a==="index.js"?-1:b==="index.js"?1:a.localeCompare(b));
const modules=await Promise.all(paths.map(async path=>({type:"ESModule",path:join(server,path),contents:await readFile(join(server,path),"utf8")})));
const mf=new Miniflare(convertV4MiniflareOptions({cf:false,host:"127.0.0.1",port:0,d1Persist:join(temporary,"d1"),workers:[{
  name:"application",rootPath:server,modules,compatibilityDate:"2026-09-27",compatibilityFlags:["nodejs_compat"],
  d1Databases:{DB:"stable-snapshots"},bindings:{SESSION_SECRET:secret},outboundService:()=>{throw new Error("No external services in snapshot verification");},
}]}));
try {
  const db=await mf.getD1Database("DB"),now=Date.now();
  for(const file of (await readdir(join(site,"drizzle"))).filter(name=>name.endsWith(".sql")).sort()) {
    for(const sql of (await readFile(join(site,"drizzle",file),"utf8")).split("--> statement-breakpoint").filter(sql=>sql.trim()))await db.prepare(sql).run();
  }
  const api=async(actor,path,input)=>{
    const signed=Buffer.from(JSON.stringify({sub:actor,ver:0,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
    const response=await mf.dispatchFetch(`http://fixture.local${path}`,{method:input===undefined?"GET":"POST",headers:{
      Cookie:`lingnet_session=${signed}.${createHmac("sha256",secret).update(signed).digest("base64url")}`,
      Origin:"http://fixture.local","Content-Type":"application/json"},...(input===undefined?{}:{body:JSON.stringify(input)})});
    assert(response.ok,`${response.status}: ${await response.clone().text()}`);return response.json();
  };
  for(const [index,rank,token,merit,expected] of [
    [0,"黄阶",53,7,{policyVersion:1,token:10,cultivation:20,merit:1,minimumVersionGapMs:604800000}],
    [1,"玄阶",150,20,{policyVersion:1,token:30,cultivation:80,merit:4,minimumVersionGapMs:604800000}],
    [2,"地阶",500,60,{policyVersion:1,token:100,cultivation:250,merit:12,minimumVersionGapMs:604800000}],
    [3,"天阶",1500,150,{policyVersion:1,token:300,cultivation:800,merit:30,minimumVersionGapMs:604800000}],
  ]) {
    const actor=`github:${9100+index}`,mission=`PLAT-STABLE-${index}`;
    await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github',?,'Synthetic','Synthetic',?)").bind(actor,String(9100+index),now).run();
    await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,deposit,budget_tokens,contract_ready,created_at) VALUES (?,'Synthetic','Synthetic only',?,'code','open',?,'site/lib/small-json.ts','Synthetic only',?,100,?,0,30000,1,?)").bind(mission,rank,"a".repeat(40),token,merit,now).run();
    const claim=(await api(actor,"/api/claims",{missionId:mission})).claim;
    await api(actor,`/api/claims/${claim.id}/start`,{});
    const original=await api(actor,`/api/claims/${claim.id}/manifest`);
    assert.deepEqual(original.payload.gameReward.stable,expected);
    assert.equal(original.payload.gameReward.token,token);assert.equal(original.payload.gameReward.merit,merit);
    assert.equal(original.payload.model.tokenBudget,30000);
    await db.prepare("UPDATE missions SET rank='天阶',reward_token=9999,reward_merit=9999 WHERE id=?").bind(mission).run();
    assert.deepEqual(await api(actor,`/api/claims/${claim.id}/manifest`),original,"Later mission edits cannot alter locked rewards");
    const balance=(await api(actor,"/api/me")).balances;
    assert.equal(balance.token,0);assert.equal(balance.cultivation,0);assert.equal(balance.merit,0,"Locking rewards does not pay them");
  }
  const oldActor="github:9199",oldClaim=randomUUID();
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github','9199','SyntheticOld','SyntheticOld',?)").bind(oldActor,now).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,deposit,budget_tokens,contract_ready,created_at) VALUES ('PLAT-STABLE-OLD','Synthetic old claim','Synthetic only','天阶','code','open',?,'site/lib/small-json.ts','Synthetic only',9999,9999,9999,0,30000,1,?)").bind("a".repeat(40),now).run();
  const snapshot={token:53,officialToken:30,cultivation:100,merit:7,deposit:0,baseCommit:"a".repeat(40),title:"Old synthetic claim",description:"Synthetic only",acceptance:"Synthetic only",allowedPaths:"site/lib/small-json.ts",budgetTokens:null};
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,'PLAT-STABLE-OLD',?,'running',?,?,?,?)").bind(oldClaim,oldActor,now,now,now+3600000,JSON.stringify(snapshot)).run();
  const legacy=await api(oldActor,`/api/claims/${oldClaim}/manifest`);
  assert.equal(Object.hasOwn(legacy.payload.gameReward,"stable"),false,"Legacy claims are not backfilled from the current mission");
  console.log("New claims lock all three stable rewards, rounded down, and the seven-day version gap; later mission edits and legacy manifests cannot replace the snapshot. No rewards paid, synthetic only.");
} finally {await mf.dispose();console.log(`Synthetic reward snapshot evidence: ${temporary}`);}
