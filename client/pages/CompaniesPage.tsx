import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Building2,
  ArrowRight,
  Loader2,
  AlertCircle,
  Briefcase,
  FolderOpen,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export function CompaniesPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formIndustry, setFormIndustry] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContactInfo, setFormContactInfo] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const companiesQuery = trpc.company.list.useQuery();

  const createMutation = trpc.company.create.useMutation({
    onSuccess: () => {
      utils.company.list.invalidate();
      setDialogOpen(false);
      resetForm();
    },
    onError: (err) => {
      setCreateError(err.message || "Не удалось создать компанию");
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormIndustry("");
    setFormDescription("");
    setFormContactInfo("");
    setCreateError(null);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!formName.trim()) {
      setCreateError("Введите название компании");
      return;
    }
    if (!formIndustry.trim()) {
      setCreateError("Введите отрасль");
      return;
    }

    createMutation.mutate({
      name: formName.trim(),
      industry: formIndustry.trim(),
      description: formDescription.trim() || undefined,
      contactInfo: formContactInfo.trim() || undefined,
    });
  };

  const companies = companiesQuery.data ?? [];

  if (companiesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Мои компании</h1>
          <p className="text-gray-500 mt-1">
            Управляйте компаниями и их бизнес-процессами
          </p>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4" />
              Создать компанию
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новая компания</DialogTitle>
              <DialogDescription>
                Заполните информацию о компании для создания бизнес-процессов
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="company-name">Название компании *</Label>
                <Input
                  id="company-name"
                  placeholder="ООО Ромашка"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={createMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-industry">Отрасль *</Label>
                <Input
                  id="company-industry"
                  placeholder="Розничная торговля"
                  value={formIndustry}
                  onChange={(e) => setFormIndustry(e.target.value)}
                  disabled={createMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-description">Описание</Label>
                <Textarea
                  id="company-description"
                  placeholder="Краткое описание деятельности компании..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  disabled={createMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-contact">Контактная информация</Label>
                <Input
                  id="company-contact"
                  placeholder="Телефон, email, адрес..."
                  value={formContactInfo}
                  onChange={(e) => setFormContactInfo(e.target.value)}
                  disabled={createMutation.isPending}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Создание...
                    </>
                  ) : (
                    "Создать"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Companies grid */}
      {companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Нет компаний
          </h3>
          <p className="text-gray-500 mb-6 max-w-sm">
            Создайте первую компанию, чтобы начать строить бизнес-процессы с
            помощью ИИ
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Создать компанию
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <Card
              key={company.id}
              className="group cursor-pointer hover:border-purple-300 hover:shadow-md transition-all"
              onClick={() => navigate(`/companies/${company.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-purple-600" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-purple-500 transition-colors" />
                </div>
                <CardTitle className="text-lg mt-3">{company.name}</CardTitle>
                <CardDescription>
                  <Badge variant="secondary" className="mt-1">
                    <Briefcase className="w-3 h-3 mr-1" />
                    {company.industry}
                  </Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {company.description ? (
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {company.description}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    Нет описания
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-3">
                  Создана {formatDate(company.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
