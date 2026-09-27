# UI 组件与 shadcn 样式的来源核验

核验日期：2026-09-27。对象是工作树中的 `site/components/ui/*.tsx`（61 个文件）、`site/vendor/shadcn-tailwind-4.13.0.css` 及同名 `.LICENSE.md`，而不是声称这些新增文件已包含在当前 HEAD 中。检查时仓库分支为 `main`，HEAD 为 `35802fe8167c5a24e8d66787d14b984aa1da3aa5`；工作树已有其他改动，本次只新增本文。本文不涵盖 SVG、概念图、业务代码、全部依赖或完整部署产物。

## 已核实的结论与边界

- `button.tsx` 和 `sheet.tsx` 与下列固定提交的官方文件**原始字节一致**。`alert-dialog.tsx` 原始字节不同，但仅替换本地 Button 的导入路径后全文一致。三者均可识别为 shadcn 的 MIT 材料，不能归为本项目独立原创。原始来源见下方重点文件表和 [shadcn 的 MIT 许可](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/LICENSE.md)。
- 61 个文件均找到同名官方文件。统一换行并执行三个明确的路径映射后，58 个全文一致；另外 3 个存在下文列出的逻辑改动。这里的“全文一致”没有删除导入、函数或样式，也不等同于全部文件原始字节一致。各文件的固定来源见覆盖表。
- vendor CSS 和现有 vendor 许可文件，分别与 `shadcn@4.13.0` 发布包内的 `package/dist/tailwind.css`、`package/LICENSE.md` 原始字节一致。[发布元数据](https://registry.npmjs.org/shadcn/4.13.0)列明 MIT、官方仓库和 CSS 导出路径；[发布包](https://registry.npmjs.org/shadcn/-/shadcn-4.13.0.tgz)是此次比较的原始材料。
- Radix、Base UI 和 `@shadcn/react` 的确切锁定版本及发布包许可均核对为 MIT，但这不替代其余依赖的核验。MIT 许可要求保留相应版权和许可通知；shadcn、WorkOS、Material-UI SAS 是不同的版权通知，不能互相替代。对应原文见依赖表。

**推断而非已证明**：上述匹配支持“本地组件取自或派生自官方 shadcn 注册表”的判断，但不证明最初复制的时间、执行者、具体安装命令或当时使用的 CLI 版本。CSS 名称中的 `4.13.0` 已有发布包内容证据；不能据此声称全部组件是 CLI 4.13.0 在本机生成的。

**尚未证明**：三个逻辑修改的作者、修改授权链、完整第三方通知是否随所有发布方式保留，以及其他依赖与产物的完整许可状态。本文不作全目录许可手续已完备、全仓 AGPL 兼容或法律放行结论。

## 固定来源与核验方法

采用 `shadcn-ui/ui` 提交 [`d0fae528221011f75a8c64a917073904c2847493`](https://github.com/shadcn-ui/ui/commit/d0fae528221011f75a8c64a917073904c2847493)（2026-07-03）中的 `apps/v4/registry/new-york-v4/ui/` 为组件比较基线。[官方注册表](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/_registry.ts)明确将 Button、Sheet、AlertDialog 的依赖列为 `radix-ui`，Combobox 列为 `@base-ui/react`，MessageScroller 列为 `@shadcn/react`。

选择这个固定提交也有版本证据：npm 的 [shadcn 4.13.0 provenance 声明](https://registry.npmjs.org/-/npm/v1/attestations/shadcn@4.13.0)在 `predicate.buildDefinition.resolvedDependencies` 中列出该 `gitCommit`。此次解码并读取了 npm 提供的声明，**没有独立验证 DSSE/Sigstore 签名**；因此将其称为发布来源声明，不称为独立验签结果。

比较方法：通过 GitHub 官方 API 读取固定提交的原文件；两侧将 CRLF 转为 LF，然后只在上游文本中执行以下三个字面路径替换，再区分大小写比较完整文本。

| 上游路径前缀 | 本地路径前缀 |
| --- | --- |
| `@/registry/new-york-v4/ui/` | `@/components/ui/` |
| `@/registry/new-york-v4/lib/utils` | `@/lib/utils` |
| `@/registry/new-york-v4/hooks/` | `@/hooks/` |

本地 `site/components.json` 声明 `style: new-york`，并配置上述组件、工具和 hook 别名；它是配置证据，不能单独证明来源。上游的[导入路径转换实现](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/packages/shadcn/src/utils/transformers/transform-import.ts)也支持按照配置转换注册表路径，但本文没有声称已在本机执行过该转换器。

发布包通过 HTTPS 在内存中读取：核对整个 `.tgz` 的 SHA-512 与 npm `dist.integrity`，再读取包内 LICENSE 和 CSS。`shadcn@4.13.0`、`radix-ui@1.6.7`、`@base-ui/react@1.8.0`、`@shadcn/react@0.3.1` 四个包的 SHA-512 均匹配元数据；后三者的 `dist.integrity` 和 tarball URL 也与本地 `site/package-lock.json` 一致。未安装、更新或落盘这些包。

## 重点文件：原始比较证据

SHA-256 使用原始文件字节，未先替换路径或换行。

| 本地文件 | 固定上游文件 / Git blob | 原始比较结果 |
| --- | --- | --- |
| `site/components/ui/button.tsx` | [button.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/button.tsx)；`4d38506cee5430d95a59ec6a2a0cef2b79217e7a` | 原始字节一致；两侧 SHA-256：`CC36AF0F8B5019C33CC039FBF03BB952A513072B15B55B53C592B78AF3E5F4C4` |
| `site/components/ui/sheet.tsx` | [sheet.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/sheet.tsx)；`cb53bb28b6850745c9519e8e7462e05f85a50c93` | 原始字节一致；两侧 SHA-256：`63863CF2DF8F8973E52B3459AC9BDBF81BE1262DBC70EB53D5271FFB03488E16` |
| `site/components/ui/alert-dialog.tsx` | [alert-dialog.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/alert-dialog.tsx)；`9c57648364a922784db10e7c882728452f483b23` | 原始字节不同；上游 SHA-256：`83AA9547A97B6FAE994807DFD0332B8DDDC9A226EF5A32C2C2ACFC393B0DD5F1`；本地：`9A8D950F2B9B4352D5EBB762FB44D5C28C2D353AA29712071973656A8736E311`。仅将 Button 导入路径由注册表路径换成本地路径后全文一致 |
| `site/vendor/shadcn-tailwind-4.13.0.css` | [packages/shadcn/src/tailwind.css](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/packages/shadcn/src/tailwind.css)；`7807c58eb94de8b764b9b6b7b5d8cde6d012b17f`；发布包 `package/dist/tailwind.css` | 与源码及发布包条目原始字节一致；SHA-256：`BC7D83425702955B4CB67CB14EDE9D603F9D912376D57A2D81D661094D2A782A`；发布条目长度 16041 字节 |
| `site/vendor/shadcn-tailwind-4.13.0.LICENSE.md` | [LICENSE.md](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/LICENSE.md)；`fad4d887a681dd49233e5ed01ee2c7a1513089a0`；发布包 `package/LICENSE.md` | 与源码及发布包条目原始字节一致；SHA-256：`1564074E13439397221FFD522E2E504D56561994A23D371AA5E3AD43E4F5423F`；1063 字节；MIT，版权通知为 `Copyright (c) 2023 shadcn` |

本地 `site/app/globals.css:3` 导入此 vendor CSS。该 CSS 属于 shadcn 发布材料，其文件名中的“tailwind”不证明它是 Tailwind CSS 包本身的源码；实际来源以上游路径和发布包条目为准。

## 61 个组件的覆盖清单

每行链接均固定到上述同一个提交的官方原文件；本地对应路径统一为 `site/components/ui/<文件名>`。“映射后全文一致”仅指前述完整文本比较。“Radix / Base / shadcn”列只记录这三类**直接导入**；“—”不意味着没有其他第三方依赖，也不证明该文件被实际页面引用或进入部署包。

| 文件 / 原始来源 | 直接导入 | 比较结论 |
| --- | --- | --- |
| [accordion.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/accordion.tsx) | Radix | 映射后全文一致 |
| [alert-dialog.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/alert-dialog.tsx) | Radix | 映射后全文一致 |
| [alert.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/alert.tsx) | — | 映射后全文一致 |
| [aspect-ratio.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/aspect-ratio.tsx) | Radix | 映射后全文一致 |
| [attachment.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/attachment.tsx) | Radix | 映射后全文一致 |
| [avatar.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/avatar.tsx) | Radix | 映射后全文一致 |
| [badge.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/badge.tsx) | Radix | 映射后全文一致 |
| [breadcrumb.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/breadcrumb.tsx) | Radix | 映射后全文一致 |
| [bubble.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/bubble.tsx) | Radix | 映射后全文一致 |
| [button-group.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/button-group.tsx) | Radix | 映射后全文一致 |
| [button.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/button.tsx) | Radix | 原始字节一致 |
| [calendar.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/calendar.tsx) | — | 映射后全文一致 |
| [card.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/card.tsx) | — | 映射后全文一致 |
| [carousel.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/carousel.tsx) | — | 映射后全文一致 |
| [chart.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/chart.tsx) | — | 存在逻辑差异，见下表 |
| [checkbox.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/checkbox.tsx) | Radix | 映射后全文一致 |
| [collapsible.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/collapsible.tsx) | Radix | 映射后全文一致 |
| [combobox.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/combobox.tsx) | Base | 映射后全文一致 |
| [command.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/command.tsx) | — | 映射后全文一致 |
| [context-menu.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/context-menu.tsx) | Radix | 映射后全文一致 |
| [dialog.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/dialog.tsx) | Radix | 映射后全文一致 |
| [direction.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/direction.tsx) | Radix | 映射后全文一致 |
| [drawer.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/drawer.tsx) | — | 映射后全文一致 |
| [dropdown-menu.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/dropdown-menu.tsx) | Radix | 映射后全文一致 |
| [empty.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/empty.tsx) | — | 映射后全文一致 |
| [field.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/field.tsx) | — | 映射后全文一致 |
| [form.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/form.tsx) | Radix | 映射后全文一致 |
| [hover-card.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/hover-card.tsx) | Radix | 映射后全文一致 |
| [input-group.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/input-group.tsx) | — | 映射后全文一致 |
| [input-otp.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/input-otp.tsx) | — | 映射后全文一致 |
| [input.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/input.tsx) | — | 映射后全文一致 |
| [item.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/item.tsx) | Radix | 映射后全文一致 |
| [kbd.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/kbd.tsx) | — | 映射后全文一致 |
| [label.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/label.tsx) | Radix | 映射后全文一致 |
| [marker.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/marker.tsx) | Radix | 映射后全文一致 |
| [menubar.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/menubar.tsx) | Radix | 映射后全文一致 |
| [message-scroller.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/message-scroller.tsx) | shadcn | 映射后全文一致 |
| [message.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/message.tsx) | — | 映射后全文一致 |
| [native-select.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/native-select.tsx) | — | 映射后全文一致 |
| [navigation-menu.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/navigation-menu.tsx) | Radix | 映射后全文一致 |
| [pagination.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/pagination.tsx) | — | 映射后全文一致 |
| [popover.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/popover.tsx) | Radix | 映射后全文一致 |
| [progress.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/progress.tsx) | Radix | 存在逻辑差异，见下表 |
| [radio-group.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/radio-group.tsx) | Radix | 映射后全文一致 |
| [resizable.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/resizable.tsx) | — | 映射后全文一致 |
| [scroll-area.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/scroll-area.tsx) | Radix | 映射后全文一致 |
| [select.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/select.tsx) | Radix | 映射后全文一致 |
| [separator.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/separator.tsx) | Radix | 映射后全文一致 |
| [sheet.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/sheet.tsx) | Radix | 原始字节一致 |
| [sidebar.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/sidebar.tsx) | Radix | 存在逻辑差异，见下表 |
| [skeleton.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/skeleton.tsx) | — | 映射后全文一致 |
| [slider.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/slider.tsx) | Radix | 映射后全文一致 |
| [sonner.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/sonner.tsx) | — | 映射后全文一致 |
| [spinner.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/spinner.tsx) | — | 映射后全文一致 |
| [switch.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/switch.tsx) | Radix | 映射后全文一致 |
| [table.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/table.tsx) | — | 映射后全文一致 |
| [tabs.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/tabs.tsx) | Radix | 映射后全文一致 |
| [textarea.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/textarea.tsx) | — | 映射后全文一致 |
| [toggle-group.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/toggle-group.tsx) | Radix | 映射后全文一致 |
| [toggle.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/toggle.tsx) | Radix | 映射后全文一致 |
| [tooltip.tsx](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui/tooltip.tsx) | Radix | 映射后全文一致 |

直接导入计数：Radix 37 个，Base UI 1 个，`@shadcn/react` 1 个；其余 22 个没有直接导入这三类包。这是本地源码导入清单，不能据此判定间接依赖或构建结果。

### 三个非一致文件

下表的基线仍是覆盖表链接的固定官方文件。其余文本在换行与路径映射后相同；由此可以识别相应上游主体为 shadcn MIT 材料。差异部分是已观测的本地修改，**没有证明这些修改是谁写的或具有什么独立授权**；不能将修改者身份猜成项目成员或社区贡献者。

| 文件 | 本地相对官方基线的差异 | 本地原始 SHA-256 |
| --- | --- | --- |
| `chart.tsx` | 将暗色主题的 `.dark` 选择器改成 `(prefers-color-scheme: dark)` 媒体查询，并相应改写生成 CSS 的映射函数 | `45AA5EA4A386F4FB5B8869FF4BAB3A08CF89255190EE322043BAF84C3E950B6A` |
| `progress.tsx` | 给 Root 增加 `value={value}`；Indicator 的缺省值表达式由 `value || 0` 改为 `value ?? 0` | `C8C26E8F5F041C3CDF4915347DC1D9C022F9448F149990FADCAF303E952FA57D` |
| `sidebar.tsx` | 骨架宽度由带 `Math.random()` 的 50–89% 随机计算改成固定 `70%` | `4A8D73E7730A2B1FCECFCA31299ED26DB65C2307B84197A59C6EC7C01C7AD28E` |

## 实际锁定的基础组件包

版本依据本地 `site/package-lock.json`，不是把 `package.json` 的版本范围当成确切版本。源提交依据对应 npm provenance 的 `resolvedDependencies.gitCommit`；与上面的 shadcn 组件基线是不同层次的证据。

| 包 / 锁定版本 | 官方元数据与发布来源声明 | 固定源许可 / 发布包内许可 |
| --- | --- | --- |
| `radix-ui` 1.6.7 | [元数据](https://registry.npmjs.org/radix-ui/1.6.7)；[provenance](https://registry.npmjs.org/-/npm/v1/attestations/radix-ui@1.6.7)；提交 `9aebdd45abd447b84092ecf20f8bcd27f2398c36` | [MIT / Copyright (c) 2022 WorkOS](https://github.com/radix-ui/primitives/blob/9aebdd45abd447b84092ecf20f8bcd27f2398c36/LICENSE)；[发布包](https://registry.npmjs.org/radix-ui/-/radix-ui-1.6.7.tgz)内 `package/LICENSE` SHA-256：`0E80A2D229D2FD4FC7E8636142EC5D0FF0BC031F14C15B682E2AC01DFD5B5138`，与固定源许可相同 |
| `@base-ui/react` 1.8.0 | [元数据](https://registry.npmjs.org/@base-ui%2freact/1.8.0)；[provenance](https://registry.npmjs.org/-/npm/v1/attestations/@base-ui%2freact@1.8.0)；提交 `47b40521eab921c2756bf9bdb0b0f07fbfdb8c8c` | [MIT / Copyright (c) 2019 Material-UI SAS](https://github.com/mui/base-ui/blob/47b40521eab921c2756bf9bdb0b0f07fbfdb8c8c/LICENSE)；[发布包](https://registry.npmjs.org/@base-ui/react/-/react-1.8.0.tgz)内 `package/LICENSE` SHA-256：`07FC1B39D69D14BC7D40482A628F47226258EB01265DB68AE684944B916BEB2A`，与固定源许可相同 |
| `@shadcn/react` 0.3.1 | [元数据](https://registry.npmjs.org/@shadcn%2freact/0.3.1)；[provenance](https://registry.npmjs.org/-/npm/v1/attestations/@shadcn%2freact@0.3.1)；提交 `63c1308d112b6b1205d86244a156cca1abef5087` | [MIT / Copyright (c) 2023 shadcn](https://github.com/shadcn-ui/ui/blob/63c1308d112b6b1205d86244a156cca1abef5087/LICENSE.md)；[发布包](https://registry.npmjs.org/@shadcn/react/-/react-0.3.1.tgz)内 `package/LICENSE.md` SHA-256：`1564074E13439397221FFD522E2E504D56561994A23D371AA5E3AD43E4F5423F`，与固定源许可相同 |

Button 使用 `Slot`，Sheet 使用 `Dialog`，AlertDialog 使用 `AlertDialog`；Radix 的[固定入口源码](https://github.com/radix-ui/primitives/blob/9aebdd45abd447b84092ecf20f8bcd27f2398c36/packages/react/radix-ui/src/index.ts)分别从 `@radix-ui/react-slot`、`@radix-ui/react-dialog`、`@radix-ui/react-alert-dialog` 再导出这些名字。本地锁文件中对应版本分别为 1.3.3、1.1.23、1.1.23；本文没有分别下载这些子包验签或完成其全部传递依赖核验。不能把聚合包的核验扩大为整个依赖树已核验。

Combobox 的本地导入来自 `@base-ui/react`，其[官方入口](https://github.com/mui/base-ui/blob/47b40521eab921c2756bf9bdb0b0f07fbfdb8c8c/packages/react/src/index.ts)包含 Combobox 再导出；其本地 wrapper 匹配 shadcn 注册表文件，因此 wrapper 的来源与底层包的来源应分别记录。MessageScroller 同理，本地 wrapper 来自 shadcn 注册表，基础实现由 `@shadcn/react/message-scroller` 导入。

## MVP 许可前置所需保留的判断

已证实的上游材料应保留其真实许可和版权通知；当前 vendor 文件保存的是 shadcn 的完整 MIT 正文。该文件不能替代 Radix 或 Base UI 的版权通知，也不能为那三个本地修改或其他第三方依赖提供来源证明。必要时应按实际交付范围补齐通知，继续保留原文件和可复核来源；不能靠删除用户素材、伪造原创或伪造贡献署名来消除来源问题。

本次是纯文档调查，未修改组件、配置、图片或锁文件，未提交 Git、未创建远端记录；没有读取 `.env`、密钥或私人会话。检查实际新增文档与覆盖清单即可验证本次修改范围；本文不产生需要符号影响分析的程序行为改动。
