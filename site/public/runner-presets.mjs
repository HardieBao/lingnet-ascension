import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateTaskPackage } from "./runner.mjs";
import { safeContent } from "./runner-checkpoints.mjs";

const efforts = ["none", "low", "medium", "high", "xhigh", "max"], uuid = /^[a-f0-9-]{36}$/i;
function definition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((name) => !["name", "reasoningEffort", "maxOutputTokens", "promptSupplement"].includes(name)) ||
      typeof value.name !== "string" || value.name.trim().length < 1 || value.name.length > 40 || /[\r\n\0]/.test(value.name) ||
      !efforts.includes(value.reasoningEffort) || !Number.isSafeInteger(value.maxOutputTokens) || value.maxOutputTokens < 1 || value.maxOutputTokens > 2048 ||
      typeof value.promptSupplement !== "string" || value.promptSupplement.length > 1024) throw new Error("功法配置无效，仅支持名称、推理档位、补充提示和更严格的输出上限");
  safeContent(Buffer.from(JSON.stringify(value)));
  return { name: value.name.trim(), reasoningEffort: value.reasoningEffort, maxOutputTokens: value.maxOutputTokens, promptSupplement: value.promptSupplement };
}
async function store(taskPackage, options, action) {
  const payload = validateTaskPackage(taskPackage);
  if (payload.schemaVersion !== 4 || ![1, 2].includes(payload.equipment.presetSlots ?? 1)) throw new Error("功法需要有效的 v4 任务包");
  let directory = resolve(options.root ?? process.cwd());
  for (const name of [".lingnet", "presets", createHash("sha256").update(payload.cultivatorId).digest("hex")]) {
    directory = join(directory, name);
    await mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("功法目录不允许链接");
  }
  const path = join(directory, ".lock"), lock = await open(path, "wx", 0o600).catch(() => { throw new Error("功法正在处理或上次操作待核对"); });
  try {
    const profiles = [];
    for (const name of await readdir(directory)) {
      if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
      const file = join(directory, name), stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw new Error("功法文件无效");
      let record;
      try { record = JSON.parse(await readFile(file, "utf8")); } catch { throw new Error("功法文件格式无效，不回显内容"); }
      if (record.id !== name.slice(0, -5) || record.version !== 1 || record.cultivatorId !== payload.cultivatorId ||
          !Number.isSafeInteger(record.createdAt)) throw new Error("功法记录无效");
      profiles.push({ id: record.id, createdAt: record.createdAt, ...definition(record.definition) });
    }
    profiles.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    return await action({ payload, directory, profiles, slots: payload.equipment.presetSlots ?? 1 });
  } finally { await lock.close(); await unlink(path); }
}
export async function savePreset(taskPackage, value, options = {}) {
  const config = definition(value);
  return store(taskPackage, options, async ({ payload, directory, profiles, slots }) => {
    if (profiles.length >= slots) throw new Error("功法槽位已满，请装备玉简或明确删除旧预设");
    const record = { version: 1, id: randomUUID(), cultivatorId: payload.cultivatorId, createdAt: Date.now(), definition: config };
    const file = await open(join(directory, `${record.id}.json`), "wx", 0o600);
    try { await file.writeFile(JSON.stringify(record)); await file.sync(); } finally { await file.close(); }
    return { id: record.id, ...config };
  });
}
export async function listPresets(taskPackage, options = {}) {
  return store(taskPackage, options, ({ profiles, slots }) => profiles.map((profile, index) => ({ ...profile, available: index < slots })));
}
export async function getPreset(taskPackage, id, options = {}) {
  if (!uuid.test(id)) throw new Error("功法编号无效");
  const presets = await listPresets(taskPackage, options), found = presets.find((preset) => preset.id === id);
  if (!found) throw new Error("功法不存在或属于另一位修士");
  if (!found.available) throw new Error("功法超出当前槽位权限，旧预设仍保留，请重新装备玉简");
  return found;
}
export async function discardPreset(taskPackage, id, options = {}) {
  if (!uuid.test(id)) throw new Error("功法编号无效");
  return store(taskPackage, options, async ({ directory, profiles }) => {
    if (!profiles.some((profile) => profile.id === id)) throw new Error("功法不存在");
    await unlink(join(directory, `${id}.json`));
    return { discarded: true };
  });
}
