import { createServer as createFixtureServer } from "node:http";
import { existsSync as fixtureExists, writeFileSync as fixtureWrite } from "node:fs";

// External provider mock only: no live model, no inspection of the gateway's budget.
const resumePhase = fixtureExists("/state/synthetic-provider-ready"), providerModel = "gpt-5.6-sol";
const invalidResume = fixtureExists("/state/synthetic-invalid-resume");
let generations = 0;
const fixtureProvider = createFixtureServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.headers.authorization !== `Bearer ${process.env.LINGNET_MODEL_API_KEY}`) {
    response.writeHead(401); response.end("{}"); return;
  }
  let text = "";
  for await (const chunk of request) text += chunk;
  const input = JSON.parse(text);
  if (request.url === "/v1/responses/input_tokens") {
    if (!resumePhase && generations > 0) {
      fixtureWrite("/state/synthetic-provider-ready", "Synthetic next execution only");
      response.writeHead(503); response.end("{}"); return;
    }
    response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 })); return;
  }
  if (request.url !== "/v1/responses" || input.model !== providerModel || input.max_output_tokens !== 128 ||
      input.reasoning?.effort !== "low" || !JSON.stringify(input).includes("坚持任务允许范围") ||
      resumePhase && !JSON.stringify(input).includes("本次从元神印记")) {
    response.writeHead(400); response.end("{}"); return;
  }
  generations++;
  const item = resumePhase && invalidResume && generations === 1
    ? { id: "call_invalid", type: "custom_tool_call", call_id: "call_invalid", name: "apply_patch",
      input: "*** Begin Patch\n*** Add File: unexpected.md\n+Synthetic out-of-scope artifact\n*** End Patch" }
    : resumePhase
    ? { id: "msg_fixture", type: "message", role: "assistant", status: "completed", phase: "final_answer",
      content: [{ type: "output_text", text: "Synthetic checkpoint continuation completed", annotations: [] }] }
    : { id: "call_fixture", type: "custom_tool_call", call_id: "call_fixture", name: "apply_patch",
      input: "*** Begin Patch\n*** Add File: site/lib/mission-graph.ts\n+export const partial = true;\n*** End Patch" };
  const result = { id: `resp_fixture_${generations}`, object: "response", created_at: 1, model: providerModel,
    status: "completed", output: [item], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } };
  response.setHeader("Content-Type", "text/event-stream");
  const events = [{ type: "response.created", response: { ...result, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item },
    { type: "response.output_item.done", output_index: 0, item }, { type: "response.completed", response: result }];
  for (const [sequence_number, event] of events.entries()) response.write(`event: ${event.type}\ndata: ${JSON.stringify({ sequence_number, ...event })}\n\n`);
  response.end();
});
await new Promise((ready) => fixtureProvider.listen(8800, "127.0.0.1", ready));
