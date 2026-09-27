import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Existing agreed public seam: upload → quarantine → independent review → claim recovery.
// Actual built page/API/D1, synthetic accounts and credential shape; no external services.
const site=resolve(dirname(fileURLToPath(import.meta.url)),".."),server=join(site,"dist","server");
const temporary=await mkdtemp(join(tmpdir(),"lingnet-quarantine-workbench-")),secret="synthetic-workbench-secret-not-production";
const actor="fixture-workbench-author",reviewer="fixture-workbench-reviewer",fakeCredential="sk-"+"0".repeat(48);
const good=await readFile(join(site,"tests","fixtures","gov001-charter.md"),"utf8");
const paths=(await readdir(server,{recursive:true})).filter(path=>/\.(?:m?js)$/.test(path)).sort((a,b)=>a==="index.js"?-1:b==="index.js"?1:a.localeCompare(b));
const modules=await Promise.all(paths.map(async path=>({type:"ESModule",path:join(server,path),contents:await readFile(join(server,path),"utf8")})));
const mf=new Miniflare(convertV4MiniflareOptions({cf:false,host:"127.0.0.1",port:0,d1Persist:join(temporary,"d1"),workers:[{
  name:"application",rootPath:server,modules,compatibilityDate:"2026-09-27",compatibilityFlags:["nodejs_compat"],d1Databases:{DB:"quarantine-workbench"},
  bindings:{SESSION_SECRET:secret,MAINTAINER_GITHUB_ID:"903"},outboundService:()=>{throw new Error("Workbench verification forbids external services");},
}]}));
const cookie=id=>{const signed=Buffer.from(JSON.stringify({sub:id,ver:0,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");return `lingnet_session=${signed}.${createHmac("sha256",secret).update(signed).digest("base64url")}`;};
const api=(id,path,body)=>mf.dispatchFetch(`http://fixture.local${path}`,{method:body===undefined?"GET":"POST",headers:{Cookie:cookie(id),Origin:"http://fixture.local","Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
const upload=(content)=>{
  const boundary=`fixture-${crypto.randomUUID()}`;
  const body=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="claimId"\r\n\r\nfixture-workbench-claim\r\n--${boundary}\r\nContent-Disposition: form-data; name="artifact"; filename="GOVERNANCE.md"\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  return mf.dispatchFetch("http://fixture.local/api/submissions",{method:"POST",headers:{Cookie:cookie(actor),Origin:"http://fixture.local","Content-Type":`multipart/form-data; boundary=${boundary}`},body});
};
async function serveWorkbench() {
  const client=join(site,"dist","client"),assets=new Set((await readdir(client,{recursive:true})).map(path=>path.replaceAll("\\","/")));
  let origin;
  const listener=createServer(async(request,response)=>{
    try {
      const url=new URL(request.url,origin),identity=url.searchParams.get("as");
      if(url.pathname==="/fixture/sign-in"&&["reviewer","author"].includes(identity)) {
        response.writeHead(303,{Location:"/review","Set-Cookie":`${cookie(identity==="reviewer"?reviewer:actor)}; Path=/; HttpOnly; SameSite=Lax`});response.end();return;
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
  await new Promise(done=>listener.listen(0,"127.0.0.1",done));origin=`http://127.0.0.1:${listener.address().port}`;
  console.log(`LOCAL_SYNTHETIC_WORKBENCH_UI=${origin}`);
  console.log("Use /fixture/sign-in?as=reviewer|author. Local synthetic data only; send stop to close this fixture.");
  await new Promise(done=>{
    process.stdin.setEncoding("utf8");
    const stop=input=>{if(input.trim()==="stop"){process.stdin.off("data",stop);process.stdin.pause();listener.close(done);}};
    process.stdin.on("data",stop);
  });
}
try {
  const db=await mf.getD1Database("DB"),now=Date.now();
  for(const file of (await readdir(join(site,"drizzle"))).filter(name=>name.endsWith(".sql")).sort())for(const sql of (await readFile(join(site,"drizzle",file),"utf8")).split("--> statement-breakpoint").filter(sql=>sql.trim()))await db.prepare(sql).run();
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github','900','SyntheticAuthor','合成作者，不计社区成果',?), (?,'github','903','SyntheticReviewer','合成独立复核者',?)").bind(actor,now,reviewer,now).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES ('GOV-001','合成隔离工作台任务','Synthetic only','黄阶','Fixture','open',?,'GOVERNANCE.md','Synthetic only',10,1,1,1,?)").bind("a".repeat(40),now).run();
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES ('fixture-workbench-claim','GOV-001',?,'running',?,?,?,?)").bind(actor,now,now,now+3600000,JSON.stringify({deposit:0,token:10,cultivation:1,merit:1,allowedPaths:"GOVERNANCE.md"})).run();
  const submitted=await upload(good+"\n"+fakeCredential+"\n");assert.equal(submitted.status,201,await submitted.clone().text());
  const submittedText=await submitted.text(),frozen=JSON.parse(submittedText).submission;
  assert.equal(frozen.state,"frozen");assert(!submittedText.includes(fakeCredential));
  if(process.argv.includes("--serve"))await serveWorkbench();
  else {
  const page=await api(reviewer,"/review"),html=await page.text();assert.equal(page.status,200);
  assert(html.includes("隔离成果"),"Maintainer workbench must surface frozen results instead of silently omitting them");
  assert(html.includes(frozen.id));assert(html.includes("允许清理后重传"));assert(!html.includes(fakeCredential));
  assert(!html.includes(`/api/submissions/${frozen.id}/artifact`),"Frozen raw content must not get a download link");
  assert(!html.includes("批准待合入"),"The only result is frozen and cannot be approved");
  const authorPage=await api(actor,"/review");assert((await authorPage.text()).includes("需要维护者权限"));
  assert.equal((await api(reviewer,`/api/reviews/${frozen.id}`,{decision:"accept",reason:"合成测试直接批准隔离成果，必须被拒绝"})).status,409);
  assert.equal((await api(reviewer,`/api/reviews/${frozen.id}`,{decision:"revise",reason:"已核对合成敏感命中，允许清理后按原期限重传"})).status,200);
  const claims=await(await api(actor,"/api/claims")).json();const claim=claims.claims.find(item=>item.id==="fixture-workbench-claim");
  assert.equal(claim.state,"running");assert.equal(claim.started_at,now,"Review cannot reset the original lease clock");
  const retained=await api(reviewer,`/api/submissions/${frozen.id}/artifact`);assert.notEqual(retained.status,200);assert(!(await retained.text()).includes(fakeCredential));
  const resubmitted=await upload(good);assert.equal(resubmitted.status,201);const clean=(await resubmitted.json()).submission;assert.equal(clean.state,"awaiting_review");
  const cleanPage=await(await api(reviewer,"/review")).text();assert(cleanPage.includes("批准待合入"));assert(cleanPage.includes(clean.id));assert(!cleanPage.includes(fakeCredential));
  const balances=(await(await api(actor,"/api/me")).json()).balances;assert.equal(balances.token,0);assert.equal(balances.cultivation,0);assert.equal(balances.merit,0);
  // Separate synthetic frozen result authored by the maintainer; only prepare data here.
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,contract_ready,created_at) VALUES ('SELF-WORKBENCH','合成本人隔离任务','Synthetic only','黄阶','Fixture','frozen',?,'fixture.md','Synthetic only',0,0,0,1,?)").bind("a".repeat(40),now).run();
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,started_at,expires_at,reward_snapshot) VALUES ('self-workbench-claim','SELF-WORKBENCH',?,'frozen',?,?,?,?)").bind(reviewer,now,now,now+3600000,JSON.stringify({deposit:0,token:0,cultivation:0,merit:0})).run();
  await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,verdict,created_at) VALUES ('self-workbench-result','self-workbench-claim',?,'isolated-self','', 'frozen',?,?)").bind(reviewer,JSON.stringify({passed:false,quarantined:true,checks:[]}),now).run();
  const selfHtml=await(await api(reviewer,"/review")).text();
  const selfArticle=selfHtml.match(/<article\b[\s\S]*?<\/article>/g)?.find(article=>article.includes("self-workbench-result"));
  assert(selfArticle?.includes("不能自行解除冻结"));assert(!selfArticle.includes("<textarea"));assert(!selfArticle.includes("允许清理后重传"));
  assert.equal((await api(reviewer,"/api/reviews/self-workbench-result",{decision:"revise",reason:"合成测试本人解除隔离，必须被拒绝"})).status,403);
  console.log("Actual upload/page/API: frozen result visible as safe metadata only, no approval/raw link; independent revision preserves original clock, clean resubmission follows normal review, no reward or external call. Synthetic only.");
  }
} finally {await mf.dispose();console.log(`Synthetic workbench evidence retained: ${temporary}`);}
