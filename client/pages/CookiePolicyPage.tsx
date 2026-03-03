import { Link } from "react-router-dom";
import { ArrowLeft, Cookie } from "lucide-react";

export function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          На главную
        </Link>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Cookie className="w-5 h-5 text-orange-600" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Политика использования Cookie
            </h1>
          </div>

          <div className="prose prose-gray max-w-none space-y-6 text-sm leading-relaxed text-gray-700">
            <p className="text-gray-500 text-xs">
              Дата последнего обновления: 01 февраля 2026 г. | Версия 1.0
            </p>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">
                1. Что такое Cookie
              </h2>
              <p>
                Cookie (куки) — это небольшие текстовые файлы, которые сохраняются на устройстве
                Пользователя (компьютере, смартфоне, планшете) при посещении веб-сайта. Cookie
                позволяют сайту запоминать информацию о посещении: предпочтительный язык,
                настройки интерфейса и другие параметры.
              </p>
              <p>
                Cookie не содержат вирусов и не могут быть использованы для запуска программ
                на устройстве Пользователя. Файлы cookie помогают сделать использование Сервиса
                более удобным и эффективным.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">
                2. Типы используемых Cookie
              </h2>

              <h3 className="text-base font-medium text-gray-800 mt-4 mb-2">
                2.1. Обязательные (технические) cookie
              </h3>
              <p>
                Необходимы для базового функционирования Сервиса. Без этих cookie сайт не может
                работать корректно. Их нельзя отключить.
              </p>

              <h3 className="text-base font-medium text-gray-800 mt-4 mb-2">
                2.2. Функциональные cookie
              </h3>
              <p>
                Позволяют запоминать настройки интерфейса, персонализацию и предпочтения
                Пользователя. Улучшают удобство использования Сервиса.
              </p>

              <h3 className="text-base font-medium text-gray-800 mt-4 mb-2">
                2.3. Аналитические cookie
              </h3>
              <p>
                Используются для сбора статистики об использовании Сервиса. Помогают понять,
                как Пользователи взаимодействуют с сайтом, какие страницы посещают чаще всего,
                с какими трудностями сталкиваются.
              </p>

              <h3 className="text-base font-medium text-gray-800 mt-4 mb-2">
                2.4. Маркетинговые cookie
              </h3>
              <p>
                Применяются для показа персонализированной рекламы, ретаргетинга
                и отслеживания эффективности рекламных кампаний.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">
                3. Список используемых Cookie
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200 text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Название</th>
                      <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Тип</th>
                      <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Срок</th>
                      <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Назначение</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-mono">auth_token</td>
                      <td className="border border-gray-200 px-3 py-2">Обязательный</td>
                      <td className="border border-gray-200 px-3 py-2">24 часа</td>
                      <td className="border border-gray-200 px-3 py-2">
                        Токен аутентификации пользователя (localStorage)
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border border-gray-200 px-3 py-2 font-mono">cookie_consent</td>
                      <td className="border border-gray-200 px-3 py-2">Обязательный</td>
                      <td className="border border-gray-200 px-3 py-2">365 дней</td>
                      <td className="border border-gray-200 px-3 py-2">
                        Сохранение настроек согласия на использование cookie
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-mono">user_preferences</td>
                      <td className="border border-gray-200 px-3 py-2">Функциональный</td>
                      <td className="border border-gray-200 px-3 py-2">180 дней</td>
                      <td className="border border-gray-200 px-3 py-2">
                        Настройки интерфейса и персонализация
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border border-gray-200 px-3 py-2 font-mono">_ym_uid</td>
                      <td className="border border-gray-200 px-3 py-2">Аналитический</td>
                      <td className="border border-gray-200 px-3 py-2">1 год</td>
                      <td className="border border-gray-200 px-3 py-2">
                        Уникальный идентификатор пользователя Яндекс.Метрики
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-mono">_ym_d</td>
                      <td className="border border-gray-200 px-3 py-2">Аналитический</td>
                      <td className="border border-gray-200 px-3 py-2">1 год</td>
                      <td className="border border-gray-200 px-3 py-2">
                        Дата первого визита Яндекс.Метрики
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border border-gray-200 px-3 py-2 font-mono">_ym_isad</td>
                      <td className="border border-gray-200 px-3 py-2">Аналитический</td>
                      <td className="border border-gray-200 px-3 py-2">2 дня</td>
                      <td className="border border-gray-200 px-3 py-2">
                        Определение наличия блокировщика рекламы
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-3 py-2 font-mono">_ym_visorc</td>
                      <td className="border border-gray-200 px-3 py-2">Аналитический</td>
                      <td className="border border-gray-200 px-3 py-2">30 минут</td>
                      <td className="border border-gray-200 px-3 py-2">
                        Запись действий пользователя на странице (Вебвизор)
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border border-gray-200 px-3 py-2 font-mono">_yasc</td>
                      <td className="border border-gray-200 px-3 py-2">Маркетинговый</td>
                      <td className="border border-gray-200 px-3 py-2">10 лет</td>
                      <td className="border border-gray-200 px-3 py-2">
                        Ретаргетинг и рекламные кампании Яндекса
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">
                4. Управление Cookie
              </h2>
              <p>
                Пользователь может управлять настройками cookie через баннер согласия,
                который появляется при первом посещении сайта, а также через настройки браузера.
              </p>

              <h3 className="text-base font-medium text-gray-800 mt-4 mb-2">
                Инструкции для браузеров:
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Google Chrome:</strong> Настройки → Конфиденциальность и безопасность
                  → Файлы cookie и другие данные сайтов
                </li>
                <li>
                  <strong>Mozilla Firefox:</strong> Настройки → Приватность и защита
                  → Cookie и данные сайтов
                </li>
                <li>
                  <strong>Safari:</strong> Настройки → Конфиденциальность → Файлы cookie
                  и данные веб-сайтов
                </li>
                <li>
                  <strong>Яндекс.Браузер:</strong> Настройки → Сайты → Расширенные настройки сайтов
                  → Cookie-файлы
                </li>
                <li>
                  <strong>Microsoft Edge:</strong> Настройки → Файлы cookie и разрешения сайтов
                  → Управление файлами cookie
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">
                5. Последствия отключения Cookie
              </h2>
              <p>
                Отключение обязательных cookie может привести к невозможности использования
                основных функций Сервиса, включая авторизацию.
              </p>
              <p>
                Отключение функциональных cookie может привести к потере персональных настроек
                интерфейса.
              </p>
              <p>
                Отключение аналитических cookie не влияет на работоспособность Сервиса, однако
                препятствует улучшению качества сервиса на основе данных об использовании.
              </p>
              <p>
                Отключение маркетинговых cookie не влияет на работоспособность Сервиса. Пользователь
                продолжит видеть рекламу, но она не будет персонализирована.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">
                6. Яндекс.Метрика
              </h2>
              <p>
                Сервис использует сервис веб-аналитики Яндекс.Метрика, предоставляемый
                ООО «ЯНДЕКС» (119021, Россия, Москва, ул. Льва Толстого, д. 16).
              </p>
              <p>
                Яндекс.Метрика использует технологию cookie для анализа поведения пользователей
                на сайте. Собранная информация (включая IP-адрес) передаётся на серверы Яндекса
                и обрабатывается в соответствии с{" "}
                <a
                  href="https://yandex.ru/legal/confidential/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline"
                >
                  Политикой конфиденциальности Яндекса
                </a>
                .
              </p>
              <p>
                Скрипты Яндекс.Метрики загружаются только после получения согласия Пользователя
                на использование аналитических cookie.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">
                7. Контакты
              </h2>
              <p>
                По вопросам, связанным с использованием cookie, обращайтесь по адресу:{" "}
                <a href="mailto:privacy@bpbuilder.ru" className="text-purple-600 hover:underline">
                  privacy@bpbuilder.ru
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
