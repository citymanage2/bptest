import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  RefreshCw,
  MessageSquare,
  FileText,
  Mic,
  Coins,
  Zap,
  Star,
  ArrowLeft,
  Gift,
  AlertCircle,
} from "lucide-react";

const PACKAGES = [
  {
    id: "start" as const,
    name: "Старт",
    tokens: 5_000,
    amount: 490,
    amountKop: 49_000,
    description: "Попробуйте сервис без рисков",
    highlight: false,
    icon: Zap,
    perks: ["5 000 токенов", "~5 генераций процессов", "Без ограничений по времени"],
  },
  {
    id: "basic" as const,
    name: "Базовый",
    tokens: 15_000,
    amount: 990,
    amountKop: 99_000,
    description: "Оптимально для регулярной работы",
    highlight: true,
    icon: Star,
    perks: ["15 000 токенов", "~15 генераций процессов", "Без ограничений по времени"],
  },
  {
    id: "pro" as const,
    name: "Профи",
    tokens: 50_000,
    amount: 2_490,
    amountKop: 249_000,
    description: "Для активного использования",
    highlight: false,
    icon: Sparkles,
    perks: ["50 000 токенов", "~50 генераций процессов", "Без ограничений по времени"],
  },
];

const COSTS = [
  { label: "Генерация бизнес-процесса", cost: "1 000", icon: Sparkles },
  { label: "Повторная генерация", cost: "1 000", icon: RefreshCw },
  { label: "Запрос изменений", cost: "500", icon: MessageSquare },
  { label: "Рекомендации", cost: "200", icon: FileText },
  { label: "Транскрипция аудио", cost: "10 / мин", icon: Mic },
];

export function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isBonus = searchParams.get("bonus") === "true";

  const createOrderMutation = trpc.payment.createOrder.useMutation({
    onSuccess: ({ paymentUrl }) => {
      window.location.href = paymentUrl;
    },
    onError: (err) => {
      alert("Ошибка при создании платежа: " + err.message);
    },
  });

  const historyQuery = trpc.payment.getUserHistory.useQuery(undefined, {
    enabled: !!user && isBonus,
  });

  const hasConfirmedPayment =
    !!historyQuery.data?.some((p) => p.status === "confirmed");

  const handleBuy = (packageId: "start" | "basic" | "pro") => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(isBonus ? "/pricing?bonus=true" : "/pricing")}`);
      return;
    }
    createOrderMutation.mutate({ packageId });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          На главную
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          {isBonus && !hasConfirmedPayment && (
            <div className="inline-flex items-center gap-2 bg-yellow-100 text-yellow-800 text-sm font-medium px-4 py-1.5 rounded-full mb-4">
              <Gift className="w-4 h-4" />
              Первое пополнение — токены ×2
            </div>
          )}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Тарифы
          </h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Токены — единая валюта сервиса. Покупаете один раз, используете в любое время.
            Токены не сгорают.
          </p>
        </div>

        {/* Already used bonus banner */}
        {isBonus && hasConfirmedPayment && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Бонус ×2 уже был использован</p>
              <p className="text-sm text-amber-700">
                Акция на удвоение токенов применяется только при первом пополнении. Вы можете пополнить счёт по обычному тарифу.
              </p>
            </div>
          </div>
        )}

        {/* Package cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PACKAGES.map((pkg) => {
            const Icon = pkg.icon;
            const isPending =
              createOrderMutation.isPending &&
              createOrderMutation.variables?.packageId === pkg.id;

            return (
              <div
                key={pkg.id}
                className={`relative bg-white rounded-2xl border-2 p-6 flex flex-col transition-shadow hover:shadow-lg ${
                  pkg.highlight
                    ? "border-purple-500 shadow-md"
                    : "border-gray-200"
                }`}
              >
                {pkg.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Популярный
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      pkg.highlight ? "bg-purple-100" : "bg-gray-100"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        pkg.highlight ? "text-purple-600" : "text-gray-600"
                      }`}
                    />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{pkg.name}</h3>
                    <p className="text-xs text-gray-500">{pkg.description}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900">
                      {pkg.amount.toLocaleString("ru-RU")}
                    </span>
                    <span className="text-gray-500 font-medium">₽</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Coins className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-semibold text-yellow-700">
                      {pkg.tokens.toLocaleString("ru-RU")} токенов
                    </span>
                  </div>
                </div>

                <ul className="space-y-2 mb-6 flex-1">
                  {pkg.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                      {perk}
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${
                    pkg.highlight
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "bg-gray-900 hover:bg-gray-800"
                  }`}
                  onClick={() => handleBuy(pkg.id)}
                  disabled={createOrderMutation.isPending}
                >
                  {isPending
                    ? "Перенаправление..."
                    : isBonus && hasConfirmedPayment
                    ? `Оплатить ×1 — ${pkg.name}`
                    : isBonus && !hasConfirmedPayment
                    ? "Купить с бонусом ×2"
                    : "Купить"}
                </Button>
              </div>
            );
          })}
        </div>

        {/* First payment bonus */}
        {!(isBonus && hasConfirmedPayment) && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-2xl p-6 mb-10 flex items-start gap-4">
            <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-yellow-900 mb-1">
                Бонус первого пополнения — токены ×2
              </h3>
              <p className="text-sm text-yellow-800">
                При первом пополнении мы удваиваем количество токенов. Купили пакет «Профи» на 50 000
                токенов — получите 100 000. Акция применяется автоматически.
              </p>
            </div>
          </div>
        )}

        {/* Cost reference table */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Coins className="w-5 h-5 text-yellow-500" />
            Стоимость операций
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="pb-2 font-medium">Операция</th>
                  <th className="pb-2 font-medium text-right">Токены</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {COSTS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <tr key={item.label}>
                      <td className="py-3">
                        <div className="flex items-center gap-2.5 text-sm text-gray-700">
                          <Icon className="w-4 h-4 text-gray-400" />
                          {item.label}
                        </div>
                      </td>
                      <td className="py-3 text-right font-semibold text-sm text-gray-900">
                        {item.cost}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Offer link */}
        <p className="text-center text-sm text-gray-500">
          Совершая покупку, вы соглашаетесь с условиями{" "}
          <Link to="/offer" className="text-purple-600 hover:text-purple-700 underline">
            публичной оферты
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
