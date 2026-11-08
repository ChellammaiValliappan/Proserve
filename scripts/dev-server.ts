// Local API server that runs the same router as the Netlify function. Usage: npm run dev:api
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*?)(\s+#.*)?$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const { handle } = await import("../server/router.ts");

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const host = req.headers.host || "localhost:8888";
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const request = new Request(`http://${host}${req.url}`, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : Buffer.concat(chunks),
  });
  const r = await handle(request, req.socket.remoteAddress || "127.0.0.1");
  const out: Record<string, string | string[]> = {};
  r.headers.forEach((v, k) => (out[k] = v));
  const cookies = (r.headers as any).getSetCookie?.() as string[] | undefined;
  if (cookies?.length) out["set-cookie"] = cookies;
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8888, () => console.log("API on http://localhost:8888"));
