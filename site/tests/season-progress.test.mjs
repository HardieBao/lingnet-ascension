import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { seasonProgressResponse } from "../lib/season-progress.ts";

// Adopted seam: public HTTP responses with actual isolated D1; no internal mocks.
async function fixture(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, host: "127.0.0.1", port: 0,
    workers: [{ name: "season-fixture", modules: true,
      script: "export default { fetch() { return new Response('Synthetic database fixture only'); } }",
      compatibilityDate: "2026-09-27", d1Databases: { DB: "synthetic-season" },
      outboundService: () => { throw new Error("Season verification forbids external services"); },
    }],
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    for (const sql of (await readFile(join(migrations, file), "utf8")).split("--> statement-breakpoint").filter((value) => value.trim())) await db.prepare(sql).run();
  }
  return db;
}

test("an empty season is an observed zero without seeding tasks or disclosing an account", async (t) => {
  const db = await fixture(t);
  await db.prepare("CREATE TRIGGER no_season_seed BEFORE INSERT ON missions BEGIN SELECT RAISE(ABORT, 'Synthetic readonly boundary'); END").run();
  const response = await seasonProgressResponse(new Request("https://fixture.invalid/api/season"), () => db);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.equal(data.state, "available");
  assert.equal(data.scope, "platform-records");
  assert.equal(data.season, "灵网初开");
  assert.deepEqual(data.missionStates, { total: 0, open: 0, blocked: 0, done: 0, other: 0 });
});

async function mission(db, id, state) {
  await db.prepare("INSERT INTO missions (id,title,description,rank,branch,state,base_commit,allowed_paths,acceptance,reward_token,reward_cultivation,reward_merit,created_at) VALUES (?,?,'Synthetic only','黄阶','Synthetic branch',?,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','fixture.md','Synthetic only',0,0,0,1)")
    .bind(id, id, state).run();
}

async function integration(db, id, missionId, commit = "b".repeat(40), integratedAt = 2) {
  await db.prepare("INSERT INTO claims (id,mission_id,cultivator_id,state,claimed_at,expires_at,reward_snapshot) VALUES (?,?,'private-season-actor','completed',1,9999999999999,'{}')")
    .bind(id, missionId).run();
  await db.prepare("INSERT INTO submissions (id,claim_id,cultivator_id,artifact_key,artifact_sha256,state,integrated_commit,created_at,integrated_at) VALUES (?,?,'private-season-actor',?,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','accepted',?,1,?)")
    .bind(id, id, `private-artifact-${id}`, commit, integratedAt).run();
}

test("the public season reports task states and deduplicated recorded integrations, never personal or spending scores", async (t) => {
  const db = await fixture(t);
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES ('private-season-actor','github','private-provider','private-handle','private-name',1)").run();
  await db.prepare("INSERT INTO ledger_events (id,cultivator_id,resource,delta,source_key,created_at) VALUES ('private-credit','private-season-actor','token',9876,'private-source',1)").run();
  for (const [id, state] of [["O1", "open"], ["O2", "open"], ["B1", "blocked"], ["B2", "blocked"], ["D1", "done"], ["D2", "done"], ["U1", "unknown-state"]]) await mission(db, id, state);
  await integration(db, "result-1", "D1");
  await integration(db, "duplicate-result", "D1");
  await integration(db, "missing-time", "D2", "b".repeat(40), null);
  for (const table of ["missions", "claims", "submissions", "cultivators", "inventory", "ledger_events"]) {
    for (const operation of ["INSERT", "UPDATE", "DELETE"]) await db.prepare(`CREATE TRIGGER season_readonly_${table}_${operation} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'Synthetic readonly boundary'); END`).run();
  }
  const response = await seasonProgressResponse(new Request("https://fixture.invalid/api/season"), () => db);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data, { state: "available", scope: "platform-records", season: "灵网初开",
    missionStates: { total: 7, open: 2, blocked: 2, done: 2, other: 1 }, recordedIntegrations: 1 });
  assert.doesNotMatch(JSON.stringify(data), /private-|9876|token|model|balance|cultivator|review/);
});

test("readonly season requests reject writes and caller-selected scopes before opening a database; unavailable is not zero", async () => {
  let opened = 0;
  const unavailableDatabase = () => { opened++; throw new Error("private-database-error"); };
  for (const query of ["?actor=private-season-actor", "?season=other", "?page=1", "?page=1&page=2"]) {
    const response = await seasonProgressResponse(new Request(`https://fixture.invalid/api/season${query}`), unavailableDatabase);
    assert.equal(response.status, 400);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await seasonProgressResponse(new Request("https://fixture.invalid/api/season", { method }), unavailableDatabase);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
  }
  assert.equal(opened, 0);
  for (const method of ["GET", "HEAD"]) {
    const response = await seasonProgressResponse(new Request("https://fixture.invalid/api/season", { method }), unavailableDatabase);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    if (method === "GET") assert.deepEqual(await response.json(), { state: "unavailable" });
    else assert.equal(await response.text(), "");
  }
});

test("incomplete, mismatched, future or invalid integration records do not advance the observed season", async (t) => {
  const db = await fixture(t);
  await db.prepare("INSERT INTO cultivators (id,provider,provider_id,handle,display_name,created_at) VALUES ('private-season-actor','github','private-provider','private-handle','private-name',1),('private-other','github','private-other-provider','private-other-handle','private-other-name',1)").run();
  for (const [id, state] of [["VALID", "done"], ["NO-TIME", "done"], ["APPROVED", "done"], ["WRONG-AUTHOR", "done"], ["UNFINISHED-CLAIM", "done"],
    ["BLOCKED", "blocked"], ["FUTURE", "done"], ["BAD-SHA", "done"], ["SHORT-SHA", "done"], ["BAD-TIME", "done"]]) await mission(db, id, state);
  await integration(db, "valid", "VALID");
  await integration(db, "no-time", "NO-TIME", "b".repeat(40), null);
  await integration(db, "approved", "APPROVED");
  await db.prepare("UPDATE submissions SET state='approved' WHERE id='approved'").run();
  await integration(db, "wrong-author", "WRONG-AUTHOR");
  await db.prepare("UPDATE submissions SET cultivator_id='private-other' WHERE id='wrong-author'").run();
  await integration(db, "unfinished-claim", "UNFINISHED-CLAIM");
  await db.prepare("UPDATE claims SET state='approved' WHERE id='unfinished-claim'").run();
  await integration(db, "blocked", "BLOCKED");
  await integration(db, "future", "FUTURE", "b".repeat(40), 9999999999999);
  await integration(db, "bad-sha", "BAD-SHA", "g".repeat(40));
  await integration(db, "short-sha", "SHORT-SHA", "b".repeat(39));
  await integration(db, "bad-time", "BAD-TIME", "b".repeat(40), "private-invalid-time");
  const response = await seasonProgressResponse(new Request("https://fixture.invalid/api/season"), () => db);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.missionStates, { total: 10, open: 0, blocked: 1, done: 9, other: 0 });
  assert.equal(data.recordedIntegrations, 1);
  await db.prepare("UPDATE missions SET state='open' WHERE id='VALID'").run();
  assert.equal((await (await seasonProgressResponse(new Request("https://fixture.invalid/api/season"), () => db)).json()).recordedIntegrations, 0);
  const head = await seasonProgressResponse(new Request("https://fixture.invalid/api/season", { method: "HEAD" }), () => db);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
