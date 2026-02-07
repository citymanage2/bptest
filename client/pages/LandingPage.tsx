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
      <section className="py-20 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-foreground tracking-tight">
            Автоматизированное построение
            <span className="block text-primary mt-2">бизнес-процессов</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
            Преобразуйте описание деятельности компании в формализованные бизнес-процессы
            с визуализацией BPMN 2.0 за 15-30 минут вместо 40-80 часов.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary text-white text-lg font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
            >
              Начать бесплатно
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/faq"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-foreground text-lg font-semibold rounded-xl border-2 border-border hover:border-primary/30 transition-colors"
            >
              Узнать больше
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-foreground mb-16">Как это работает</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Создайте компанию",
                description: "Укажите информацию о вашей компании и сфере деятельности",
              },
              {
                step: "02",
                title: "Пройдите интервью",
                description: "Ответьте на вопросы анкеты текстом или голосом",
              },
              {
                step: "03",
                title: "Получите процесс",
                description: "ИИ автоматически сгенерирует бизнес-процесс в формате BPMN",
              },
              {
                step: "04",
                title: "Оптимизируйте",
                description: "Редактируйте, получайте рекомендации и экспортируйте результат",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-primary">{item.step}</span>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-foreground mb-16">Преимущества</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Brain,
                title: "ИИ-генерация",
                description:
                  "Автоматическое создание бизнес-процессов на основе структурированного интервью с использованием Claude AI.",
              },
              {
                icon: BarChart3,
                title: "BPMN 2.0 Swimlane",
                description:
                  "Визуализация процессов в стандартном формате с дорожками по ролям и этапами.",
              },
              {
                icon: FileOutput,
                title: "Экспорт и интеграция",
                description:
                  "Экспорт в PNG, PDF и BPMN XML для совместимости с Camunda, Bizagi и другими платформами.",
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="p-8 rounded-2xl border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Готовы оптимизировать бизнес-процессы?
          </h2>
          <p className="text-white/80 mb-8 text-lg">
            Начните бесплатно — 5000 токенов при регистрации
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
