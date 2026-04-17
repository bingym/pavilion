export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
}

// 文件类型枚举（整型常量，不使用 TypeScript enum）
export const FileType = {
  EPUB: 1,
  MOBI: 2,
  PDF: 3,
} as const;

export type FileTypeValue = (typeof FileType)[keyof typeof FileType];

export const FileTypeLabel: Record<FileTypeValue, string> = {
  [FileType.EPUB]: "epub",
  [FileType.MOBI]: "mobi",
  [FileType.PDF]: "pdf",
};

export const FileTypeExtMap: Record<string, FileTypeValue> = {
  epub: FileType.EPUB,
  mobi: FileType.MOBI,
  pdf: FileType.PDF,
};

export interface Book {
  id: number;
  name: string;
  hash: string;
  file_size: number;
  file_type: FileTypeValue;
  file_key: string;
  created_at: number;
}

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}
