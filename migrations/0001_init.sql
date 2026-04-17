-- Migration: 0001_init
-- 初始化电子书管理系统数据库
-- file_type: 1=epub, 2=mobi, 3=pdf

CREATE TABLE IF NOT EXISTS books (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  hash       TEXT    NOT NULL UNIQUE,
  file_size  INTEGER NOT NULL,
  file_type  INTEGER NOT NULL,
  file_key   TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_books_hash      ON books(hash);
CREATE INDEX IF NOT EXISTS idx_books_file_type ON books(file_type);
