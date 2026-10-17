#!/usr/bin/env node
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { startRunnerStatusWorkbench } from "./runner-status-workbench.mjs";

let workbench;
try {
  if (process.argv.length !== 3) {
    console.error("用法：node runner-status-cli.mjs <v4任务包.json>（在原 Runner 根目录运行，只读，不需模型费用确认）");
    process.exitCode = 2;
  } else {
    const path = process.argv[2], stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 131072) throw new Error("Invalid package file");
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let value;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size > 131072) throw new Error("Changed package file");
      const bytes = Buffer.alloc(131073);
      let size = 0;
      while (size < bytes.length) {
        const { bytesRead } = await handle.read(bytes, size, bytes.length - size, size);
        if (!bytesRead) break;
        size += bytesRead;
      }
      if (size > 131072) throw new Error("Package file limit");
      value = JSON.parse(bytes.subarray(0, size).toString("utf8"));
    } finally { await handle.close(); }
    workbench = await startRunnerStatusWorkbench(value);
    console.log(`LOCAL_RUNNER_STATUS=${workbench.origin}/`);
    console.log("本机只读观察，不启动模型或上传记录。输入 stop 或按 Ctrl+C 仅关闭此状态服务，原记录保留。");
    let stop, input, command = "";
    try {
      await new Promise((done) => {
        stop = done;
        input = (chunk) => {
          const lines = (command + chunk).split(/\r?\n/);
          command = lines.pop().slice(-128);
          if (lines.some((line) => line.trim() === "stop")) done();
        };
        process.stdin.setEncoding("utf8"); process.stdin.on("data", input); process.stdin.once("end", stop);
        process.once("SIGINT", stop); process.once("SIGTERM", stop);
      });
    } finally {
      process.stdin.pause(); process.stdin.removeListener("data", input); process.stdin.removeListener("end", stop);
      process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    }
  }
} catch {
  console.error("无法打开本机状态页。请核对任务包、Runner 目录及同目录的状态模块；不回显文件内容，不启动或恢复模型。");
  process.exitCode = 1;
} finally { if (workbench) await workbench.close(); }
