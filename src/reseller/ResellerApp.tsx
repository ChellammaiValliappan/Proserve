import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "./store";
import Login from "./Login";
import Register from "./Register";
import Home from "./Home";
import Products from "./Products";
import Cart from "./Cart";
import Checkout from "./Checkout";
import { Orders, OrderDetail, OrderDone } from "./Orders";
import Help from "./Help";
import { Spinner } from "./ui";

function Guard({ children }: { children: ReactNode }) {
  const { me } = useStore();
  const loc = useLocation();
  if (me === undefined) return <Spinner />;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!me.profileComplete && loc.pathname !== "/register") return <Navigate to="/register" replace />;
  return <>{children}</>;
}

function Shell() {
  const { me, toast, config } = useStore();
  return (
    <div className="app">
      {config?.paymentMode === "mock" && <div className="dev-banner">DEV / TEST SERVER – no real payments</div>}
      <Routes>
        <Route path="/login" element={me ? <Navigate to="/" replace /> : me === undefined ? <Spinner /> : <Login />} />
        <Route path="/register" element={<Guard><Register /></Guard>} />
        <Route path="/" element={<Guard><Home /></Guard>} />
        <Route path="/products" element={<Guard><Products /></Guard>} />
        <Route path="/cart" element={<Guard><Cart /></Guard>} />
        <Route path="/checkout" element={<Guard><Checkout /></Guard>} />
        <Route path="/done/:id" element={<Guard><OrderDone /></Guard>} />
        <Route path="/orders" element={<Guard><Orders /></Guard>} />
        <Route path="/orders/:id" element={<Guard><OrderDetail /></Guard>} />
        <Route path="/help" element={<Guard><Help /></Guard>} />
        <Route path="/profile" element={<Guard><Register edit /></Guard>} />
        <Route path="/profile/edit" element={<Guard><Register edit /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default function ResellerApp() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
