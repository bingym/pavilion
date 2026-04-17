import { Hono } from "hono";
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

  // Cloudflare R2 Workers Binding 不支持原生预签名 URL，
  // 采用 Worker 代理上传方案：返回带签名 token 的上传端点
  const uploadToken = await generateUploadToken(hash, key, c.env.JWT_SECRET);

  return c.json({
    key,
    uploadUrl: `/api/upload/proxy`,
    uploadToken,
    method: "PUT",
  });
});

/** PUT /api/upload/proxy — 代理接收文件并写入 R2 */
upload.put("/proxy", async (c) => {
  const token = c.req.header("X-Upload-Token");
  const key = c.req.header("X-Upload-Key");

  if (!token || !key) {
    return c.json({ error: "Missing upload token or key" }, 400);
  }

  let tokenPayload: { hash: string; key: string; exp: number };
  try {
    tokenPayload = await verifyUploadToken(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ error: "Invalid or expired upload token" }, 401);
  }

  if (tokenPayload.key !== key) {
    return c.json({ error: "Key mismatch" }, 400);
  }

  const body = c.req.raw.body;
  if (!body) {
    return c.json({ error: "No file body" }, 400);
  }

  const contentType =
    c.req.header("Content-Type") ?? "application/octet-stream";

  await c.env.R2.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { sha256: tokenPayload.hash },
  });

  return c.json({ success: true });
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

// ──────────────────────────────────────────────
// 上传 Token 工具函数（HMAC-SHA256，10分钟有效）
// ──────────────────────────────────────────────

async function generateUploadToken(
  hash: string,
  key: string,
  secret: string
): Promise<string> {
  const payload = {
    hash,
    key,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const enc = new TextEncoder();
  const data = enc.encode(JSON.stringify(payload));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const payloadB64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${payloadB64}.${sigB64}`;
}

async function verifyUploadToken(
  token: string,
  secret: string
): Promise<{ hash: string; key: string; exp: number }> {
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) throw new Error("Invalid token");

  const payloadStr = decodeURIComponent(
    escape(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")))
  );
  const payload = JSON.parse(payloadStr) as {
    hash: string;
    key: string;
    exp: number;
  };

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = Uint8Array.from(
    atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const isValid = await crypto.subtle.verify(
    "HMAC",
    cryptoKey,
    sigBytes,
    enc.encode(JSON.stringify(payload))
  );

  if (!isValid) throw new Error("Invalid signature");
  return payload;
}

export default upload;
