import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  User,
  Mail,
  PenLine,
  Save,
  Loader2,
  AlertCircle,
  Coins,
  Calendar,
  Shield,
  TrendingDown,
  TrendingUp,
  Sparkles,
  RefreshCw,
  MessageSquare,
  FileText,
  Mic,
  CreditCard,
  X,
  CheckCircle2,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";

export function ProfilePage() {
  const { user, updateUser } = useAuth();

  // --- Edit profile ---
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [editEmail, setEditEmail] = useState(user?.email ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: (updatedUser) => {
      updateUser(updatedUser);
      setIsEditing(false);
      setEditError(null);
      setEditSuccess(true);
      setTimeout(() => setEditSuccess(false), 3000);
    },
    onError: (err) => {
      setEditError(err.message || "Не удалось обновить профиль");
    },
  });

  const startEditing = () => {
    setEditName(user?.name ?? "");
    setEditEmail(user?.email ?? "");
    setEditError(null);
    setEditSuccess(false);
    setIsEditing(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!editName.trim()) {
      setEditError("Имя обязательно");
      return;
    }
    if (!editEmail.trim()) {
      setEditError("Email обязателен");
      return;
    }

    updateProfileMutation.mutate({
      name: editName.trim(),
      email: editEmail.trim(),
    });
  };

  // --- Token operation type config ---
  const operationConfig: Record<
    string,
    { label: string; icon: React.ElementType; colorClass: string }
  > = {
    generation: {
      label: "Генерация процесса",
      icon: Sparkles,
      colorClass: "text-purple-500",
    },
    regeneration: {
      label: "Повторная генерация",
      icon: RefreshCw,
      colorClass: "text-blue-500",
    },
    change_request: {
      label: "Запрос изменений",
      icon: MessageSquare,
      colorClass: "text-orange-500",
    },
    recommendations: {
      label: "Рекомендации",
      icon: FileText,
      colorClass: "text-green-500",
    },
    transcription: {
      label: "Транскрипция",
      icon: Mic,
      colorClass: "text-pink-500",
    },
    topup: {
      label: "Пополнение",
      icon: CreditCard,
      colorClass: "text-emerald-500",
    },
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Мой профиль</h1>

      <div className="space-y-6">
        {/* Profile info card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center">
                  <User className="w-7 h-7 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">{user.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <Mail className="w-3.5 h-3.5" />
                    {user.email}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={user.role === "admin" ? "default" : "secondary"}
                >
                  <Shield className="w-3 h-3 mr-1" />
                  {user.role === "admin" ? "Администратор" : "Пользователь"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>
                Зарегистрирован {formatDate(user.createdAt)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Token balance card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              Баланс токенов
            </CardTitle>
            <CardDescription>
              Токены используются для генерации и обработки бизнес-процессов
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-6 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl border border-yellow-200">
              <div>
                <p className="text-sm font-medium text-yellow-700 mb-1">
                  Текущий баланс
                </p>
                <p className="text-4xl font-bold text-yellow-800">
                  {user.tokenBalance.toLocaleString("ru-RU")}
                </p>
                <p className="text-sm text-yellow-600 mt-1">токенов</p>
              </div>
              <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center">
                <Coins className="w-8 h-8 text-yellow-500" />
              </div>
            </div>

            {/* Cost reference */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Генерация", cost: "1 000", icon: Sparkles },
                { label: "Регенерация", cost: "1 000", icon: RefreshCw },
                { label: "Запрос изменений", cost: "500", icon: MessageSquare },
                { label: "Рекомендации", cost: "200", icon: FileText },
                { label: "Транскрипция", cost: "10/мин", icon: Mic },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {item.cost}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Edit profile card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Редактирование профиля</CardTitle>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <PenLine className="w-4 h-4" />
                  Редактировать
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm mb-4">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Профиль успешно обновлён</span>
              </div>
            )}

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                {editError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="profile-name">Имя</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="profile-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="pl-10"
                      disabled={updateProfileMutation.isPending}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="profile-email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="pl-10"
                      disabled={updateProfileMutation.isPending}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Сохранение...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Сохранить
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditError(null);
                    }}
                    disabled={updateProfileMutation.isPending}
                  >
                    <X className="w-4 h-4" />
                    Отмена
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Имя</p>
                  <p className="text-gray-900">{user.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">
                    Email
                  </p>
                  <p className="text-gray-900">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">
                    Роль
                  </p>
                  <p className="text-gray-900">
                    {user.role === "admin" ? "Администратор" : "Пользователь"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">
                    Дата регистрации
                  </p>
                  <p className="text-gray-900">{formatDate(user.createdAt)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
