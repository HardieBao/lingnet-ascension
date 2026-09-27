import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Manual browser fixture for the existing public trial API boundary. Synthetic, loopback only.
// No production database, private environment configuration, real model or GitHub calls.
const site=resolve(dirname(fileURLToPath(import.meta.url)),".."),build=join(site,"dist","server"),client=join(site,"dist","client");
const temporary=await mkdtemp(join(tmpdir(),"lingnet-trial-ui-")),secret="synthetic-trial-ui-session-not-production",base="a".repeat(40),digest="b".repeat(64);
const files=(await readdir(build,{recursive:true})).filter(path=>/\.(?:m?js)$/.test(path)).sort((a,b)=>a==="index.js"?-1:b==="index.js"?1:a.localeCompare(b));
const modules=await Promise.all(files.map(async path=>({type:"ESModule",path:join(build,path),contents:await readFile(join(build,path),"utf8")})));
const assets=new Set((await readdir(client,{recursive:true})).map(path=>path.replaceAll("\\","/")));
const mf=new Miniflare(convertV4MiniflareOptions({cf:false,host:"127.0.0.1",port:0,d1Persist:join(temporary,"d1"),workers:[{
  name:"application",rootPath:build,modules,compatibilityDate:"2026-09-27",compatibilityFlags:["nodejs_compat"],d1Databases:{DB:"manual-trial-ui"},
  bindings:{SESSION_SECRET:secret,MAINTAINER_GITHUB_ID:"903"},outboundService:()=>{throw new Error("Local trial UI denies external services");},
}]}));
const db=await mf.getD1Database("DB");
for(const file of (await readdir(join(site,"drizzle"))).filter(name=>name.endsWith(".sql")).sort()) {
  for(const sql of (await readFile(join(site,"drizzle",file),"utf8")).split("--> statement-breakpoint").filter(sql=>sql.trim()))await db.prepare(sql).run();
}
await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES ('fixture-ui-reviewer','github','903','SyntheticReviewer','合成复核者，不是真实成果',1),('fixture-ui-original','github','902','SyntheticOriginal','合成原作者',1)").run();
for(let number=0;number<10;number++)await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at) VALUES (?,'合成历史，不是社区成果','Synthetic only','黄阶','Fixture','done',?,'fixture.md','Synthetic only',0,0,0,1)").bind(`UI-FORMAL-${number}`,base).run();
const cases={foundation:{realm:"qi",target:"foundation",cultivation:1000,merit:50,count:3},blocked:{realm:"qi",target:"foundation",cultivation:1000,merit:49,count:3},core:{realm:"foundation",target:"core",cultivation:5000,merit:200,count:10},empty:{realm:"mortal",target:null,cultivation:0,merit:0,count:0}};
let sequence=1000;
for(const [key,scenario] of Object.entries(cases)) {
  const actor=`fixture-ui-${key}`,now=Date.now();
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,realm,created_at) VALUES (?,'github',?,'SyntheticUI','合成验证 · 非真实贡献',?,?)").bind(actor,String(sequence++),scenario.realm,now).run();
  for(const [resource,amount] of [["token",3000],["cultivation",scenario.cultivation],["merit",scenario.merit]])await db.prepare("INSERT INTO ledger_events VALUES (?,?,?,?,?,?)").bind(`${actor}:${resource}`,actor,resource,amount,`${actor}:synthetic-funding:${resource}`,now).run();
  for(let number=0;number<scenario.count;number++) {
    const id=`${actor}:formal:${number}`;
    await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES (?, ?,?,'completed',1,2,'{}')").bind(id,`UI-FORMAL-${number}`,actor).run();
    await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at) VALUES (?,?,?,?,?,'accepted','fixture-ui-reviewer',?,2,1)").bind(`${id}:result`,id,actor,`${id}.md`,digest,base).run();
  }
  if(scenario.target) {
    await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES (?,'合成渡劫契约 · 不计社区成果','Synthetic only','地阶','Fixture','open',?,'fixture.md','Synthetic only',0,0,0,1,?)").bind(`${actor}:mission`,base,now).run();
    await db.prepare("INSERT INTO realm_trial_contracts VALUES (?,?,600000)").bind(`${actor}:mission`,scenario.target).run();
    await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES (?,?,?,'running',?,?,?,?)").bind(`${actor}:claim`,`${actor}:mission`,actor,now,now,now+7200000,JSON.stringify({deposit:0,token:0,cultivation:0,merit:0,baseCommit:base,allowedPaths:"fixture.md"})).run();
  }
}
await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES ('UI-REPLAY-C','UI-FORMAL-0','fixture-ui-original','completed',1,2,'{}')").run();
await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at) VALUES ('UI-REPLAY-S','UI-REPLAY-C','fixture-ui-original','replay.md',?,'accepted','fixture-ui-reviewer',?,2,1)").bind(digest,base).run();
await db.prepare("INSERT INTO result_revalidations VALUES ('UI-REPLAY-R','UI-REPLAY-S','fixture-ui-core',1,?,1,1,?,?,?,'passed','完整合成复验观察，只验证采纳资格与渡劫，不代表真实 CI 或社区成果。',20)").bind(base,base,base,digest).run();
await db.prepare("INSERT INTO result_revalidation_decisions VALUES ('UI-REPLAY-R','accept','fixture-ui-reviewer','合成独立采纳，不是真人证据',30)").run();

let origin;
const server=createServer(async(request,response)=>{
  try {
    const url=new URL(request.url,origin),scenario=url.searchParams.get("case");
    if(url.pathname==="/fixture/sign-in"&&Object.hasOwn(cases,scenario)) {
      const payload=Buffer.from(JSON.stringify({sub:`fixture-ui-${scenario}`,ver:0,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
      response.writeHead(303,{Location:"/","Set-Cookie":`lingnet_session=${payload}.${createHmac("sha256",secret).update(payload).digest("base64url")}; Path=/; HttpOnly; SameSite=Lax`});response.end();return;
    }
    if(url.pathname==="/fixture/formal"&&Object.hasOwn(cases,scenario)) {
      const actor=`fixture-ui-${scenario}`,trial=await db.prepare("SELECT * FROM realm_trials WHERE cultivator_id=? AND state='active'").bind(actor).first();
      if(!trial)throw new Error("No active synthetic trial");
      await db.batch([db.prepare("UPDATE claims SET state='completed' WHERE id=?").bind(trial.claim_id),db.prepare("UPDATE missions SET state='done' WHERE id=?").bind(`${actor}:mission`),
        db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,reviewer_id,integrated_commit,integrated_at,created_at) VALUES (?,?,?,?,?,'accepted','fixture-ui-reviewer',?,?,?)").bind(`${actor}:trial-result`,trial.claim_id,actor,"synthetic-trial.md",digest,base,Date.now(),Date.now())]);
      response.writeHead(303,{Location:"/"});response.end();return;
    }
    const asset=url.pathname.slice(1);
    if(assets.has(asset)&&/\.(?:js|css|svg)$/.test(asset)) {
      response.setHeader("Content-Type",{".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml"}[extname(asset)]);response.end(await readFile(join(client,asset)));return;
    }
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    const result=await mf.dispatchFetch(origin+request.url,{method:request.method,headers:request.headers,...(["GET","HEAD"].includes(request.method)?{}:{body:Buffer.concat(chunks)})});
    response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
  } catch {response.writeHead(500,{"Content-Type":"text/plain"});response.end("Synthetic fixture request failed; no private data returned.");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));origin=`http://127.0.0.1:${server.address().port}`;
console.log(`LOCAL_SYNTHETIC_TRIAL_UI=${origin}`);
console.log(`Use /fixture/sign-in?case=foundation|blocked|core|empty. /fixture/formal?case=foundation|core adds synthetic proof only. No real outcomes.`);
console.log(`Isolated D1 retained: ${temporary}. Send stop to this terminal to close only this fixture.`);
process.stdin.setEncoding("utf8");
process.stdin.on("data",async input=>{if(input.trim()==="stop"){server.close();await mf.dispose();process.exit(0);}});
