import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  return children;
}

// restricts access to pages, determine who logs in (can access page)