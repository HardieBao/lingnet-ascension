import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Public CLI rejection paths only; synthetic Git origin, no model/provider/production access.
const execute=promisify(execFile),site=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const temporary=await mkdtemp(join(tmpdir(),"lingnet-preflight-refusals-")),source=join(temporary,"source");
const environment={...process.env};
for(const name of Object.keys(environment))if(/(API_KEY|TOKEN|SECRET|PASSWORD|GIT_CONFIG)/i.test(name))delete environment[name];
const command=(program,args,cwd=temporary)=>execute(program,args,{cwd,env:environment,windowsHide:true,timeout:30000,maxBuffer:1000000});
await mkdir(source);await writeFile(join(source,"README.md"),"Synthetic baseline deliberately lacks CI/package configuration.");
await command("git",["init","--initial-branch=main"],source);await command("git",["add","README.md"],source);
await command("git",["-c","user.name=Synthetic","-c","user.email=fixture@example.invalid","commit","-m","Synthetic refusal baseline"],source);
const commit=(await command("git",["rev-parse","HEAD"],source)).stdout.trim();
Object.assign(environment,{GIT_CONFIG_COUNT:"1",GIT_CONFIG_KEY_0:`url.${source.replaceAll("\\","/")}.insteadOf`,GIT_CONFIG_VALUE_0:"https://github.com/HardieBao/lingnet-ascension.git"});
const payload={schemaVersion:4,cultivatorId:"synthetic-refusal-owner",claim:{id:randomUUID(),expiresAt:Date.now()+3600000},
  repository:{url:"https://github.com/HardieBao/lingnet-ascension.git",baseCommit:commit},
  mission:{id:"PLAT-QA",title:"Synthetic",description:"Synthetic only",acceptance:"No fallback",allowedPaths:["site/lib/example.ts"],artifactPath:"site/lib/example.ts"},
  model:{harness:"codex-cli",id:"gpt-5.6-sol",tokenBudget:30000,maxOutputTokens:2048,budgetAccounting:"input+output"},
  equipment:{localPreflight:true,checkpointSlots:1,heartTalisman:false,presetSlots:1},gameReward:{token:0,cultivation:0,merit:0}};
const task=join(temporary,"task.json"),artifact=join(temporary,"example.ts");
const save=async value=>writeFile(task,JSON.stringify({payload:value,sha256:createHash("sha256").update(JSON.stringify(value)).digest("hex")}));
await writeFile(artifact,"export const example = true;\n");await save(payload);
await assert.rejects(command(process.execPath,[join(site,"public","runner.mjs"),"preflight",task,artifact]),error=>{
  assert.match(error.stderr,/固定基线尚无完整可信预检配置/);assert(!error.stdout.includes("在断网只读容器"));return true;
});
await save({...payload,claim:{...payload.claim,expiresAt:Date.now()-1}});
await assert.rejects(command(process.execPath,[join(site,"public","runner.mjs"),"preflight",task,artifact]),error=>{
  assert.match(error.stderr,/任务包字段或运行范围/);assert(!error.stdout.includes("代码预检工作区"));return true;
});
assert.equal(await readFile(artifact,"utf8"),"export const example = true;\n");
console.log("Public CLI fails closed for an incomplete fixed baseline and expired claim; no arbitrary-command fallback, model call, lease extension or source overwrite.");
console.log(`Synthetic refusal workspace retained: ${temporary}`);
