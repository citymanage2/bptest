import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Star,
  Clock,
  AlertTriangle,
  Users,
  FileText,
  Search,
  Settings,
  Home,
  Menu,
  X,
  Flame,
} from "lucide-react";

// Данные FAQ
const faqData = [
  { q: "А если у меня небольшая компания, от пяти человек?", a: "Именно на старте правильные процессы дают максимальный эффект. Вы закладываете фундамент, на котором бизнес растёт без хаоса. Чем раньше начнёте — тем сильнее оторвётесь от конкурентов." },
  { q: "У нас уже есть какие-то регламенты и инструкции. Вы всё сломаете и переделаете?", a: "Нет. Мы принципиально не ломаем то, что работает. Загрузите существующие документы — мы возьмём их за основу. На интервью уточним, как процессы устроены на самом деле, и выстроим карту, которая отражает реальность. А дальше вы сами увидите, что стоит улучшить." },
  { q: "Как я увижу, где теряю деньги?", a: "На карте процессов видно каждый этап, каждого ответственного и каждую точку, где происходят задержки, дублирование или потери. Сервис подсвечивает узкие места и показывает, какие изменения дадут максимальный эффект по деньгам и времени." },
  { q: "Чем это отличается от обычных блок-схем, которые можно нарисовать самому?", a: "Мы не просто рисуем схемы. Интервью выявляет реальные рабочие процессы — не идеальные, а те, что есть сейчас. На основе карты сервис формирует регламенты, инструкции и финансовую модель — готовый комплект для управления." },
  { q: "Нужен ли мне для этого консультант или специальные знания?", a: "Нет. Интервью проходит онлайн, вопросы подстраиваются под вашу отрасль. Вам нужно только рассказать, как работает ваш бизнес — своими словами. Но если хотите, мы подключим эксперта." },
  { q: "Как быстро я получу результат?", a: "Первая карта рабочего процесса — через 30 минут после интервью. Регламенты и инструкции — в тот же день. Полный комплект «Под ключ» — от 3 до 7 рабочих дней." },
  { q: "Что значит «первое пополнение удваивается»?", a: "При первом пополнении баланса мы начисляем бонус в размере вашего платежа. Положили 5 000 — на счёте 10 000. Бонусные средства расходуются так же, как обычные — на любые продукты сервиса. Срока действия нет." },
  { q: "Можно ли обновлять процессы после создания?", a: "Да. Бизнес меняется — процессы тоже. Карта процессов — это живой инструмент, а не отчёт для полки. Обновляйте в любое время. Средства на балансе не сгорают." },
];

// Отзывы
const testimonials = [
  { text: "Мы сократили время адаптации нового сотрудника с трёх недель до трёх дней. Наконец-то каждый знает, что ему делать.", name: "Алексей К.", role: "генеральный директор", company: "строительная компания" },
  { text: "Нашли потери на 1,2 миллиона рублей в месяц. Оказалось, два отдела дублировали работу друг друга и никто этого не видел.", name: "Марина В.", role: "операционный директор", company: "торговая компания" },
  { text: "За 49 000 получили то, за что консультант просил 800 000 и четыре месяца. Причём у нас документы живые — обновляем сами.", name: "Дмитрий Н.", role: "собственник", company: "сеть автосервисов" },
];

// Hook для fade-in при скролле
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.1 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, className: `transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}` };
}

export function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const heroFade = useFadeIn();
  const trustFade = useFadeIn();
  const painsFade = useFadeIn();
  const stepsFade = useFadeIn();
  const resultsFade = useFadeIn();
  const pricingFade = useFadeIn();
  const testimonialsFade = useFadeIn();
  const faqFade = useFadeIn();
  const ctaFade = useFadeIn();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ============================================================ */}
      {/* Блок 1. Header */}
      {/* ============================================================ */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a href="#" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-gray-900">biz-process<span className="text-purple-600">.ru</span></span>
            </a>

            <nav className="hidden md:flex items-center gap-1">
              {[
                { id: "how-it-works", label: "Как это работает" },
                { id: "results", label: "Результат" },
                { id: "pricing", label: "Тарифы" },
                { id: "faq", label: "Вопросы" },
              ].map((item) => (
                <button key={item.id} onClick={() => scrollTo(item.id)} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-3">
              <Link to="/login" className="inline-flex items-center justify-center h-9 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
                Войти
              </Link>
              <button onClick={() => scrollTo("pricing")} className="inline-flex items-center justify-center h-9 px-4 py-2 text-sm font-medium border border-gray-300 bg-white rounded-md shadow-sm hover:bg-gray-50 transition-colors">
                Пополнить счёт
              </button>
              <Link to="/register" className="inline-flex items-center justify-center h-9 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-md shadow hover:bg-purple-700 transition-colors">
                Пройти интервью бесплатно
              </Link>
            </div>

            <button className="md:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 px-4 py-4 space-y-2">
            {[
              { id: "how-it-works", label: "Как это работает" },
              { id: "results", label: "Результат" },
              { id: "pricing", label: "Тарифы" },
              { id: "faq", label: "Вопросы" },
            ].map((item) => (
              <button key={item.id} onClick={() => scrollTo(item.id)} className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">
                {item.label}
              </button>
            ))}
            <Link to="/login" className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100">Войти</Link>
            <Link to="/register" className="block w-full px-3 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 text-center">
              Пройти интервью бесплатно
            </Link>
          </div>
        )}
      </header>

      {/* ============================================================ */}
      {/* Блок 2. Hero */}
      {/* ============================================================ */}
      <section className="pt-24 pb-16 sm:pt-32 sm:pb-20 bg-white border-b border-gray-200" ref={heroFade.ref}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${heroFade.className}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Левая часть — текст */}
            <div>
              {/* Надзаголовок */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 border border-purple-200 rounded-full text-xs font-semibold text-purple-700 mb-6">
                ИИ-сервис для описания бизнес-процессов
              </div>

              {/* Главный заголовок */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight mb-6">
                Узнайте, где ваш бизнес теряет деньги — за 1 час
              </h1>

              {/* Подзаголовок */}
              <p className="text-base sm:text-lg text-gray-500 mb-8 max-w-xl">
                Пройдите онлайн-интервью, и ИИ построит визуальную карту процессов вашей компании. Вы увидите узкие места, потери и резервы роста — на одном экране.
              </p>

              {/* Два CTA */}
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 h-12 px-8 bg-purple-600 text-white text-sm font-medium rounded-md shadow hover:bg-purple-700 transition-colors">
                  Пройти интервью бесплатно
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button onClick={() => scrollTo("results")} className="inline-flex items-center justify-center gap-2 h-12 px-6 border border-gray-300 bg-white text-gray-700 text-sm font-medium rounded-md shadow-sm hover:bg-gray-50 transition-colors">
                  Посмотреть пример карты
                </button>
              </div>

              {/* Микродоверие */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-purple-600" />
                  Интервью бесплатно
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-purple-600" />
                  Результат за 30 минут
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-purple-600" />
                  Без установки ПО
                </span>
              </div>
            </div>

            {/* Правая часть — визуал (мокап карты процессов) */}
            <div className="relative">
              <div className="bg-gray-100 rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
                {/* Шапка окна */}
                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="w-3 h-3 rounded-full bg-red-400"></span>
                  <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                  <span className="w-3 h-3 rounded-full bg-green-400"></span>
                  <span className="ml-3 text-xs text-gray-400">Карта процесса: Обработка заявки</span>
                </div>
                {/* Содержимое — схематичная карта */}
                <div className="p-6 min-h-[280px] bg-white">
                  <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
                    <div className="px-4 py-3 bg-green-50 border-2 border-green-400 rounded-lg text-sm font-medium text-green-700">
                      Заявка
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                    <div className="px-4 py-3 bg-amber-50 border-2 border-amber-400 rounded-lg text-sm font-medium text-amber-700 relative">
                      Проверка
                      <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-3 h-3 text-white" />
                      </span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                    <div className="px-4 py-3 bg-blue-50 border-2 border-blue-400 rounded-lg text-sm font-medium text-blue-700">
                      Обработка
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                    <div className="px-4 py-3 bg-purple-50 border-2 border-purple-400 rounded-lg text-sm font-medium text-purple-700">
                      Готово
                    </div>
                  </div>
                  {/* Подсветка узкого места */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-amber-800 mb-1">Узкое место найдено</div>
                        <div className="text-xs text-amber-700">Этап «Проверка» — 4 часа вместо 30 мин. Потенциальная экономия: 120 000 ₽/мес</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Декоративные элементы */}
              <div className="absolute -z-10 -top-4 -right-4 w-72 h-72 bg-purple-100 rounded-full blur-3xl opacity-50"></div>
              <div className="absolute -z-10 -bottom-4 -left-4 w-48 h-48 bg-blue-100 rounded-full blur-3xl opacity-50"></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Блок 3. Цифры доверия */}
      {/* ============================================================ */}
      <section className="py-8 bg-gray-50 border-b border-gray-200" ref={trustFade.ref}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${trustFade.className}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { value: "200+", label: "компаний уже работают с сервисом" },
              { value: "1 час", label: "средний срок готовности карты процессов" },
              { value: "12", label: "отраслей в базе сервиса" },
              { value: "от 5 000 ₽", label: "стоимость одной карты процессов" },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{item.value}</div>
                <div className="text-xs sm:text-sm text-gray-500">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Блок 4. Боли (проблематизация) */}
      {/* ============================================================ */}
      <section className="py-16 sm:py-20 bg-white" ref={painsFade.ref}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${painsFade.className}`}>
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Узнаёте себя?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[
              {
                icon: Clock,
                title: "80% времени — на тушение пожаров",
                text: "Руководитель решает одни и те же проблемы снова и снова. На развитие не остаётся ни времени, ни сил.",
                color: "red",
              },
              {
                icon: AlertTriangle,
                title: "До 30% выручки теряется незаметно",
                text: "Переделки, дублирование работы, простои — потери есть в каждой компании. Просто их никто не считал.",
                color: "amber",
              },
              {
                icon: Users,
                title: "Уйдёт ключевой человек — встанет отдел",
                text: "Бизнес держится на людях, а не на системе. Масштабировать такой бизнес невозможно.",
                color: "orange",
              },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl bg-${card.color}-50 flex items-center justify-center mb-4`}>
                  <card.icon className={`w-6 h-6 text-${card.color}-500`} />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-lg">{card.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{card.text}</p>
              </div>
            ))}
          </div>

          {/* Переходная фраза */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 text-center">
            <p className="text-base text-purple-900">
              Всё это — следствие одного: <strong>в компании не описаны процессы</strong>. Мы это исправим за 1 час.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Блок 5. Как это работает (три шага) */}
      {/* ============================================================ */}
      <section id="how-it-works" className="py-16 sm:py-20 bg-gray-50" ref={stepsFade.ref}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${stepsFade.className}`}>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">Три шага от хаоса к управляемому бизнесу</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
              {
                num: "01",
                title: "Пройдите бесплатное интервью",
                text: "Ответьте на вопросы в удобном онлайн-формате (~15 минут). Загрузите существующие документы — мы берём то, что уже работает, и выстраиваем на этом фундаменте.",
                badge: "Бесплатно · ~15 минут",
                badgeColor: "green",
              },
              {
                num: "02",
                title: "Увидьте свой бизнес целиком",
                text: "На основе интервью и ваших документов сервис строит визуальную карту процессов — такими, какие они есть сейчас. Без приукрашиваний. Вы впервые видите на одном экране: где теряются деньги, где простаивают люди, где скрыты резервы для роста.",
                badge: "~1 час",
                badgeColor: "purple",
              },
              {
                num: "03",
                title: "Управляйте бизнесом по системе",
                text: "На основе карты процессов сервис формирует регламенты, инструкции, бизнес-модель и финансовую модель. Вы сами решаете, что оптимизировать — а сервис показывает, что именно даст максимальный эффект.",
                badge: "от 1 дня",
                badgeColor: "blue",
              },
            ].map((step, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 border-l-4 border-l-purple-600 relative">
                <span className="absolute top-2 right-4 text-5xl font-extrabold text-purple-100 select-none">{step.num}</span>
                <h3 className="font-semibold text-gray-900 mb-3 pr-12 text-lg">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-4">{step.text}</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-${step.badgeColor}-100 text-${step.badgeColor}-700`}>
                  {step.badge}
                </span>
              </div>
            ))}
          </div>

          {/* CTA под блоком */}
          <div className="text-center">
            <Link to="/register" className="inline-flex items-center gap-2 h-11 px-8 bg-purple-600 text-white text-sm font-medium rounded-md shadow hover:bg-purple-700 transition-colors">
              Начать с бесплатного интервью
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Блок 6. Что вы получите (результат) */}
      {/* ============================================================ */}
      <section id="results" className="py-16 sm:py-20 bg-white" ref={resultsFade.ref}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${resultsFade.className}`}>
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Что вы получите на выходе</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Карточки результата */}
            <div className="space-y-6">
              {[
                {
                  icon: Search,
                  title: "Визуальная карта процессов",
                  text: "Полная схема одного рабочего процесса: все этапы, ответственные, точки решений и узкие места. Не отчёт для полки — рабочий инструмент.",
                },
                {
                  icon: AlertTriangle,
                  title: "Список потерь и резервов",
                  text: "Где именно теряются деньги, где простаивают люди, что можно ускорить или автоматизировать — конкретно, по каждому этапу.",
                },
                {
                  icon: FileText,
                  title: "Регламенты и инструкции",
                  text: "Пошаговые документы: кто, что, когда и как делает. Новый сотрудник разберётся за день. Обновляются вместе с бизнесом.",
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Мокап карты процессов */}
            <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-800">
                <span className="w-3 h-3 rounded-full bg-red-400"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                <span className="w-3 h-3 rounded-full bg-green-400"></span>
                <span className="ml-3 text-xs text-gray-500">Пример карты процессов</span>
              </div>
              <div className="p-6 min-h-[300px]">
                <div className="space-y-4">
                  {/* Схема процесса */}
                  <div className="flex items-center gap-3 flex-wrap justify-center">
                    <span className="px-4 py-2 bg-purple-600/30 border border-purple-500 rounded-lg text-sm text-white">Заявка</span>
                    <ArrowRight className="w-4 h-4 text-purple-400" />
                    <span className="px-4 py-2 bg-amber-600/30 border border-amber-500 rounded-lg text-sm text-white">Проверка</span>
                    <ArrowRight className="w-4 h-4 text-purple-400" />
                    <span className="px-4 py-2 bg-blue-600/30 border border-blue-500 rounded-lg text-sm text-white">Обработка</span>
                    <ArrowRight className="w-4 h-4 text-purple-400" />
                    <span className="px-4 py-2 bg-green-600/30 border border-green-500 rounded-lg text-sm text-white">Готово</span>
                  </div>
                  {/* Найденные проблемы */}
                  <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 text-xs text-amber-200">
                    ⚠️ Узкое место: Этап «Проверка» — среднее время 4 часа вместо 30 минут
                  </div>
                  <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 text-xs text-green-200">
                    💰 Потенциальная экономия: 120 000 ₽/мес
                  </div>
                  {/* Регламент */}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">Сгенерированный регламент:</div>
                    <ol className="space-y-1 text-xs text-gray-300 list-decimal list-inside">
                      <li>Менеджер получает заявку в течение 5 мин</li>
                      <li>Проверка комплектности по чек-листу</li>
                      <li>Связь с клиентом для уточнения</li>
                      <li>Передача в отдел исполнения</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Блок 7. Тарифы */}
      {/* ============================================================ */}
      <section id="pricing" className="py-16 sm:py-20 bg-gray-50" ref={pricingFade.ref}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${pricingFade.className}`}>
          {/* Акционная плашка */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-6 mb-10 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Flame className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <div className="font-bold text-amber-900 mb-0.5">Первое пополнение — двойной баланс</div>
                <div className="text-sm text-amber-700">Пополните счёт на любую сумму — мы удвоим её. Вместо 5 000 ₽ на счету окажется 10 000 ₽.</div>
              </div>
            </div>
          </div>

          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">Прозрачные цены — платите только за то, что нужно</h2>
            <p className="text-sm text-gray-500 max-w-xl mx-auto">Начните с карты процессов. Добавляйте документы по мере необходимости. Каждый рубль на счёте — это конкретный результат.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Карта рабочего процесса */}
            <div className="bg-white rounded-xl border-2 border-purple-600 shadow-md p-6 relative">
              <span className="absolute -top-3 left-4 px-2.5 py-0.5 bg-purple-600 text-white text-xs font-semibold rounded-md">Основа</span>
              <h3 className="font-semibold text-gray-900 mt-2 mb-1">Карта рабочего процесса</h3>
              <div className="text-2xl font-bold text-gray-900 mb-3">5 000 ₽</div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">Полная визуальная схема одного рабочего процесса вашей компании.</p>
              <ul className="space-y-2">
                {["Интервью по процессу", "Визуальная карта со всеми этапами", "Список найденных узких мест", "Рекомендации по оптимизации"].map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600"><Check className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
            {/* Регламент */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Регламент или инструкция</h3>
              <div className="text-2xl font-bold text-gray-900 mb-3">от 200 ₽</div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">Пошаговый документ: кто, что, когда и как должен делать.</p>
              <ul className="space-y-2">
                {["Пошаговое описание действий", "Ответственные и сроки", "Шаблоны документов", "Чек-листы для проверки"].map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600"><Check className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
            {/* Бизнес-модель */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Бизнес-модель компании</h3>
              <div className="text-2xl font-bold text-gray-900 mb-3">5 000 ₽</div>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">Как ваша компания создаёт ценность и зарабатывает деньги.</p>
              <ul className="space-y-2">
                {["Ценностное предложение", "Каналы привлечения и продаж", "Структура доходов и расходов", "Ключевые ресурсы и партнёры"].map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600"><Check className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
            {/* Под ключ */}
            <div className="bg-gray-900 rounded-xl shadow-lg p-6 text-white relative">
              <span className="absolute -top-3 left-4 px-2.5 py-0.5 bg-amber-500 text-white text-xs font-semibold rounded-md">Максимальная выгода</span>
              <h3 className="font-semibold mt-2 mb-1">Полный комплект «Под ключ»</h3>
              <div className="text-2xl font-bold mb-3">от 49 000 ₽</div>
              <p className="text-xs text-gray-400 mb-4 leading-relaxed">Все процессы + документы + модели + эксперт + обучение команды.</p>
              <ul className="space-y-2">
                {["Все карты рабочих процессов (до 15)", "Регламенты и инструкции", "Бизнес-модель и финансовая модель", "Персональный эксперт", "Поддержка 3 месяца"].map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-300"><Check className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />{f}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* CTA под тарифами */}
          <div className="text-center">
            <button onClick={() => scrollTo("cta")} className="inline-flex items-center gap-2 h-11 px-8 bg-purple-600 text-white text-sm font-medium rounded-md shadow hover:bg-purple-700 transition-colors">
              Пополнить счёт и получить ×2
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Блок 7.5. Отзывы */}
      {/* ============================================================ */}
      <section className="py-16 sm:py-20 bg-white" ref={testimonialsFade.ref}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${testimonialsFade.className}`}>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">Компании, которые уже навели порядок</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-gray-50 rounded-xl border border-gray-200 p-6 relative">
                <span className="absolute top-3 left-5 text-5xl font-serif text-purple-200 leading-none select-none">"</span>
                <p className="text-sm italic text-gray-700 leading-relaxed mb-6 relative z-10">{t.text}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-sm font-bold text-purple-600">{t.name.charAt(0)}</div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.role}, {t.company}</div>
                    <div className="flex gap-0.5 mt-0.5">{[...Array(5)].map((_, j) => <Star key={j} className="w-3 h-3 fill-amber-400 text-amber-400" />)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Блок 8. FAQ */}
      {/* ============================================================ */}
      <section id="faq" className="py-16 sm:py-20 bg-gray-50" ref={faqFade.ref}>
        <div className={`max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 ${faqFade.className}`}>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-8">Ответы на частые вопросы</h2>

          <div className="space-y-2">
            {faqData.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm">
                  <button onClick={() => setOpenFaq(isOpen ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                    <span className="text-sm font-medium text-gray-900 pr-4">{item.q}</span>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-gray-100">
                      <p className="pt-3 text-sm text-gray-600 leading-relaxed">{item.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Блок 9. Финальный CTA */}
      {/* ============================================================ */}
      <section id="cta" className="py-16 sm:py-20 bg-purple-600" ref={ctaFade.ref}>
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${ctaFade.className}`}>
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Начните прямо сейчас — первый шаг бесплатный</h2>
            <p className="text-sm text-purple-200 max-w-lg mx-auto">Пройдите интервью, и через 1 час вы увидите свой бизнес на одном экране.</p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <Link to="/register" className="inline-flex items-center gap-2 h-12 px-10 bg-white text-purple-600 text-base font-semibold rounded-md shadow-lg hover:bg-gray-100 transition-colors">
              Зарегистрироваться и пройти интервью
              <ArrowRight className="w-5 h-5" />
            </Link>

            {/* Снятие возражений */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-purple-200">
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Без привязки карты
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Без установки ПО
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Интервью занимает ~15-30 минут
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Footer */}
      {/* ============================================================ */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <a href="#" className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-purple-600 rounded-lg flex items-center justify-center">
                  <Home className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-sm text-gray-900">biz-process<span className="text-purple-600">.ru</span></span>
              </a>
              <p className="text-xs text-gray-500 leading-relaxed">
                ИИ-сервис для создания карт рабочих процессов, регламентов, инструкций и бизнес-моделей.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Навигация</h4>
              <ul className="space-y-2">
                {[
                  { label: "Как это работает", id: "how-it-works" },
                  { label: "Результат", id: "results" },
                  { label: "Тарифы", id: "pricing" },
                  { label: "Вопросы", id: "faq" },
                ].map((l, i) => (
                  <li key={i}><button onClick={() => scrollTo(l.id)} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{l.label}</button></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Поддержка</h4>
              <ul className="space-y-2">
                {["Частые вопросы", "Контакты", "Политика конфиденциальности", "Пользовательское соглашение"].map((l, i) => (
                  <li key={i}><a href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Контакты</h4>
              <div className="space-y-2 text-sm text-gray-500">
                <p><a href="mailto:info@biz-process.ru" className="hover:text-gray-900 transition-colors">info@biz-process.ru</a></p>
                <p><a href="tel:+7XXXXXXXXXX" className="hover:text-gray-900 transition-colors">+7 (XXX) XXX-XX-XX</a></p>
                <p><a href="https://t.me/bizprocess" className="hover:text-gray-900 transition-colors">Телеграм: @bizprocess</a></p>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-gray-200 text-center text-sm text-gray-400">
            © 2026 biz-process.ru — Все права защищены
          </div>
        </div>
      </footer>
    </div>
  );
}
