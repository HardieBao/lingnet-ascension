# MVP 候选快照的标准 / 规格双轴审查

主理人已确认从 `main / 35802fe8167c5a24e8d66787d14b984aa1da3aa5` 审查全部 MVP 必需改动。用户工作区未暂存、提交或推送。审查只读快照位于 `C:\Users\13013\AppData\Local\Temp\lingnet-mvp-review-0e21f5e7dc744826a888abfd73edbe9e`，HEAD 为 `0b7166e568e7fad98912771d06058599a473fa64`，相对基线有 282 个差异路径；快照包含 290 份候选文件，工作区干净，未纳入无关归档差异、凭据、依赖或生成产物。这个本地合成提交不计社区成果，也不是用户仓库的新分支或发布版本。

固定命令：`git -C <快照目录> diff 35802fe8167c5a24e8d66787d14b984aa1da3aa5...HEAD`；提交区间只有 `0b7166e Local immutable MVP audit snapshot only; no community credit`。已经核对基线可解析及差异非空，没有用原工作区的空提交区间冒称已审查。

按 `code-review` 技能分别派出 Standards 与 Spec 两个并行只读审查者。标准来源为 CONTRIBUTING、CONTEXT、维护中的 AGENTS 和用户四原则；规格来源为 plan.md、task.md 与 ADR 0003。没有伪造已批准 Issue、真人复核或发布签署。以下两轴保持分离，不将维护性建议和规格缺失混成一个排名。

## Standards

未发现当前源码能证实的硬性规范违例；启发式建议 2 项：

1. **P2，possible Primitive Obsession / Data Clumps：认领契约解析分散。** `site/lib/claims.ts:11` 将契约表示为 `reward_snapshot: string`；`site/lib/manifest.ts:29`、`site/app/api/reviews/[id]/route.ts:34`、`site/app/api/integrations/[id]/route.ts:42` 分别声明不一致的字段子集。引用：`JSON.parse(claim.reward_snapshot) as { deposit: number }`。建议在确需修改契约时增加小型统一类型/解析入口，保留现有存储格式；没有证明当前正常契约错误结算。
2. **P3，possible Speculative Generality：未使用的 UI 库范围。** 61 个组件目前页面直接消费其中 9 个；`site/components/ui/chart.tsx:4` 仍引入 `recharts`，`site/package.json:38` 仍包含相关依赖。建议评估实际交付范围，减少安装/类型/来源维护负担；属于判断，不是硬性违例。本轮不删除用户现有素材或组件。

本轴合计：硬性违例 0，启发式建议 2；最高为 P2 契约解析分散。没有执行发布审批。

## Spec

规格结论：尚未达到可发布 MVP。

1. **P1，缺失：模型硬预算。** `plan.md:352` 要求“模型用量记录与任务预算上限”。`site/public/runner.mjs:46` 拒绝非空预算，`:281` 只限制运行时间；已复现有限预算任务包被拒绝。
2. **P1，机制缺失：敏感成果不会冻结。** `plan.md:438` 要求“密钥、私人配置和来源不明资源触发元神冻结”。`site/app/api/submissions/route.ts:73` 只做结构检查，`:81` 只有待复核/需修订分支；附加假密钥样式的合格章程仍通过。没有使用真实密钥做测试。
3. **P1，部分：稳定 / 回滚结算缺失。** `plan.md:412` 要求“跨一个发布周期未回滚”，`task.md:558` 要求“回滚产生抵消事件”。`site/app/api/integrations/[id]/route.ts:85` 只有 Token/退款追加，未实现发布周期、稳定奖励、掉落与回滚抵消通路。
4. **P1，部分：六件装备与恢复。** `task.md:512` 要求“保存可恢复工作区”，Runner `:91` 只有运行元数据，储物袋、护心符、功法槽未实现；`:170` 拒绝代码任务本地预检，未满足 `plan.md:272`“提交前运行完整本地预检”。
5. **P1，部分：可操作渡劫与首赛季任务。** `plan.md:356` 要求“渡劫任务与境界突破”；`site/app/realm-actions.tsx:44` 无筑基/金丹入口。只有五张种子悬赏；`site/tests/mission-graph-contract.test.mjs:18` 因对应实现缺失而跳过，未满足 `task.md:437`“循环依赖拒绝”。
6. **P2，错误实现：修订绕过总租约。** `plan.md:184` 固定“自开跑起累计最长为黄阶 2 小时”；`site/app/api/reviews/[id]/route.ts:60` 修订时无条件再给两小时。独立审查用真实路由 SQL 的内存数据库复现：24 小时前开跑的黄阶认领被恢复运行，仍可再次提交；主审又核对了路由与 `heartbeatExpiry` 的不一致。错误尚未修复，不冒称当前数据中已经发生真实事故。

本轴未发现明确额外功能越界。真人渡劫、25 个社区成果、三周版本、生产对账与复盘仍为如实披露的发布前置条件；生产 Cron、第二审批人同意、设计与检查点规则确认不能由本地 QA 替代。

本轴合计：6 项，5 项 P1 缺失/部分、1 项 P2 错误实现；最高为模型预算等 P1 发布阻断。没有将标准轴“0 硬性违例”抵消规格轴的结论。

## 本轮处置

定时事件的已确认实现范围已完成本地验证，原筑基/金丹接口回归也通过：14 个合成账号对账无差异，真实一分钟到期及重复退款通过；没有模型调用、真实合入、正式贡献或生产定时任务。现有结算 SQL、费用与资格未改，构建输出确认 `triggers` 为空。

维护性建议不引发无关重构或删除。修订租约错误已核对，但它需要新增“宗门复核→修订后的认领/任务包/上传”测试边界；按 TDD 技能先向主理人确认后再进入修复循环。其他 P1 项保持为未完成，不通过改写 MVP 定义或合成签署消除。
