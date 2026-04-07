// components/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/user/login" replace />;
  }

  return children;
}

// restricts access to pages, determine who logs in (can access page)