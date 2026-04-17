import { Hono } from "hono";
import { jwtSign } from "../utils/jwt.ts";
import type { Env } from "../types.ts";

const auth = new Hono<{ Bindings: Env }>();

auth.post("/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  const { username, password } = body ?? {};

  if (!username || !password) {
    return c.json({ error: "username and password are required" }, 400);
  }

  if (username !== c.env.ADMIN_USER || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await jwtSign({ sub: username }, c.env.JWT_SECRET);
  return c.json({ token });
});

export default auth;
