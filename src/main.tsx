import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./styles.css";
import ResellerApp from "./reseller/ResellerApp";

// The admin portal is loaded only when someone opens /admin, keeping the reseller app light on mobile data.
const AdminApp = lazy(() => import("./admin/AdminApp"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={<div className="spinner" />}><AdminApp /></Suspense>} />
        <Route path="/*" element={<ResellerApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
