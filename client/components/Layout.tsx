import { useState } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { trpc } from "../lib/trpc";
import {
  Building2,
  User,
  LogOut,
  HelpCircle,
  MessageSquare,
  Shield,
  Coins,
  Home,
  FileDown,
  Loader2,
  X,
} from "lucide-react";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const navItems = [
    { href: "/companies", label: "Компании", icon: Building2 },
    { href: "/support", label: "Поддержка", icon: MessageSquare },
    { href: "/faq", label: "База знаний", icon: HelpCircle },
  ];

  if (user?.role === "admin") {
    navItems.push({ href: "/admin", label: "Админ", icon: Shield });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/companies" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-foreground">BPB</span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* User section */}
            <div className="flex items-center gap-4">
              {/* Token balance */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 rounded-full border border-yellow-200">
                <Coins className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-700">
                  {user?.tokenBalance?.toLocaleString()}
                </span>
              </div>

              {/* Profile */}
              <Link
                to="/profile"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium hidden sm:block">{user?.name}</span>
              </Link>

              {/* Logout */}
              <button
                onClick={handleLogout}
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100 transition-colors"
                title="Выйти"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-border px-4 py-2 flex gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main content */}
      <main className="w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded-lg flex items-center justify-center">
                <Home className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-sm text-foreground">BPB</span>
              <span className="text-sm text-muted-foreground">— Business Process Builder</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/faq" className="hover:text-foreground transition-colors">
                База знаний
              </Link>
              <Link to="/support" className="hover:text-foreground transition-colors">
                Поддержка
              </Link>
            </div>
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} BPB. Все права защищены.
            </div>
          </div>
        </div>
      </footer>

      {/* Admin Log Button */}
      {user?.role === "admin" && <AdminLogButton />}
    </div>
  );
}

// Floating admin log button component
function AdminLogButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const logsQuery = trpc.admin.getLogs.useQuery(
    { limit: 500 },
    { enabled: isOpen, refetchInterval: isOpen ? 5000 : false }
  );

  const downloadLogs = async () => {
    setIsDownloading(true);
    try {
      const logs = logsQuery.data?.logs || [];
      const text = logs
        .map((l) => {
          const details = l.details
            ? `\n  ${JSON.stringify(l.details, null, 2).replace(/\n/g, "\n  ")}`
            : "";
          return `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${details}`;
        })
        .join("\n\n");

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bpb-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download logs", e);
    } finally {
      setIsDownloading(false);
    }
  };

  const errorCount = logsQuery.data?.logs.filter((l) => l.level === "error").length || 0;
  const warnCount = logsQuery.data?.logs.filter((l) => l.level === "warn").length || 0;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 w-12 h-12 bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center transition-colors z-50"
        title="Логи сервера"
      >
        {isOpen ? <X className="w-5 h-5" /> : <FileDown className="w-5 h-5" />}
        {!isOpen && errorCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">
            {errorCount > 9 ? "9+" : errorCount}
          </span>
        )}
      </button>

      {/* Log panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 w-[500px] max-h-[70vh] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-gray-900">Логи сервера</h3>
              <span className="text-xs text-gray-500">
                ({logsQuery.data?.total || 0} записей)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {errorCount > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium">
                  {errorCount} ошибок
                </span>
              )}
              {warnCount > 0 && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-medium">
                  {warnCount} предупр.
                </span>
              )}
              <button
                onClick={downloadLogs}
                disabled={isDownloading || logsQuery.isLoading}
                className="px-2 py-1 bg-gray-900 hover:bg-gray-800 text-white rounded text-xs font-medium flex items-center gap-1 disabled:opacity-50"
              >
                {isDownloading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <FileDown className="w-3 h-3" />
                )}
                Скачать
              </button>
            </div>
          </div>

          {/* Logs list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-gray-900 font-mono text-xs">
            {logsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : logsQuery.data?.logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Логов пока нет</div>
            ) : (
              [...(logsQuery.data?.logs || [])].reverse().map((log, i) => (
                <div
                  key={i}
                  className={`p-2 rounded ${
                    log.level === "error"
                      ? "bg-red-900/30 text-red-300"
                      : log.level === "warn"
                        ? "bg-yellow-900/30 text-yellow-300"
                        : "bg-gray-800/50 text-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`px-1 rounded text-[10px] uppercase font-bold shrink-0 ${
                        log.level === "error"
                          ? "bg-red-500 text-white"
                          : log.level === "warn"
                            ? "bg-yellow-500 text-black"
                            : "bg-gray-600 text-gray-200"
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-blue-400 shrink-0">[{log.source}]</span>
                    <span className="break-all">{log.message}</span>
                  </div>
                  {log.details != null && (
                    <pre className="mt-1 text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap break-all">
                      {String(typeof log.details === "string"
                        ? log.details
                        : JSON.stringify(log.details, null, 2))}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
