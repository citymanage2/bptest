import { useState } from "react";
import { Link } from "react-router-dom";
import { useCookieConsent, type CookiePreferences } from "@/lib/cookieConsent";
import { trpc } from "@/lib/trpc";
import { Cookie, Settings, Check, X } from "lucide-react";

export function CookieConsentBanner() {
  const { hasConsented, acceptAll, rejectOptional, savePreferences, visitorId } = useCookieConsent();
  const [showSettings, setShowSettings] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(true);

  const saveMutation = trpc.consent.saveCookieConsent.useMutation();

  if (hasConsented) return null;

  const handleAcceptAll = () => {
    acceptAll();
    saveMutation.mutate({
      visitorId,
      functional: true,
      analytics: true,
      marketing: true,
    });
  };

  const handleRejectOptional = () => {
    rejectOptional();
    saveMutation.mutate({
      visitorId,
      functional: false,
      analytics: false,
      marketing: false,
    });
  };

  const handleSaveCustom = () => {
    savePreferences({ functional, analytics, marketing });
    saveMutation.mutate({
      visitorId,
      functional,
      analytics,
      marketing,
    });
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 md:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Main banner */}
        <div className="p-4 md:p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
              <Cookie className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-base mb-1">
                Мы используем cookie
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Мы используем файлы cookie и аналогичные технологии для обеспечения работы сайта,
                анализа трафика и персонализации контента. Вы можете настроить свои предпочтения
                или принять все cookie. Подробнее в{" "}
                <Link
                  to="/privacy-policy"
                  className="text-purple-600 hover:text-purple-700 underline"
                >
                  Политике конфиденциальности
                </Link>{" "}
                и{" "}
                <Link
                  to="/cookie-policy"
                  className="text-purple-600 hover:text-purple-700 underline"
                >
                  Политике Cookie
                </Link>
                .
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              Настроить
            </button>
            <button
              onClick={handleRejectOptional}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Только необходимые
            </button>
            <button
              onClick={handleAcceptAll}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-sm"
            >
              <Check className="w-4 h-4" />
              Принять все
            </button>
          </div>
        </div>

        {/* Detailed settings panel */}
        {showSettings && (
          <div className="border-t border-gray-200 p-4 md:p-6 bg-gray-50">
            <h4 className="font-semibold text-gray-900 text-sm mb-4">Настройки Cookie</h4>

            <div className="space-y-3">
              {/* Necessary - always on */}
              <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                <div className="flex-1 mr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900">Обязательные</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-medium">
                      Всегда включены
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Необходимы для работы сайта: аутентификация, безопасность, сохранение настроек согласия.
                  </p>
                </div>
                <div className="shrink-0">
                  <div className="w-11 h-6 bg-purple-600 rounded-full relative cursor-not-allowed">
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow" />
                  </div>
                </div>
              </div>

              {/* Functional */}
              <CookieToggle
                label="Функциональные"
                description="Настройки интерфейса, персонализация, запоминание предпочтений пользователя."
                checked={functional}
                onChange={setFunctional}
              />

              {/* Analytics */}
              <CookieToggle
                label="Аналитические"
                description="Яндекс.Метрика: анализ посещаемости, поведения пользователей, улучшение сервиса."
                checked={analytics}
                onChange={setAnalytics}
              />

              {/* Marketing */}
              <CookieToggle
                label="Маркетинговые"
                description="Ретаргетинг, персонализированная реклама, отслеживание рекламных кампаний."
                checked={marketing}
                onChange={setMarketing}
              />
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveCustom}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-sm"
              >
                <Check className="w-4 h-4" />
                Сохранить настройки
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CookieToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
      <div className="flex-1 mr-4">
        <span className="font-medium text-sm text-gray-900">{label}</span>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
          checked ? "bg-purple-600" : "bg-gray-300"
        }`}
        aria-label={`${label}: ${checked ? "включено" : "выключено"}`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? "right-0.5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
