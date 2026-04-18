import { AwsClient } from "aws4fetch";
import type { Env } from "../types.ts";

const SIGN_EXPIRES_SECONDS = 300;

function createR2S3Client(env: Env): AwsClient {
  return new AwsClient({
    service: "s3",
    region: "auto",
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
  });
}

function objectUrl(env: Env, key: string): URL {
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`;
  return new URL(base);
}

/**
 * 通过 S3 兼容 API 对对象做 HEAD，与预签名 PUT 使用同一云端桶路径。
 * wrangler dev 下 `c.env.R2.head` 走的是本地 Miniflare 桶，与浏览器直传 R2 的桶不一致，故 complete 必须用此函数校验。
 */
export async function headR2ObjectViaS3(
  env: Env,
  key: string
): Promise<{ size: number } | null> {
  const r2Client = createR2S3Client(env);
  const url = objectUrl(env, key);
  url.searchParams.set("X-Amz-Expires", String(SIGN_EXPIRES_SECONDS));

  const signed = await r2Client.sign(
    new Request(url.toString(), { method: "HEAD" }),
    { aws: { signQuery: true } }
  );

  const res = await fetch(signed);
  if (res.status === 404) return null;
  if (!res.ok) return null;

  const cl = res.headers.get("content-length");
  const size = cl ? Number(cl) : 0;
  if (!Number.isFinite(size) || size < 0) return null;
  return { size };
}

/**
 * 通过 S3 兼容 API 删除对象，与 binding 本地桶解耦（本地 dev 与 complete 一致）。
 */
export async function deleteR2ObjectViaS3(
  env: Env,
  key: string
): Promise<{ ok: boolean; status: number }> {
  const r2Client = createR2S3Client(env);
  const url = objectUrl(env, key);
  url.searchParams.set("X-Amz-Expires", String(SIGN_EXPIRES_SECONDS));

  const signed = await r2Client.sign(
    new Request(url.toString(), { method: "DELETE" }),
    { aws: { signQuery: true } }
  );

  const res = await fetch(signed);
  const ok = res.ok || res.status === 204 || res.status === 404;
  return { ok, status: res.status };
}
