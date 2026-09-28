import { existsSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";

let gitReadOnly = false;
try { writeFileSync("/workspace/.git/config", "Synthetic metadata attack"); }
catch { gitReadOnly = true; }
const outsideBlocked = await new Promise((resolve) => {
  const socket = createConnection({ host: "1.1.1.1", port: 443 });
  socket.setTimeout(1500);
  socket.once("connect", () => { socket.destroy(); resolve(false); });
  socket.once("error", () => { socket.destroy(); resolve(true); });
  socket.once("timeout", () => { socket.destroy(); resolve(true); });
});
const response = await fetch("http://gateway:8787/v1/responses", { method: "POST",
  headers: { Authorization: `Bearer ${process.env.LINGNET_RELAY_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "gpt-5.6-sol", input: "Synthetic isolation probe" }),
});
const body = await response.json();
console.log(JSON.stringify({ gitReadOnly, outsideBlocked, modelStatus: response.status, usage: body.usage,
  noUpstreamKey: process.env.LINGNET_MODEL_API_KEY === undefined,
  noOwnerControl: process.env.LINGNET_CONTROL_TOKEN === undefined,
  noPrivateState: !existsSync("/state/budget.json") && !existsSync("/state/private-owner.txt"),
  noDockerSocket: !existsSync("/var/run/docker.sock") }));
