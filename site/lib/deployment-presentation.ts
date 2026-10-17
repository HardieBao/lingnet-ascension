// Presentation only; authentication, economic switches and release approvals are separate.
import { isInvitationBeta } from "./beta-access.ts";

export function deploymentPresentation(settings: object) {
  const beta = isInvitationBeta(settings);
  const production = Reflect.get(settings, "DEPLOYMENT_STAGE") === "production" && !Reflect.get(settings, "PREVIEW_ONLY_GITHUB_ID");
  const revision: unknown = Reflect.get(settings, "SOURCE_REVISION");
  const pinned = typeof revision === "string" && /^[a-f0-9]{40}$/i.test(revision);
  return {
    stage: beta ? "邀请制 Beta" : production ? "生产版" : "Pre-Alpha",
    description: beta ? "邀请制 Beta：真实 GitHub 登录与测试记录；模型执行、奖励复核与调账暂不开放，尚非完整生产 MVP。邀请链接请勿公开转发。"
      : production ? "以真实任务贡献推进首赛季。模型费用由本机服务商收取，游戏 Token 不可提现；任务通过独立复核与合入核验后结算。"
      : "Pre-Alpha 受限预览，尚非正式 MVP；真实模型限额、生产经济开关与完整发布验收须分别确认。",
    sourceUrl: pinned ? `https://github.com/HardieBao/lingnet-ascension/tree/${revision}` : "https://github.com/HardieBao/lingnet-ascension",
    sourceLabel: pinned ? "查看固定部署源码 · AGPL-3.0" : "公开仓库 · 部署源码版本待核对",
  };
}
