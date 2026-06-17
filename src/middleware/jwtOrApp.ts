import { createMiddleware } from "hono/factory";
import { hashToken } from "../utils/appToken.ts";
import type { Env } from "../types.ts";

type Variables = {
  appId?: number;
};

export const jwtOrAppMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const bearer = authorization.slice(7);

  try {
    const tokenHash = await hashToken(bearer);
    const row = await c.env.DB.prepare(
      "SELECT id FROM apps WHERE token_hash = ?"
    )
      .bind(tokenHash)
      .first<{ id: number }>();

    if (!row) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("appId", row.id);
    await next();
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});
