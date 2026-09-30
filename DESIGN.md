---
name: "灵网纪元"
description: "既有暗色操作页体系与本机功法殿变体的实现记录"
colors:
  background: "#071113"
  foreground: "#e4eee9"
  card: "#0e1c1e"
  primary: "#9ae3d1"
  primary-foreground: "#082021"
  muted: "#152729"
  border: "#254044"
  preset-muted-foreground: "#adc5be"
  preset-input-border: "#365452"
  preset-action-border: "#446560"
  preset-action-hover: "#243e3d"
  preset-primary-hover: "#b7efdf"
  preset-disclosure: "#b7dfd0"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
  preset-body:
    fontFamily: 'Arial, "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    lineHeight: 1.65
  preset-headline:
    fontFamily: 'Arial, "Microsoft YaHei", sans-serif'
    fontSize: "30px"
    lineHeight: 1.3
  preset-title:
    fontSize: "21px"
  preset-row-title:
    fontSize: "18px"
  preset-label:
    fontSize: "15px"
  preset-help:
    fontSize: "14px"
  preset-meta:
    fontSize: "13px"
rounded:
  base: "0.35rem"
  preset-control: "6px"
spacing:
  "6": "6px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "32": "32px"
  "40": "40px"
components:
  preset-button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.preset-body}"
    rounded: "{rounded.preset-control}"
    padding: "9px 16px"
  preset-button-primary-hover:
    backgroundColor: "{colors.preset-primary-hover}"
  preset-button-secondary:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    typography: "{typography.preset-body}"
    rounded: "{rounded.preset-control}"
    padding: "9px 16px"
  preset-button-secondary-hover:
    backgroundColor: "{colors.preset-action-hover}"
  preset-field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.preset-label}"
    rounded: "{rounded.preset-control}"
    padding: "10px"
    width: "100%"
  preset-row:
    textColor: "{colors.foreground}"
    padding: "20px 0"
  preset-meta:
    textColor: "{colors.preset-muted-foreground}"
    typography: "{typography.preset-meta}"
  preset-disclosure:
    textColor: "{colors.preset-disclosure}"
---

# Design System: 灵网纪元

## Overview

**Creative North Star: 未确认。** 本记录不命名未经用户确认的品牌隐喻。

本记录描述当前实现中可复用的暗色操作页体系，以及本机功法殿的局部变体。已确认的品牌只有「灵网纪元」与赛博修仙语境；功能称谓对应真实流程。墨绿操作面、薄荷主操作、原生表单与细分隔线来自既有源码，不构成新的品牌方案。

质感与颜色名称是暂定描述，尚未获得额外偏好确认。没有已确认的 Creative North Star、批准的设计效果图或新的视觉世界。此文档依据实现和本地合成截图记录事实；截图、预设与演示文案不代表真实社区成果、真人复核或正式 MVP 完成。

**Key Characteristics:**

- 深色底面与浅色正文承载操作信息。
- 薄荷主操作与明确的状态文案并用。
- 本机功法页保留原生控件、折叠详情和线性列表。
- 桌面编辑器与列表并列；窄屏按编辑器、列表的顺序堆叠。

记录来源：[PRODUCT.md](PRODUCT.md)、[本机功法页源码](site/public/runner-preset-ui.mjs)中的方向注释与实际样式，以及 [平台全局样式](site/app/globals.css)最后生效的暗色覆写和操作页样式。视觉参照为 [桌面已存状态](docs/verification/images/preset-ui-restored-desktop-2026-10-01.jpg)、[窄屏已存状态](docs/verification/images/preset-ui-restored-mobile-2026-10-01.jpg)和 [窄屏空状态修订](docs/verification/images/preset-ui-empty-mobile-fixed-2026-10-01.jpg)。

## Colors

暂称「墨绿操作面与薄荷提示」：低亮度底面承载浅色信息，主操作与可交互提示使用薄荷色。名称是描述性工作用语，色值以上方实际提取值为准。

### Primary

- **薄荷主操作**（`primary`）：平台暗色覆写与本机页共用；用于保存主按钮、焦点轮廓和反馈文字。
- **主操作深色文字**（`primary-foreground`）：薄荷填充上的按钮文字。
- **本机主操作悬停**（`preset-primary-hover`）：主按钮可用时的悬停填充。
- **本机折叠提示**（`preset-disclosure`）：查看补充提示与删除详情的原生 summary 文字。

### Neutral

- **页面底面**（`background`）、**正文**（`foreground`）：平台与本机页共用的基础对比关系。
- **控件底面**（`card`）：本机文本、选择和多行输入；在平台中也是卡片语义色。
- **次操作底面**（`muted`）：本机普通按钮与导出链接。
- **轻分隔线**（`border`）：本机标题区、预设行、导入区与页脚的边界。
- **本机辅助文字**（`preset-muted-foreground`）：帮助、状态说明、元数据与页脚；不同于平台自身的 muted-foreground。
- **本机控件边界**（`preset-input-border`）、**次操作边界**（`preset-action-border`）、**次操作悬停**（`preset-action-hover`）：将字段、按钮与底面分开，保留静态平面布局。

本机页另外使用温暖的错误与删除文字色；它们记录在对应侧车组件中，不据此扩张新的品牌辅色体系。侧车的八级色带仅为合成预览，不是源码中已经采用的 tonal token。

**The Local Variant Rule.** 本机功法殿使用自己的控件半径、辅助文字色和响应断点；将这些值迁移到其他页面前，先核对该页面现有实现。

## Typography

**Body Font:** 平台沿用 `body` 字体栈。本机页使用 `preset-body`，加入 Microsoft YaHei 回退。

**Character:** 当前字体承担中文操作信息和原生控件的可读性。此处不确立展示字体、装饰标题或新的字体品牌。

### Hierarchy

- **本机页标题**（`preset-headline`）：桌面标题；窄屏降为 26px，仍保持原来的行高。
- **本机分区标题**（`preset-title`）：保存与列表分区。
- **本机行标题**（`preset-row-title`）：预设名称与导入区标题。
- **本机正文**（`preset-body`）：操作说明、按钮文字和预设参数；段落最大行宽为 72ch，长内容允许换行。
- **本机标签、帮助、元数据**（`preset-label`、`preset-help`、`preset-meta`）：字段名称、限制说明与可用状态依次降低视觉权重。
- **主按钮强调**：实际实现仅为主按钮显式设置字重 700；不推导完整的全局字重系统。

**The Readable Operation Rule.** 本机功法页正文、标签、辅助文字和元数据按不同层级显示；帮助文字保持为可阅读的正文补充，不缩成装饰性标记。

## Layout

平台样式中已有三栏操作壳（250px 导航、可伸缩主区、310px 详情）；1200px 以下变为双栏，760px 以下主区与详情顺序堆叠。这是代表性既有布局，不能从本机页反向改写。

本机功法页单独采用最大宽度 1120px 的居中容器，桌面内边距为纵向 40px、横向 28px。编辑器列最多 380px，列表列接收余下空间，两列间距 40px。表单与参数区以 16px 为间距，标签内部间距 6px，行操作可以换行。

700px 以下容器改为纵向 24px、横向 18px；编辑器与列表顺序堆叠，分区间距 32px。参数区变为单列，第二分区增加顶部细线与 24px 留白。窄屏空状态直接指向「保存新功法」表单，避免依赖桌面的左右方位。

## Elevation & Depth

本机页没有阴影、动画或滤镜。深浅底面、描边、分隔线与留白承担结构区分；悬停直接改变按钮底色，焦点显示清晰轮廓。平台品牌标记中的局部内阴影只属于该既有标记，不提炼成通用卡片阴影。

## Shapes

平台通用半径 token 为 `base`；一些已有平台操作按钮仍使用更小的局部半径。本机页字段、按钮与导出链接统一使用 `preset-control`。本机列表行保持平面、无外框卡片，以底部细分隔线区分；原生 details/summary 提供展开提示与删除确认，不增加新的图标系统。

## Components

### Buttons

本机主按钮负责保存：薄荷填充、深色文字、明确字重。普通按钮和导出链接使用深底与细边界。按钮和导出链接最小高度为 44px，内边距记录在前置层。悬停只在可用按钮上生效；禁用的按钮与表单控件使用透明度 0.55 和不可用指针。按钮与导出链接的键盘焦点均为 2px 主色轮廓，外偏移 3px。

### Cards / Containers

本机预设列表为 article 行：名称与可用状态可以换行并列，参数说明跟随，详情、只读编号、导出和删除入口依次排列。行间使用细分隔线，常规行纵向内边距为 20px，首行取消顶部内边距。这是列表容器，不引入额外抬升层级。

### Inputs / Fields

文本、数字、选择和多行字段共用底色、边界、控件半径与 10px 内边距。标签与控件保持对应关系；编号字段只读。多行提示允许垂直调整大小，内容保留换行；文件导入保留原生文件选择器。字段焦点与按钮一致，不用占位符替代可见标签。当前字段以 font:inherit 继承标签：普通字段为 15px，只读编号为 14px；这只是当前实现事实，不设为新的全站控件字级规则。

### Disclosure / Confirmation

补充提示和删除确认均使用原生 details/summary；文字与浏览器自带标记提示可展开。查看提示后的段落保留换行；删除入口展开后才出现不可撤销说明、保留按钮和确认删除按钮。此记录描述当前界面表现，不把示例组件当作完整可执行管理服务。

### Empty / Status

无预设时使用一段带留白的辅助文字，明确引导保存表单或导入。反馈区保留 32px 最小高度，采用 `role="status"` 与 `aria-live="polite"`；错误使用独立文字色。预设可用性为文字说明，没有单独的胶囊式状态组件。功法页没有新增导航组件，因此侧车不虚构导航示例。

**The Honest State Rule.** 本机功法页的成功、错误、槽位不足和不可启用状态同时有明确文案；颜色与禁用外观不能代替结果说明。

## Do's and Don'ts

### Do:

- **Do** 沿用前置层的实际暗色覆写，先区分平台通用 token 与本机功法页变体。
- **Do** 保留标签、可见键盘焦点、原生详情展开与完整的状态文案。
- **Do** 让本机功法页在窄屏先展示编辑器，再展示已存功法；帮助文案与提示内容能够换行，只读编号字段保持单行、可选择并横向滚动。
- **Do** 将任何示例预设、截图数据与用量标注为本地合成验证材料。

### Don't:

- **Don't** 将本机功法页的 6px 控件半径或 700px 断点扩大为所有页面的统一要求。
- **Don't** 从单个品牌标记、未回答的偏好或合成截图推导新的品牌隐喻与视觉承诺。
- **Don't** 将绿色状态、界面完成或合成记录表述为真实贡献、模型限额核验、真人接受或 MVP 发布证据。
- **Don't** 将既有装饰性眉题及系统字体展示面当作新页面必须继承的品牌规则。

**未纳入规范的既有元素：** 全局样式中已有装饰性眉题（`.eyebrow`）、系统字体的展示用法和品牌标记内阴影。它们既非本机功法页所需，也未经过本轮品牌确认；眉题与系统展示字体保留为既有视觉缺口，不写成未来界面继承规则。
