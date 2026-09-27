export type Verdict = {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
};

const artifactPaths: Record<string, string> = {
  "GOV-001": "GOVERNANCE.md",
  "GOV-002": "docs/WORLD_BRIEF.md",
  "GOV-003": "docs/ARCHITECTURE_SPIKE.md",
  "GOV-004T": "docs/TOKEN_TERMS.md",
};

export function artifactPathForMission(missionId: string): string | null {
  return Object.hasOwn(artifactPaths, missionId) ? artifactPaths[missionId] : null;
}

export function matchesArtifactUploadName(missionId: string, filename: string): boolean {
  const artifactPath = artifactPathForMission(missionId);
  if (!artifactPath) return false;
  const basename = artifactPath.split("/").at(-1);
  return filename === basename || filename === `${missionId}-${basename}`;
}

export function verifyGov001(content: string): Verdict {
  const checks = [
    {
      name: "文件长度",
      passed: content.trim().length >= 300 && content.length <= 131072,
      detail: "章程正文应为 300 至 131072 个字符。",
    },
    {
      name: "产品边界",
      passed: /产品边界|项目边界/.test(content),
      detail: "说明灵网纪元首赛季的工作范围。",
    },
    {
      name: "三账本",
      passed: /Token/.test(content) && /修为/.test(content) && /功德/.test(content),
      detail: "分别定义 Token、修为和功德。",
    },
    {
      name: "治理责任",
      passed: /负责人|维护者/.test(content) && /复核|评审/.test(content),
      detail: "列出负责人和独立复核安排。",
    },
    {
      name: "停止条件",
      passed: /停止条件|暂停条件/.test(content),
      detail: "列出项目或赛季应暂停的情况。",
    },
    {
      name: "变更与签署",
      passed: /变更流程|决策记录/.test(content) && /签署|确认人/.test(content),
      detail: "说明变更流程并留下签署信息。",
    },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

export function verifyGov002(content: string): Verdict {
  const checks = [
    { name: "文件长度", passed: content.trim().length >= 400 && content.length <= 12000, detail: "体验简报应为 400 至 12000 个字符。" },
    { name: "世界词汇", passed: ["万象天网", "修士", "本命法器", "宗门", "渡劫"].every((term) => content.includes(term)), detail: "解释主要修仙概念。" },
    { name: "真实任务映射", passed: /认领/.test(content) && /提交/.test(content) && /复核/.test(content) && /正式成果/.test(content), detail: "将修仙概念映射到任务状态。" },
    { name: "算力与游戏经济", passed: /算力/.test(content) && /游戏\s*Token/i.test(content) && /不可提现/.test(content) && /实际费用|真实费用|模型费用/.test(content), detail: "区分真实模型费用和不可提现的游戏 Token。" },
    { name: "体验语气", passed: /核心循环/.test(content) && /页面语气/.test(content) && /正例/.test(content) && /反例/.test(content), detail: "提供核心循环与页面语气的正反例。" },
    { name: "敏感表达", passed: /敏感表达/.test(content) && /清单/.test(content), detail: "列出应避免的表达。" },
    { name: "五人理解测试", passed: /(?:5|五)\s*名/.test(content) && /测试者/.test(content) && /反馈|结果/.test(content), detail: "记录五名测试者的理解结果，供维护者核实。" },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

export function verifyGov003(content: string): Verdict {
  const score = content.match(/技术评分\s*[:：]\s*(\d{1,3})(?!\d)/);
  const checks = [
    { name: "文件长度", passed: content.trim().length >= 800 && content.length <= 20000, detail: "尖峰报告应为 800 至 20000 个字符。" },
    { name: "基线与环境", passed: /固定基线/.test(content) && /\b[a-f0-9]{40}\b/i.test(content) && /执行环境/.test(content) && /执行时间/.test(content), detail: "记录完整基线提交、执行环境和时间。" },
    { name: "纵向流程", passed: ["认领", "Runner", "上传", "审判", "复核", "合入", "账本"].every((term) => content.includes(term)), detail: "逐步记录真实任务的完整流程。" },
    { name: "回归命令", passed: ["npm test", "npm run typecheck", "npm run lint", "npm run build"].every((term) => content.includes(term)), detail: "列出四项回归命令及其结果。" },
    { name: "可复核证据", passed: /证据/.test(content) && /命令输出/.test(content) && /CI/.test(content), detail: "给出可由维护者核对的命令输出与 CI 证据。" },
    { name: "架构图", passed: /架构图/.test(content) && /```mermaid/.test(content) && ["Runner", "D1", "R2", "GitHub"].every((term) => content.includes(term)), detail: "用架构图说明运行与数据边界。" },
    { name: "技术评分", passed: /方案\s*A/.test(content) && /方案\s*B/.test(content) && /权衡/.test(content) && !!score && Number(score[1]) >= 75 && Number(score[1]) <= 100, detail: "比较至少两种方案，所选方案评分为 75 至 100。" },
    { name: "ADR 与局限", passed: ["ADR", "选择", "风险", "回滚", "未验证"].every((term) => content.includes(term)), detail: "记录决策、风险、回滚与未验证事项。" },
    { name: "凭据边界", passed: ["密钥", "本机", "隔离", "模型 Token"].every((term) => content.includes(term)), detail: "说明凭据留在本机且模型用量不等于游戏 Token。" },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

export function verifyGov004T(content: string): Verdict {
  const checks = [
    { name: "文件长度", passed: content.trim().length >= 400 && content.length <= 12000, detail: "条款草案应为 400 至 12000 个字符。" },
    { name: "游戏与算力分离", passed: /游戏\s*Token/i.test(content) && /模型\s*Token|算力\s*Token/i.test(content) && /模型费用|实际费用|真实费用/.test(content), detail: "分别说明游戏 Token 与真实模型用量。" },
    { name: "非金融边界", passed: ["不可充值", "不可提现", "不可交易", "不可转赠"].every((term) => content.includes(term)) && /不等于现金|不是现金/.test(content), detail: "列出充值、提现、交易、转赠与现金边界。" },
    { name: "费用责任", passed: /用户/.test(content) && /自行承担|自己承担/.test(content) && /模型费用|实际费用/.test(content), detail: "说明真实模型费用由用户承担。" },
    { name: "游戏消费与退款", passed: /装备/.test(content) && /押金/.test(content) && /退款|退还/.test(content), detail: "解释装备消费、任务押金与退款。" },
    { name: "贡献公平", passed: /功德/.test(content) && /验收|审判/.test(content) && /不能购买|不得购买|不可购买/.test(content), detail: "说明付费不能购买验收通过或功德。" },
    { name: "承诺与治理", passed: /无收益承诺|不承诺收益/.test(content) && /争议|申诉/.test(content) && /变更/.test(content), detail: "说明收益承诺、争议处理和条款变更。" },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

export function verifyMissionContent(missionId: string, content: string): Verdict | null {
  if (missionId === "GOV-001") return verifyGov001(content);
  if (missionId === "GOV-002") return verifyGov002(content);
  if (missionId === "GOV-003") return verifyGov003(content);
  if (missionId === "GOV-004T") return verifyGov004T(content);
  return null;
}
