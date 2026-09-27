# 已识别运行依赖的许可原文与交付检查

日期：2026-09-28。源码入口核对以公开预览3902293（业务代码fa4e92c）及当前实际构建为起点；本轮仅增加有限范围的第三方通知，不修改依赖、锁文件、业务代码、认证、经济规则或用户素材。既有来源未明概念图及三个组件的本地修改授权仍缺，不能因此关闭MVP第9项。

## 已核验范围

现有公共通知覆盖组件与SVG，但未收录下列运行依赖的完整许可。React/DOM/Scheduler可在实际客户端framework/index及服务器react/react-dom构建模块识别；当前Button、工具函数、图标及Vinext入口也直接引用这些包。此项是选定运行路径和依赖的核对，不是完整打包模块图或所有传递依赖清单。

逐包核对12项：本机版本等于锁文件版本；官方固定版本元数据的dist.integrity等于锁文件；在内存下载的12份发布包共6354189字节，逐包SHA-512相同；tar内指定许可文件SHA-256等于本机原文件。没有安装/升级包、生成provenance签字或写入下载的压缩包。7组原文件完全相同的许可按哈希去重，全文保留在site/public/THIRD_PARTY_RUNTIME.md，包括CVA的完整Apache-2.0及Joe Bell通知、Lucide的ISC与所列Feather图标MIT通知。没有把贡献者猜成本项目作者。

| 包 / 固定版本元数据 | 许可文件 | SHA-256 | 锁定发布包SHA-512 |
| --- | --- | --- | --- |
| [react 19.3.0](https://registry.npmjs.org/react/19.3.0) | LICENSE | da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | sha512-E8LUcbtBWt20bbl2YoHfx4ZDBdxVTfOKtCZn9cDSJ4l6/nuoApcpIBcj47t2wZoVX8g2ZHuMHbiShgCR1T5Sog== |
| [react-dom 19.3.0](https://registry.npmjs.org/react-dom/19.3.0) | LICENSE | da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | sha512-JDk8dgif51OjFoDE70+OT9ICyYr+69HlmihNwp1+Nsfbna3t5sIiCa9ZJktDmQ4/1b/rn26hIAR2uYXDMr5r0Q== |
| [react-server-dom-webpack 19.3.0](https://registry.npmjs.org/react-server-dom-webpack/19.3.0) | LICENSE | da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | sha512-ymt9RkvWtW4OpIhWf1wj4u5CxnBaVbDCkz/bw3/QFmOE7+/wg8C30uiJ/QqkEdWn/UqT5c7/rOUW/eWYMwceCg== |
| [scheduler 0.28.0](https://registry.npmjs.org/scheduler/0.28.0) | LICENSE | da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93 | sha512-juorfCmIkIw8tT+p5BXSm6PJjQF/ycEYmKyzURCIt/RaZIhL+PulbQ9Yu2z1HdOJDdqDTlxA1+xKBmHXJsczAw== |
| [lucide-react 1.47.0](https://registry.npmjs.org/lucide-react/1.47.0) | LICENSE | b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57 | sha512-o8C23aXpNQypRY73W7fW02EyvWJinEMXgKeGjFoKym0zj3Q73hD97A1IQps1g8C14HTGsOpZL0Am+xjfgFZAbg== |
| [class-variance-authority 0.7.1](https://registry.npmjs.org/class-variance-authority/0.7.1) | LICENSE | 0ccbf956cffc8dcf515809433cb5242ee67c94513d46e48c261d68d0880de406 | sha512-Ka+9Trutv7G8M6WT6SeiRWz792K5qEqIGEGzXKhAE6xOWAY6pPH8U+9IY3oCMv6kqTmLsv7Xh/2w2RigkePMsg== |
| [clsx 2.1.1](https://registry.npmjs.org/clsx/2.1.1) | license | 9a9edad7baae52622bddf3c15b2ef8a33d2c89f2d25408ad13e8a7481c6b0c97 | sha512-eYm0QWBtUrBWZWG0d386OGAw16Z995PiOVo2B7bjWSbHedGl5e0ZWaq65kOGgUSNesEIDkB9ISbTg/JK9dhCZA== |
| [tailwind-merge 3.6.0](https://registry.npmjs.org/tailwind-merge/3.6.0) | LICENSE.md | d4c70c7ce38cea8778f0aed3fc0bef0a9dbd27f13bd8b6773cbd6d37941971e5 | sha512-uxL7qAVQriqRQPAyK3pj66VqskWqoZ37PW94jwOTwNfq/z9oyu1V+eqrZqtR2+fCiXdYOZe/Modt8GtvqNzu+w== |
| [vinext 1.0.0-beta.5](https://registry.npmjs.org/vinext/1.0.0-beta.5) | LICENSE | 19a7b85046eb77c8ab308c68569abbbb59235814297b9c95dc90480f71ec7198 | sha512-c0I1UB70/pGwD9y4/iXWrGfz/LnowSbkQpUw+lK9t08tes5WHX7Vl0sZAY4MIzGaVCyvrD4/xZo7HWpMje6SwA== |
| [@radix-ui/react-slot 1.3.3](https://registry.npmjs.org/%40radix-ui%2Freact-slot/1.3.3) | LICENSE | 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | sha512-qx7oqnYbxnK9kYI9m317qmFmEgo6ywqWvbTogdj7cL9p3/yx4M48p7Rnw5z3H890cL/ow/EeWJsuTykeZVXP5Q== |
| [@radix-ui/react-dialog 1.1.23](https://registry.npmjs.org/%40radix-ui%2Freact-dialog/1.1.23) | LICENSE | 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | sha512-Ksw4WeROkO4rC9k/onilX/Ao2Cr1ku1unMNH+XSCcP4jSXYu7HDsg9n4ojMjVb22XpYjAQ9qfrFlVbru1vXDUA== |
| [@radix-ui/react-alert-dialog 1.1.23](https://registry.npmjs.org/%40radix-ui%2Freact-alert-dialog/1.1.23) | LICENSE | 0e80a2d229d2fd4fc7e8636142ec5d0ff0bc031f14c15b682e2ac01dfd5b5138 | sha512-VAYOiQRqj3GPpYJE0I9J+X8Ip05cyVlNdKOFeiGS2Ou1HHGfpl0BxOyZm6nmVDyU+W+NF3/XLzmjHmVGydhwgA== |

同原文件字节匹配只证明所检查的公开发布包与本地许可相同，不是发布者身份验签或全包供应链审计。包根目录本地LICENSE/NOTICE枚举不替代嵌套第三方材料检查；未证明所有依赖的AGPL兼容性，也未取得主理人/独立维护者的最终放行签字。

## 检索与变更边界

按agent-reach网页指引尝试通用读取，匿名信誉限制返回401；改用npm官方固定版本公开API及tarball，未增加登录凭据、走其他账号或请求Sub2API。体检进程因首次观察未保留输出；随后进程核对已不在运行，不声称体检通过。

新增通知只原样收录已验证文本；已有组件通知链接到它。法律原文复制的字节、构建复制结果、公开交付与最终diff需继续核对，不能仅凭文件存在声称已经在线交付。

## 本地交付验证

从新增通知的7个text块重新计算SHA-256，包含所有空白与末尾换行，均等于独立核验过的包原文；12项包名/版本映射完整。首次候选检查发现文件末尾多余空行，仅移除许可text块以外的该空行；最终重建退出0，公共源码文件与dist/client中的通知SHA-256同为e622d1d150a434a2c2487a86a9d4e6980cf7ef5e1076310be1f8d4439622c921，22859字节。

最新普通143项：142通过、1跳过、0失败；类型、lint、构建退出0。原Vite未来native配置及动态分组警告仍保留，没有屏蔽。Wrangler4.137.0严格试部署退出0，57静态文件、117附加模块、1198.01KiB/gzip345.65KiB；原受限账号、D1和四项非秘密变量一致，未新增绑定或修改兼容日期。

这些是本地复制与试部署结果，不是线上HTTP交付或真人验收。来源不明概念图、本地组件修改授权、完整嵌套/传递依赖、独立最终复核和生产严重事件观察保持未证明。
