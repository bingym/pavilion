import React, { Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TOKEN_KEY } from "./api/client";

const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const BooksPage = React.lazy(() => import("./pages/BooksPage"));
const AppsAdminPage = React.lazy(() => import("./pages/AppsAdminPage"));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <BooksPage />
              </RequireAuth>
            }
          />
          <Route
            path="/apps"
            element={
              <RequireAuth>
                <AppsAdminPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
