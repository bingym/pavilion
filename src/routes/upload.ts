import { Hono } from "hono";
import { AwsClient } from "aws4fetch";
import { authMiddleware } from "../middleware/auth.ts";
import { FileTypeExtMap, FileTypeLabel } from "../types.ts";
import type { Env, FileTypeValue } from "../types.ts";

const upload = new Hono<{ Bindings: Env }>();

upload.use("/*", authMiddleware);

/**
 * 根据 hash 和原始文件名生成 R2 Key
 * 格式: files/{hash[0:2]}/{hash[2:4]}/{fullHash}.{ext}
 */
function buildKey(hash: string, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  return `files/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${ext}`;
}

/** POST /api/upload/check — 检查文件是否已存在 */
upload.post("/check", async (c) => {
  const body = await c.req.json<{ hash: string }>();
  const { hash } = body ?? {};

  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    return c.json({ error: "Invalid hash" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT id, name, file_key FROM books WHERE hash = ?"
  )
    .bind(hash)
    .first<{ id: number; name: string; file_key: string }>();

  if (row) {
    return c.json({ exists: true, book: row });
  }

  return c.json({ exists: false });
});

/** GET /api/upload/presign — 生成预签名上传 URL */
upload.get("/presign", async (c) => {
  const hash = c.req.query("hash");
  const filename = c.req.query("filename");
  const contentType = c.req.query("contentType") ?? "application/octet-stream";

  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    return c.json({ error: "Invalid hash" }, 400);
  }
  if (!filename) {
    return c.json({ error: "filename is required" }, 400);
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!FileTypeExtMap[ext]) {
    return c.json({ error: `Unsupported file type: ${ext}` }, 400);
  }

  const key = buildKey(hash, filename);

  // 使用 aws4fetch 生成 R2 S3 API 预签名 URL
  // 浏览器可直接使用此 URL 上传文件，绕过 Worker 请求体大小限制
  const r2Client = new AwsClient({
    service: "s3",
    region: "auto",
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
  });

  const r2Url = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const expiresInSeconds = 600; // 10 分钟有效期

  const signedRequest = await r2Client.sign(
    new Request(
      `${r2Url}/${c.env.R2_BUCKET_NAME}/${key}?X-Amz-Expires=${expiresInSeconds}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
      }
    ),
    { aws: { signQuery: true } }
  );

  return c.json({
    key,
    uploadUrl: signedRequest.url.toString(),
    method: "PUT",
    contentType,
  });
});

/** POST /api/upload/complete — 验证 R2 文件并写入数据库 */
upload.post("/complete", async (c) => {
  const body = await c.req.json<{
    key: string;
    hash: string;
    name: string;
    size: number;
    type: FileTypeValue;
  }>();

  const { key, hash, name, size, type } = body ?? {};

  if (!key || !hash || !name || !size || !type) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  if (!Object.values(FileTypeLabel).includes(FileTypeLabel[type])) {
    return c.json({ error: "Invalid file type" }, 400);
  }

  // 验证 R2 中文件真实存在
  const object = await c.env.R2.head(key);
  if (!object) {
    return c.json({ error: "File not found in storage" }, 422);
  }

  // 防止重复入库
  const existing = await c.env.DB.prepare(
    "SELECT id FROM books WHERE hash = ?"
  )
    .bind(hash)
    .first<{ id: number }>();

  if (existing) {
    return c.json({ error: "Book already exists", id: existing.id }, 409);
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.prepare(
    "INSERT INTO books (name, hash, file_size, file_type, file_key, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(name, hash, size, type, key, now)
    .run();

  return c.json({
    success: true,
    book: {
      id: result.meta.last_row_id,
      name,
      hash,
      file_size: size,
      file_type: type,
      file_key: key,
      created_at: now,
    },
  });
});

export default upload;
