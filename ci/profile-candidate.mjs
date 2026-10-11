import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// Only PR21's fixed schema shape is proposed here, not general migration/test permissions.
export const PROFILE_CANDIDATE_PATHS = ["site/app/api/profile/route.ts", "site/app/api/profiles/[publicId]/route.ts",
  "site/app/cultivators/[publicId]/page.tsx", "site/app/dwelling/dwelling.css", "site/app/dwelling/page.tsx",
  "site/app/dwelling/profile-settings.tsx", "site/app/page.tsx", "site/db/schema.ts",
  "site/drizzle/0017_cultivator_profiles.sql", "site/drizzle/meta/0017_snapshot.json",
  "site/drizzle/meta/_journal.json", "site/lib/cultivator-profile.ts", "site/scripts/verify-profile-privacy.mjs"];

const MIGRATION_DIGESTS = {
  "site/drizzle/0017_cultivator_profiles.sql": "9fd074010ca837b78697bbadb3f1e92a155f3de7e22eb16aab27fd329ca1af16",
  "site/drizzle/meta/0017_snapshot.json": "d3f7c63bc5f3f7bd20881ad88c7268baf81f3ab2924b5076aa8b5f1360c1d300",
  "site/drizzle/meta/_journal.json": "7657ac2998ae337688ffbcc636bc2ea6e419722b6ee04162ac193ee3a6a9a8df",
};

export function validateProfileCandidate(candidate, paths) {
  const git = (args) => execFileSync("git", args, { cwd: candidate, maxBuffer: 1024 * 1024 });
  if (paths.length !== PROFILE_CANDIDATE_PATHS.length || new Set(paths).size !== paths.length ||
      paths.some((path) => !PROFILE_CANDIDATE_PATHS.includes(path))) throw new Error("档案候选范围不完整或含未授权路径");
  if (git(["status", "--porcelain"]).toString().trim()) throw new Error("档案候选必须是干净的固定 Git 副本");
  for (const path of paths) {
    if (!/^100(?:644|755) blob /.test(git(["ls-tree", "HEAD", "--", path]).toString())) throw new Error("档案候选不能删除文件或引入链接");
    const bytes = git(["show", `HEAD:${path}`]);
    if (bytes.length > 512 * 1024) throw new Error("档案候选文件超过限制");
    if (MIGRATION_DIGESTS[path] && createHash("sha256").update(bytes).digest("hex") !== MIGRATION_DIGESTS[path]) {
      throw new Error("档案迁移、快照或日记不匹配固定契约；新迁移形状需另行审阅");
    }
  }
}
