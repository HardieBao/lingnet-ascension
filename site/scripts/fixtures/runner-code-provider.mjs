import { createServer as createFixtureServer } from "node:http";

// External model service fixture only. Real keys/providers are neither read nor called.
let generations = 0;
const fixtureProvider = createFixtureServer(async (request,response) => {
  if (request.headers.authorization !== `Bearer ${process.env.LINGNET_MODEL_API_KEY}`) {
    response.writeHead(401); response.end("{}"); return;
  }
  let text=""; for await (const chunk of request) text+=chunk;
  const input=JSON.parse(text);
  if (request.url === "/v1/responses/input_tokens") {
    response.setHeader("Content-Type","application/json");
    response.end(JSON.stringify({object:"response.input_tokens",input_tokens:2})); return;
  }
  if (request.url !== "/v1/responses" || input.model !== "gpt-5.6-sol" || input.max_output_tokens > 2048) {
    response.writeHead(400); response.end("{}"); return;
  }
  const item = generations++ === 0
    ? {id:"call_code",type:"custom_tool_call",call_id:"call_code",name:"apply_patch",
      input:"*** Begin Patch\n*** Update File: site/lib/small-json.ts\n@@\n-export async function readSmallJson(request: Request): Promise<unknown | null> {\n+// Synthetic automatic preflight fixture; not a community outcome.\n+export async function readSmallJson(request: Request): Promise<unknown | null> {\n*** End Patch"}
    : {id:"msg_code",type:"message",role:"assistant",status:"completed",phase:"final_answer",
      content:[{type:"output_text",text:"Synthetic scoped code finished",annotations:[]}]};
  const result={id:`resp_code_${generations}`,object:"response",created_at:1,model:"gpt-5.6-sol",status:"completed",output:[item],
    usage:{input_tokens:2,output_tokens:1,total_tokens:3}};
  response.setHeader("Content-Type","text/event-stream");
  const events=[{type:"response.created",response:{...result,status:"in_progress",output:[]}},
    {type:"response.output_item.added",output_index:0,item},{type:"response.output_item.done",output_index:0,item},
    {type:"response.completed",response:result}];
  for (const [sequence_number,event] of events.entries()) response.write(`event: ${event.type}\ndata: ${JSON.stringify({sequence_number,...event})}\n\n`);
  response.end();
});
await new Promise(ready=>fixtureProvider.listen(8800,"127.0.0.1",ready));
