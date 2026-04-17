import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.ts";
import { FileTypeLabel } from "../types.ts";
import type { Env, Book } from "../types.ts";

const books = new Hono<{ Bindings: Env }>();

books.use("/*", authMiddleware);

/** GET /api/books?page=1&pageSize=20 — 分页查询书籍列表 */
books.get("/", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "20")));
  const offset = (page - 1) * pageSize;

  const [countResult, rowsResult] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as total FROM books").first<{
      total: number;
    }>(),
    c.env.DB.prepare(
      "SELECT id, name, hash, file_size, file_type, file_key, created_at FROM books ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
      .bind(pageSize, offset)
      .all<Book>(),
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

  // 先删 R2 文件，再删 D1 记录
  await c.env.R2.delete(book.file_key);
  await c.env.DB.prepare("DELETE FROM books WHERE id = ?").bind(id).run();

  return c.json({ success: true });
});

export default books;
