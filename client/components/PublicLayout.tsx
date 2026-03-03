import { Outlet, Link } from "react-router-dom";
import { Home, HelpCircle } from "lucide-react";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-foreground">BPB</span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/faq"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                База знаний
              </Link>
            </nav>

            {/* Auth buttons */}
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                Войти
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Регистрация
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-border px-4 py-2 flex gap-1">
          <Link
            to="/faq"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            База знаний
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
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
            <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap justify-center">
              <Link to="/faq" className="hover:text-foreground transition-colors">
                База знаний
              </Link>
              <Link to="/privacy-policy" className="hover:text-foreground transition-colors">
                Конфиденциальность
              </Link>
              <Link to="/cookie-policy" className="hover:text-foreground transition-colors">
                Cookie
              </Link>
            </div>
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} BPB. Все права защищены.
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border flex justify-center">
            <a
              href="https://vladykin.pro"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Разработка с профессионалами</span>
              <div className="bg-gray-900 rounded px-1.5 py-0.5 flex items-center justify-center">
                <img src="/vladykin-logo.png" alt="vladykin.pro" className="h-4" />
              </div>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
