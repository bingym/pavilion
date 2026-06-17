import { Hono } from "hono";
import type { Env } from "../types.ts";
import { generateRawToken, hashToken } from "../utils/appToken.ts";

const adminApps = new Hono<{ Bindings: Env }>();

const MAX_NAME_LEN = 200;

/** GET / — 列表 */
adminApps.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, created_at,
            CASE WHEN token_hash IS NOT NULL THEN 1 ELSE 0 END as has_token
     FROM apps ORDER BY id ASC`
  ).all<{
    id: number;
    name: string;
    created_at: number;
    has_token: number;
  }>();

  const list = (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    hasToken: r.has_token === 1,
  }));

  return c.json({ list });
});

/** POST / — 创建 APP */
adminApps.post("/", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim();
  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }
  if (name.length > MAX_NAME_LEN) {
    return c.json({ error: "name too long" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.prepare(
    "INSERT INTO apps (name, token_hash, created_at) VALUES (?, NULL, ?)"
  )
    .bind(name, now)
    .run();

  const id = result.meta.last_row_id as number;
  return c.json({ app: { id, name, created_at: now } }, 201);
});

/** POST /:id/token — 创建或轮换 token，明文仅响应中返回一次 */
adminApps.post("/:id/token", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT id FROM apps WHERE id = ?"
  )
    .bind(id)
    .first<{ id: number }>();

  if (!row) {
    return c.json({ error: "App not found" }, 404);
  }

  const raw = generateRawToken();
  const tokenHash = await hashToken(raw);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    "UPDATE apps SET token_hash = ? WHERE id = ?"
  )
    .bind(tokenHash, id)
    .run();

  return c.json({ token: raw, appId: id, rotatedAt: now });
});

/** DELETE /:id/token — 撤销 token（幂等） */
adminApps.delete("/:id/token", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id" }, 400);
  }

  await c.env.DB.prepare("UPDATE apps SET token_hash = NULL WHERE id = ?")
    .bind(id)
    .run();

  return c.body(null, 204);
});

/** DELETE /:id — 删除 APP，token 同时失效 */
adminApps.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id" }, 400);
  }

  const result = await c.env.DB.prepare("DELETE FROM apps WHERE id = ?")
    .bind(id)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "App not found" }, 404);
  }

  return c.body(null, 204);
});

export default adminApps;
