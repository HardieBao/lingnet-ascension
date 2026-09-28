import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile,mkdir,mkdtemp,readFile,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname,join,resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Minimal public CLI loop for existing-file export; synthetic service and zero game rewards.
const execute=promisify(execFile),site=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const temporary=await mkdtemp(join(tmpdir(),"lingnet-existing-run-")),source=join(temporary,"source"),bundle=join(temporary,"bundle"),owner=join(temporary,"owner");
for(const path of [source,bundle,owner])await mkdir(path);
const environment={...process.env,LINGNET_MODEL_API_KEY:"synthetic-existing-file-key",LINGNET_MODEL_BASE_URL:"http://127.0.0.1:8800/v1",LINGNET_PROVIDER_LIMITS_VERIFIED:"1"};
for(const name of Object.keys(environment))if(/(API_KEY|TOKEN|SECRET|PASSWORD|GIT_CONFIG)/i.test(name)&&!name.startsWith("LINGNET_MODEL_"))delete environment[name];
const command=(program,args,cwd=source)=>execute(program,args,{cwd,env:environment,windowsHide:true,timeout:60000,maxBuffer:2000000});
// Same public Runner loop as the small repository, now against the complete locked baseline.
const baseline="2cc196b37033fbb006acfdaf4be71707518cbb9b";
await command("git",["clone","--no-checkout",resolve(site,".."),source]);
await command("git",["checkout","--detach",baseline]);
await command("git",["branch","--force","main",baseline]);
Object.assign(environment,{GIT_CONFIG_COUNT:"1",GIT_CONFIG_KEY_0:`url.${source.replaceAll("\\","/")}.insteadOf`,GIT_CONFIG_VALUE_0:"https://github.com/HardieBao/lingnet-ascension.git"});
for(const file of ["runner.mjs","runner-sandbox.mjs","runner-workspace.mjs","runner-checkpoints.mjs","runner-presets.mjs"])await copyFile(join(site,"public",file),join(bundle,file));
await writeFile(join(bundle,"budget-gateway.mjs"),await readFile(join(site,"scripts","fixtures","runner-code-provider.mjs"),"utf8")+"\n"+await readFile(join(site,"public","budget-gateway.mjs"),"utf8"));
const payload={schemaVersion:4,cultivatorId:"synthetic-existing-owner",claim:{id:randomUUID(),expiresAt:Date.now()+3600000},
  repository:{url:"https://github.com/HardieBao/lingnet-ascension.git",baseCommit:baseline},
  mission:{id:"PLAT-QA",title:"Synthetic",description:"Synthetic only",acceptance:"Existing-file output",allowedPaths:["site/lib/small-json.ts"],artifactPath:"site/lib/small-json.ts"},
  model:{harness:"codex-cli",id:"gpt-5.6-sol",tokenBudget:30000,maxOutputTokens:2048,budgetAccounting:"input+output"},
  equipment:{localPreflight:false,checkpointSlots:1,heartTalisman:false,presetSlots:1},gameReward:{token:0,cultivation:0,merit:0}};
const task=join(owner,"task.json");await writeFile(task,JSON.stringify({payload,sha256:createHash("sha256").update(JSON.stringify(payload)).digest("hex")}));
try {
  const result=await command(process.execPath,[join(bundle,"runner.mjs"),"run",task,"--ack-model-costs"],owner);
  await writeFile(join(temporary,"cli.stdout.log"),result.stdout);
  assert.match(await readFile(join(owner,"PLAT-QA-small-json.ts"),"utf8"),/Synthetic automatic preflight fixture/);
  console.log("Existing-file public Runner exports only the modified scoped artifact through the real Docker/CLI path. Synthetic only.");
} finally {
  console.log(`Synthetic existing-file workspace retained: ${temporary}`);
}
