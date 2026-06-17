import React, { Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

const BooksPage = React.lazy(() => import("./pages/BooksPage"));
const AppsAdminPage = React.lazy(() => import("./pages/AppsAdminPage"));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div />}>
        <Routes>
          <Route path="/" element={<BooksPage />} />
          <Route path="/apps" element={<AppsAdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
