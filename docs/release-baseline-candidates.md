# MVP 发布基线候选盘点

盘点日期：2026-09-27。原工作区为 `main`，`HEAD` 为 `35802fe8167c5a24e8d66787d14b984aa1da3aa5`。主理人已明确确认以该提交为固定基线，审查全部 MVP 必需改动，保留其他工作及私密配置。本文件仍是候选盘点，不是正式审查放行、用户工作区提交或发布版本。

## 当前证据

盘点时（不含本文与新 tracker 文档）有 202 个普通 Git 差异路径、85 个未跟踪文件，共 287 个候选路径；其中 261 个属于站点、CI 或工作流。用户工作区 `git diff --cached` 仍为空，不能将状态中的新增文件误称为已暂存。原工作区固定基线到 `HEAD` 的提交区间仍为空；主理人确认后已在独立临时快照建立非空差异并完成双轴审查，见 [审查记录](verification/mvp-two-axis-review-2026-09-27.md)。快照合成提交不计社区成果，也不是用户仓库提交，规格轴未通过 MVP 放行。

14 份迁移 SQL 及各自快照都存在，journal 对应关系完整；其中以下 7 组尚未被 Git 跟踪，准备候选提交时必须与 journal 一起纳入：

| 迁移 SQL | 配套快照 |
|---|---|
| `site/drizzle/0001_amusing_kingpin.sql` | `site/drizzle/meta/0001_snapshot.json` |
| `site/drizzle/0005_small_king_cobra.sql` | `site/drizzle/meta/0005_snapshot.json` |
| `site/drizzle/0006_jittery_cobalt_man.sql` | `site/drizzle/meta/0006_snapshot.json` |
| `site/drizzle/0007_ledger_immutable.sql` | `site/drizzle/meta/0007_snapshot.json` |
| `site/drizzle/0008_nonnegative_ledger.sql` | `site/drizzle/meta/0008_snapshot.json` |
| `site/drizzle/0012_nasty_the_stranger.sql` | `site/drizzle/meta/0012_snapshot.json` |
| `site/drizzle/0013_core-trials.sql` | `site/drizzle/meta/0013_snapshot.json` |

## 必需但未跟踪的实现

不能只依据普通 `git diff` 生成发布包。当前还有下列必需内容，需按实际文件清单纳入候选并核对依赖：

- `ci/Dockerfile`、`site/build/sites-vite-plugin.ts` 与配套 MIT 许可。
- 代码投稿、复验提交/决定、成果复核与成果文件读取接口。
- 账本、任务操作和独立复核页面/组件。
- 认领插入/租约、代码来源/合入、经济对账、正式成果计数、悬赏资格/历史/初始化/解锁、境界突破、同源校验、复验计数、退款和审判模块。
- 对应的普通测试、四份文档产物合成 fixture，以及认领并发、装备并发、金丹渡劫、复验 HTTP 验证脚本。

这些文件已参与之前的本机/容器验证，但仍未成为远端版本。纳入候选也不能把合成 fixture 和测试记录计作正式成果。

## 排除与保留

- 本机 `.env*`、`.dev.vars*`、认证文件、私钥、私人会话、`node_modules/`、`dist/`、`.wrangler/`、`.lingnet/`、检查点与生成状态不得纳入候选。当前路径盘点未发现这些内容，`site/.env.local`、构建输出和本地 D1 状态均被 Git 忽略；没有读取密钥值。
- 对盘点时 287 份候选文本执行常见 API key、GitHub token/PAT 和私钥头标记的只读检查，仅输出路径/行号/类型，未输出匹配正文；无跳过文件、无命中。这仅是有限字面特征检查，不排除未知格式凭据、个人信息或其他安全问题，不能替代发布安全审查。
- `archive/public-good-research/scripts/build_catalog.ps1` 与 `csv-safety.ps1` 属于此前目录研究工作，不依赖于当前游戏运行；保留其已有改动，不默认混入 MVP 技术初始化提交。
- `AGENTS.md`、`CLAUDE.md`、`.claude/` 和 `.superdesign/` 是维护/设计资料，不能因不是运行源码就删除或覆盖；是否随候选同步应单独明确。设计草案不是已实现界面。
- `docs/assets/task-hall-concept.png` 的来源仍待权利人确认。三份模板 SVG 已与固定 Next.js 源文件比对，MIT 通知见 `site/public/THIRD_PARTY_ASSETS.md`；组件及已核对基础包的通知见 `site/public/THIRD_PARTY_COMPONENTS.md`，来源清单见 `docs/licenses/component-provenance.md`。候选发布需保留这些通知及组件目录通知，不能把上述有限范围核对扩展为全仓素材、传递依赖或本地修改的授权审查已完成。

## 下一步

1. 固定基线已确认；真实 Issue 的批准与正式贡献记录仍须另外核对，不猜编号或伪造批准。
2. 在独立审查快照中包含全部必需候选文件，保留用户工作区和暂存区。
3. 分别执行编码标准与规格审查，保留两轴结论；另完成当前补丁的安全与许可审查。
4. 必要修订后重新运行本机、受限容器和实际远端 CI；获准后再整理新分支和草稿 PR。

本轮没有暂存、提交、推送、创建 PR、删除文件或改变生产角色；正式 MVP 仍须满足 `plan.md` 第 17 节的全部十项条件。
