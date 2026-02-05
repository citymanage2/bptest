import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { CompanyPage } from "./pages/CompanyPage";
import { InterviewPage } from "./pages/InterviewPage";
import { ProcessPage } from "./pages/ProcessPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SupportPage } from "./pages/SupportPage";
import { FaqPage } from "./pages/FaqPage";
import { AdminPage } from "./pages/AdminPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/companies" replace /> : <LandingPage />} />
      <Route path="/login" element={user ? <Navigate to="/companies" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/companies" replace /> : <RegisterPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/companies" element={<CompaniesPage />} />
        <Route path="/companies/:id" element={<CompanyPage />} />
        <Route path="/interview/:id" element={<InterviewPage />} />
        <Route path="/process/:id" element={<ProcessPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/support" element={<SupportPage />} />
      </Route>
      <Route
        path="/admin/*"
        element={
          <AdminRoute>
            <Layout />
          </AdminRoute>
        }
      >
        <Route index element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
