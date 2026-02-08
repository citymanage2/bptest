import { useState, useMemo, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Zap,
  Menu,
  X,
  UserPlus,
  MessageSquareText,
  Coins,
  Target,
  Users,
  PlayCircle,
  ListOrdered,
  FileText,
  BarChart3,
  ShieldCheck,
  Puzzle,
  LayoutDashboard,
  FileSpreadsheet,
  Calculator,
  BookOpen,
  Workflow,
  Scale,
  Download,
  Building2,
  HardHat,
  Headset,
  Monitor,
  ChevronDown,
  Check,
  Clock,
  Star,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ────────────────────────────────────────────────
// Token Calculator Constants
// ────────────────────────────────────────────────
const TOKEN_ESTIMATES: Record<string, [number, number][]> = {
  bpmn: [[800, 1200], [1500, 2200], [2500, 3800], [4000, 5500], [6000, 8500]],
  regulation: [[600, 1000], [1200, 1800], [2000, 3000], [3200, 4500], [5000, 7000]],
  canvas: [[1000, 1500], [2000, 3000], [3500, 5000], [5500, 7500], [8000, 11000]],
  crm: [[500, 800], [1000, 1500], [1800, 2500], [2800, 4000], [4500, 6000]],
  legal: [[700, 1100], [1400, 2000], [2200, 3200], [3500, 5000], [5500, 7500]],
  full: [[3000, 5000], [6000, 9000], [10000, 15000], [16000, 22000], [25000, 35000]],
};

const ARTIFACT_TYPES = [
  { value: "bpmn", label: "BPMN-диаграмма" },
  { value: "regulation", label: "Регламент процесса" },
  { value: "canvas", label: "Canvas + финмодель" },
  { value: "crm", label: "CRM-воронка" },
  { value: "legal", label: "Юридический пакет" },
  { value: "full", label: "Полный пакет (все артефакты)" },
];

const COMPLEXITY_LABELS = ["Простой", "Базовый", "Средний", "Сложный", "Комплексный"];

// ────────────────────────────────────────────────
// Smooth scroll helper
// ────────────────────────────────────────────────
function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ────────────────────────────────────────────────
// Hero abstract SVG illustration
// ────────────────────────────────────────────────
function HeroIllustration() {
  return (
    <svg viewBox="0 0 480 360" fill="none" className="w-full h-auto max-w-lg" aria-hidden>
      {/* Background blobs */}
      <ellipse cx="240" cy="180" rx="220" ry="160" fill="url(#hero-grad)" opacity="0.08" />
      <ellipse cx="160" cy="140" rx="60" ry="40" fill="#7c3aed" opacity="0.06" />
      <ellipse cx="340" cy="220" rx="50" ry="35" fill="#7c3aed" opacity="0.05" />

      {/* Cards */}
      <rect x="60" y="60" width="120" height="72" rx="12" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
      <rect x="72" y="76" width="50" height="6" rx="3" fill="#7c3aed" opacity="0.6" />
      <rect x="72" y="88" width="80" height="4" rx="2" fill="#d1d5db" />
      <rect x="72" y="98" width="60" height="4" rx="2" fill="#d1d5db" />
      <circle cx="156" cy="76" r="8" fill="#7c3aed" opacity="0.15" />
      <path d="M153 76l2 2 4-4" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="300" y="50" width="130" height="72" rx="12" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
      <rect x="312" y="66" width="45" height="6" rx="3" fill="#7c3aed" opacity="0.6" />
      <rect x="312" y="78" width="90" height="4" rx="2" fill="#d1d5db" />
      <rect x="312" y="88" width="70" height="4" rx="2" fill="#d1d5db" />
      <rect x="312" y="100" width="50" height="4" rx="2" fill="#e5e7eb" />

      <rect x="180" y="170" width="140" height="80" rx="14" fill="white" stroke="#7c3aed" strokeWidth="1.5" opacity="0.95" />
      <rect x="196" y="188" width="60" height="6" rx="3" fill="#7c3aed" opacity="0.7" />
      <rect x="196" y="200" width="100" height="4" rx="2" fill="#d1d5db" />
      <rect x="196" y="210" width="80" height="4" rx="2" fill="#d1d5db" />
      <rect x="196" y="224" width="50" height="16" rx="6" fill="#7c3aed" opacity="0.12" />
      <rect x="204" y="229" width="34" height="6" rx="3" fill="#7c3aed" opacity="0.5" />

      <rect x="50" y="200" width="100" height="60" rx="10" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
      <rect x="62" y="214" width="40" height="5" rx="2.5" fill="#7c3aed" opacity="0.5" />
      <rect x="62" y="224" width="70" height="3" rx="1.5" fill="#e5e7eb" />
      <rect x="62" y="232" width="55" height="3" rx="1.5" fill="#e5e7eb" />
      <circle cx="130" y="214" r="6" fill="#10b981" opacity="0.2" />

      <rect x="360" y="180" width="100" height="60" rx="10" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
      <rect x="372" y="194" width="35" height="5" rx="2.5" fill="#7c3aed" opacity="0.5" />
      <rect x="372" y="204" width="65" height="3" rx="1.5" fill="#e5e7eb" />
      <rect x="372" y="212" width="50" height="3" rx="1.5" fill="#e5e7eb" />

      {/* Connection lines */}
      <path d="M180 96 L300 86" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.3" />
      <path d="M120 132 L220 170" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.3" />
      <path d="M365 122 L300 170" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.3" />
      <path d="M150 230 L180 220" stroke="#7c3aed" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.25" />
      <path d="M320 220 L360 210" stroke="#7c3aed" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.25" />

      {/* Small chart bars */}
      <rect x="86" y="290" width="12" height="30" rx="4" fill="#7c3aed" opacity="0.15" />
      <rect x="104" y="280" width="12" height="40" rx="4" fill="#7c3aed" opacity="0.25" />
      <rect x="122" y="295" width="12" height="25" rx="4" fill="#7c3aed" opacity="0.12" />
      <rect x="140" y="270" width="12" height="50" rx="4" fill="#7c3aed" opacity="0.3" />

      {/* Decorative dots */}
      <circle cx="280" cy="290" r="3" fill="#7c3aed" opacity="0.2" />
      <circle cx="300" cy="300" r="2" fill="#7c3aed" opacity="0.15" />
      <circle cx="320" cy="285" r="2.5" fill="#7c3aed" opacity="0.18" />
      <circle cx="340" cy="295" r="3" fill="#7c3aed" opacity="0.12" />

      <defs>
        <radialGradient id="hero-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

// ────────────────────────────────────────────────
// Main Landing Page
// ────────────────────────────────────────────────
export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [artifactType, setArtifactType] = useState("bpmn");
  const [complexity, setComplexity] = useState(2);

  // Token estimate calculation
  const tokenEstimate = useMemo(() => {
    const estimates = TOKEN_ESTIMATES[artifactType];
    if (!estimates) return [0, 0];
    return estimates[complexity] || estimates[2];
  }, [artifactType, complexity]);

  // Close mobile menu on resize
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setMobileMenuOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const navItems = useMemo(() => [
    { label: "Как работает", id: "how-it-works" },
    { label: "Возможности", id: "capabilities" },
    { label: "Токены", id: "tokens" },
    { label: "Примеры", id: "examples" },
    { label: "FAQ", id: "faq" },
  ], []);

  const handleNavClick = useCallback((id: string) => {
    scrollTo(id);
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">
      {/* ═══════════════════════════════════════ A) HEADER ═══════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl flex items-center justify-center shadow-sm">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight hidden sm:block">BPBuilder</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-purple-700 rounded-lg hover:bg-purple-50 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-purple-700 transition-colors"
            >
              Войти
            </Link>
            <Link
              to="/register?next=/interview"
              className="px-5 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-sm shadow-purple-200 hover:shadow-md hover:shadow-purple-200"
            >
              Начать интервью
            </Link>
          </div>

          {/* Mobile burger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Меню"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 pb-4 pt-2 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-purple-700 rounded-lg hover:bg-purple-50 transition-colors"
              >
                {item.label}
              </button>
            ))}
            <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
              <Link
                to="/login"
                className="px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-purple-700 rounded-lg hover:bg-gray-50 transition-colors text-center"
              >
                Войти
              </Link>
              <Link
                to="/register?next=/interview"
                className="px-3 py-2.5 bg-purple-600 text-white text-sm font-semibold rounded-xl text-center hover:bg-purple-700 transition-colors"
              >
                Начать интервью
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ═══════════════════════════════════════ B) HERO ═══════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50/60 via-white to-purple-50/30 pointer-events-none" />
        <div className="absolute top-20 -right-32 w-[500px] h-[500px] bg-purple-100 rounded-full blur-3xl opacity-30 pointer-events-none" />
        <div className="absolute -bottom-20 -left-32 w-[400px] h-[400px] bg-purple-100 rounded-full blur-3xl opacity-20 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — copy */}
            <div className="space-y-8">
              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.12] tracking-tight text-gray-900">
                Описывайте процессы и получайте регламенты за&nbsp;вечер{" "}
                <span className="text-purple-600">через&nbsp;интервью</span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-500 leading-relaxed max-w-xl">
                Ответьте на&nbsp;вопросы&nbsp;— платформа соберёт BPMN&#8209;диаграмму, бизнес-модель,
                финмодель и документы. Оплата&nbsp;— токенами.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link
                  to="/register?next=/interview"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-purple-600 text-white text-base font-semibold rounded-2xl hover:bg-purple-700 transition-all shadow-lg shadow-purple-200/60 hover:shadow-xl hover:shadow-purple-300/50"
                >
                  Зарегистрироваться и начать
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/examples"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white text-gray-700 text-base font-semibold rounded-2xl border-2 border-gray-200 hover:border-purple-300 hover:text-purple-700 transition-all"
                >
                  Посмотреть пример
                </Link>
              </div>
            </div>

            {/* Right — illustration */}
            <div className="hidden lg:flex justify-center">
              <HeroIllustration />
            </div>
          </div>

          {/* Badges row */}
          <div className="mt-14 flex flex-wrap gap-3 justify-center lg:justify-start">
            {["BPMN 2.0", "Osterwalder Canvas", "PDF / DOCX / XLSX", "Версии и согласование"].map((badge) => (
              <span
                key={badge}
                className="px-4 py-1.5 bg-white/80 backdrop-blur border border-gray-200 text-sm font-medium text-gray-600 rounded-full shadow-sm"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ C) КАК ЭТО РАБОТАЕТ ═══════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-gray-50/70 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Как это работает</h2>
            <p className="mt-4 text-gray-500 text-lg max-w-2xl mx-auto">
              Три шага от описания до готовых артефактов
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {[
              {
                icon: UserPlus,
                step: "01",
                title: "Регистрация",
                time: "1 минута",
                description: "Создайте аккаунт и укажите компанию. Без карты — начинаете сразу.",
              },
              {
                icon: MessageSquareText,
                step: "02",
                title: "Интервью",
                time: "10–25 минут",
                description: "Ответьте на вопросы: роли, триггеры, этапы, документы, исключения. Платформа структурирует всё автоматически.",
              },
              {
                icon: Coins,
                step: "03",
                title: "Токены и генерация",
                time: "Мгновенно",
                description: "Оплатите пакет токенов — получите BPMN, регламент, CRM-воронку, финмодель и юр.документы.",
              },
            ].map((item, i) => (
              <div key={item.step} className="relative">
                {/* Connector line between steps on desktop */}
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 left-[calc(50%+48px)] w-[calc(100%-96px)] h-px bg-gradient-to-r from-purple-300 to-purple-100" />
                )}
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-100 transition-all h-full">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center shrink-0">
                      <item.icon className="w-7 h-7 text-purple-600" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-purple-500 uppercase tracking-wider">Шаг {item.step}</span>
                      <h3 className="text-xl font-bold text-gray-900">{item.title}</h3>
                    </div>
                  </div>
                  <p className="text-gray-500 leading-relaxed mb-4">{item.description}</p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                    <Clock className="w-3.5 h-3.5" />
                    {item.time}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-14">
            <Link
              to="/register?next=/interview"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-purple-600 text-white font-semibold rounded-2xl hover:bg-purple-700 transition-all shadow-sm shadow-purple-200"
            >
              Начать интервью
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ D) ЧТО СПРОСИМ ═══════════════════════════════════════ */}
      <section className="py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Интервью: что мы спросим</h2>
            <p className="mt-4 text-gray-500 text-lg max-w-2xl mx-auto">
              Структурированный опросник покрывает все аспекты процесса
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Target, title: "Название и цель", example: "«Какой результат должен получить клиент?»" },
              { icon: Users, title: "Владелец и роли", example: "«Кто отвечает за процесс? Кто участвует?»" },
              { icon: PlayCircle, title: "Триггер и результат", example: "«Что запускает процесс? Чем он завершается?»" },
              { icon: ListOrdered, title: "Основные этапы", example: "«Перечислите шаги от начала до конца»" },
              { icon: FileText, title: "Документы и артефакты", example: "«Какие документы нужны на каждом шаге?»" },
              { icon: BarChart3, title: "Метрики и SLA", example: "«Какие KPI отслеживаете? Сколько длится этап?»" },
              { icon: ShieldCheck, title: "Согласования и исключения", example: "«Кто утверждает? Что может пойти не так?»" },
              { icon: Puzzle, title: "Интеграции", example: "«Какие системы используете: CRM, почта, ERP?»" },
            ].map((card) => (
              <div
                key={card.title}
                className="group bg-white rounded-2xl border border-gray-100 p-6 hover:border-purple-200 hover:shadow-md transition-all"
              >
                <div className="w-11 h-11 bg-purple-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-100 transition-colors">
                  <card.icon className="w-5.5 h-5.5 text-purple-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{card.title}</h3>
                <p className="text-sm text-gray-400 italic leading-snug">{card.example}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ E) ЧТО ПОЛУЧИТЕ ═══════════════════════════════════════ */}
      <section id="capabilities" className="py-20 sm:py-28 bg-gray-50/70 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Что вы получаете</h2>
            <p className="mt-4 text-gray-500 text-lg max-w-2xl mx-auto">
              Полный набор артефактов из одного интервью
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: LayoutDashboard,
                title: "BPMN-диаграмма",
                description: "Swimlane-схема процесса с ролями, этапами и решениями. Экспорт в PNG и XML.",
                accent: "from-purple-500 to-violet-600",
              },
              {
                icon: Workflow,
                title: "Бизнес-модель Osterwalder",
                description: "9 блоков Canvas: сегменты, ценность, каналы, потоки выручки и ресурсы.",
                accent: "from-blue-500 to-cyan-600",
              },
              {
                icon: Calculator,
                title: "Финмодель driver-based",
                description: "Расчёт от выручки, прибыли или дивидендов. Сценарии и допущения.",
                accent: "from-emerald-500 to-teal-600",
              },
              {
                icon: BookOpen,
                title: "Регламент процесса",
                description: "DOCX-документ с чек-листами по ролям. Готов к утверждению.",
                accent: "from-orange-500 to-amber-600",
              },
              {
                icon: FileSpreadsheet,
                title: "Инструкции (SOP)",
                description: "Короткие пошаговые инструкции для каждого сотрудника.",
                accent: "from-rose-500 to-pink-600",
              },
              {
                icon: Target,
                title: "CRM-воронка",
                description: "Этапы, SLA, ответственные. Готовая структура для внедрения в CRM.",
                accent: "from-indigo-500 to-blue-600",
              },
              {
                icon: Scale,
                title: "Юридические документы",
                description: "Шаблоны договоров, регламентов и приказов на основе процесса.",
                accent: "from-slate-500 to-gray-600",
              },
              {
                icon: Download,
                title: "Экспорт и версии",
                description: "PDF, DOCX, XLSX. История правок, сравнение версий, согласование.",
                accent: "from-purple-500 to-fuchsia-600",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="group bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg hover:border-purple-100 transition-all"
              >
                <div className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br",
                  card.accent
                )}>
                  <card.icon className="w-5.5 h-5.5 text-white" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{card.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ F) ТОКЕНЫ ═══════════════════════════════════════ */}
      <section id="tokens" className="py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Токены</h2>
            <p className="mt-4 text-gray-500 text-lg max-w-2xl mx-auto">
              Внутренняя валюта для генерации артефактов. Покупаете пакет — расходуете на нужные документы.
            </p>
          </div>

          {/* Token Calculator */}
          <div className="max-w-2xl mx-auto mb-16">
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-purple-600" />
                Калькулятор расхода
              </h3>

              {/* Artifact type select */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Тип результата
                </label>
                <div className="relative">
                  <select
                    value={artifactType}
                    onChange={(e) => setArtifactType(e.target.value)}
                    className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-colors"
                  >
                    {ARTIFACT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Complexity slider */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Сложность процесса
                </label>
                <input
                  type="range"
                  min={0}
                  max={4}
                  value={complexity}
                  onChange={(e) => setComplexity(parseInt(e.target.value, 10))}
                  className="w-full h-2 rounded-full bg-gray-200 accent-purple-600 cursor-pointer"
                />
                <div className="flex justify-between mt-2">
                  {COMPLEXITY_LABELS.map((label, i) => (
                    <span
                      key={label}
                      className={cn(
                        "text-xs transition-colors",
                        i === complexity ? "text-purple-700 font-semibold" : "text-gray-400"
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Estimate result */}
              <div className="bg-purple-50 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-sm text-purple-600 font-medium">Оценка расхода токенов</span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-purple-700 mt-1">
                    {tokenEstimate[0].toLocaleString("ru-RU")} – {tokenEstimate[1].toLocaleString("ru-RU")}
                  </div>
                </div>
                <Link
                  to="/billing/tokens"
                  className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-all shadow-sm text-sm whitespace-nowrap"
                >
                  Перейти к оплате
                </Link>
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">
                После интервью система покажет точный расход токенов для вашего процесса
              </p>
            </div>
          </div>

          {/* Token packages */}
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                name: "Старт",
                tokens: "50 000",
                price: "от 990 ₽",
                covers: "1–2 процесса с базовым набором артефактов",
                validity: "Не сгорают 90 дней",
                popular: false,
              },
              {
                name: "Команда",
                tokens: "200 000",
                price: "от 2 990 ₽",
                covers: "5–8 процессов, регламенты, CRM-воронки и финмодели",
                validity: "Не сгорают 180 дней",
                popular: true,
              },
              {
                name: "Компания",
                tokens: "600 000",
                price: "от 6 990 ₽",
                covers: "15–25 процессов, полный пакет артефактов + юр.документы",
                validity: "Не сгорают 365 дней",
                popular: false,
              },
            ].map((pkg) => (
              <div
                key={pkg.name}
                className={cn(
                  "relative bg-white rounded-3xl border-2 p-8 transition-all hover:shadow-lg",
                  pkg.popular
                    ? "border-purple-400 shadow-md shadow-purple-100"
                    : "border-gray-100 hover:border-purple-200"
                )}
              >
                {pkg.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-4 py-1 bg-purple-600 text-white text-xs font-bold rounded-full shadow">
                      <Star className="w-3 h-3" />
                      Популярный
                    </span>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900">{pkg.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-extrabold text-gray-900">{pkg.tokens}</span>
                    <span className="text-sm text-gray-500 ml-1.5">токенов</span>
                  </div>
                  <p className="text-lg font-semibold text-purple-600 mt-1">{pkg.price}</p>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                    {pkg.covers}
                  </li>
                  <li className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                    {pkg.validity}
                  </li>
                  <li className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                    Все типы артефактов
                  </li>
                </ul>
                <Link
                  to="/billing/tokens"
                  className={cn(
                    "block text-center py-3 rounded-xl font-semibold text-sm transition-all",
                    pkg.popular
                      ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm shadow-purple-200"
                      : "bg-gray-100 text-gray-900 hover:bg-purple-50 hover:text-purple-700"
                  )}
                >
                  Купить токены
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ G) ПРИМЕРЫ ═══════════════════════════════════════ */}
      <section id="examples" className="py-20 sm:py-28 bg-gray-50/70 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Примеры процессов</h2>
            <p className="mt-4 text-gray-500 text-lg max-w-2xl mx-auto">
              Посмотрите, что генерирует платформа для разных отраслей
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Building2,
                title: "Закупки",
                description: "Процесс закупки → регламент + CRM-воронка поставщиков",
                slug: "procurement",
              },
              {
                icon: HardHat,
                title: "Строительство",
                description: "Тендер → смета → договор → акты КС-2 / КС-3",
                slug: "construction",
              },
              {
                icon: Headset,
                title: "Сервисная компания",
                description: "Заявки → назначение → SLA → закрытие обращения",
                slug: "service",
              },
              {
                icon: Monitor,
                title: "IT / Офис",
                description: "Онбординг, согласования, заявки на доступы и оборудование",
                slug: "it-office",
              },
            ].map((ex) => (
              <div
                key={ex.slug}
                className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md hover:border-purple-100 transition-all flex flex-col"
              >
                <div className="w-11 h-11 bg-purple-50 rounded-xl flex items-center justify-center mb-4">
                  <ex.icon className="w-5.5 h-5.5 text-purple-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{ex.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed flex-1 mb-4">{ex.description}</p>
                <div className="flex gap-2">
                  <Link
                    to={`/examples/${ex.slug}`}
                    className="text-xs font-semibold text-purple-600 hover:text-purple-800 inline-flex items-center gap-1 transition-colors"
                  >
                    Открыть пример
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              to="/interview/demo"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-purple-700 font-semibold rounded-xl border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50 transition-all text-sm"
            >
              <PlayCircle className="w-4 h-4" />
              Пройти демо-интервью
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ H) FAQ ═══════════════════════════════════════ */}
      <section id="faq" className="py-20 sm:py-28 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Частые вопросы</h2>
          </div>

          <Accordion type="multiple" className="space-y-3">
            {[
              {
                q: "Что такое токены и как они списываются?",
                a: "Токены — внутренняя валюта платформы. Каждая операция генерации (BPMN-диаграмма, регламент, CRM-воронка и т.д.) расходует определённое количество токенов. Точный расход зависит от сложности процесса и типа артефакта. Вы видите расход до генерации и подтверждаете списание.",
              },
              {
                q: "Можно ли начать без оплаты?",
                a: "Да. Регистрация и прохождение интервью полностью бесплатны. Демо-интервью тоже доступно без регистрации. Токены нужны только для генерации артефактов — BPMN, регламентов, финмодели и других документов.",
              },
              {
                q: "Можно ли экспортировать BPMN-диаграмму?",
                a: "Да. Диаграмму можно скачать в PNG (для презентаций), PDF (для печати) и BPMN XML (для импорта в Camunda, Bizagi, ARIS и другие системы). Также доступен экспорт в DOCX с описанием процесса.",
              },
              {
                q: "Как формируется Canvas по Остервальдеру?",
                a: "На основе данных интервью и описания процесса платформа заполняет все 9 блоков Business Model Canvas: сегменты клиентов, ценностные предложения, каналы, взаимоотношения, потоки выручки, ключевые ресурсы, деятельность, партнёры и структура затрат.",
              },
              {
                q: "Финмодель строится от выручки, прибыли или дивидендов?",
                a: "Все три варианта. Платформа генерирует driver-based финмодель, где вы выбираете точку отсчёта: целевая выручка, чистая прибыль или дивиденды акционерам. Модель включает допущения, сценарии (оптимистичный / базовый / пессимистичный) и ключевые метрики.",
              },
              {
                q: "Юридические документы — шаблоны или индивидуальные?",
                a: "Платформа генерирует юр.документы на основе вашего процесса и данных из интервью: договоры, регламенты, приказы, должностные инструкции. Это не универсальные шаблоны, а документы, адаптированные под вашу ситуацию. Рекомендуем проверку юристом перед подписанием.",
              },
              {
                q: "Есть ли интеграция с Bitrix24, amoCRM?",
                a: "Прямых интеграций пока нет, но CRM-воронка генерируется в структурированном формате, который легко перенести в любую CRM: этапы, SLA, ответственные и чек-листы. Интеграции с популярными системами находятся в разработке.",
              },
              {
                q: "Как обеспечивается безопасность данных?",
                a: "Все данные хранятся на защищённых серверах, передача шифруется (HTTPS/TLS). Доступ к процессам имеет только владелец аккаунта. Мы не передаём данные третьим лицам и не используем их для обучения моделей.",
              },
              {
                q: "Поддерживаются ли версии и согласование?",
                a: "Да. Каждое изменение процесса сохраняется как версия. Вы можете сравнивать версии, откатываться к предыдущим и отслеживать историю правок. Система согласований позволяет отправлять артефакты на утверждение коллегам.",
              },
              {
                q: "Какие процессы можно описать?",
                a: "Любые: закупки, продажи, производство, сервис, HR-процессы, документооборот, IT-операции и другие. Платформа адаптируется под специфику вашей отрасли и компании на основе данных интервью.",
              },
            ].map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="bg-white rounded-2xl border border-gray-100 px-6 overflow-hidden data-[state=open]:shadow-sm data-[state=open]:border-purple-100 transition-all"
              >
                <AccordionTrigger className="text-left font-semibold text-gray-900 py-5 text-[0.95rem] hover:no-underline hover:text-purple-700 transition-colors">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-gray-500 leading-relaxed pb-5">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ═══════════════════════════════════════ I) ФИНАЛЬНЫЙ CTA ═══════════════════════════════════════ */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gradient-to-br from-purple-600 via-purple-700 to-violet-800 rounded-[2rem] px-8 sm:px-16 py-16 sm:py-20 text-center overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Начните с интервью — дальше система сделает остальное
              </h2>

              <div className="flex flex-wrap justify-center gap-6 mt-8 mb-10">
                {[
                  { icon: Clock, text: "10–25 минут" },
                  { icon: LayoutDashboard, text: "BPMN + регламенты" },
                  { icon: Coins, text: "Оплата токенами" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-2 text-white/90 text-sm font-medium">
                    <item.icon className="w-4 h-4 text-purple-300" />
                    {item.text}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/register?next=/interview"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-purple-700 font-bold rounded-2xl hover:bg-gray-50 transition-all shadow-lg text-base"
                >
                  Зарегистрироваться
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/billing/tokens"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 text-white font-semibold rounded-2xl border-2 border-white/20 hover:bg-white/20 hover:border-white/40 transition-all text-base backdrop-blur-sm"
                >
                  Купить токены
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ J) FOOTER ═══════════════════════════════════════ */}
      <footer className="border-t border-gray-100 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
            {/* Продукт */}
            <div>
              <h4 className="font-bold text-gray-900 mb-4 text-sm">Продукт</h4>
              <ul className="space-y-2.5">
                <li><button onClick={() => scrollTo("how-it-works")} className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Как работает</button></li>
                <li><button onClick={() => scrollTo("capabilities")} className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Возможности</button></li>
                <li><Link to="/examples" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Примеры</Link></li>
                <li><Link to="/interview/demo" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Демо-интервью</Link></li>
              </ul>
            </div>

            {/* Токены */}
            <div>
              <h4 className="font-bold text-gray-900 mb-4 text-sm">Токены</h4>
              <ul className="space-y-2.5">
                <li><button onClick={() => scrollTo("tokens")} className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Калькулятор</button></li>
                <li><Link to="/billing/tokens" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Купить токены</Link></li>
                <li><button onClick={() => scrollTo("faq")} className="text-sm text-gray-500 hover:text-purple-700 transition-colors">FAQ о токенах</button></li>
              </ul>
            </div>

            {/* Материалы */}
            <div>
              <h4 className="font-bold text-gray-900 mb-4 text-sm">Материалы</h4>
              <ul className="space-y-2.5">
                <li><Link to="/faq" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Помощь и FAQ</Link></li>
                <li><Link to="/support" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Поддержка</Link></li>
                <li><Link to="/privacy-policy" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Политика конфиденциальности</Link></li>
                <li><Link to="/cookie-policy" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Политика cookie</Link></li>
              </ul>
            </div>

            {/* Компания */}
            <div>
              <h4 className="font-bold text-gray-900 mb-4 text-sm">Компания</h4>
              <ul className="space-y-2.5">
                <li><Link to="/register" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Регистрация</Link></li>
                <li><Link to="/login" className="text-sm text-gray-500 hover:text-purple-700 transition-colors">Вход</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-sm text-gray-900">BPBuilder</span>
            </div>
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} BPBuilder. Все права защищены.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
