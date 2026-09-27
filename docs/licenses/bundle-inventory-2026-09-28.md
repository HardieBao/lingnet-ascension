# 本地检查构建：实际模块与许可覆盖清单

日期：2026-09-28。源起点为公开预览a20b4d25（业务源码fa4e92c），实际工作区仍main/35802fe。此次只做本地检查构建，没有新部署、生产写入、模型调用、版权签字或正式MVP放行。以下不是简单安装包清单，也不声称检查候选就是线上8aa6ff99的相同二进制。

## 采集方法与明确限制

临时脚本复用项目现有Vite配置、已安装Vinext的Next配置/共享buildID/RSC兼容ID准备、preview-build凭据上下文，以及Vite多环境buildApp。它不替换原项目配置，不导出环境变量或模块代码，只记录最终生成块的相对路径、模块ID和SHA-256。共享的检查凭据随机生成，不是生产登录/模型秘密。

脚本在系统临时目录中，未进入源码分支或Worker。重建前已验证删除目标精确为本机生成的site/dist且位于site内，没有删除源代码、用户工作区或私密配置。脚本退出0，原生成目录被替换；结束本次检查后须再次执行原npm构建，不能把诊断构建当作发布构建。

- 采集144个写入块，142个与写入磁盘后的代码SHA-256一致；只有已匹配块参与以下包映射。客户端index及link两个块后续内容不同，未用它们声称完整覆盖。
- 最终磁盘有156个JavaScript/mjs文件，14个不在已匹配采集中：6个公开Runner自有模块、6个后续生成清单/资产模块，以及上述2个块。详细相对路径与142块哈希保留在同目录JSON证据中。
- 匹配块反查到49个包根目录，版本均等于锁文件。仍有virtual-module类别未做权利归属映射；不把虚拟/生成代码默认为项目原创。
- 49包在本机根目录共48份LICENSE/NOTICE/CopyrightNotice等原文、12组不同哈希；@vitejs/plugin-rsc、react-remove-scroll-bar根目录未找到原文。仅package.json声明MIT不足以补写版权人或版权通知，仍需固定原始发布/源码核对。
- vinext根目录匹配的模块含嵌入pathslash@0.1.0路径，内层发布材料本机只提供dist，没有package.json/LICENSE。JSON的vendored字段按完整模块列表重新计算，不按首个模块判断；也不把根目录vinext的MIT声明自动扩大到内嵌材料。
- 当前globals.css直接导入tailwindcss、tw-animate-css和已核对的shadcn vendor CSS。JavaScript块采集不代替CSS、字体、SVG、概念图、所有嵌套或复制材料审查；tslib另外有CopyrightNotice.txt，不能仅保留LICENSE.txt。

GitNexus先确认当前仓库/分支与索引，query/context定位现有localBindingConfig，再补读本机Vinext CLI、Vite/Rolldown类型和全部现有配置；未修改既有符号。索引不包含node_modules和系统临时脚本，不能据此声称调用图覆盖了构建内部或检查脚本；另以实际构建、哈希及源码补验。后续提交仍应检查真实diff与detect_changes。

## 49个已观察到的包

下面是检查候选中已匹配块的有限归属清单，不是已经完成官方压缩包完整性、provenance签名或法律兼容性审查。C=client，R=rsc，S=ssr；第三方声明保持原样。

| 包 | 固定版本 | 环境 | 匹配模块数 | 根目录原文文件 |
| --- | --- | --- | --- | --- |
| @floating-ui/core | 1.8.0 | C,S | 1 | LICENSE |
| @floating-ui/dom | 1.8.0 | C,S | 1 | LICENSE |
| @floating-ui/react-dom | 2.1.9 | C,S | 1 | LICENSE |
| @floating-ui/utils | 0.2.12 | C,S | 2 | LICENSE |
| @radix-ui/number | 1.1.3 | C,S | 1 | LICENSE |
| @radix-ui/primitive | 1.1.7 | C,S | 1 | LICENSE |
| @radix-ui/react-alert-dialog | 1.1.23 | C,S | 1 | LICENSE |
| @radix-ui/react-collection | 1.1.15 | C,S | 1 | LICENSE |
| @radix-ui/react-compose-refs | 1.1.5 | C,R,S | 1 | LICENSE |
| @radix-ui/react-context | 1.2.2 | C,S | 1 | LICENSE |
| @radix-ui/react-dialog | 1.1.23 | C,S | 1 | LICENSE |
| @radix-ui/react-direction | 1.1.4 | C,S | 1 | LICENSE |
| @radix-ui/react-dismissable-layer | 1.1.19 | C,S | 1 | LICENSE |
| @radix-ui/react-focus-guards | 1.1.6 | C,S | 1 | LICENSE |
| @radix-ui/react-focus-scope | 1.1.16 | C,S | 1 | LICENSE |
| @radix-ui/react-id | 1.1.4 | C,S | 1 | LICENSE |
| @radix-ui/react-label | 2.1.15 | C,S | 1 | LICENSE |
| @radix-ui/react-popper | 1.3.7 | C,S | 1 | LICENSE |
| @radix-ui/react-portal | 1.1.17 | C,S | 1 | LICENSE |
| @radix-ui/react-presence | 1.1.10 | C,S | 1 | LICENSE |
| @radix-ui/react-primitive | 2.1.10 | C,S | 1 | LICENSE |
| @radix-ui/react-progress | 1.1.16 | C,S | 1 | LICENSE |
| @radix-ui/react-select | 2.3.7 | C,S | 1 | LICENSE |
| @radix-ui/react-slot | 1.3.3 | C,R,S | 1 | LICENSE |
| @radix-ui/react-use-callback-ref | 1.1.4 | C,S | 1 | LICENSE |
| @radix-ui/react-use-controllable-state | 1.2.6 | C,S | 1 | LICENSE |
| @radix-ui/react-use-effect-event | 0.0.5 | C,S | 1 | LICENSE |
| @radix-ui/react-use-layout-effect | 1.1.4 | C,S | 1 | LICENSE |
| @radix-ui/react-use-previous | 1.1.4 | C,S | 1 | LICENSE |
| @radix-ui/react-use-size | 1.1.4 | C,S | 1 | LICENSE |
| @radix-ui/react-visually-hidden | 1.2.11 | C,S | 1 | LICENSE |
| @vitejs/plugin-rsc | 0.5.35 | R,S | 8 | 未找到；需上游核对 |
| aria-hidden | 1.2.6 | C,S | 1 | LICENSE |
| class-variance-authority | 0.7.1 | C,R,S | 1 | LICENSE |
| clsx | 2.1.1 | C,R,S | 1 | license |
| get-nonce | 1.0.1 | C,S | 1 | LICENSE |
| lucide-react | 1.47.0 | C,S | 16 | LICENSE |
| react | 19.3.0 | C,R,S | 8 | LICENSE |
| react-dom | 19.3.0 | C,R,S | 10 | LICENSE |
| react-remove-scroll | 2.7.2 | C,S | 7 | LICENSE |
| react-remove-scroll-bar | 2.3.8 | C,S | 3 | 未找到；需上游核对 |
| react-server-dom-webpack | 19.3.0 | R,S | 5 | LICENSE |
| react-style-singleton | 2.2.3 | C,S | 3 | LICENSE |
| scheduler | 0.28.0 | C | 2 | LICENSE |
| tailwind-merge | 3.6.0 | C,R,S | 1 | LICENSE.md |
| tslib | 2.8.1 | C,S | 1 | CopyrightNotice.txt, LICENSE.txt |
| use-callback-ref | 1.3.3 | C,S | 3 | LICENSE |
| use-sidecar | 1.1.3 | C,S | 2 | LICENSE |
| vinext | 1.0.0-beta.5 | C,R,S | 204 | LICENSE |

## 可复核证据与下一步

同目录bundle-inventory-2026-09-28.json保存相对模块路径、包根目录及匹配块SHA-256；原始临时inventory.json SHA-256为8de896ea4f4336afed26b50eefdd2309d3efd1812065834dcfc9fe29b74bea08，临时检查脚本SHA-256为e2f19df253fe35b7f384ae76abe1ae88407734d5171a10c38b69b00429821b8c。公开JSON更正了完整模块列表的vendored分类并追加来源说明，不声称与原始文件字节相同。

下一步按实际观察包逐一核对固定发布包与版权原文，补两个缺原文包、pathslash及CSS/生成材料；新通知交付后再读回字节。许可来源不明概念图、组件本地修改的授权和独立放行仍需人确认，MVP第9项保持未证明。稳定结算测试范围、消费后回滚、平台初始化审批、代理契约及真实社区门槛不因这份清单关闭。

## 恢复与回归

检查后原npm run build重建退出0，未部署诊断构建。最新普通143项：142通过、1跳过、0失败；类型、lint退出0；原公开生产配置/实际构建/API/D1合成登录限制驱动退出0。可读表逐项核对49个包名/固定版本均与JSON一致，142块、14未覆盖文件、2不同块及1处vendored分类计数一致。动态首页再次实际429/1027，没有变更套餐或转移到其他服务。

原临时脚本、原始JSON和包根目录原文均保留在本机，未广泛清理。此前资料提交a20b4d25的真实GitHub运行36345216589已核对completed/success；这不是新检查候选已完成远端复建或正式贡献验收的证据。
