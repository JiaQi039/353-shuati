#!/usr/bin/env node
/**
 * 零依赖本地静态服务器。
 * 用法：node scripts/serve.mjs [端口]
 * 然后访问 http://localhost:8000
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv.find(argument => /^\d+$/.test(argument))) || 8000;
const localOnly = process.argv.includes("--localhost");
const host = localOnly ? "127.0.0.1" : "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, "");
  const target = resolve(join(root, relative || "index.html"));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

const server = createServer(async (request, response) => {
  let target = safePath(request.url || "/");
  if (!target) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    let info = await stat(target);
    if (info.isDirectory()) {
      target = join(target, "index.html");
      info = await stat(target);
    }
    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<h1>404</h1><p>文件不存在。请检查路径。</p>");
  }
});

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

server.listen(port, host, () => {
  console.log(`353 刷题室已启动：http://localhost:${port}`);
  if (!localOnly) {
    for (const address of lanAddresses()) {
      console.log(`手机（同一 Wi-Fi）：http://${address}:${port}`);
    }
    console.log("仅在可信局域网内使用；如 Windows 弹出防火墙提示，请允许“专用网络”。");
  }
  console.log("按 Ctrl+C 停止。");
});
