import { realmNames, type Realm } from "./realms.ts";

const realmOrder: Realm[] = ["mortal", "qi", "foundation", "core"];

export function missionAccessReason(currentRealm: Realm, merit: number, requiredRealm: string, requiredMerit: number): string | null {
  const requiredLevel = realmOrder.indexOf(requiredRealm as Realm);
  if (requiredLevel < 0 || !Number.isSafeInteger(requiredMerit) || requiredMerit < 0) return "任务门槛配置无效，请联系维护者。";
  if (realmOrder.indexOf(currentRealm) < requiredLevel) return `需要达到${realmNames[requiredRealm as Realm]}境。`;
  if (merit < requiredMerit) return `功德还需 ${requiredMerit - merit} 点。`;
  return null;
}
