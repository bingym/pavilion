import type { Context } from "hono";
import type { Env } from "../types.ts";

/**
 * 预签名上传/下载需要 R2 S3 API Token（与 wrangler R2 binding 不同）。
 * 本地开发请在 .dev.vars 中配置，参考 .dev.vars.example。
 */
export function requireR2SigningEnv(
  c: Context<{ Bindings: Env }>
): Response | undefined {
  const account = c.env.R2_ACCOUNT_ID?.trim();
  const keyId = c.env.R2_ACCESS_KEY_ID?.trim();
  const secret = c.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!account || !keyId || !secret) {
    return c.json(
      {
        error:
          "R2 S3 API 未配置：请在 .dev.vars 中设置 R2_ACCOUNT_ID、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY（参考 .dev.vars.example 与 README）。",
      },
      503
    );
  }
  return undefined;
}
