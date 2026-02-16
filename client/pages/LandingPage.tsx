import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

// CSS переменные согласно ТЗ
const cssVars = {
  colorPrimary: "#0F2B46",
  colorAccent: "#00C48C",
  colorAccentHover: "#00A876",
  colorWarm: "#FF6B35",
  colorBg: "#FAFBFC",
  colorBgAlt: "#F0F4F8",
  colorBgDark: "#0F2B46",
  colorText: "#1A2B3C",
  colorTextMuted: "#5A6B7C",
  colorTextLight: "#FFFFFF",
  colorDanger: "#E74C3C",
  colorBorder: "#E2E8F0",
};

// Данные отраслей
const industries = [
  { icon: "🏗️", name: "Строительство и подряд", short: "Управление проектом от сметы до сдачи объекта. Контроль субподрядчиков, закупки, этапы работ.", full: "Прекратите терять деньги на простоях, несогласованности подрядчиков и нехватке материалов. Видите каждый этап — от проектирования до подписания акта." },
  { icon: "⚙️", name: "Производство", short: "Путь от сырья до готового изделия. Планирование, контроль качества, отгрузка.", full: "Найдите, где теряется время между операциями, почему растёт брак и на каком этапе деньги уходят впустую. Сократите производственный цикл." },
  { icon: "🤝", name: "Услуги и сервис", short: "Стандарт качества от первого обращения до повторной продажи. Масштабирование без потери уровня.", full: "Опишите путь клиента так, чтобы любой новый сотрудник давал тот же уровень сервиса, что и лучший менеджер." },
  { icon: "🛒", name: "Торговля и розница", short: "Закупка, хранение, продажа, возврат. Прозрачная цепочка и маржа по каждому товару.", full: "Выстройте процессы так, чтобы точно знать, сколько зарабатываете на каждом товаре, и не терять деньги на складских остатках." },
  { icon: "🚛", name: "Логистика и транспорт", short: "Маршруты, диспетчеризация, погрузка, доставка. Контроль сроков и стоимости перевозки.", full: "Устраните простои, оптимизируйте маршруты, автоматизируйте диспетчеризацию. Видите загрузку транспорта и персонала в реальном времени." },
  { icon: "🍽️", name: "Общественное питание", short: "Кухня, зал, закупки, персонал. От приёмки продуктов до обслуживания гостя.", full: "Контролируйте себестоимость каждого блюда, стандартизируйте обслуживание и откройте второе заведение без страха потерять качество." },
  { icon: "🏥", name: "Медицина и клиники", short: "Запись, приём, лечение, документооборот. Стандарты качества и безопасности.", full: "Выстройте путь пациента так, чтобы ни один этап не потерялся: от первичного обращения до контрольного визита. Сократите ожидание и нагрузку на администраторов." },
  { icon: "🔧", name: "Автосервис и техобслуживание", short: "Приёмка, диагностика, ремонт, выдача. Контроль запчастей и нормо-часов.", full: "Знайте рентабельность каждого заказ-наряда. Стандартизируйте приёмку, чтобы клиент возвращался, а мастера не теряли время на уточнения." },
  { icon: "🧹", name: "Клининг и эксплуатация", short: "Объекты, графики, бригады, контроль качества, приёмка работ.", full: "Управляйте десятками объектов с чёткими регламентами для каждого типа уборки. Контролируйте качество удалённо и сокращайте рекламации." },
  { icon: "📚", name: "Образование и обучение", short: "Набор, программы, расписание, преподаватели, аттестация.", full: "Опишите полный цикл от заявки ученика до выдачи сертификата. Масштабируйте образовательные программы без потери качества." },
  { icon: "📐", name: "Проектные и инженерные организации", short: "Разработка документации, согласования, экспертиза, авторский надзор.", full: "Контролируйте сроки каждого раздела проекта, автоматизируйте передачу между отделами и исключите потерю согласований." },
  { icon: "🏢", name: "Управляющие компании и девелопмент", short: "Обслуживание объектов, работа с жителями, подрядчики, аварийные службы.", full: "Систематизируйте обработку заявок, контроль подрядчиков и плановое обслуживание. Сократите время реакции и количество жалоб." },
];

// Данные FAQ
const faqData = [
  { q: "А если у меня небольшая компания, от пяти человек?", a: "Именно на старте правильные процессы дают максимальный эффект. Вы закладываете фундамент, на котором бизнес растёт без хаоса. Чем раньше начнёте — тем сильнее оторвётесь от конкурентов." },
  { q: "У нас уже есть какие-то регламенты и инструкции. Вы всё сломаете и переделаете?", a: "Нет. Мы принципиально не ломаем то, что работает. Загрузите существующие документы — мы возьмём их за основу. На интервью уточним, как процессы устроены на самом деле, и выстроим карту, которая отражает реальность. А дальше вы сами увидите, что стоит улучшить." },
  { q: "Как я увижу, где теряю деньги?", a: "На карте процессов видно каждый этап, каждого ответственного и каждую точку, где происходят задержки, дублирование или потери. Сервис подсвечивает узкие места и показывает, какие изменения дадут максимальный эффект по деньгам и времени." },
  { q: "Чем это отличается от обычных блок-схем, которые можно нарисовать самому?", a: "Мы не просто рисуем схемы. Интервью выявляет реальные рабочие процессы — не идеальные, а те, что есть сейчас. На основе карты сервис формирует регламенты, инструкции и финансовую модель — готовый комплект для управления." },
  { q: "Нужен ли мне для этого консультант или специальные знания?", a: "Нет. Интервью проходит онлайн, вопросы подстраиваются под вашу отрасль. Вам нужно только рассказать, как работает ваш бизнес — своими словами. Но если хотите, мы подключим эксперта." },
  { q: "Как быстро я получу результат?", a: "Первая карта рабочего процесса — через 1–2 часа после интервью. Регламенты и инструкции — в тот же день. Полный комплект «Под ключ» — от 3 до 7 рабочих дней." },
  { q: "Что значит «первое пополнение удваивается»?", a: "При первом пополнении баланса мы начисляем бонус в размере вашего платежа. Положили 5 000 — на счёте 10 000. Бонусные средства расходуются так же, как обычные — на любые продукты сервиса. Срока действия нет." },
  { q: "Можно ли обновлять процессы после создания?", a: "Да. Бизнес меняется — процессы тоже. Карта процессов — это живой инструмент, а не отчёт для полки. Обновляйте в любое время. Средства на балансе не сгорают." },
  { q: "Для каких отраслей подходит сервис?", a: "Для любого бизнеса с повторяющимися операциями: строительство, производство, услуги, торговля, логистика, общественное питание, медицина, автосервис, клининг, образование, проектные организации, управляющие компании и другие. Интервью адаптируется под специфику вашей отрасли." },
];

// Отзывы
const testimonials = [
  { text: "Мы сократили время адаптации нового сотрудника с трёх недель до трёх дней. Наконец-то каждый знает, что ему делать.", name: "Алексей К.", role: "генеральный директор", company: "строительная компания" },
  { text: "Нашли потери на 1,2 миллиона рублей в месяц. Оказалось, два отдела дублировали работу друг друга и никто этого не видел.", name: "Марина В.", role: "операционный директор", company: "торговая компания" },
  { text: "За 49 000 получили то, за что консультант просил 800 000 и четыре месяца. Причём у нас документы живые — обновляем сами.", name: "Дмитрий Н.", role: "собственник", company: "сеть автосервисов" },
];

// Теги отраслей для Hero
const industryTags = ["Строительство", "Производство", "Услуги", "Торговля", "Логистика", "Общественное питание", "Медицина", "Автосервис", "Клининг", "Образование", "Проектные организации", "Управляющие компании"];

// Hook для анимации чисел
function useCountUp(end: number, duration: number = 2000, startOnView: boolean = true) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnView) {
      setHasStarted(true);
    }
  }, [startOnView]);

  useEffect(() => {
    if (!hasStarted) return;

    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration, hasStarted]);

  useEffect(() => {
    if (!startOnView || !ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) {
          setHasStarted(true);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [startOnView, hasStarted]);

  return { count, ref };
}

// Hook для анимации появления при скролле
function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

export function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [activeIndustry, setActiveIndustry] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [formData, setFormData] = useState({ name: "", contact: "", industry: "", wantExpert: false });

  // Счётчики для блока социального доказательства
  const counter1 = useCountUp(200, 2000);
  const counter2 = useCountUp(2, 1500);
  const counter3 = useCountUp(10, 1800);

  // Анимации секций
  const heroAnim = useScrollAnimation();
  const problemAnim = useScrollAnimation();
  const promiseAnim = useScrollAnimation();
  const howItWorksAnim = useScrollAnimation();
  const pricingAnim = useScrollAnimation();
  const comparisonAnim = useScrollAnimation();
  const industriesAnim = useScrollAnimation();
  const socialProofAnim = useScrollAnimation();
  const demoAnim = useScrollAnimation();
  const offerAnim = useScrollAnimation();
  const faqAnim = useScrollAnimation();
  const ctaAnim = useScrollAnimation();

  // Sticky header
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Smooth scroll
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setIsMobileMenuOpen(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Здесь логика отправки формы
    console.log("Form submitted:", formData);
  };

  return (
    <>
      {/* Глобальные стили */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          font-family: 'Manrope', sans-serif;
          color: ${cssVars.colorText};
          line-height: 1.6;
          background: ${cssVars.colorBg};
        }

        .landing-page {
          overflow-x: hidden;
        }

        /* Анимации появления */
        .fade-in-up {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }

        .fade-in-up.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Кнопки */
        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px 32px;
          background: ${cssVars.colorAccent};
          color: ${cssVars.colorTextLight};
          font-size: 18px;
          font-weight: 700;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          box-shadow: 0 4px 14px rgba(0, 196, 140, 0.3);
        }

        .btn-primary:hover {
          background: ${cssVars.colorAccentHover};
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 196, 140, 0.4);
        }

        .btn-primary-large {
          height: 56px;
          font-size: 18px;
        }

        .btn-ghost {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 24px;
          background: transparent;
          color: ${cssVars.colorPrimary};
          font-size: 16px;
          font-weight: 600;
          border: 2px solid ${cssVars.colorBorder};
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
        }

        .btn-ghost:hover {
          border-color: ${cssVars.colorAccent};
          color: ${cssVars.colorAccent};
        }

        /* Header */
        .header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          padding: 16px 24px;
          transition: all 0.3s ease;
        }

        .header.scrolled {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
        }

        .header-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .logo {
          font-size: 24px;
          font-weight: 700;
          color: ${cssVars.colorPrimary};
          text-decoration: none;
        }

        .logo span {
          color: ${cssVars.colorAccent};
        }

        .nav-desktop {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .nav-link {
          font-size: 16px;
          font-weight: 500;
          color: ${cssVars.colorText};
          text-decoration: none;
          transition: color 0.3s ease;
          cursor: pointer;
        }

        .nav-link:hover {
          color: ${cssVars.colorAccent};
        }

        .header-buttons {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .burger {
          display: none;
          flex-direction: column;
          gap: 5px;
          cursor: pointer;
          padding: 8px;
        }

        .burger span {
          display: block;
          width: 24px;
          height: 2px;
          background: ${cssVars.colorPrimary};
          transition: all 0.3s ease;
        }

        .burger.open span:nth-child(1) {
          transform: rotate(45deg) translate(5px, 5px);
        }

        .burger.open span:nth-child(2) {
          opacity: 0;
        }

        .burger.open span:nth-child(3) {
          transform: rotate(-45deg) translate(5px, -5px);
        }

        /* Mobile menu */
        .mobile-menu {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: ${cssVars.colorTextLight};
          z-index: 999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 24px;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }

        .mobile-menu.open {
          opacity: 1;
          visibility: visible;
        }

        .mobile-menu .nav-link {
          font-size: 24px;
        }

        /* Секции */
        .section {
          padding: 80px 24px;
        }

        .section-alt {
          background: ${cssVars.colorBgAlt};
        }

        .section-dark {
          background: ${cssVars.colorBgDark};
          color: ${cssVars.colorTextLight};
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .section-title {
          font-size: 36px;
          font-weight: 800;
          color: ${cssVars.colorPrimary};
          margin-bottom: 16px;
          line-height: 1.3;
        }

        .section-dark .section-title {
          color: ${cssVars.colorTextLight};
        }

        .section-subtitle {
          font-size: 18px;
          color: ${cssVars.colorTextMuted};
          max-width: 800px;
          line-height: 1.7;
        }

        /* Hero */
        .hero {
          padding-top: 120px;
          min-height: 100vh;
          background: linear-gradient(135deg, ${cssVars.colorBg} 0%, #E8F4FD 100%);
          position: relative;
          overflow: hidden;
        }

        .hero-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(255, 107, 53, 0.15);
          color: ${cssVars.colorWarm};
          font-size: 14px;
          font-weight: 600;
          border-radius: 20px;
          margin-bottom: 24px;
        }

        .hero h1 {
          font-size: 48px;
          font-weight: 800;
          color: ${cssVars.colorPrimary};
          line-height: 1.2;
          margin-bottom: 24px;
        }

        .hero-subtitle {
          font-size: 20px;
          color: ${cssVars.colorTextMuted};
          line-height: 1.7;
          margin-bottom: 32px;
        }

        /* Industry tags */
        .industry-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 32px;
          max-width: 100%;
          overflow-x: auto;
          padding-bottom: 8px;
        }

        .industry-tag {
          padding: 8px 16px;
          background: ${cssVars.colorBgAlt};
          color: ${cssVars.colorTextMuted};
          font-size: 14px;
          border-radius: 20px;
          white-space: nowrap;
        }

        /* Promo block */
        .promo-block {
          background: linear-gradient(135deg, rgba(255, 107, 53, 0.1) 0%, rgba(255, 193, 7, 0.1) 100%);
          border-left: 4px solid ${cssVars.colorWarm};
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 32px;
          position: relative;
        }

        .promo-x2 {
          position: absolute;
          right: 24px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 64px;
          font-weight: 800;
          color: ${cssVars.colorWarm};
          opacity: 0.2;
        }

        .promo-block p {
          font-size: 18px;
          color: ${cssVars.colorText};
          position: relative;
          z-index: 1;
        }

        .hero-cta-note {
          font-size: 14px;
          color: ${cssVars.colorTextMuted};
          margin-top: 12px;
        }

        /* Hero visual */
        .hero-visual {
          position: relative;
        }

        .hero-visual svg {
          width: 100%;
          height: auto;
        }

        /* Trust bar */
        .trust-bar {
          background: ${cssVars.colorTextLight};
          border-top: 1px solid ${cssVars.colorBorder};
          padding: 16px 24px;
        }

        .trust-bar-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: center;
          gap: 40px;
          flex-wrap: wrap;
        }

        .trust-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: ${cssVars.colorTextMuted};
        }

        .trust-item svg {
          color: ${cssVars.colorAccent};
        }

        /* Problem cards */
        .problem-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          margin: 48px 0;
        }

        .problem-card {
          background: ${cssVars.colorTextLight};
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }

        .problem-card-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .problem-card h3 {
          font-size: 20px;
          font-weight: 700;
          color: ${cssVars.colorDanger};
          margin-bottom: 12px;
        }

        .problem-card p {
          font-size: 16px;
          color: ${cssVars.colorTextMuted};
          line-height: 1.6;
        }

        /* Amplifier block */
        .amplifier {
          background: ${cssVars.colorPrimary};
          color: ${cssVars.colorTextLight};
          padding: 40px 60px;
          border-radius: 16px;
          text-align: center;
          font-size: 24px;
          line-height: 1.6;
        }

        /* Promise section */
        .promise-grid {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 60px;
          align-items: start;
        }

        .promise-icon {
          width: 200px;
          height: 200px;
          background: ${cssVars.colorBgAlt};
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 80px;
        }

        .promise-text {
          font-size: 20px;
          color: ${cssVars.colorText};
          line-height: 1.7;
          margin: 24px 0 32px;
        }

        .promise-features {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          margin-bottom: 32px;
        }

        .promise-feature {
          display: flex;
          gap: 12px;
        }

        .promise-feature-icon {
          font-size: 24px;
          flex-shrink: 0;
        }

        .promise-feature p {
          font-size: 16px;
          color: ${cssVars.colorText};
        }

        .promise-result {
          font-size: 18px;
          font-style: italic;
          color: ${cssVars.colorPrimary};
        }

        /* Steps */
        .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 40px;
          position: relative;
        }

        .steps::before {
          content: '';
          position: absolute;
          top: 40px;
          left: 15%;
          right: 15%;
          height: 2px;
          background: repeating-linear-gradient(
            to right,
            ${cssVars.colorAccent} 0px,
            ${cssVars.colorAccent} 8px,
            transparent 8px,
            transparent 16px
          );
        }

        .step {
          background: ${cssVars.colorTextLight};
          border-radius: 16px;
          padding: 32px;
          border-left: 4px solid ${cssVars.colorAccent};
          position: relative;
        }

        .step-number {
          font-size: 64px;
          font-weight: 800;
          color: ${cssVars.colorAccent};
          opacity: 0.3;
          position: absolute;
          top: -10px;
          right: 24px;
        }

        .step h3 {
          font-size: 20px;
          font-weight: 700;
          color: ${cssVars.colorPrimary};
          margin-bottom: 16px;
        }

        .step p {
          font-size: 16px;
          color: ${cssVars.colorTextMuted};
          line-height: 1.6;
          margin-bottom: 16px;
        }

        .step-time {
          font-size: 14px;
          font-weight: 600;
          color: ${cssVars.colorAccent};
        }

        /* Pricing cards */
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          margin-top: 48px;
        }

        .pricing-card {
          background: ${cssVars.colorTextLight};
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
          position: relative;
        }

        .pricing-card.featured {
          border: 2px solid ${cssVars.colorAccent};
        }

        .pricing-card.dark {
          background: ${cssVars.colorPrimary};
          color: ${cssVars.colorTextLight};
        }

        .pricing-badge {
          position: absolute;
          top: -12px;
          left: 24px;
          padding: 6px 12px;
          background: ${cssVars.colorAccent};
          color: ${cssVars.colorTextLight};
          font-size: 12px;
          font-weight: 700;
          border-radius: 6px;
        }

        .pricing-card.dark .pricing-badge {
          background: ${cssVars.colorWarm};
        }

        .pricing-card h3 {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .pricing-price {
          font-size: 32px;
          font-weight: 800;
          color: ${cssVars.colorPrimary};
          margin-bottom: 16px;
        }

        .pricing-card.dark .pricing-price {
          color: ${cssVars.colorTextLight};
        }

        .pricing-card p {
          font-size: 14px;
          color: ${cssVars.colorTextMuted};
          margin-bottom: 16px;
          line-height: 1.6;
        }

        .pricing-card.dark p {
          color: rgba(255, 255, 255, 0.7);
        }

        .pricing-features {
          list-style: none;
        }

        .pricing-features li {
          font-size: 14px;
          padding: 8px 0;
          border-top: 1px solid ${cssVars.colorBorder};
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .pricing-card.dark .pricing-features li {
          border-color: rgba(255, 255, 255, 0.1);
        }

        .pricing-features li::before {
          content: '—';
          color: ${cssVars.colorAccent};
          font-weight: 700;
        }

        /* Promo repeat */
        .promo-repeat {
          background: linear-gradient(135deg, rgba(255, 107, 53, 0.1) 0%, transparent 100%);
          border: 2px solid ${cssVars.colorWarm};
          border-radius: 16px;
          padding: 32px;
          margin-top: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .promo-repeat-text {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .promo-repeat-x2 {
          font-size: 48px;
          font-weight: 800;
          color: ${cssVars.colorWarm};
          opacity: 0.5;
        }

        .promo-repeat p {
          font-size: 18px;
          color: ${cssVars.colorText};
        }

        /* Comparison table */
        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 48px;
          background: ${cssVars.colorTextLight};
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }

        .comparison-table th,
        .comparison-table td {
          padding: 20px 24px;
          text-align: left;
          font-size: 16px;
        }

        .comparison-table th {
          background: ${cssVars.colorBgAlt};
          font-weight: 700;
          color: ${cssVars.colorPrimary};
        }

        .comparison-table tr:nth-child(even) {
          background: ${cssVars.colorBgAlt};
        }

        .comparison-table td:first-child {
          font-weight: 500;
          color: ${cssVars.colorText};
        }

        .comparison-table td:nth-child(2) {
          color: ${cssVars.colorTextMuted};
        }

        .comparison-table td:nth-child(3) {
          color: ${cssVars.colorAccent};
          font-weight: 600;
          background: rgba(0, 196, 140, 0.05);
        }

        /* Industries grid */
        .industries-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-top: 48px;
        }

        .industry-card {
          background: ${cssVars.colorTextLight};
          border-radius: 12px;
          padding: 24px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        }

        .industry-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }

        .industry-card.expanded {
          grid-column: span 2;
        }

        .industry-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .industry-card-icon {
          font-size: 32px;
        }

        .industry-card h4 {
          font-size: 16px;
          font-weight: 700;
          color: ${cssVars.colorPrimary};
        }

        .industry-card-short {
          font-size: 14px;
          color: ${cssVars.colorTextMuted};
          margin-top: 12px;
          line-height: 1.5;
        }

        .industry-card-full {
          font-size: 14px;
          color: ${cssVars.colorText};
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid ${cssVars.colorBorder};
          line-height: 1.6;
        }

        .industries-note {
          text-align: center;
          margin-top: 32px;
          font-size: 16px;
          color: ${cssVars.colorTextMuted};
        }

        /* Stats */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 40px;
          margin-bottom: 60px;
        }

        .stat-item {
          text-align: center;
        }

        .stat-number {
          font-size: 56px;
          font-weight: 800;
          color: ${cssVars.colorPrimary};
        }

        .stat-suffix {
          font-size: 32px;
        }

        .stat-label {
          font-size: 16px;
          color: ${cssVars.colorTextMuted};
          margin-top: 8px;
        }

        /* Testimonials */
        .testimonials-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .testimonial-card {
          background: ${cssVars.colorBgAlt};
          border-radius: 16px;
          padding: 32px;
          position: relative;
        }

        .testimonial-quote {
          position: absolute;
          top: 16px;
          left: 24px;
          font-size: 64px;
          color: ${cssVars.colorAccent};
          opacity: 0.2;
          font-family: Georgia, serif;
          line-height: 1;
        }

        .testimonial-text {
          font-size: 16px;
          font-style: italic;
          color: ${cssVars.colorText};
          line-height: 1.7;
          margin-bottom: 24px;
          position: relative;
          z-index: 1;
        }

        .testimonial-author {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .testimonial-avatar {
          width: 48px;
          height: 48px;
          background: ${cssVars.colorPrimary};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${cssVars.colorTextLight};
          font-weight: 700;
        }

        .testimonial-name {
          font-size: 14px;
          font-weight: 700;
          color: ${cssVars.colorPrimary};
        }

        .testimonial-role {
          font-size: 12px;
          color: ${cssVars.colorTextMuted};
        }

        .testimonial-stars {
          color: ${cssVars.colorWarm};
          margin-top: 4px;
        }

        /* Demo section */
        .demo-container {
          max-width: 900px;
          margin: 0 auto;
        }

        .demo-browser {
          background: #1a1a1a;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .demo-browser-header {
          background: #2d2d2d;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .demo-browser-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .demo-browser-dot.red { background: #ff5f56; }
        .demo-browser-dot.yellow { background: #ffbd2e; }
        .demo-browser-dot.green { background: #27ca40; }

        .demo-browser-content {
          padding: 24px;
          min-height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .demo-tabs {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-top: 24px;
        }

        .demo-tab {
          padding: 12px 24px;
          background: rgba(255, 255, 255, 0.1);
          color: ${cssVars.colorTextLight};
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .demo-tab.active {
          background: ${cssVars.colorAccent};
        }

        .demo-cta {
          text-align: center;
          margin-top: 40px;
        }

        /* Offer section */
        .offer-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .offer-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .offer-card {
          background: ${cssVars.colorTextLight};
          border-radius: 16px;
          padding: 32px;
          text-align: center;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }

        .offer-card-amount {
          font-size: 24px;
          font-weight: 700;
          color: ${cssVars.colorText};
          margin-bottom: 8px;
        }

        .offer-card-result {
          font-size: 32px;
          font-weight: 800;
          color: ${cssVars.colorAccent};
          margin-bottom: 16px;
        }

        .offer-card-desc {
          font-size: 14px;
          color: ${cssVars.colorTextMuted};
        }

        .offer-cta {
          text-align: center;
          margin-top: 48px;
        }

        .offer-note {
          font-size: 14px;
          color: ${cssVars.colorTextMuted};
          margin-top: 16px;
        }

        /* FAQ */
        .faq-list {
          max-width: 800px;
          margin: 48px auto 0;
        }

        .faq-item {
          border-bottom: 1px solid ${cssVars.colorBorder};
        }

        .faq-question {
          width: 100%;
          padding: 24px 0;
          background: none;
          border: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 18px;
          font-weight: 600;
          color: ${cssVars.colorPrimary};
          cursor: pointer;
          text-align: left;
        }

        .faq-icon {
          font-size: 24px;
          font-weight: 300;
          transition: transform 0.3s ease;
        }

        .faq-item.open .faq-icon {
          transform: rotate(45deg);
        }

        .faq-answer {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease;
        }

        .faq-item.open .faq-answer {
          max-height: 500px;
        }

        .faq-answer p {
          padding-bottom: 24px;
          font-size: 16px;
          color: ${cssVars.colorTextMuted};
          line-height: 1.7;
        }

        /* CTA Form */
        .cta-form-container {
          background: ${cssVars.colorTextLight};
          border-radius: 16px;
          padding: 48px;
          max-width: 500px;
          margin: 48px auto 0;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }

        .cta-form-group {
          margin-bottom: 20px;
        }

        .cta-form-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: ${cssVars.colorText};
          margin-bottom: 8px;
        }

        .cta-form-input,
        .cta-form-select {
          width: 100%;
          padding: 14px 16px;
          font-size: 16px;
          border: 2px solid ${cssVars.colorBorder};
          border-radius: 8px;
          transition: border-color 0.3s ease;
          font-family: inherit;
        }

        .cta-form-input:focus,
        .cta-form-select:focus {
          outline: none;
          border-color: ${cssVars.colorAccent};
        }

        .cta-form-checkbox {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }

        .cta-form-checkbox input {
          width: 20px;
          height: 20px;
          accent-color: ${cssVars.colorAccent};
        }

        .cta-form-checkbox span {
          font-size: 14px;
          color: ${cssVars.colorText};
        }

        .cta-form-submit {
          width: 100%;
          margin-top: 24px;
        }

        .cta-form-note {
          font-size: 12px;
          color: ${cssVars.colorTextMuted};
          text-align: center;
          margin-top: 16px;
        }

        /* Footer */
        .footer {
          background: #0A1F33;
          padding: 60px 24px 24px;
          color: ${cssVars.colorTextLight};
        }

        .footer-grid {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr;
          gap: 40px;
        }

        .footer-about p {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          margin-top: 16px;
          line-height: 1.6;
        }

        .footer-title {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 20px;
        }

        .footer-links {
          list-style: none;
        }

        .footer-links li {
          margin-bottom: 12px;
        }

        .footer-links a {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          text-decoration: none;
          transition: color 0.3s ease;
        }

        .footer-links a:hover {
          color: ${cssVars.colorAccent};
        }

        .footer-contact p {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 8px;
        }

        .footer-contact a {
          color: rgba(255, 255, 255, 0.6);
          text-decoration: none;
        }

        .footer-contact a:hover {
          color: ${cssVars.colorAccent};
        }

        .footer-bottom {
          max-width: 1200px;
          margin: 40px auto 0;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          text-align: center;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.4);
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .hero-grid {
            grid-template-columns: 1fr;
          }

          .hero-visual {
            display: none;
          }

          .problem-cards {
            grid-template-columns: 1fr;
          }

          .promise-grid {
            grid-template-columns: 1fr;
          }

          .promise-icon {
            width: 120px;
            height: 120px;
            font-size: 48px;
            margin: 0 auto;
          }

          .promise-features {
            grid-template-columns: 1fr;
          }

          .steps {
            grid-template-columns: 1fr;
          }

          .steps::before {
            display: none;
          }

          .pricing-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .industries-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .testimonials-grid {
            grid-template-columns: 1fr;
          }

          .offer-grid {
            grid-template-columns: 1fr;
          }

          .footer-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .nav-desktop {
            display: none;
          }

          .header-buttons .btn-ghost,
          .header-buttons .btn-primary {
            display: none;
          }

          .burger {
            display: flex;
          }

          .hero h1 {
            font-size: 32px;
          }

          .hero-subtitle {
            font-size: 16px;
          }

          .section {
            padding: 60px 16px;
          }

          .section-title {
            font-size: 26px;
          }

          .amplifier {
            padding: 24px;
            font-size: 18px;
          }

          .pricing-grid {
            grid-template-columns: 1fr;
          }

          .comparison-table {
            display: block;
            overflow-x: auto;
          }

          .industries-grid {
            grid-template-columns: 1fr;
          }

          .industry-card.expanded {
            grid-column: span 1;
          }

          .stats-grid {
            grid-template-columns: 1fr;
            gap: 24px;
          }

          .stat-number {
            font-size: 40px;
          }

          .footer-grid {
            grid-template-columns: 1fr;
          }

          .promo-repeat {
            flex-direction: column;
            text-align: center;
          }

          .cta-form-container {
            padding: 24px;
            margin: 24px 16px 0;
          }
        }
      `}</style>

      <div className="landing-page">
        {/* Блок 1: Header */}
        <header className={`header ${isScrolled ? "scrolled" : ""}`}>
          <div className="header-inner">
            <a href="#" className="logo">
              biz-process<span>.ru</span>
            </a>

            <nav className="nav-desktop">
              <span className="nav-link" onClick={() => scrollToSection("features")}>Возможности</span>
              <span className="nav-link" onClick={() => scrollToSection("how-it-works")}>Как это работает</span>
              <span className="nav-link" onClick={() => scrollToSection("pricing")}>Тарифы</span>
              <span className="nav-link" onClick={() => scrollToSection("testimonials")}>Отзывы</span>
            </nav>

            <div className="header-buttons">
              <Link to="/login" className="btn-ghost">Войти</Link>
              <button className="btn-primary" onClick={() => scrollToSection("cta")}>Пополнить счёт</button>
            </div>

            <div className={`burger ${isMobileMenuOpen ? "open" : ""}`} onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </header>

        {/* Mobile menu */}
        <div className={`mobile-menu ${isMobileMenuOpen ? "open" : ""}`}>
          <span className="nav-link" onClick={() => scrollToSection("features")}>Возможности</span>
          <span className="nav-link" onClick={() => scrollToSection("how-it-works")}>Как это работает</span>
          <span className="nav-link" onClick={() => scrollToSection("pricing")}>Тарифы</span>
          <span className="nav-link" onClick={() => scrollToSection("testimonials")}>Отзывы</span>
          <Link to="/login" className="btn-ghost">Войти</Link>
          <button className="btn-primary" onClick={() => scrollToSection("cta")}>Пополнить счёт</button>
        </div>

        {/* Блок 2: Hero */}
        <section className="hero" ref={heroAnim.ref}>
          <div className={`container fade-in-up ${heroAnim.isVisible ? "visible" : ""}`}>
            <div className="hero-grid">
              <div>
                <div className="hero-badge">
                  🔥 Первое пополнение — двойной баланс
                </div>

                <h1>У 9 из 10 компаний нет выстроенных рабочих процессов. Это ваш шанс — оторвитесь от конкурентов</h1>

                <p className="hero-subtitle">
                  Компания без описанных процессов не растёт — она выживает. Выстроенные процессы — это фундамент, на котором бизнес масштабируется, нанимает людей и увеличивает прибыль. Мы поможем этот фундамент построить.
                </p>

                <div className="industry-tags">
                  {industryTags.map((tag, i) => (
                    <span key={i} className="industry-tag">{tag}</span>
                  ))}
                </div>

                <div className="promo-block">
                  <span className="promo-x2">×2</span>
                  <p>
                    Пополните счёт на любую сумму — и мы удвоим её. Вместо 5 000 ₽ на счету окажется 10 000 ₽. Этого хватит на две полных карты рабочих процессов.
                  </p>
                </div>

                <button className="btn-primary btn-primary-large" onClick={() => scrollToSection("cta")}>
                  Пополнить счёт и получить ×2
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </button>

                <p className="hero-cta-note">
                  Минимальное пополнение — 1 000 ₽. Баланс удваивается автоматически.
                </p>
              </div>

              <div className="hero-visual">
                <svg viewBox="0 0 400 400" fill="none">
                  <rect x="50" y="50" width="100" height="60" rx="8" fill={cssVars.colorAccent} opacity="0.2" stroke={cssVars.colorAccent} strokeWidth="2"/>
                  <text x="100" y="85" textAnchor="middle" fill={cssVars.colorPrimary} fontSize="12" fontWeight="600">Старт</text>

                  <path d="M100 110 L100 140" stroke={cssVars.colorAccent} strokeWidth="2" strokeDasharray="4"/>

                  <polygon points="200,140 250,180 200,220 150,180" fill={cssVars.colorWarm} opacity="0.2" stroke={cssVars.colorWarm} strokeWidth="2"/>
                  <text x="200" y="185" textAnchor="middle" fill={cssVars.colorPrimary} fontSize="11" fontWeight="600">Решение</text>

                  <path d="M150 180 L80 180 L80 250" stroke={cssVars.colorAccent} strokeWidth="2" strokeDasharray="4"/>
                  <path d="M250 180 L320 180 L320 250" stroke={cssVars.colorAccent} strokeWidth="2" strokeDasharray="4"/>

                  <rect x="30" y="250" width="100" height="50" rx="8" fill={cssVars.colorBgAlt} stroke={cssVars.colorPrimary} strokeWidth="2"/>
                  <text x="80" y="280" textAnchor="middle" fill={cssVars.colorPrimary} fontSize="11" fontWeight="600">Процесс А</text>

                  <rect x="270" y="250" width="100" height="50" rx="8" fill={cssVars.colorBgAlt} stroke={cssVars.colorPrimary} strokeWidth="2"/>
                  <text x="320" y="280" textAnchor="middle" fill={cssVars.colorPrimary} fontSize="11" fontWeight="600">Процесс Б</text>

                  <path d="M80 300 L80 330 L200 330" stroke={cssVars.colorAccent} strokeWidth="2" strokeDasharray="4"/>
                  <path d="M320 300 L320 330 L200 330" stroke={cssVars.colorAccent} strokeWidth="2" strokeDasharray="4"/>

                  <circle cx="200" cy="360" r="25" fill={cssVars.colorAccent} opacity="0.2" stroke={cssVars.colorAccent} strokeWidth="2"/>
                  <text x="200" y="365" textAnchor="middle" fill={cssVars.colorPrimary} fontSize="11" fontWeight="600">Конец</text>
                </svg>
              </div>
            </div>
          </div>
        </section>

        {/* Trust bar */}
        <div className="trust-bar">
          <div className="trust-bar-inner">
            <div className="trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              Уже помогли 200+ компаниям
            </div>
            <div className="trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              Средняя карта процесса — за 2 часа
            </div>
            <div className="trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              12 отраслей
            </div>
            <div className="trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              Без ломки того, что уже работает
            </div>
          </div>
        </div>

        {/* Блок 3: Проблема */}
        <section id="features" className="section section-alt" ref={problemAnim.ref}>
          <div className={`container fade-in-up ${problemAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Без выстроенных процессов бизнес не растёт — он буксует
            </h2>
            <p className="section-subtitle" style={{ textAlign: "center", margin: "0 auto" }}>
              9 из 10 компаний работают без описанных рабочих процессов. Каждый сотрудник действует по-своему, задачи теряются, сроки срываются. Руководитель тратит 80% времени на тушение пожаров вместо развития. Те, кто выстраивают процессы первыми — забирают рынок.
            </p>

            <div className="problem-cards">
              <div className="problem-card">
                <div className="problem-card-icon">💸</div>
                <h3>Прибыль утекает незаметно</h3>
                <p>Переделки, дублирование работы, простои — до 30% выручки теряется на процессах, которые никто не видит и не контролирует.</p>
              </div>
              <div className="problem-card">
                <div className="problem-card-icon">⏰</div>
                <h3>Рост упирается в потолок</h3>
                <p>Невозможно масштабировать то, что не описано. Без процессов каждый новый сотрудник, филиал или направление — это новый хаос.</p>
              </div>
              <div className="problem-card">
                <div className="problem-card-icon">🔓</div>
                <h3>Бизнес зависит от людей, а не от системы</h3>
                <p>Уйдёт ключевой человек — встанет целый отдел. Выстроенные процессы делают бизнес устойчивым и независимым от конкретных людей.</p>
              </div>
            </div>

            <div className="amplifier">
              Компании с описанными процессами растут в 2–3 раза быстрее конкурентов. Они нанимают людей без страха, открывают филиалы без потери качества и точно знают, где теряют деньги, а где — резервы для роста.
            </div>
          </div>
        </section>

        {/* Блок 3.5: Обещание */}
        <section className="section" ref={promiseAnim.ref}>
          <div className={`container fade-in-up ${promiseAnim.isVisible ? "visible" : ""}`}>
            <div className="promise-grid">
              <div className="promise-icon">🛡️</div>
              <div>
                <h2 className="section-title">Мы не ломаем то, что у вас уже работает</h2>
                <p className="promise-text">
                  Мы не приходим с шаблонами и не заставляем вас перестраивать бизнес. На основе интервью с вами и ваших реальных документов мы описываем процессы так, как они работают сейчас. Без приукрашиваний. Потом выстраиваем их правильно — с чёткой логикой, ответственными и точками контроля.
                </p>
                <p style={{ fontWeight: 600, marginBottom: 24, color: cssVars.colorPrimary }}>
                  Вы сами увидите на карте процессов:
                </p>
                <div className="promise-features">
                  <div className="promise-feature">
                    <span className="promise-feature-icon">📍</span>
                    <p>Где именно теряются деньги — на каком этапе, в каком отделе, из-за какого действия</p>
                  </div>
                  <div className="promise-feature">
                    <span className="promise-feature-icon">📈</span>
                    <p>Где скрыты резервы для роста — какие процессы можно ускорить, упростить или автоматизировать</p>
                  </div>
                  <div className="promise-feature">
                    <span className="promise-feature-icon">🔄</span>
                    <p>Что можно оптимизировать дальше — карта процессов обновляется вместе с бизнесом, а не пылится в папке</p>
                  </div>
                </div>
                <p className="promise-result">
                  Результат — не отчёт для полки. Это рабочий инструмент, по которому живёт компания.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Блок 4: Как это работает */}
        <section id="how-it-works" className="section section-alt" ref={howItWorksAnim.ref}>
          <div className={`container fade-in-up ${howItWorksAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Три шага от хаоса к управляемому бизнесу
            </h2>

            <div className="steps" style={{ marginTop: 48 }}>
              <div className="step">
                <span className="step-number">01</span>
                <h3>Расскажите, как работает ваш бизнес</h3>
                <p>Ответьте на вопросы в удобном онлайн-формате. Загрузите существующие документы, регламенты, должностные инструкции — всё, что уже есть. Мы не начинаем с чистого листа. Мы берём то, что работает, и выстраиваем на этом фундаменте.</p>
                <span className="step-time">~40 минут</span>
              </div>
              <div className="step">
                <span className="step-number">02</span>
                <h3>Увидьте свой бизнес целиком</h3>
                <p>На основе интервью и ваших документов сервис строит визуальную карту процессов — такими, какие они есть сейчас. Без приукрашиваний. Вы впервые видите на одном экране: где теряются деньги, где простаивают люди, где скрыты резервы для роста.</p>
                <span className="step-time">~2 часа</span>
              </div>
              <div className="step">
                <span className="step-number">03</span>
                <h3>Получите инструменты для управления</h3>
                <p>На основе карты процессов сервис формирует регламенты, инструкции, бизнес-модель и финансовую модель. Вы сами решаете, что оптимизировать — а сервис показывает, что именно даст максимальный эффект. Процессы обновляются вместе с бизнесом.</p>
                <span className="step-time">от 1 дня</span>
              </div>
            </div>
          </div>
        </section>

        {/* Блок 5: Продукт и цены */}
        <section id="pricing" className="section" ref={pricingAnim.ref}>
          <div className={`container fade-in-up ${pricingAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Прозрачные цены — платите только за то, что нужно
            </h2>
            <p className="section-subtitle" style={{ textAlign: "center", margin: "0 auto" }}>
              Начните с карты процессов. Добавляйте документы по мере необходимости. Каждый рубль на счёте — это конкретный результат.
            </p>

            <div className="pricing-grid">
              <div className="pricing-card featured">
                <span className="pricing-badge">Основа</span>
                <h3>Карта рабочего процесса</h3>
                <div className="pricing-price">5 000 ₽</div>
                <p>Полная визуальная схема одного рабочего процесса вашей компании. Видны все этапы, ответственные, точки принятия решений и узкие места.</p>
                <ul className="pricing-features">
                  <li>Интервью по процессу</li>
                  <li>Визуальная карта со всеми этапами</li>
                  <li>Список найденных узких мест</li>
                  <li>Рекомендации по оптимизации</li>
                </ul>
              </div>

              <div className="pricing-card">
                <h3>Регламент или инструкция</h3>
                <div className="pricing-price">от 200 ₽</div>
                <p>Пошаговый документ на понятном языке: кто, что, когда и как должен делать. Новый сотрудник разберётся за день.</p>
                <ul className="pricing-features">
                  <li>Пошаговое описание действий</li>
                  <li>Ответственные и сроки</li>
                  <li>Шаблоны документов</li>
                  <li>Чек-листы для проверки</li>
                </ul>
              </div>

              <div className="pricing-card">
                <h3>Бизнес-модель компании</h3>
                <div className="pricing-price">5 000 ₽</div>
                <p>Структурированное описание того, как ваша компания создаёт ценность, привлекает клиентов и зарабатывает деньги.</p>
                <ul className="pricing-features">
                  <li>Ценностное предложение</li>
                  <li>Каналы привлечения и продаж</li>
                  <li>Структура доходов и расходов</li>
                  <li>Ключевые ресурсы и партнёры</li>
                </ul>
              </div>

              <div className="pricing-card dark">
                <span className="pricing-badge">Максимальная выгода</span>
                <h3>Полный комплект «Под ключ»</h3>
                <div className="pricing-price">от 49 000 ₽</div>
                <p>Все рабочие процессы компании + все документы + бизнес-модель + финансовая модель + персональный эксперт + обучение команды.</p>
                <ul className="pricing-features">
                  <li>Все карты рабочих процессов (до 15 штук)</li>
                  <li>Регламенты и инструкции по каждому процессу</li>
                  <li>Бизнес-модель и финансовая модель</li>
                  <li>Персональный эксперт на весь период</li>
                  <li>Обучение команды</li>
                  <li>Поддержка и обновления 3 месяца</li>
                </ul>
              </div>
            </div>

            <div className="promo-repeat">
              <div className="promo-repeat-text">
                <span className="promo-repeat-x2">×2</span>
                <p>
                  <strong>Не забудьте:</strong> первое пополнение удваивается. Положите 5 000 ₽ — получите 10 000 ₽ на счёт. Это целых две карты процессов или одна карта + бизнес-модель.
                </p>
              </div>
              <button className="btn-primary" onClick={() => scrollToSection("cta")}>
                Пополнить и получить ×2
              </button>
            </div>
          </div>
        </section>

        {/* Блок 6: Сравнение с консультантом */}
        <section className="section section-alt" ref={comparisonAnim.ref}>
          <div className={`container fade-in-up ${comparisonAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Почему компании выбирают сервис, а не консультанта
            </h2>

            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Параметр</th>
                  <th>С консультантом</th>
                  <th>С нашим сервисом</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Стоимость одного процесса</td>
                  <td>От 50 000 ₽</td>
                  <td>5 000 ₽</td>
                </tr>
                <tr>
                  <td>Полное описание компании</td>
                  <td>От 300 000 ₽</td>
                  <td>От 49 000 ₽</td>
                </tr>
                <tr>
                  <td>Срок получения результата</td>
                  <td>От 3 до 12 месяцев</td>
                  <td>Первый результат через 2 часа</td>
                </tr>
                <tr>
                  <td>Формат работы</td>
                  <td>Встречи, командировки, согласования</td>
                  <td>Онлайн, в удобное время</td>
                </tr>
                <tr>
                  <td>Обновление процессов</td>
                  <td>Каждое изменение — доплата</td>
                  <td>Обновляйте сами, в любой момент</td>
                </tr>
                <tr>
                  <td>Язык документов</td>
                  <td>Профессиональный жаргон и аббревиатуры</td>
                  <td>Простой и понятный каждому сотруднику</td>
                </tr>
                <tr>
                  <td>Доступность</td>
                  <td>Папка с документами на полке</td>
                  <td>Онлайн, с любого устройства, круглосуточно</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Блок 7: Для кого */}
        <section className="section" ref={industriesAnim.ref}>
          <div className={`container fade-in-up ${industriesAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Работает в любой отрасли, где есть повторяющиеся операции
            </h2>

            <div className="industries-grid">
              {industries.map((ind, i) => (
                <div
                  key={i}
                  className={`industry-card ${activeIndustry === i ? "expanded" : ""}`}
                  onClick={() => setActiveIndustry(activeIndustry === i ? null : i)}
                >
                  <div className="industry-card-header">
                    <span className="industry-card-icon">{ind.icon}</span>
                    <h4>{ind.name}</h4>
                  </div>
                  <p className="industry-card-short">{ind.short}</p>
                  {activeIndustry === i && (
                    <p className="industry-card-full">{ind.full}</p>
                  )}
                </div>
              ))}
            </div>

            <p className="industries-note">
              Не нашли свою отрасль? Сервис адаптируется — интервью подстраивается под специфику любого бизнеса, где есть повторяющиеся рабочие операции.
            </p>
          </div>
        </section>

        {/* Блок 8: Социальное доказательство */}
        <section id="testimonials" className="section section-alt" ref={socialProofAnim.ref}>
          <div className={`container fade-in-up ${socialProofAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Компании, которые уже навели порядок
            </h2>

            <div className="stats-grid" style={{ marginTop: 48 }}>
              <div className="stat-item" ref={counter1.ref}>
                <div className="stat-number">{counter1.count}<span className="stat-suffix">+</span></div>
                <div className="stat-label">компаний используют сервис</div>
              </div>
              <div className="stat-item" ref={counter2.ref}>
                <div className="stat-number">{counter2.count} <span className="stat-suffix">часа</span></div>
                <div className="stat-label">среднее время создания карты процесса</div>
              </div>
              <div className="stat-item" ref={counter3.ref}>
                <div className="stat-number">×{counter3.count}</div>
                <div className="stat-label">дешевле чем с консультантом</div>
              </div>
            </div>

            <div className="testimonials-grid">
              {testimonials.map((t, i) => (
                <div key={i} className="testimonial-card">
                  <span className="testimonial-quote">"</span>
                  <p className="testimonial-text">{t.text}</p>
                  <div className="testimonial-author">
                    <div className="testimonial-avatar">{t.name.charAt(0)}</div>
                    <div>
                      <div className="testimonial-name">{t.name}</div>
                      <div className="testimonial-role">{t.role}, {t.company}</div>
                      <div className="testimonial-stars">★★★★★</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Блок 9: Демо */}
        <section className="section section-dark" ref={demoAnim.ref}>
          <div className={`container fade-in-up ${demoAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Посмотрите, как выглядит результат
            </h2>

            <div className="demo-container" style={{ marginTop: 48 }}>
              <div className="demo-browser">
                <div className="demo-browser-header">
                  <span className="demo-browser-dot red"></span>
                  <span className="demo-browser-dot yellow"></span>
                  <span className="demo-browser-dot green"></span>
                </div>
                <div className="demo-browser-content">
                  {activeTab === 0 && (
                    <svg viewBox="0 0 600 300" fill="none" style={{ width: "100%", height: "100%" }}>
                      <rect x="20" y="20" width="120" height="50" rx="8" fill={cssVars.colorAccent} opacity="0.3" stroke={cssVars.colorAccent} strokeWidth="2"/>
                      <text x="80" y="50" textAnchor="middle" fill={cssVars.colorTextLight} fontSize="14">Заявка</text>

                      <path d="M140 45 L180 45" stroke={cssVars.colorAccent} strokeWidth="2"/>
                      <polygon points="180,45 170,40 170,50" fill={cssVars.colorAccent}/>

                      <polygon points="250,20 310,45 250,70 190,45" fill={cssVars.colorWarm} opacity="0.3" stroke={cssVars.colorWarm} strokeWidth="2"/>
                      <text x="250" y="50" textAnchor="middle" fill={cssVars.colorTextLight} fontSize="12">Проверка</text>

                      <path d="M310 45 L350 45" stroke={cssVars.colorAccent} strokeWidth="2"/>

                      <rect x="350" y="20" width="120" height="50" rx="8" fill={cssVars.colorBgAlt} opacity="0.3" stroke={cssVars.colorTextLight} strokeWidth="2"/>
                      <text x="410" y="50" textAnchor="middle" fill={cssVars.colorTextLight} fontSize="14">Обработка</text>

                      <path d="M410 70 L410 100 L200 100 L200 130" stroke={cssVars.colorAccent} strokeWidth="2" strokeDasharray="4"/>

                      <rect x="140" y="130" width="120" height="50" rx="8" fill={cssVars.colorPrimary} stroke={cssVars.colorAccent} strokeWidth="2"/>
                      <text x="200" y="160" textAnchor="middle" fill={cssVars.colorTextLight} fontSize="14">Выполнение</text>

                      <path d="M260 155 L300 155" stroke={cssVars.colorAccent} strokeWidth="2"/>

                      <rect x="300" y="130" width="120" height="50" rx="8" fill={cssVars.colorAccent} opacity="0.3" stroke={cssVars.colorAccent} strokeWidth="2"/>
                      <text x="360" y="160" textAnchor="middle" fill={cssVars.colorTextLight} fontSize="14">Контроль</text>

                      <path d="M420 155 L460 155" stroke={cssVars.colorAccent} strokeWidth="2"/>

                      <circle cx="500" cy="155" r="25" fill={cssVars.colorAccent} opacity="0.3" stroke={cssVars.colorAccent} strokeWidth="2"/>
                      <text x="500" y="160" textAnchor="middle" fill={cssVars.colorTextLight} fontSize="12">Готово</text>

                      <rect x="20" y="220" width="560" height="60" rx="8" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                      <text x="40" y="245" fill={cssVars.colorWarm} fontSize="12" fontWeight="600">⚠ Узкое место:</text>
                      <text x="40" y="265" fill="rgba(255,255,255,0.7)" fontSize="11">Этап «Проверка» — среднее время 4 часа вместо 30 минут. Потенциальная экономия: 120 000 ₽/мес</text>
                    </svg>
                  )}
                  {activeTab === 1 && (
                    <div style={{ color: cssVars.colorTextLight, padding: 40, textAlign: "left" }}>
                      <h3 style={{ marginBottom: 20 }}>Регламент: Обработка входящей заявки</h3>
                      <ol style={{ lineHeight: 2, opacity: 0.8 }}>
                        <li>Менеджер получает заявку в течение 5 минут</li>
                        <li>Проверяет комплектность данных по чек-листу</li>
                        <li>Связывается с клиентом для уточнения деталей</li>
                        <li>Передаёт заявку в отдел исполнения</li>
                        <li>Контролирует статус в течение 24 часов</li>
                      </ol>
                    </div>
                  )}
                  {activeTab === 2 && (
                    <div style={{ color: cssVars.colorTextLight, padding: 40 }}>
                      <h3 style={{ marginBottom: 20, textAlign: "center" }}>Бизнес-модель</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
                        <div style={{ background: "rgba(255,255,255,0.1)", padding: 16, borderRadius: 8 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>Ценность</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Быстрое решение проблем клиентов</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.1)", padding: 16, borderRadius: 8 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>Каналы</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Сайт, рекомендации, реклама</div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.1)", padding: 16, borderRadius: 8 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>Доходы</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>Услуги, абонементы, доп. продажи</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="demo-tabs">
                <button className={`demo-tab ${activeTab === 0 ? "active" : ""}`} onClick={() => setActiveTab(0)}>Карта процесса</button>
                <button className={`demo-tab ${activeTab === 1 ? "active" : ""}`} onClick={() => setActiveTab(1)}>Регламент</button>
                <button className={`demo-tab ${activeTab === 2 ? "active" : ""}`} onClick={() => setActiveTab(2)}>Бизнес-модель</button>
              </div>

              <div className="demo-cta">
                <button className="btn-primary" onClick={() => scrollToSection("cta")}>
                  Создать карту для своего бизнеса →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Блок 10: Повторный оффер */}
        <section className="section" style={{ background: `linear-gradient(135deg, rgba(255, 107, 53, 0.05) 0%, ${cssVars.colorBg} 100%)` }} ref={offerAnim.ref}>
          <div className={`container fade-in-up ${offerAnim.isVisible ? "visible" : ""}`}>
            <div className="offer-header">
              <h2 className="section-title">
                Каждый рубль, вложенный в первый раз, работает вдвойне
              </h2>
              <p className="section-subtitle" style={{ margin: "0 auto" }}>
                Пополните баланс прямо сейчас — и получите в два раза больше средств на создание карт процессов, регламентов и инструкций для вашего бизнеса.
              </p>
            </div>

            <div className="offer-grid">
              <div className="offer-card">
                <div className="offer-card-amount">Вы вносите 2 500 ₽</div>
                <div className="offer-card-result">На счёте 5 000 ₽</div>
                <p className="offer-card-desc">1 полная карта рабочего процесса</p>
              </div>
              <div className="offer-card" style={{ border: `2px solid ${cssVars.colorAccent}` }}>
                <div className="offer-card-amount">Вы вносите 5 000 ₽</div>
                <div className="offer-card-result">На счёте 10 000 ₽</div>
                <p className="offer-card-desc">2 карты процессов или 1 карта + бизнес-модель</p>
              </div>
              <div className="offer-card">
                <div className="offer-card-amount">Вы вносите 25 000 ₽</div>
                <div className="offer-card-result">На счёте 50 000 ₽</div>
                <p className="offer-card-desc">Практически полный комплект «Под ключ»</p>
              </div>
            </div>

            <div className="offer-cta">
              <button className="btn-primary btn-primary-large" onClick={() => scrollToSection("cta")}>
                Пополнить счёт и удвоить баланс
              </button>
              <p className="offer-note">
                Акция действует для первого пополнения. Средства не сгорают — используйте в любое время.
              </p>
            </div>
          </div>
        </section>

        {/* Блок 11: FAQ */}
        <section className="section section-alt" ref={faqAnim.ref}>
          <div className={`container fade-in-up ${faqAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Ответы на вопросы, которые задают чаще всего
            </h2>

            <div className="faq-list">
              {faqData.map((item, i) => (
                <div key={i} className={`faq-item ${openFaqIndex === i ? "open" : ""}`}>
                  <button className="faq-question" onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}>
                    {item.q}
                    <span className="faq-icon">+</span>
                  </button>
                  <div className="faq-answer">
                    <p>{item.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Блок 12: Финальный CTA */}
        <section id="cta" className="section section-dark" ref={ctaAnim.ref}>
          <div className={`container fade-in-up ${ctaAnim.isVisible ? "visible" : ""}`}>
            <h2 className="section-title" style={{ textAlign: "center" }}>
              Перестаньте терять деньги и время на хаос в процессах
            </h2>
            <p className="section-subtitle" style={{ textAlign: "center", margin: "0 auto", color: "rgba(255,255,255,0.7)" }}>
              Первое пополнение удваивается. Одна карта процесса — 5 000 рублей. Результат — через 2 часа.
            </p>

            <div className="cta-form-container">
              <form onSubmit={handleFormSubmit}>
                <div className="cta-form-group">
                  <label className="cta-form-label">Ваше имя</label>
                  <input
                    type="text"
                    className="cta-form-input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="cta-form-group">
                  <label className="cta-form-label">Телефон или электронная почта</label>
                  <input
                    type="text"
                    className="cta-form-input"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    required
                  />
                </div>
                <div className="cta-form-group">
                  <label className="cta-form-label">Ваша отрасль</label>
                  <select
                    className="cta-form-select"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  >
                    <option value="">Выберите отрасль</option>
                    <option value="construction">Строительство</option>
                    <option value="trade">Торговля</option>
                    <option value="services">Услуги</option>
                    <option value="manufacturing">Производство</option>
                    <option value="other">Другое</option>
                  </select>
                </div>
                <div className="cta-form-group">
                  <label className="cta-form-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.wantExpert}
                      onChange={(e) => setFormData({ ...formData, wantExpert: e.target.checked })}
                    />
                    <span>Хочу, чтобы эксперт помог на первом интервью (бесплатно)</span>
                  </label>
                </div>
                <button type="submit" className="btn-primary btn-primary-large cta-form-submit">
                  Пополнить счёт и начать
                </button>
              </form>
              <p className="cta-form-note">
                Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности. Мы не передаём данные третьим лицам.
              </p>
            </div>
          </div>
        </section>

        {/* Блок 13: Footer */}
        <footer className="footer">
          <div className="footer-grid">
            <div className="footer-about">
              <a href="#" className="logo">
                biz-process<span>.ru</span>
              </a>
              <p>
                Сервис для создания карт рабочих процессов, регламентов, инструкций и бизнес-моделей на основе интервью с собственником.
              </p>
            </div>

            <div>
              <div className="footer-title">Навигация</div>
              <ul className="footer-links">
                <li><a href="#features">Возможности</a></li>
                <li><a href="#how-it-works">Как это работает</a></li>
                <li><a href="#pricing">Тарифы</a></li>
                <li><a href="#testimonials">Отзывы</a></li>
                <li><a href="#">Блог</a></li>
              </ul>
            </div>

            <div>
              <div className="footer-title">Поддержка</div>
              <ul className="footer-links">
                <li><a href="#">Частые вопросы</a></li>
                <li><a href="#">Контакты</a></li>
                <li><a href="#">Политика конфиденциальности</a></li>
                <li><a href="#">Пользовательское соглашение</a></li>
              </ul>
            </div>

            <div className="footer-contact">
              <div className="footer-title">Контакты</div>
              <p><a href="mailto:info@biz-process.ru">info@biz-process.ru</a></p>
              <p><a href="tel:+7XXXXXXXXXX">+7 (XXX) XXX-XX-XX</a></p>
              <p><a href="https://t.me/bizprocess">Телеграм: @bizprocess</a></p>
            </div>
          </div>

          <div className="footer-bottom">
            © 2026 biz-process.ru — Все права защищены
          </div>
        </footer>
      </div>
    </>
  );
}
