# Sub2API 接口前置核查（未放行真实生成）

日期：2026-09-27。主理人明确确认：Sub2API 是独立项目，但灵网纪元仍可使用它提供的模型 API。该确认不授权修改另一项目的账号、路由、余额、配额或部署。

## 本机配置与实测

本机忽略文件 `site/.env.local` 已有主理人此前轮换、撤销旧值后填写的密钥，但没有接口地址。本轮只补入 `LINGNET_MODEL_BASE_URL=https://sub2api.ai2remote.com/v1`，未改写密钥，也未设置真实运行放行标志。

使用本机已获授权的密钥，对指定 HTTPS 域名执行 1 次模型目录读取和 7 次输入计数请求；拒绝重定向，设置超时和响应大小边界，输出仅保留状态、布尔值及数字。没有提交生成请求、私人会话、仓库代码或 GitHub 凭据，没有测试收费，不得据此宣称零费用。

| 请求 | HTTP 状态 | 核查结果 |
|---|---:|---|
| 模型目录 | 200 | `data` 为列表，存在 `gpt-5.6-sol`；不证明生成时的实际模型映射 |
| 短纯文本计数 | 200 | `response.input_tokens`，3 |
| 相同文本的消息结构计数 | 200 | 8 |
| 消息加重复的合成 instructions | 200 | 133 |
| 消息加合成本地 function 工具描述 | 200 | 201 |
| 重复的合成中文文本 | 200 | 1,000 |
| 消息加 32 字节构造的无效 encrypted reasoning | 200 | 13 |
| 消息加 4,096 字节构造的无效 encrypted reasoning | 200 | 13 |

推理输入是公开合成的无效填充，不是真实模型密文；两次计数相同不能证明有效推理状态的真实 Token 数，也不能独自证明线上运行了哪一版本代码。

## 公开源码识别的契约风险

只读检索 Sub2API 公共仓库，固定提交 `a3eb7ef302961cba716dc78b39b93b60c467db0e`。未克隆或执行其代码，未登录另一项目后台；公共仓库版本不等于该域名部署版本。

- [计数实现](https://github.com/Wei-Shaw/sub2api/blob/a3eb7ef302961cba716dc78b39b93b60c467db0e/backend/internal/service/openai_gateway_count_tokens.go)：部分上游类型或不支持计数的上游会走本地估算；估算与上游计数均可返回 200 和同样的 `response.input_tokens` 格式。估算遍历未计入 encrypted content。实测与这条路径吻合，这是推断，不是部署路由证明。
- [OAuth 转换](https://github.com/Wei-Shaw/sub2api/blob/a3eb7ef302961cba716dc78b39b93b60c467db0e/backend/internal/service/openai_codex_transform.go)：对应 Codex OAuth 路径会删除 `max_output_tokens` / `max_completion_tokens`。
- [兼容重试](https://github.com/Wei-Shaw/sub2api/blob/a3eb7ef302961cba716dc78b39b93b60c467db0e/backend/internal/service/openai_responses_rejected_field_retry.go)：特定上游拒绝参数时可删除输出上限后重试；[转发入口](https://github.com/Wei-Shaw/sub2api/blob/a3eb7ef302961cba716dc78b39b93b60c467db0e/backend/internal/service/openai_gateway_forward.go)调用该兼容逻辑。不能假定客户端参数一定被完整保留。

OpenAI Docs 的[计数与输出说明](https://developers.openai.com/api/docs/guides/token-counting)指出输出限额覆盖非可见生成 Token；这只说明官方协议语义，不证明 Sub2API 的部署、模型映射、转发或计费契约遵守同样约束。

## 当前结论与下一步

模型目录及输入计数接口可访问，不等于 30,000 总模型 Token / 2,048 单请求输出硬限制已通过。真实生成保持关闭，不用估算、超时或事后超额检测替代请求前限制。

解除真实模型运行门禁仍需接口级证据或服务提供方可核实的契约：完整输入准确计数；计数和生成使用一致模型/输入契约；输出上限包含推理且不会被删除、放宽或在隐藏重试中绕过；实际用量和收费边界可核对。不能用估算或事后检测代替原硬预算要求。

最新范围确认：Sub2API 仅是灵网纪元的外部模型 API 依赖，不是本任务待开发、审查或发布的项目。此前把接口核验扩大到后台核查的安排已停止，不再要求主理人登录、提供后台日志或处理另一项目的配置。后续只处理灵网纪元自身的接口适配、验证和发布；未核实的模型功能保持关闭。后台登录不列为灵网纪元上线的必经步骤，受控内测部署与正式 MVP 放行仍分别遵守原有安全及业务门槛。

现有未核验代理拒绝启动的定向测试重新运行：1 通过、0 失败。GitNexus 核对仓库/分支/index 并通过 query/context 定位 Runner 入口；没有修改业务函数，私密配置不在索引中，另查字段与忽略规则。没有提交、推送或部署站点，本记录不关闭 MVP 发布门禁。
