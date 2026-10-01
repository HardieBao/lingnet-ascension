# GitHub 大提交元数据核验：本地修复

日期：2026-10-01。最初本地阶段的复现和结果保留如下；后续独立[草稿PR #20](https://github.com/HardieBao/lingnet-ascension/pull/20)及真实可信CI已经建立，精确身份见文末。尚未真人批准、合入、部署或启用生产结算，没有新增正式成果目录接口或公开个人字段。

## 实际只读证据

灵网自己的公开 main `40d8180f3b9b0573a6deb3314ad7176156cc7370` 的普通提交响应为1,200,861 UTF-8字节，本次第一页含300个文件条目；现有元数据JSON读取上限32 KiB，因此不能用于只提取该提交SHA。相同提交按SHA媒体类型请求只有40字节，SHA完全一致。

比较固定 `35802fe...40d8180` 时，`per_page=1` 的响应为1,205,203字节；`per_page=1&page=2` 为9,990字节，顶层关系均为ahead。相同提交的第二页比较也返回identical。第二页的文件字段未返回，不能将PowerShell对null数组的Count=1误记为一个文件。依据[GitHub提交与比较接口文档](https://docs.github.com/en/rest/commits/commits)，SHA媒体类型适用于提交引用，比较文件差异只在第一页提供。

实际修正后的只读核对：`inspectCurrentRollback`对固定main的公开GOVERNANCE.md得到rolledBack=false，文件SHA-256为 `8f211ce992948520e821646afe92752c0526b24cfd9006af786f3c4207204518`；`verifyMissionIntegration`亦通过同一文件的main祖先关系/摘要检查，比较响应11,300字节，文件4,820字节。这只证明公开文件读取，不证明该待签章程已被真人接受或成为正式成果，没有写生产数据或调用模型。

## 精准改动与固定身份

- `site/lib/stable-versions.ts`：新增私有SHA读取器，请求 `application/vnd.github.sha`，分块读取最多64字节，只接受完整40位十六进制SHA并归一化；拒绝超限、无效、不可用响应。版本标签与当前main都复用它；关系比较改为非第一页元数据。
- `site/lib/github-integration.ts`：同样只调整祖先关系比较的分页请求；ahead/identical条件与指定提交中的成果字节验证不变。
- JSON元数据原32 KiB、成果原128 KiB上限不放宽；不可变正式Release、七天间隔、发布时间、祖先关系、同一文件摘要与当前main回滚条件不变。此修复不宣称所有GitHub响应大小、慢请求或接口故障已解决。

两个本地提交保留：SHA修复 `5728e813609b34c7b1b0d47d16dff58591bb0df6`（父8ab45204），比较修复 `7e0593d30b141c6264d388aa323404bd0145d3ab`（父5728e813），最终完整tree `98ac6cb8a5f6975e436c18ec7efdbda07c1223ce`。它们在已有自有验证副本中固化，不是仅两文件相对公开main的独立提案；祖先仍含PR19与六件合成证据。后续发布源码必须另核对独立基线/实际diff，不能把整棵本地tree无声叠到main。

| 最终材料 | SHA-256 |
| --- | --- |
| `site/lib/stable-versions.ts` | `36947CECE28F65DA393E64E2D4157BADAB9974BE74C362BE60E229B599A46519` |
| `site/lib/github-integration.ts` | `805DE84DDFB93CB48490866391EF4D4BDBD73C597EFAADCFBBF7989D9C158B24` |
| `site/tests/stable-versions.test.mjs` | `8A91F603DAAEE8621644A0CE9561CD866770FA3C70CA5067F57901E89A7993EA` |
| 原结算演练脚本更新版 | `5D44EDC4C3FBBB18DA4FD5428D02F55BC286836F808F01627ECAD3F687D5B028` |

新测试另存本地Git blob `cc2685893e125754fa444e0ff827f6a9fa5a7853`，演练脚本为 `8c0d736fc783cb9b7a1eba08fc8f9013eb1017ae`；不在这两份业务源码提交中。另一个本机integrated辅助副本同步调整了同样的合成响应，没有改动既有公开证据提交。

## 红绿与回归

首先通过现有导出接口复现大提交JSON拒绝：回滚用例退出1，修正后通过；随后稳定版本用例在标签解析处退出1，补齐三处SHA解析后通过。最后新增比较元数据请求用例，旧请求未指定非第一页而失败，两条比较调用修正后通过。只模拟GitHub这一外部边界，不模拟自身核验函数。

最终7项补测覆盖大提交、标签/main、异常/超限/不可用响应、分块大写SHA、非不可变版本仍拒绝、文件改变仍回滚，以及关系/文件核验均使用第二页。已提交基线143项加新7项实际为150 tests/149 pass/0 fail/1原有skip；类型、全量lint和构建退出0。不是远端CI执行150项，也不包含本机另10项功法测试。一次测试启动命令有括号语法错误、未执行任何测试，已正确重跑，不计作通过。

构建后的原Worker/API/D1结算演练退出0，仍验证正式版本结算、回滚欠账、消费保护和独立解除；仅将外部模拟提交响应升级为实际SHA媒体类型并断言请求头。合成维护者/版本/奖励不等于真人与真实赛季。原脚本退出前校验临时路径在系统TEMP且带自建前缀，清理自己的D1样本；没有删除用户工作区或被拒绝清理的依赖链接。

遵循TDD先失败后修正，以及Cloudflare的有界流读取原则；实际核对最新Workers类型 `5.20261001.1` 的TextDecoder/getReader签名，仅下载到临时目录，未升级项目依赖或修改绑定、兼容日期和配置。既有Vite警告保留，不称零警告。

## 影响与未关闭门槛

修改前GitNexus查到版本与回滚调用者；共享 `verifyFileIntegration` 上游8符号/4条业务流程为HIGH，已在改动前说明，涉及正式合入、独立复验及稳定结算。更新索引使用force/index-only保留AGENTS与技能。暂存差异只含当轮业务文件，并与实际diff逐份核对；最后增量检测为2文件/2符号/0流程/LOW。这个增量结果不能代替完整HIGH上游风险，也不能证明HTTP、分页、SQL或框架回调全被图覆盖；已另用真实只读请求、导出接口及合成API/D1验证。

用户原工作区仍main/35802fe，暂存区空，索引SHA-256保持 `C03648BD873C81F928D088EAAB947FDB1A459EEE6EFA051E3A96E5A3D7F26FE8`。原问题的运行/索引句柄均已读回终态，未重启同一任务或伪称等待真人是活进程。

闭关页的本机/平台数据边界与90%提示建议仍待真人选择；本轮没有把自动goal续跑当确认，也没有上传模型数据。原plan.md §10.1还要求完整修士档案/隐私设置、洞府、宗门/天骄榜和公开版本成果列表：目前资源侧栏与本人账本不是这些功能全部完成的证据。已有formal-results计数只核对数据库中的正式合入条件，不核验某个Release的成员；私有提交/成果读取接口不能直接当公开目录。

GOV-001签署、#9独立审计、两维护者生产授权和第17节十项真实验收全部保持原要求。这个修复不产生公开版本、社区成果、真实渡劫或模型成本证明，也不赋予自动合入资格。

## 后续独立提案与真实可信检查

公开head `ce5d95c18e133350bcaf9416a4420715a23dea94`，完整tree `2a4efda34b17c8023345634444eb0acf2ba978a6`，唯一父为main `40d8180f3b9b0573a6deb3314ad7176156cc7370`。本机独立候选 `ff275397eff1ace755431734b22c52c4bd89d6b2` 与之同树，仅两份业务库，27行新增/11行删除；逐份远端blob与本机Git对象相同。没有叠入PR19装备源码或六件证据，没有覆盖旧草稿。

独立候选再次执行150项（149通过/1原有跳过）、类型/lint/build和升级外部响应的原结算Worker/API/D1演练，均退出0。仅复用既有依赖链接，不称干净独立安装。新7项测试和模拟脚本不在这两份公开业务源码内。

[真实pull_request运行36865086447](https://github.com/HardieBao/lingnet-ascension/actions/runs/36865086447)已读回completed/success；`pull-request` job `110378496607`的可信基线检出、验证器和最终成功步骤均通过，精确为 `Verified ce5d95c18e133350bcaf9416a4420715a23dea94 on merge 165272d090b9b0f29270b81d7d8a2d2da4b87146`，与PR API测试合并SHA一致。实际日志143 tests/142 pass/0 fail/1 skipped及类型/lint/build完成；Platform baseline self-check预期skipped，不写成全部作业成功。远端不包含新7项，不能写成150项CI。

独立候选index-only刷新对应ff275397，上游共享核验仍HIGH/8符号/4业务流程。compare检测包含工作树中另行修改的外部模拟脚本，因而显示3文件/7符号/LOW；精确Git对象比较固定main到候选只有两份业务源码。组装临时索引时默认cached统计相对旧组合HEAD曾显示删除旧组合内容，已通过显式base/candidate比较确认未进入此提案；不能把该临时统计当作公开PR范围。没有把0流程/LOW替代完整上游HIGH判断。

当前PR20 draft=true、merged=false、实际reviews为空，main仍40d8180。这份提案不表示任何真实维护者已独立批准。后续新增测试、模拟脚本与本记录以单独固定材料提供复核，不改变源码head或已完成CI；此前被拒绝的#17证据同步没有重试、包含或换通道。
