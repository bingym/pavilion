import { Hono } from "hono";
import { AwsClient } from "aws4fetch";
import { jwtOrAppMiddleware } from "../middleware/jwtOrApp.ts";
import { FileType, FileTypeLabel } from "../types.ts";
import type { Env, Book, FileTypeValue } from "../types.ts";
import { requireR2SigningEnv } from "../utils/r2SigningEnv.ts";
import { deleteR2ObjectViaS3 } from "../utils/r2S3Api.ts";

const books = new Hono<{ Bindings: Env }>();

const FILE_TYPES: FileTypeValue[] = [FileType.EPUB, FileType.MOBI, FileType.PDF];

function safeDownloadFilename(name: string, ext: string): string {
  const base = name.replace(/["\r\n]/g, "_").trim() || "book";
  return `${base}.${ext}`;
}

/** GET /api/books?page=&pageSize=&fileType=&name= — 分页查询（可选：类型、文件名模糊） */
books.get("/", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "20")));
  const offset = (page - 1) * pageSize;

  const fileTypeRaw = c.req.query("fileType");
  let fileTypeFilter: FileTypeValue | null = null;
  if (fileTypeRaw !== undefined && fileTypeRaw !== "") {
    const n = Number(fileTypeRaw);
    if (!Number.isInteger(n) || !FILE_TYPES.includes(n as FileTypeValue)) {
      return c.json({ error: "Invalid fileType" }, 400);
    }
    fileTypeFilter = n as FileTypeValue;
  }

  const nameRaw = (c.req.query("name") ?? "").trim();
  const namePattern =
    nameRaw.length > 0 ? `%${nameRaw.toLowerCase()}%` : null;

  const whereParts: string[] = [];
  const binds: (string | number)[] = [];
  if (fileTypeFilter !== null) {
    whereParts.push("file_type = ?");
    binds.push(fileTypeFilter);
  }
  if (namePattern !== null) {
    whereParts.push("LOWER(name) LIKE ?");
    binds.push(namePattern);
  }
  const whereSql =
    whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const countStmt = c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM books ${whereSql}`
  );
  const listStmt = c.env.DB.prepare(
    `SELECT id, name, hash, file_size, file_type, file_key, created_at FROM books ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  );

  const [countResult, rowsResult] = await Promise.all([
    binds.length > 0 ? countStmt.bind(...binds).first<{ total: number }>() : countStmt.first<{ total: number }>(),
    binds.length > 0
      ? listStmt.bind(...binds, pageSize, offset).all<Book>()
      : listStmt.bind(pageSize, offset).all<Book>(),
  ]);

  const total = countResult?.total ?? 0;
  const list = (rowsResult.results ?? []).map((b) => ({
    ...b,
    file_type_label: FileTypeLabel[b.file_type] ?? "unknown",
  }));

  return c.json({
    list,
    total,
    page,
    pageSize,
  });
});

const BOOK_HASH_HEX_RE = /^[0-9a-f]{64}$/i;

/** GET /api/books/:hash/download — 返回 R2 预签名 GET；:hash 为 64 位 hex（与 books.hash 一致） */
books.get("/:hash/download", async (c) => {
  const segment = c.req.param("hash");
  if (!BOOK_HASH_HEX_RE.test(segment)) {
    return c.json({ error: "Invalid hash" }, 400);
  }
  const hash = segment.toLowerCase();

  const book = await c.env.DB.prepare(
    "SELECT id, name, hash, file_size, file_type, file_key, created_at FROM books WHERE hash = ?"
  )
    .bind(hash)
    .first<Book>();

  if (!book) {
    return c.json({ error: "Book not found" }, 404);
  }

  const ext = FileTypeLabel[book.file_type] ?? "bin";
  const filename = safeDownloadFilename(book.name, ext);

  const signingErr = requireR2SigningEnv(c);
  if (signingErr) return signingErr;

  const r2Client = new AwsClient({
    service: "s3",
    region: "auto",
    accessKeyId: c.env.R2_ACCESS_KEY_ID,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
  });

  const r2Url = `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const expiresInSeconds = 600;
  const disposition = `attachment; filename="${filename}"`;

  const url = new URL(
    `${r2Url}/${c.env.R2_BUCKET_NAME}/${book.file_key}`
  );
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  url.searchParams.set("response-content-disposition", disposition);

  const signedRequest = await r2Client.sign(
    new Request(url.toString(), { method: "GET" }),
    { aws: { signQuery: true } }
  );

  return c.json({
    downloadUrl: signedRequest.url.toString(),
    expiresInSeconds,
    filename,
  });
});

/** PATCH /api/books/:id — 修改显示名称（D1 name 字段） */
books.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id" }, 400);
  }

  const body = await c.req.json<{ name?: string }>();
  const name = body?.name?.trim();
  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }
  if (name.length > 500) {
    return c.json({ error: "name too long" }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id, name, hash, file_size, file_type, file_key, created_at FROM books WHERE id = ?"
  )
    .bind(id)
    .first<Book>();

  if (!existing) {
    return c.json({ error: "Book not found" }, 404);
  }

  await c.env.DB.prepare("UPDATE books SET name = ? WHERE id = ?")
    .bind(name, id)
    .run();

  const file_type = existing.file_type;
  return c.json({
    book: {
      ...existing,
      name,
      file_type_label: FileTypeLabel[file_type] ?? "unknown",
    },
  });
});

/** DELETE /api/books/:id — 删除书籍（R2 文件 + D1 记录） */
books.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "Invalid id" }, 400);
  }

  const book = await c.env.DB.prepare(
    "SELECT id, file_key FROM books WHERE id = ?"
  )
    .bind(id)
    .first<{ id: number; file_key: string }>();

  if (!book) {
    return c.json({ error: "Book not found" }, 404);
  }

  const signingErr = requireR2SigningEnv(c);
  if (signingErr) return signingErr;

  // 与 complete 一致：用 S3 API 删云端对象（本地 dev 下 binding 与预签名桶不一致）
  const del = await deleteR2ObjectViaS3(c.env, book.file_key);
  if (!del.ok) {
    return c.json(
      { error: "Failed to delete object from storage", status: del.status },
      502
    );
  }

  await c.env.DB.prepare("DELETE FROM books WHERE id = ?").bind(id).run();

  return c.json({ success: true });
});

export default books;
