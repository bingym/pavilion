import { createMiddleware } from "hono/factory";
import { jwtVerify } from "../utils/jwt.ts";
import { hashToken } from "../utils/appToken.ts";
import type { Env, JwtPayload } from "../types.ts";

type Variables = {
  jwtPayload?: JwtPayload;
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
    const payload = await jwtVerify(bearer, c.env.JWT_SECRET);
    c.set("jwtPayload", payload);
    await next();
    return;
  } catch {
    // 非 JWT 或 JWT 无效：按 APP Token 校验
  }

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
