# Pavilion — 电子书管理系统

基于 Cloudflare Workers + R2 + D1 构建的轻量级电子书管理系统，支持 epub、mobi、pdf 格式的上传、去重、浏览与删除。

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Cloudflare Workers |
| API 框架 | [Hono](https://hono.dev) |
| 数据库 | Cloudflare D1（SQLite） |
| 对象存储 | Cloudflare R2 |
| 前端 | Vite + React + Ant Design |

## 项目结构

```
pavilion/
├── src/                        # Workers 后端
│   ├── index.ts                # Hono 入口
│   ├── types.ts                # Env bindings & FileType 常量
│   ├── utils/jwt.ts            # JWT 工具（原生 Web Crypto）
│   ├── middleware/auth.ts      # JWT 验证中间件
│   └── routes/
│       ├── auth.ts             # POST /api/auth/login
│       ├── books.ts            # GET/DELETE /api/books
│       └── upload.ts           # 上传流程（check/presign/complete）
├── frontend/                   # React 前端
│   └── src/
│       ├── App.tsx             # 路由 + 认证守卫
│       ├── api/client.ts       # axios 封装
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   └── BooksPage.tsx   # 书籍列表（入口页）
│       └── components/
│           └── UploadModal.tsx # 分步上传弹窗
├── migrations/                 # D1 数据库迁移
│   └── 0001_init.sql
├── wrangler.toml
└── package.json
```

## 本地开发

### 前置条件

- Node.js >= 18
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) >= 3.x（`npm i -g wrangler`）
- Cloudflare 账号（已登录：`wrangler login`）

### 第一步：安装依赖

```bash
pnpm install
```

### 第二步：配置本地环境变量

```bash
cp .dev.vars.example .dev.vars
```

### 第三步：初始化本地数据库

```bash
pnpm run db:migrate:local
```

### 第四步：启动开发服务器

```bash
pnpm dev
```

## 部署到 Cloudflare

### 第一步：创建 D1 数据库

```bash
wrangler d1 create pavilion-db
```

将输出的 `database_id` 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "pavilion-db"
database_id = "你的-database-id"   # ← 替换这里
migrations_dir = "migrations"
```

### 第二步：创建 R2 存储桶

```bash
wrangler r2 bucket create pavilion-books
```

### 第四步：执行数据库迁移

```bash
npm run db:migrate:remote
```

### 第五步：构建并部署

```bash
npm run deploy
```

部署完成后，Worker 地址会显示在终端，如 `https://pavilion.<你的子域>.workers.dev`。

## 数据库迁移

项目使用 Wrangler 内置的 D1 Migrations 机制，迁移文件存放于 `migrations/` 目录，文件名格式为 `NNNN_描述.sql`。

### 创建新迁移

```bash
npm run db:migrate:new -- "add_cover_url"
# 等价于: wrangler d1 migrations create pavilion-db "add_cover_url"
# 自动生成: migrations/0002_add_cover_url.sql
```

编辑生成的 SQL 文件，然后应用：

```bash
# 本地测试
npm run db:migrate:local

# 应用到生产
npm run db:migrate:remote
```

Wrangler 会在 D1 中维护一张 `d1_migrations` 表记录已执行的迁移，保证每条迁移只执行一次。

## API 说明

所有 `/api/books` 和 `/api/upload` 接口均需在请求头携带 JWT：

```
Authorization: Bearer <token>
```

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/books?page=1&pageSize=20` | 分页查询书籍列表 |
| DELETE | `/api/books/:id` | 删除书籍（同步删除 R2 文件） |
| POST | `/api/upload/check` | `{hash}` → 检查文件是否已存在 |
| POST | `/api/upload/presign` | `{hash,filename,size}` → 获取预签名直传 URL |
| POST | `/api/upload/complete` | `{hash,filename}` → 验证 R2 对象并入库 |

## 上传流程

```
浏览器                        Workers API                  R2          D1
  │                                │                         │           │
  │── 读取文件，计算 SHA-256 ──────>│                         │           │
  │                                │                         │           │
  │── POST /upload/check {hash} ──>│── SELECT WHERE hash=? ─────────────>│
  │                                │<─────────────────────────────────── │
  │<── {exists: false} ───────────-│                         │           │
  │                                │                         │           │
  │── POST /upload/presign ───────>│ 生成预签名 PUT URL      │           │
  │<── {uploadUrl, contentType} ───│                         │           │
  │                                │                         │           │
  │── PUT uploadUrl ────────────────────────────────────────>│           │
  │<──────────────────────────────────────────────────────── │           │
  │                                │                         │           │
  │── POST /upload/complete ──────>│── R2.head(key) ────────>│           │
  │                                │── INSERT INTO books ───────────────>│
  │<── {success, book} ────────────│                         │           │
```

## 文件存储 Key 格式

```
files/{hash前2位}/{hash第3-4位}/{完整hash}.{扩展名}

示例：
  files/a1/b2/a1b2c3d4e5f6...epub
```

以哈希前缀分子目录，避免 R2 单目录文件数过多影响性能。

