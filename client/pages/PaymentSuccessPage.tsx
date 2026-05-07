import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Coins, Package, ArrowRight } from "lucide-react";

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get("orderId") ?? "";

  const [timedOut, setTimedOut] = useState(false);

  const { data, error } = trpc.payment.getStatus.useQuery(
    { orderId },
    {
      enabled: !!orderId,
      refetchInterval: (query) =>
        query.state.data?.status === "confirmed" ? false : timedOut ? false : 2000,
    }
  );

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 30_000);
    return () => clearTimeout(timer);
  }, []);

  if (!orderId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-gray-500">Номер заказа не указан</p>
        <Button onClick={() => navigate("/pricing")}>Перейти к тарифам</Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-gray-500">Не удалось загрузить статус платежа</p>
        <Button onClick={() => navigate("/companies")}>На главную</Button>
      </div>
    );
  }

  const isConfirmed = data?.status === "confirmed";
  const isFailed = data?.status === "failed" || data?.status === "cancelled";
  const isPending = !data || data.status === "pending";

  if (isPending && !isFailed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">Обрабатываем платёж...</p>
          <p className="text-sm text-gray-500 mt-1">Это займёт несколько секунд</p>
        </div>
        {timedOut && (
          <div className="text-center space-y-2">
            <p className="text-sm text-gray-500">
              Платёж обрабатывается дольше обычного. Токены будут зачислены автоматически.
            </p>
            <Button variant="outline" onClick={() => navigate("/companies")}>
              На главную
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">Платёж не прошёл</p>
          <p className="text-sm text-gray-500 mt-1">
            {data?.status === "cancelled" ? "Платёж был отменён" : "Произошла ошибка при оплате"}
          </p>
        </div>
        <Button onClick={() => navigate("/pricing")}>Попробовать ещё раз</Button>
      </div>
    );
  }

  // confirmed
  const credited = data!.tokensCredited;
  const hasBonus = data!.isFirstPayment;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-10 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Оплата прошла успешно</h1>
            <p className="text-sm text-gray-500 mt-1">Токены зачислены на ваш счёт</p>
          </div>
        </div>

        {/* Details card */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Package className="w-4 h-4" />
                Пакет
              </div>
              <span className="text-sm font-medium text-gray-900">{data!.packageName}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Сумма</span>
              <span className="text-sm font-medium text-gray-900">
                {(data!.amount / 100).toLocaleString("ru-RU")} ₽
              </span>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Coins className="w-4 h-4" />
                  Зачислено токенов
                </div>
                <span
                  className={`text-lg font-bold ${hasBonus ? "text-yellow-600" : "text-gray-900"}`}
                >
                  {credited.toLocaleString("ru-RU")}
                  {hasBonus && (
                    <span className="ml-1.5 text-xs font-normal bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
                      ×2 бонус
                    </span>
                  )}
                </span>
              </div>
              {hasBonus && (
                <p className="text-xs text-yellow-600 mt-1.5">
                  Первое пополнение — токены удвоены!
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <span className="text-sm text-gray-500">Текущий баланс</span>
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-bold text-yellow-700">
                  {data!.tokenBalance.toLocaleString("ru-RU")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button className="w-full gap-2" onClick={() => navigate("/companies")}>
          Перейти к сервису
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
