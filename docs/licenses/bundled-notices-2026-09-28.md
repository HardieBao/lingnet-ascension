# 构建已观察材料：许可原文补齐与来源绑定

日期：2026-09-28。沿bundle-inventory的49包清单补齐通知；源代码与锁文件不变，不增加模型调用、生产数据或许可兼容性结论。已有12项通知作为历史记录保留，本轮扩大实际明确覆盖范围，不将旧记录改成曾经覆盖所有依赖。

## 官方固定发布包核验

49个npm固定版本元数据的dist.integrity逐一等于锁文件；49份在内存下载的压缩包共7170968字节，逐包SHA-512相同。tar根目录原文集合与本机完全对应：47个包共48份LICENSE/NOTICE/CopyrightNotice，12组不同原文哈希；另两个包均无根目录原文。逐个文件名、数量、SHA-256、字节长度都比对，不只比对文件数量。没有安装或升级包、关闭TLS校验或把签名存在称为独立验签。

## 两个缺原文包的具体证据

1. @vitejs/plugin-rsc 0.5.35：固定npm元数据gitHead为a309c8b0b0303c008a4d7b07881bea7e0b6cbbbb；该提交packages/plugin-rsc/package.json的名称、版本、MIT声明一致。原文取自[固定源LICENSE](https://github.com/vitejs/vite-plugin-react/blob/a309c8b0b0303c008a4d7b07881bea7e0b6cbbbb/LICENSE)，Git blob 9c1b313d7b18166024d52473b2ed645f5b4e64dd，1103字节，SHA-256 29b68325fe026047d13e187b44c33b2acacf7dc647dec4583702e59f235e13b5。不把源码原文说成压缩包原文。
2. react-remove-scroll-bar 2.3.8：npm声明gitHead b3b1287aad81def2e2ae707274b74531b61ddbaf，但其指向仓库查询404；上游固定提交8ca9ba5ea52de03308fe8ced94f7b159a44d28ff的manifest仍为2.3.7，因此不能据版本名称直接绑定。该提交明确合入LICENSE，原文见[固定源LICENSE](https://github.com/theKashey/react-remove-scroll-bar/blob/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE)，Git blob 7c08c3990396ecefd90f99ff5d9a34f26f5b5616，SHA-256 a79aae0c0f21990d9d963bb3c5a79cdcea9a46f8523ba55c58d7fe776b6ebc84。从该提交获取component.tsx、constants.ts、utils.ts、index.ts，用项目安装的TypeScript 5.9.3、ES5目标/ES2015模块/React JSX/importHelpers转译，与已安装2.3.8的四个dist/es2015运行文件扫描标记序列比较；去掉注释/空白，仅将字符串字面量按解码值比较，其余标记完整保留。四项均一致：573/24/235/43标记。由此只识别已用运行部分的源码与版权通知，不声称原始字节一致、manifest版本相同、发行gitHead恢复或整包provenance完成。

## 内嵌与样式材料

pathslash 0.1.0：固定npm压缩包SHA-512核验；许可原文SHA-256 74de2d5a038fb2efb43cab0f741be0a9fc8ff673c15b08adcf3b868120b4b08e。Vinext内嵌文件的region明确指向该包；固定发布包的dist/index.mjs与内嵌index.js，仅除去注释、打印格式及完整顶层export声明后，其余所有语句相同，规范化长度均1298。原文件导出较多名称，内嵌文件只导出4项，差异明确保留；不称原始字节或导出接口完全一致。

tailwindcss 4.2.1：直接globals.css输入，固定元数据/压缩包与锁定SHA-512一致，LICENSE原文SHA-256 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985。shadcn vendor CSS通知仍另行保留，不混称它是Tailwind CSS本身。

tw-animate-css 1.4.0：直接globals.css输入，固定元数据/压缩包与锁定SHA-512一致，LICENSE原文SHA-256 039184dfa0a822397b3f45a435b5b1e538721587fbade96b9fa80f86cb354109。shadcn vendor CSS通知仍另行保留，不混称它是Tailwind CSS本身。

公共通知合计52个材料映射、17组不同原文：49观察包+两个样式包+pathslash；此前12项均是49项的子集，没有额外重复计数。radix-ui聚合包和shadcn组件通知仍在单独文件中。按原文SHA去重，不按猜测作者名称合并；MIT、ISC/Feather MIT、CVA Apache-2.0以及tslib两份0BSD/版权原文均完整保留。仅tslib的两份CRLF转换LF，原始字节哈希另列；其余原文不改。

## 检查边界

用agent-reach的npm公开接口/GitHub官方CLI读取路线，不重试此前匿名读取服务的401、不增加登录凭据。临时源代码比较在系统临时目录，不进入Worker，不执行上游代码，仅解析/转译；没有把资料比对当作App稳定结算测试。GitNexus核对main/35802fe及索引、相关配置context；node_modules与临时脚本不在索引中，调用图不能覆盖其内部，另以固定blob、实际数据与明确比较方法补验。

14个未采集文件、虚拟/生成材料及其他嵌套内容的权利链仍需审查；来源不明概念图、三个本地组件修改的作者/授权、独立最终放行及生产事件观察仍未证明。本轮不作AGPL兼容或法律许可全覆盖结论，MVP第9项和其余十项门禁不变。稳定结算的新测试边界和消费后回滚细则仍等待用户确认，未擅自实现。

## 固定包与原文清单

本地已核对52个映射、17个完整text块；15块与原始LF文件SHA-256一致，tslib两块仅CRLF→LF，规范化副本SHA分别为72ba857a2d06a6d440c28e690835119f6d70fe16f58b7538e3e3c1c133d944d7与0e8d2550baea17eb3072c4f919b36fbf9852bb49dba948549872e713863c0834。最初验证命令因Windows参数过长未启动，不算验证成功；改用本机临时参考JSON后，逐字内容与规范化核对退出0。

最新普通143项：142通过、1跳过、0失败；类型、lint、构建退出0，原框架警告未屏蔽。公共源码/实际构建通知均46489字节，SHA-256 bf36fb877df3795814974bfa61b30c719e8b748fe6218804be4cc8099df8e310。Wrangler4.137.0严格试部署退出0，57静态文件、117附加模块、1198.01KiB/gzip345.63KiB，配置和绑定不变。上述不等于线上交付，仍需实际发布读回。

agent-reach更新检查因GitHub公共API限流返回无法检查，未安装/更新工具，也未将其当作已是最新版本或当前项目阻碍。

| 材料 | 版本 | 原文来源文件 / 原始SHA-256 |
| --- | --- | --- |
| [@floating-ui/core](https://registry.npmjs.org/%40floating-ui%2Fcore/1.8.0) | 1.8.0 | LICENSE: 0e4c9a9b6c71019cbbea3bdc20b01223110a9035700f9c960c8fcbf78c2325ce |
| [@floating-ui/dom](https://registry.npmjs.org/%40floating-ui%2Fdom/1.8.0) | 1.8.0 | LICENSE: 0e4c9a9b6c71019cbbea3bdc20b01223110a9035700f9c960c8fcbf78c2325ce |
| [@floating-ui/react-dom](https://registry.npmjs.org/%40floating-ui%2Freact-dom/2.1.9) | 2.1.9 | LICENSE: 0e4c9a9b6c71019cbbea3bdc20b01223110a9035700f9c960c8fcbf78c2325ce |
| [@floating-ui/utils](https://registry.npmjs.org/%40floating-ui%2Futils/0.2.12) | 0.2.12 | LICENSE: 0e4c9a9b6c71019cbbea3bdc20b01223110a9035700f9c960c8fcbf78c2325ce |
| [@radix-ui/number](https://registry.npmjs.org/%40radix-ui%2Fnumber/1.1.3) | 1.1.3 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/primitive](https://registry.npmjs.org/%40radix-ui%2Fprimitive/1.1.7) | 1.1.7 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-alert-dialog](https://registry.npmjs.org/%40radix-ui%2Freact-alert-dialog/1.1.23) | 1.1.23 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-collection](https://registry.npmjs.org/%40radix-ui%2Freact-collection/1.1.15) | 1.1.15 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-compose-refs](https://registry.npmjs.org/%40radix-ui%2Freact-compose-refs/1.1.5) | 1.1.5 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-context](https://registry.npmjs.org/%40radix-ui%2Freact-context/1.2.2) | 1.2.2 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-dialog](https://registry.npmjs.org/%40radix-ui%2Freact-dialog/1.1.23) | 1.1.23 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-direction](https://registry.npmjs.org/%40radix-ui%2Freact-direction/1.1.4) | 1.1.4 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-dismissable-layer](https://registry.npmjs.org/%40radix-ui%2Freact-dismissable-layer/1.1.19) | 1.1.19 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-focus-guards](https://registry.npmjs.org/%40radix-ui%2Freact-focus-guards/1.1.6) | 1.1.6 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-focus-scope](https://registry.npmjs.org/%40radix-ui%2Freact-focus-scope/1.1.16) | 1.1.16 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-id](https://registry.npmjs.org/%40radix-ui%2Freact-id/1.1.4) | 1.1.4 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-label](https://registry.npmjs.org/%40radix-ui%2Freact-label/2.1.15) | 2.1.15 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-popper](https://registry.npmjs.org/%40radix-ui%2Freact-popper/1.3.7) | 1.3.7 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-portal](https://registry.npmjs.org/%40radix-ui%2Freact-portal/1.1.17) | 1.1.17 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-presence](https://registry.npmjs.org/%40radix-ui%2Freact-presence/1.1.10) | 1.1.10 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-primitive](https://registry.npmjs.org/%40radix-ui%2Freact-primitive/2.1.10) | 2.1.10 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-progress](https://registry.npmjs.org/%40radix-ui%2Freact-progress/1.1.16) | 1.1.16 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-select](https://registry.npmjs.org/%40radix-ui%2Freact-select/2.3.7) | 2.3.7 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-slot](https://registry.npmjs.org/%40radix-ui%2Freact-slot/1.3.3) | 1.3.3 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-use-callback-ref](https://registry.npmjs.org/%40radix-ui%2Freact-use-callback-ref/1.1.4) | 1.1.4 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-use-controllable-state](https://registry.npmjs.org/%40radix-ui%2Freact-use-controllable-state/1.2.6) | 1.2.6 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-use-effect-event](https://registry.npmjs.org/%40radix-ui%2Freact-use-effect-event/0.0.5) | 0.0.5 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-use-layout-effect](https://registry.npmjs.org/%40radix-ui%2Freact-use-layout-effect/1.1.4) | 1.1.4 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-use-previous](https://registry.npmjs.org/%40radix-ui%2Freact-use-previous/1.1.4) | 1.1.4 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-use-size](https://registry.npmjs.org/%40radix-ui%2Freact-use-size/1.1.4) | 1.1.4 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@radix-ui/react-visually-hidden](https://registry.npmjs.org/%40radix-ui%2Freact-visually-hidden/1.2.11) | 1.2.11 | LICENSE: 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 |
| [@vitejs/plugin-rsc](https://registry.npmjs.org/%40vitejs%2Fplugin-rsc/0.5.35) | 0.5.35 | Fixed-source LICENSE: 29b68325fe026047d13e187b44c33b2acacf7dc647dec4583702e59f235e13b5 |
| [aria-hidden](https://registry.npmjs.org/aria-hidden/1.2.6) | 1.2.6 | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 |
| [class-variance-authority](https://registry.npmjs.org/class-variance-authority/0.7.1) | 0.7.1 | LICENSE: 0ccbf956cffc8dcf515809433cb5242ee67c94513d46e48c261d68d0880de406 |
| [clsx](https://registry.npmjs.org/clsx/2.1.1) | 2.1.1 | license: 9a9edad7baae52622bddf3c15b2ef8a33d2c89f2d25408ad13e8a7481c6b0c97 |
| [get-nonce](https://registry.npmjs.org/get-nonce/1.0.1) | 1.0.1 | LICENSE: acf3b087b348d2f2e731b9d4131af185aad694c1204ce14a46909483fd42da05 |
| [lucide-react](https://registry.npmjs.org/lucide-react/1.47.0) | 1.47.0 | LICENSE: b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57 |
| [pathslash](https://registry.npmjs.org/pathslash/0.1.0) | 0.1.0 | LICENSE: 74de2d5a038fb2efb43cab0f741be0a9fc8ff673c15b08adcf3b868120b4b08e |
| [react](https://registry.npmjs.org/react/19.3.0) | 19.3.0 | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 |
| [react-dom](https://registry.npmjs.org/react-dom/19.3.0) | 19.3.0 | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 |
| [react-remove-scroll](https://registry.npmjs.org/react-remove-scroll/2.7.2) | 2.7.2 | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 |
| [react-remove-scroll-bar](https://registry.npmjs.org/react-remove-scroll-bar/2.3.8) | 2.3.8 | Source LICENSE for identified runtime: a79aae0c0f21990d9d963bb3c5a79cdcea9a46f8523ba55c58d7fe776b6ebc84 |
| [react-server-dom-webpack](https://registry.npmjs.org/react-server-dom-webpack/19.3.0) | 19.3.0 | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 |
| [react-style-singleton](https://registry.npmjs.org/react-style-singleton/2.2.3) | 2.2.3 | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 |
| [scheduler](https://registry.npmjs.org/scheduler/0.28.0) | 0.28.0 | LICENSE: da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 |
| [tailwind-merge](https://registry.npmjs.org/tailwind-merge/3.6.0) | 3.6.0 | LICENSE.md: d4c70c7ce38cea8778f0aed3fc0bef0a9dbd27f13bd8b6773cbd6d37941971e5 |
| [tailwindcss](https://registry.npmjs.org/tailwindcss/4.2.1) | 4.2.1 | LICENSE: 60e0b68c0f35c078eef3a5d29419d0b03ff84ec1df9c3f9d6e39a519a5ae7985 |
| [tslib](https://registry.npmjs.org/tslib/2.8.1) | 2.8.1 | CopyrightNotice.txt: da16ddb65f8ca390998fb99223d0112498b56b45784d00afd77ff8ce1ac4de8b; LICENSE.txt: 210b19e543130388c68654b7497e967119ce17145f66ab7d85688fbd70f08751 |
| [tw-animate-css](https://registry.npmjs.org/tw-animate-css/1.4.0) | 1.4.0 | LICENSE: 039184dfa0a822397b3f45a435b5b1e538721587fbade96b9fa80f86cb354109 |
| [use-callback-ref](https://registry.npmjs.org/use-callback-ref/1.3.3) | 1.3.3 | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 |
| [use-sidecar](https://registry.npmjs.org/use-sidecar/1.1.3) | 1.1.3 | LICENSE: 30f0cfddf483d1128e3610205020f2041a6c5e837aa999e0aa82e5576187d4a9 |
| [vinext](https://registry.npmjs.org/vinext/1.0.0-beta.5) | 1.0.0-beta.5 | LICENSE: 19a7b85046eb77c8ab308c68569abbbb59235814297b9c95dc90480f71ec7198 |
