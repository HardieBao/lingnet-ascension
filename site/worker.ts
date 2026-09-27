import handler from "vinext/server/fetch-handler";
import { settleScheduledRealmTrials } from "./lib/scheduled-trials";

export default {
  fetch: handler.fetch,
  async scheduled() {
    await settleScheduledRealmTrials();
  },
} satisfies ExportedHandler<Cloudflare.Env>;
