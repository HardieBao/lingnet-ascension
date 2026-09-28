# 发布基线的首次真实远端自检

日期：2026-09-28。不改任务贡献验证规则，不证明主分支初始化、真实PR合入、社区成果或正式MVP完成。

## 当前来源与审批边界

实际远端main仍`35802fe8167c5a24e8d66787d14b984aa1da3aa5`，无站点与可信验证器；预览分支此前为9d84a843。GitHub查询无现有PR，只有8张治理Issue，GOV-001为ready、其余blocked；没有已批准的平台初始化Issue。当前CLI账号HardieBao/134252261与仓库负责人一致，但账号权限不等于独立复核或正式批准。

普通PR工作流会从base.sha读取trusted/ci/verify-pr.mjs，而当前main尚无该文件；不得拿仅授权章程的GOV-001覆盖整个平台，也不得伪造Issue批准或把自检当社区任务验收。已向主理人请求单独确认平台初始化审批Issue和草稿PR范围，当前未创建、未合入main。

## 最小配置改动与保护证明

仅改`.github/workflows/trusted-baseline.yml`：push自检加入现有预览分支；push作业命名“Platform baseline self-check (not task verification)”；干净环境先生成框架类型，再运行原测试/类型/lint/构建。标准ubuntu-latest、contents:read、固定第三方Action提交及persist-credentials:false不变，不添加秘密、工作流写权限或生产部署。

- 两个固定Action SHA经官方GitHub仓库API实际确认存在，没有从标签备注猜版本或替换为浮动标签。
- GitNexus查询/context核对贡献验证入口和范围分类；YAML触发关系不能由符号图充分覆盖，补读完整工作流、服务端run/event/head/merge校验以及具体diff。
- YAML用已有js-yaml解析；PR仍只面向main，整个pull-request作业相对9d84a843逐字相同，权限只读，typegen在typecheck之前。最初尝试不存在的yaml包失败，改用已安装的js-yaml，没有增加依赖或把失败称通过；本地未发布的首个hunk作用域偏差也被实际读回纠正，最终仅扩展push分支。
- 现有CI范围和代码PR来源20项测试全部通过，含混改验证器拒绝、只读断网候选检查、精确head/merge/attempt标记缺失拒绝；未修改测试、任务scope或可信CI接受条件。
- `inspectCodePullRequest`只接收event=pull_request，且限定工作流路径、当前head、成功pull-request作业和精确Verified标记；预览push自检绿色不能用于领奖或代码提交通过。

## 真实远端运行

增量提交`cd34f25eb8ad13fca42aff95e66d3a0471506be6`，父提交9d84a843；临时索引只纳入该工作流。真实暂存区为空，用户工作区main和无关归档/维护文件保持不变。无需重发Worker，因为站点运行代码未变。

[运行36340810150](https://github.com/HardieBao/lingnet-ascension/actions/runs/36340810150)绑定上述headSha，event=push，状态completed/success；[自检作业108680391964](https://github.com/HardieBao/lingnet-ascension/actions/runs/36340810150/job/108680391964)于2026-09-27T18:29:10Z至18:29:53Z（北京时间9月28日02:29）在实际GitHub Linux环境运行。

安装禁用脚本、框架类型准备、普通测试、类型、lint与构建六项步骤均success；远端普通143项为142通过/1跳过/0失败，跳过不计通过。作业显示的原步骤名“Checkout main”是旧名称，实际checkout由事件决定，headSha和源分支是cd34f25/pre-alpha-2026-09-27，不代表main被改。

同一运行的pull-request作业为skipped，未执行trusted-base贡献验证。首次列表为空时尚未确认live handle；随后实际查询得到运行in_progress，等待同一36340810150并读回completed/success，没有因观察空列表重建提交或重复运行。

## 仍缺的正式证据

这补齐了当前平台源码的真实远端干净自检，未关闭可信贡献基线缺口。平台初始化须有真实审批范围、独立复核与合入决定，再建立main上的验证器；随后还须用真实PR的当前head/test-merge/attempt证明任务门禁。不能削弱守卫、标ready、解锁代码任务或计社区成果。

稳定结算/回滚待确认与实现、真实模型限额契约、来源许可/生产运维、真人渡劫、25成果、三周可玩版本及签署复盘等原发布条件保持未完成；本轮未新增计费、模型调用、财务角色或生产账本事件。
