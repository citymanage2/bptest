import { Link } from "react-router-dom";
import { ArrowRight, Zap, BarChart3, FileOutput, Brain } from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">Business Process Builder</span>
          </div>
          <div className="flex items-center gap-3">
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
      </header>

      {/* Hero */}
      <section className="h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full mb-8">
            🔥 Первое пополнение — двойной баланс
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground tracking-tight leading-tight">
            Выстройте рабочие процессы компании
          </h1>

          <p className="mt-5 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto">
            Опишите деятельность — получите готовый BPMN-процесс за 15–30 минут.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary text-white text-lg font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
            >
              Начать бесплатно
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/register"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              5 000 токенов при регистрации
            </Link>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-10 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground mb-4 font-medium uppercase tracking-wider">
            Подходит для
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {["Строительство", "Производство", "Логистика", "Финансы", "IT", "Торговля", "Медицина"].map((tag) => (
              <span key={tag} className="px-4 py-1.5 bg-gray-100 text-foreground text-sm font-medium rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-foreground mb-14">Как это работает</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Создайте компанию",
                description: "Укажите название и сферу деятельности",
              },
              {
                step: "02",
                title: "Пройдите интервью",
                description: "Ответьте на вопросы текстом или голосом",
              },
              {
                step: "03",
                title: "Получите процесс",
                description: "ИИ сгенерирует бизнес-процесс в формате BPMN",
              },
              {
                step: "04",
                title: "Оптимизируйте",
                description: "Редактируйте, получайте рекомендации, экспортируйте",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">{item.step}</span>
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1.5">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-foreground mb-14">Преимущества</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Brain,
                title: "ИИ-генерация",
                description:
                  "Создание бизнес-процессов через структурированное интервью на базе Claude AI.",
              },
              {
                icon: BarChart3,
                title: "BPMN 2.0 Swimlane",
                description:
                  "Визуализация процессов в стандартном формате с дорожками по ролям.",
              },
              {
                icon: FileOutput,
                title: "Экспорт и интеграция",
                description:
                  "PNG, PDF и BPMN XML — совместимость с Camunda, Bizagi и другими платформами.",
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="p-7 rounded-2xl border border-border hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">
            Готовы оптимизировать процессы?
          </h2>
          <p className="text-white/75 mb-8 text-lg">
            Начните бесплатно — 5 000 токенов при регистрации
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-primary text-lg font-semibold rounded-xl hover:bg-gray-100 transition-colors"
          >
            Создать аккаунт
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 text-center text-muted-foreground text-sm">
          &copy; {new Date().getFullYear()} Business Process Builder. Все права защищены.
        </div>
      </footer>
    </div>
  );
}
