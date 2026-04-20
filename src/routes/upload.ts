import { Hono } from "hono";
import { AwsClient } from "aws4fetch";
import { jwtOrAppMiddleware } from "../middleware/jwtOrApp.ts";
import {
  FileTypeExtMap,
  FileTypeLabel,
  type Env,
  type FileTypeValue,
} from "../types.ts";
import { requireR2SigningEnv } from "../utils/r2SigningEnv.ts";
import { headR2ObjectViaS3 } from "../utils/r2S3Api.ts";

const upload = new Hono<{ Bindings: Env }>();

upload.use("/*", jwtOrAppMiddleware);

const FileContentTypeMap: Record<string, string> = {
  epub: "application/epub+zip",
  mobi: "application/x-mobipocket-ebook",
  pdf: "application/pdf",
};

/**
 * 根据 hash 和原始文件名生成 R2 Key
 * 格式: files/{hash[0:2]}/{hash[2:4]}/{fullHash}.{ext}
 */
function buildKey(hash: string, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  return `files/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${ext}`;
}

function getFileExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function getBaseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

/** POST /api/upload/check — 检查文件是否已存在 */
upload.post("/check", async (c) => {
  const body = await c.req.json<{ hash: string }>();
  const { hash } = body ?? {};

  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    return c.json({ error: "Invalid hash" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT id, name, hash, file_size, file_type, file_key, created_at FROM books WHERE hash = ?"
  )
    .bind(hash)
    .first<{
      id: number;
      name: string;
      hash: string;
      file_size: number;
      file_type: FileTypeValue;
      file_key: string;
      created_at: number;
    }>();

  if (row) {
    return c.json({
      exists: true,
      book: {
        ...row,
        file_type_label: FileTypeLabel[row.file_type] ?? "unknown",
      },
    });
  }

  return c.json({ exists: false });
});

/** POST /api/upload/presign — 生成预签名上传 URL */
upload.post("/presign", async (c) => {
  const body = await c.req.json<{
    hash: string;
    filename: string;
    size: number;
  }>();
  const { hash, filename, size } = body ?? {};

  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    return c.json({ error: "Invalid hash" }, 400);
  }
  if (!filename) {
    return c.json({ error: "filename is required" }, 400);
  }
  if (!Number.isInteger(size) || size <= 0) {
    return c.json({ error: "Invalid size" }, 400);
  }

  const ext = getFileExt(filename);
  if (!FileTypeExtMap[ext]) {
    return c.json({ error: `Unsupported file type: ${ext}` }, 400);
  }
  const contentType = FileContentTypeMap[ext] ?? "application/octet-stream";

  const key = buildKey(hash, filename);

  const signingErr = requireR2SigningEnv(c);
  if (signingErr) return signingErr;

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
    expiresInSeconds,
  });
});

/** POST /api/upload/complete — 验证 R2 文件并写入数据库 */
upload.post("/complete", async (c) => {
  const body = await c.req.json<{
    hash: string;
    filename: string;
  }>();

  const { hash, filename } = body ?? {};

  if (!hash || !filename) {
    return c.json({ error: "Missing required fields" }, 400);
  }
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    return c.json({ error: "Invalid hash" }, 400);
  }

  const ext = getFileExt(filename);
  const type = FileTypeExtMap[ext];
  if (!type || !Object.values(FileTypeLabel).includes(FileTypeLabel[type])) {
    return c.json({ error: "Invalid file type" }, 400);
  }

  const key = buildKey(hash, filename);
  const name = getBaseName(filename);
  const normalizedName = name.trim() || hash;

  const signingErr = requireR2SigningEnv(c);
  if (signingErr) return signingErr;

  // 必须用 S3 API HEAD：预签名 PUT 写入的是云端桶；wrangler dev 下 c.env.R2 为本地模拟桶，head 会误判不存在
  const object = await headR2ObjectViaS3(c.env, key);
  if (!object) {
    return c.json({ error: "File not found in storage" }, 422);
  }
  if (object.size <= 0) {
    return c.json({ error: "Uploaded file is empty" }, 422);
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
    .bind(normalizedName, hash, object.size, type, key, now)
    .run();

  return c.json({
    success: true,
    book: {
      id: result.meta.last_row_id,
      name: normalizedName,
      hash,
      file_size: object.size,
      file_type: type,
      file_type_label: FileTypeLabel[type],
      file_key: key,
      created_at: now,
    },
  });
});

export default upload;
