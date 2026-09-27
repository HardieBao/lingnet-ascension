import { createServer } from "node:http";

// Synthetic upstream runs only in the trusted test gateway container, on loopback.
const provider = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.headers.authorization !== `Bearer ${process.env.LINGNET_MODEL_API_KEY}`) {
    response.writeHead(401); response.end("{}"); return;
  }
  if (request.url === "/v1/responses/input_tokens") {
    response.end(JSON.stringify({ object: "response.input_tokens", input_tokens: 2 }));
  } else if (request.url === "/v1/responses") {
    let text = "";
    for await (const chunk of request) text += chunk;
    const input = JSON.parse(text);
    const item = { id: "msg_fixture", type: "message", role: "assistant", status: "completed", phase: "final_answer",
      content: [{ type: "output_text", text: "Synthetic isolated CLI result", annotations: [] }] };
    const result = { id: "resp_fixture", object: "response", created_at: 1, model: "gpt-5.6-sol", status: "completed", output: [item],
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } };
    if (input.stream) {
      response.setHeader("Content-Type", "text/event-stream");
      const events = [
        { type: "response.created", response: { ...result, status: "in_progress", output: [] } },
        { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
        { type: "response.content_part.added", item_id: item.id, output_index: 0, content_index: 0,
          part: { type: "output_text", text: "", annotations: [] } },
        { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: item.content[0].text },
        { type: "response.output_text.done", item_id: item.id, output_index: 0, content_index: 0, text: item.content[0].text },
        { type: "response.content_part.done", item_id: item.id, output_index: 0, content_index: 0, part: item.content[0] },
        { type: "response.output_item.done", output_index: 0, item },
        { type: "response.completed", response: result },
      ];
      for (const [sequence_number, event] of events.entries()) response.write(`event: ${event.type}\ndata: ${JSON.stringify({ sequence_number, ...event })}\n\n`);
      response.end();
    } else response.end(JSON.stringify(result));
  } else { response.writeHead(404); response.end("{}"); }
});
await new Promise((resolve) => provider.listen(8800, "127.0.0.1", resolve));
await import("/gateway/budget-gateway.mjs");
