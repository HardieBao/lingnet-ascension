import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Agreed seam: actual purchase/equip API → manifest → public Runner, synthetic Git/model services only.
const execute = promisify(execFile), site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(join(tmpdir(), "lingnet-code-preflight-"));
const source = join(temporary, "source"), owner = join(temporary, "owner");
const environment = { ...process.env };
for (const name of Object.keys(environment)) if (/(API_KEY|TOKEN|SECRET|PASSWORD|GIT_CONFIG)/i.test(name)) delete environment[name];
const command = (program, args, cwd = owner) => execute(program, args, { cwd, env: environment,
  windowsHide: true, timeout: 20 * 60_000, maxBuffer: 4_000_000 });
let mf;
try {
  await mkdir(owner);
  await command("git", ["clone", "--no-checkout", resolve(site, ".."), source]);
  const baseline = "2cc196b37033fbb006acfdaf4be71707518cbb9b";
  await command("git", ["checkout", "--detach", baseline], source);
  await command("git", ["branch", "--force", "main", baseline], source);
  Object.assign(environment, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${source.replaceAll("\\", "/")}.insteadOf`,
    GIT_CONFIG_VALUE_0: "https://github.com/HardieBao/lingnet-ascension.git" });
  const server = join(site, "dist", "server"), secret = "synthetic-preflight-session-secret-not-real", actor = "github:903";
  const modules = (await readdir(server, { recursive: true })).filter(path => /\.(?:m?js)$/.test(path))
    .sort((a,b) => a === "index.js" ? -1 : b === "index.js" ? 1 : a.localeCompare(b));
  const workerModules = await Promise.all(modules.map(async path => ({ type: "ESModule", path: join(server,path), contents: await readFile(join(server,path),"utf8") })));
  mf = new Miniflare(convertV4MiniflareOptions({ cf:false,host:"127.0.0.1",port:0,d1Persist:join(temporary,"d1"),workers:[{
    name:"application",rootPath:server,modules:workerModules,compatibilityDate:"2026-09-27",compatibilityFlags:["nodejs_compat"],
    d1Databases:{DB:"code-preflight"},bindings:{SESSION_SECRET:secret},outboundService:()=>{throw new Error("Preflight verification forbids external application calls");},
  }] }));
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir(join(site,"drizzle"))).filter(name=>name.endsWith(".sql")).sort()) {
    for (const sql of (await readFile(join(site,"drizzle",file),"utf8")).split("--> statement-breakpoint").filter(sql=>sql.trim())) await db.prepare(sql).run();
  }
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES (?,'github','903','Synthetic903','Synthetic',?)").bind(actor,Date.now()).run();
  await db.prepare("INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES ('fixture-funding',?,'token',5000,'fixture:funding',?)").bind(actor,Date.now()).run();
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,deposit,budget_tokens,contract_ready,created_at) VALUES ('PLAT-QA','Synthetic preflight','Synthetic only','yellow','code','open',?,'site/lib/small-json.ts','Four locked checks',0,0,0,0,30000,1,?)").bind(baseline,Date.now()).run();
  const signed = Buffer.from(JSON.stringify({sub:actor,ver:0,exp:Math.floor(Date.now()/1000)+3600})).toString("base64url");
  const cookie = `lingnet_session=${signed}.${createHmac("sha256",secret).update(signed).digest("base64url")}`;
  const api = async (path,input) => {
    const response = await mf.dispatchFetch(`http://fixture.local${path}`,{method:input===undefined?"GET":"POST",
      headers:{Cookie:cookie,Origin:"http://fixture.local","Content-Type":"application/json"},...(input===undefined?{}:{body:JSON.stringify(input)})});
    assert(response.ok,`${response.status}: ${await response.clone().text()}`);return response.json();
  };
  const claim = (await api("/api/claims",{missionId:"PLAT-QA"})).claim;
  await api(`/api/claims/${claim.id}/start`,{});
  const manifest = () => api(`/api/claims/${claim.id}/manifest`);
  const basic = await manifest();
  assert.equal(basic.payload.equipment.localPreflight,false);
  await api("/api/equipment/purchase",{itemId:"calculation-array"});
  assert.equal((await manifest()).payload.equipment.localPreflight,false,"Owning gear is not equipping it");
  await api("/api/equipment/calculation-array/equip",{equipped:true});
  const equipped = await manifest(), payload = equipped.payload;
  assert.equal(payload.equipment.localPreflight,true);
  assert.deepEqual(payload.model,basic.payload.model);
  assert.deepEqual(payload.gameReward,basic.payload.gameReward);
  assert.equal(payload.claim.expiresAt,basic.payload.claim.expiresAt);
  assert.equal((await api("/api/me")).balances.token,4500);
  const task = join(owner, "task.json"), artifact = join(owner, "small-json.ts");
  await writeFile(task, JSON.stringify(equipped));
  const original = await readFile(join(source, payload.mission.artifactPath), "utf8");
  await writeFile(artifact, original + "\n// Synthetic preflight-only change; not a community outcome.\n");
  const result = await command(process.execPath, [join(site, "public", "runner.mjs"), "preflight", task, artifact]);
  await writeFile(join(temporary,"passed.stdout.log"),result.stdout);
  await writeFile(join(temporary,"passed.stderr.log"),result.stderr);
  assert.match(result.stdout, /代码完整预检通过/);
  assert.match(result.stdout, /测试、类型、lint、构建/);
  assert.equal(await readFile(artifact, "utf8"), original + "\n// Synthetic preflight-only change; not a community outcome.\n");
  const regression = original.replace('return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));','return null;');
  assert.notEqual(regression,original);
  await writeFile(artifact,regression);
  let regressionFailure;
  await assert.rejects(command(process.execPath,[join(site,"public","runner.mjs"),"preflight",task,artifact]),error=>{
    regressionFailure=error;
    assert.equal(error.code,1);
    assert(!error.stdout.includes("代码完整预检通过"));
    assert(error.stdout.includes("断网只读容器"));
    return true;
  });
  await writeFile(join(temporary,"failed.stdout.log"),regressionFailure.stdout);
  await writeFile(join(temporary,"failed.stderr.log"),regressionFailure.stderr);
  const balances = (await api("/api/me")).balances;
  assert.equal(balances.token,4500);assert.equal(balances.cultivation,0);assert.equal(balances.merit,0);
  for (const invalid of ["", "x".repeat(131073), "sk-" + "x".repeat(40)]) {
    await writeFile(artifact,invalid);
    await assert.rejects(command(process.execPath,[join(site,"public","runner.mjs"),"preflight",task,artifact]),error=>{
      assert.equal(error.code,1);assert(!error.stdout.includes("代码预检工作区"));return true;
    });
  }
  const bundle=join(temporary,"bundle"); await mkdir(bundle);
  for (const file of ["runner.mjs","runner-sandbox.mjs","runner-workspace.mjs","runner-checkpoints.mjs","runner-presets.mjs"]) {
    await copyFile(join(site,"public",file),join(bundle,file));
  }
  await writeFile(join(bundle,"budget-gateway.mjs"),await readFile(join(site,"scripts","fixtures","runner-code-provider.mjs"),"utf8")+"\n"+await readFile(join(site,"public","budget-gateway.mjs"),"utf8"));
  Object.assign(environment,{LINGNET_MODEL_API_KEY:"synthetic-code-upstream-key",LINGNET_MODEL_BASE_URL:"http://127.0.0.1:8800/v1",LINGNET_PROVIDER_LIMITS_VERIFIED:"1"});
  const automatic=await command(process.execPath,[join(bundle,"runner.mjs"),"run",task,"--ack-model-costs"]);
  await writeFile(join(temporary,"automatic.stdout.log"),automatic.stdout);
  assert.match(automatic.stdout,/演算阵盘已装备/);
  assert.match(automatic.stdout,/代码完整预检通过/);
  assert.match(await readFile(join(owner,"PLAT-QA-small-json.ts"),"utf8"),/Synthetic automatic preflight fixture/);
  const runDirectories=await readdir(join(owner,".lingnet","runs"));
  assert.equal(runDirectories.length,1);
  const finished=JSON.parse(await readFile(join(owner,".lingnet","runs",runDirectories[0],"finished.json"),"utf8"));
  assert.equal(finished.budget.knownSpent,6); assert.equal(finished.budget.remaining,29994);
  const unchanged=(await api("/api/me")).balances;
  assert.equal(unchanged.token,4500);assert.equal(unchanged.cultivation,0);assert.equal(unchanged.merit,0);
  assert.deepEqual((await manifest()).payload.model,basic.payload.model);
  assert.equal((await manifest()).payload.claim.expiresAt,basic.payload.claim.expiresAt);
  console.log("Actual purchase/equip → manifest → public CLI: valid code passes all four checks; a real JSON regression fails; automatic Runner preflight passes; no rewards or real-provider calls, lease and original model allowance unchanged.");
} finally { await mf?.dispose(); console.log(`Synthetic code preflight workspace retained: ${temporary}`); }
