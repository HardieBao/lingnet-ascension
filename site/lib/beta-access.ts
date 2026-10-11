export function isInvitationBeta(settings: object): boolean {
  return Reflect.get(settings, "DEPLOYMENT_STAGE") === "beta";
}

export function betaInvitationVersion(settings: object): string | undefined {
  const hash: unknown = Reflect.get(settings, "BETA_INVITE_SHA256");
  return isInvitationBeta(settings) && typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash) ? hash : undefined;
}

export async function verifyBetaInvitation(settings: object, code: string | undefined): Promise<boolean> {
  const expected = betaInvitationVersion(settings);
  if (!expected || !code || !/^[a-f0-9]{64}$/.test(code)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const observed = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return observed === expected;
}
