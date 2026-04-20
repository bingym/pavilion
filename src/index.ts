import { Hono } from "hono";
import { cors } from "hono/cors";
import auth from "./routes/auth.ts";
import adminApps from "./routes/adminApps.ts";
import books from "./routes/books.ts";
import upload from "./routes/upload.ts";
import type { Env } from "./types.ts";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.route("/api/auth", auth);
app.route("/api/admin/apps", adminApps);
app.route("/api/books", books);
app.route("/api/upload", upload);

// 健康检查
app.get("/api/health", (c) => c.json({ ok: true }));

// 其余请求交给静态资源（前端 SPA）
// 文件请求（有扩展名）直接透传；其他路由（/login、/ 等）找不到时回退 index.html
app.get("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) {
    const indexUrl = new URL("/index.html", c.req.url);
    return c.env.ASSETS.fetch(new Request(indexUrl, c.req.raw));
  }
  return res;
});

export default app;
