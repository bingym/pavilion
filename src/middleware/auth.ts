import { createMiddleware } from "hono/factory";
import { jwtVerify, importHmac } from "../utils/jwt.ts";
import type { Env, JwtPayload } from "../types.ts";

type Variables = {
  jwtPayload: JwtPayload;
};

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice(7);
  try {
    const payload = await jwtVerify(token, c.env.JWT_SECRET);
    c.set("jwtPayload", payload);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
