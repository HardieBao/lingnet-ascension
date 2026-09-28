export function artifactSafetyIssues(content: string): string[] {
  const issues: string[] = [];
  if (/\bsk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{20,}\b/.test(content) ||
      /\b(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b/.test(content)) {
    issues.push("疑似密钥或访问令牌");
  }
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(content)) issues.push("疑似私钥");
  const credentials = /\b(?:[A-Z_]*(?:API_KEY|ACCESS_TOKEN|PASSWORD|SECRET)|apiKey|api_key|accessToken|access_token|password|secret)\b\s*["']?\s*[:=]\s*["']?([a-zA-Z0-9+/_=-]{8,})\b/g;
  for (const match of content.matchAll(credentials)) {
    if (!/^(?:YOUR_[A-Z0-9_]+|REPLACE_ME|REDACTED|CHANGE_ME|CHANGEME)$/i.test(match[1])) {
      issues.push("疑似私人配置中的凭据");
      break;
    }
  }
  return issues;
}
