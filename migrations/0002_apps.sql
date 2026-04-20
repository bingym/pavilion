-- 第三方 APP：name + 至多一个 token（仅存哈希，明文仅创建/轮换时返回一次）

CREATE TABLE IF NOT EXISTS apps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  token_hash TEXT    UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apps_token_hash ON apps(token_hash);
