import axios from "axios";

export const TOKEN_KEY = "pavilion_token";

export const http = axios.create({
  baseURL: "/api",
  timeout: 30_000,
});

// 请求拦截器：自动附加 JWT
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：401 自动跳转登录
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ─── Auth ────────────────────────────────────────────
export const login = (username: string, password: string) =>
  http.post<{ token: string }>("/auth/login", { username, password });

// ─── Books ───────────────────────────────────────────
export interface Book {
  id: number;
  name: string;
  hash: string;
  file_size: number;
  file_type: number;
  file_type_label: string;
  file_key: string;
  created_at: number;
}

export interface BooksResponse {
  list: Book[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BooksQuery {
  /** 1=epub, 2=mobi, 3=pdf */
  fileType?: number;
  /** 文件名模糊匹配（后端 LOWER(name) LIKE） */
  name?: string;
}

export const getBooks = (
  page = 1,
  pageSize = 20,
  query?: BooksQuery
) =>
  http.get<BooksResponse>("/books", {
    params: {
      page,
      pageSize,
      ...(query?.fileType != null ? { fileType: query.fileType } : {}),
      ...(query?.name ? { name: query.name } : {}),
    },
  });

export const patchBookName = (id: number, name: string) =>
  http.patch<{ book: Book }>(`/books/${id}`, { name });

export interface DownloadPresignResponse {
  downloadUrl: string;
  expiresInSeconds: number;
  filename: string;
}

/** 获取 R2 预签名 GET，浏览器可 window.location.href = downloadUrl */
export const getBookDownloadPresign = (id: number) =>
  http.get<DownloadPresignResponse>(`/books/${id}/download`);

export const deleteBook = (id: number) =>
  http.delete<{ success: boolean }>(`/books/${id}`);

// ─── Upload ──────────────────────────────────────────
export const checkFile = (hash: string) =>
  http.post<{ exists: boolean; book?: Book }>("/upload/check", { hash });

export interface PresignResponse {
  key: string;
  uploadUrl: string;
  method: string;
  contentType: string;
  expiresInSeconds: number;
}

export const presignUpload = (
  hash: string,
  file: Pick<File, "name" | "size">
) =>
  http.post<PresignResponse>("/upload/presign", {
    hash,
    filename: file.name,
    size: file.size,
  });

export const directUpload = (
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void
) =>
  axios.put(uploadUrl, file, {
    headers: {
      "Content-Type": contentType,
    },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });

export const FILE_TYPE_MAP: Record<string, number> = {
  epub: 1,
  mobi: 2,
  pdf: 3,
};

export const completeUpload = (payload: {
  hash: string;
  filename: string;
}) => http.post<{ success: boolean; book: Book }>("/upload/complete", payload);

// ─── Utilities ───────────────────────────────────────
export async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
