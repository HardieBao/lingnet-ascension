# 后续生成与虚拟材料：来源分类与明确缺口

日期：2026-09-28。复核bundle-inventory中14个未匹配文件以及10个虚拟模块类别；只做本地诊断，不改变产品代码/配置、模型调用、账号权限或生产账本。仍不等于完整法律兼容/权利链放行。

## 14文件分类

| 分类 | 数量 | 实际核对 |
| --- | --- | --- |
| 自有公开Runner模块 | 6 | 与site/public中各源文件原始字节及SHA-256一致；不将它们归为第三方构建工具原创。 |
| Vinext客户端资产侧文件 | 2 | server及server/ssr的vinext-client-assets.js，解析JSON后按安装的buildPagesClientAssetsModule模板重建原始字节一致。 |
| RSC资产清单 | 2 | 两个__vite_rsc_assets_manifest.js字节相同；当前无RuntimeAsset的对象按原serializeValueWithRuntime的JSON二空格模板重建一致。 |
| Next客户端清单 | 2 | _buildManifest.js/_ssgManifest.js与安装的两个原生成函数返回字节一致，不靠手写假清单代替。 |
| 后期改写的客户端块 | 2 | 原144块中两个哈希不等块的完整差异验证如下；不是简单忽略全部不同代码。 |

- dist/client/_next/static/chunks/index-Dkn7FyOd.js：早期SHA-256 56da76f97b8da756395628b1e44017c7b846232679b274b0784819dcc0d9fa5e，最终SHA-256 1ab49c9a599e4693be4952b3d65955e7205ea2e4958788f4bdc025fc62f8d0f5；仅在前端增加Vite原模板依赖映射，并将17个__VITE_PRELOAD__标记替换：12个映射调用、5个void 0。逐个替换位置之间的全部原始片段均保持字节一致，无其他尾部/前部改写；新前缀按Vite原模板和纯JSON路径数组完整重建一致。模块属于vinext / @vitejs/plugin-rsc / react-server-dom-webpack / react-server-dom-webpack/client.browser.js，并未发现这些块新增其他物理依赖根。
- dist/client/_next/static/chunks/link-Bp1OZ8a8.js：早期SHA-256 d91d8be97992148ebbe02309d7eb98e0aa57ea6349fef47c69e45f7ee8de6b6d，最终SHA-256 424bcddba022416963f30e0b9d09bc7ed4545029bf4def748cf2eb30c291b6ae；仅在前端增加Vite原模板依赖映射，并将6个__VITE_PRELOAD__标记替换：6个映射调用、0个void 0。逐个替换位置之间的全部原始片段均保持字节一致，无其他尾部/前部改写；新前缀按Vite原模板和纯JSON路径数组完整重建一致。模块属于vinext，并未发现这些块新增其他物理依赖根。

诊断追加了代码快照，只保留在本机临时目录，不提交/上传原始编译代码或环境变量。首次尝试本机diff包发现未安装，没有安装新包；改用明确Vite标记/模板规则逐段比较。临时脚本GitNexus impact返回目标不存在、UNKNOWN，不能视作LOW或零影响；现有配置query有效，框架/临时脚本不在索引，另补读原生成器并执行实际构建/字节核对。目录恢复须使用原npm构建，不能把诊断候选称为当前生产二进制。

## 10个虚拟ID的生成来源

| ID / 类别 | 已定位源文件/工具 | 仍保留的限制 |
| --- | --- | --- |
| virtual:vinext-cache-adapters | vinext/dist/cache/cache-adapters-virtual.js | 当前无自定义适配器，注册为空操作；不推断任意未来自定义适配器权利。 |
| virtual:vinext-image-adapters | vinext/dist/image/image-adapters-virtual.js | 当前无图片适配器，不涵盖外部图片权利。 |
| virtual:vinext-rsc-entry | vinext/dist/index.js及entries/app-rsc-entry.js | 混入本项目路由，项目代码与框架原始部分分别适用其许可。 |
| virtual:vinext-app-browser-entry | vinext/dist/index.js及server/app-browser-entry.js | 不将生成框架代码自动改称项目原创。 |
| vinext:async-hooks-stub | vinext/dist/plugins/async-hooks-stub.js | 客户端空操作AsyncLocalStorage，来源是框架生成器。 |
| virtual:vite-rsc/css | @vitejs/plugin-rsc/dist/plugin-CLvIS10V.js | CSS输入另保留已确认的三份样式来源，不扩大到字体/图片。 |
| virtual:vite-rsc/client-references | @vitejs/plugin-rsc原引用生成器 | 混合引用元数据与运行代码，原框架版权通知仍保留。 |
| vite/preload-helper.js | vite/dist/node/chunks/node.js | 依赖映射及预加载生成代码，新增完整Vite核心许可。 |
| rolldown/runtime.js | rolldown运行代码及已匹配runtime块 | 新增包完整LICENSE和完整THIRD-PARTY-LICENSE，不只保留VoidZero主体。 |
| virtual:cloudflare/worker-entry | @cloudflare/vite-plugin/dist/index.mjs virtualModulesPlugin | Worker包装及nodejs compat注入应归原工具；任意未来额外polyfill/嵌套材料仍需核查。 |

## 固定原文

Vite8.3.0、Rolldown1.2.10、@cloudflare/vite-plugin1.58.0固定npm元数据/压缩包SHA-512逐一等于锁文件，前两包原文文件与本机原文件原始SHA-256一致。公共THIRD_PARTY_GENERATED.md保留Vite完整核心段、Rolldown两个完整文件以及Cloudflare固定源MIT原文，不发布所有未使用的构建依赖清单。

Cloudflare1.58.0发布包无根目录原文；公开npm来源声明的包SHA-512与锁定包相同，声明resolvedDependencies指向workers-sdk a1f05a34643c2d8774ab7791fdf5b35f6f7770fa。该提交package manifest名称/1.58.0/MIT一致；根目录实际有LICENSE-MIT及LICENSE-APACHE，而不是LICENSE。保留[LICENSE-MIT](https://github.com/cloudflare/workers-sdk/blob/a1f05a34643c2d8774ab7791fdf5b35f6f7770fa/LICENSE-MIT)，blob a0e7ebf133868d6c1759cfb09f3c05d4cce430c8，SHA-256 9bb3b077cc8628334bab25961223dd8207252c8a56aa054195be38f1c042aaf4，不以读声明代替DSSE/Sigstore验签，也不改称包内原文。

本次实际client目录仅4份SVG，无woff/ttf/otf/png/jpg/webp/gif；三份模板SVG已有固定来源通知，favicon属于项目现有素材。未因此认定所有仓库素材有授权，尤其未解决源仓库概念PNG或三个组件本地修改的作者/授权。14文件的生成/复制来源已更具体，但原始依赖包内部其他嵌套版权、最终独立签署与生产事件观察仍需保留检查，MVP所有十项门禁不变。

## 本地恢复与交付验证

四段通知原文内容完整匹配，Vite核心段副本SHA-256 e373c2e74cd342b9e74d0b8813a8fddf3c9788515669a79c2ac238195673d38b；Rolldown LICENSE与原SHA相同，THIRD-PARTY-LICENSE只补末尾LF，副本SHA为743d64c1f8a673ddcfd1740aa81672eac950ad7e63f6ba2d7c39f91dd57c5b99；Cloudflare MIT副本与固定源SHA相同。未将Vite核心段副本称为完整112425字节包许可文件。

原npm构建恢复退出0，生成通知源码/dist副本均8308字节、SHA-256 581ec487aad54493ba1266edf66acd1292e70fcd86004191b17e30b3822c63f9；普通143项/142通过/1跳过/0失败，类型与lint退出0。受限配置/实际构建/API/D1合成登录驱动退出0，模拟身份不计真人成果。Wrangler4.137.0严格试部署退出0：58静态文件、117附加模块、1198.04KiB/gzip345.66KiB，原配置与绑定保持不变。

上述是本地与试部署结果，仍需线上读回；动态首页本轮实际429/1027，没有修改套餐或借用其他服务绕过限制。旧资料提交1841355的远端36348926828已完成成功，不把它当作新诊断候选的远端构建证据。
