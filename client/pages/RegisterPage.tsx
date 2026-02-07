import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Zap, Mail, Lock, User, AlertCircle, Loader2, Gift } from "lucide-react";

export function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Consent checkboxes
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentPersonalData, setConsentPersonalData] = useState(false);
  const [consentCookie, setConsentCookie] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      login(data.token, data.user);
      navigate("/companies");
    },
    onError: (err) => {
      setError(
        err.message || "Не удалось зарегистрироваться. Попробуйте снова."
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Введите ваше имя");
      return;
    }
    if (!email.trim()) {
      setError("Введите email");
      return;
    }
    if (!password) {
      setError("Введите пароль");
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен содержать минимум 6 символов");
      return;
    }
    if (!consentPrivacy) {
      setError("Необходимо принять Политику конфиденциальности");
      return;
    }
    if (!consentPersonalData) {
      setError("Необходимо дать согласие на обработку персональных данных");
      return;
    }
    if (!consentCookie) {
      setError("Необходимо принять Политику использования Cookie");
      return;
    }
    if (!consentMarketing) {
      setError("Необходимо дать согласие на получение информационных рассылок");
      return;
    }

    registerMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
      consentPrivacyPolicy: true as const,
      consentPersonalData: true as const,
      consentCookiePolicy: true as const,
      consentMarketing: true as const,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-200">
          <Zap className="w-6 h-6 text-white" />
        </div>
        <span className="font-bold text-xl text-gray-900">
          Business Process Builder
        </span>
      </Link>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Создать аккаунт</CardTitle>
          <CardDescription>
            Зарегистрируйтесь и начните строить бизнес-процессы
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Bonus banner */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-sm">
              <Gift className="w-4 h-4 shrink-0" />
              <span>5 000 токенов бесплатно при регистрации</span>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Иван Иванов"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  autoComplete="name"
                  disabled={registerMutation.isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  autoComplete="email"
                  disabled={registerMutation.isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Минимум 6 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  autoComplete="new-password"
                  disabled={registerMutation.isPending}
                />
              </div>
            </div>

            {/* Consent checkboxes */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                Согласия
              </p>

              <ConsentCheckbox
                id="consent-privacy"
                checked={consentPrivacy}
                onChange={setConsentPrivacy}
                disabled={registerMutation.isPending}
              >
                Я прочитал и согласен с{" "}
                <a
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:text-purple-700 underline font-medium"
                >
                  Политикой конфиденциальности
                </a>
              </ConsentCheckbox>

              <ConsentCheckbox
                id="consent-personal-data"
                checked={consentPersonalData}
                onChange={setConsentPersonalData}
                disabled={registerMutation.isPending}
              >
                Я согласен на обработку моих персональных данных
              </ConsentCheckbox>

              <ConsentCheckbox
                id="consent-cookie"
                checked={consentCookie}
                onChange={setConsentCookie}
                disabled={registerMutation.isPending}
              >
                Я прочитал и согласен с{" "}
                <a
                  href="/cookie-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:text-purple-700 underline font-medium"
                >
                  Политикой использования Cookie
                </a>
              </ConsentCheckbox>

              <ConsentCheckbox
                id="consent-marketing"
                checked={consentMarketing}
                onChange={setConsentMarketing}
                disabled={registerMutation.isPending}
              >
                Я согласен на получение информационных рассылок
              </ConsentCheckbox>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Регистрация...
                </>
              ) : (
                "Зарегистрироваться"
              )}
            </Button>

            <p className="text-sm text-gray-500 text-center">
              Уже есть аккаунт?{" "}
              <Link
                to="/login"
                className="text-purple-600 hover:text-purple-700 font-medium hover:underline"
              >
                Войти
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>

      <p className="mt-8 text-xs text-gray-400 text-center">
        &copy; {new Date().getFullYear()} Business Process Builder. Все права
        защищены.
      </p>
    </div>
  );
}

function ConsentCheckbox({
  id,
  checked,
  onChange,
  disabled,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2.5 cursor-pointer group"
    >
      <div className="shrink-0 mt-0.5">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>
      <span className="text-sm text-gray-600 leading-snug group-hover:text-gray-900 select-none">
        {children}
      </span>
    </label>
  );
}
