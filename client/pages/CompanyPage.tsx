import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  Plus,
  FileText,
  GitBranch,
  Info,
  Trash2,
  Zap,
  Clock,
  Download,
  CheckCircle2,
  Archive,
  PenLine,
  Save,
} from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { InterviewMode } from "@shared/types";

export function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const companyId = Number(id);

  // --- Data queries ---
  const companyQuery = trpc.company.getById.useQuery(
    { id: companyId },
    { enabled: !!id }
  );
  const processesQuery = trpc.company.getProcesses.useQuery(
    { companyId },
    { enabled: !!id }
  );
  const documentsQuery = trpc.company.getDocuments.useQuery(
    { companyId },
    { enabled: !!id }
  );
  const interviewsQuery = trpc.interview.listByCompany.useQuery(
    { companyId },
    { enabled: !!id }
  );

  // --- Create interview ---
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [interviewMode, setInterviewMode] = useState<InterviewMode>("full");

  const createInterviewMutation = trpc.interview.create.useMutation({
    onSuccess: (data) => {
      setInterviewDialogOpen(false);
      navigate(`/interview/${data.id}`);
    },
  });

  const handleCreateInterview = () => {
    createInterviewMutation.mutate({
      companyId,
      mode: interviewMode,
    });
  };

  // --- Delete process ---
  const deleteProcessMutation = trpc.process.delete.useMutation({
    onSuccess: () => {
      utils.company.getProcesses.invalidate({ companyId });
    },
  });

  const handleDeleteProcess = (processId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.confirm("Вы уверены, что хотите удалить этот процесс?")) {
      deleteProcessMutation.mutate({ id: processId });
    }
  };

  // --- Edit company ---
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editContactInfo, setEditContactInfo] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const updateCompanyMutation = trpc.company.update.useMutation({
    onSuccess: () => {
      utils.company.getById.invalidate({ id: companyId });
      utils.company.list.invalidate();
      setIsEditing(false);
      setEditError(null);
    },
    onError: (err) => {
      setEditError(err.message || "Не удалось обновить компанию");
    },
  });

  const startEditing = () => {
    if (company) {
      setEditName(company.name);
      setEditIndustry(company.industry);
      setEditDescription(company.description ?? "");
      setEditContactInfo(company.contactInfo ?? "");
      setEditError(null);
      setIsEditing(true);
    }
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!editName.trim()) {
      setEditError("Название компании обязательно");
      return;
    }
    if (!editIndustry.trim()) {
      setEditError("Отрасль обязательна");
      return;
    }

    updateCompanyMutation.mutate({
      id: companyId,
      name: editName.trim(),
      industry: editIndustry.trim(),
      description: editDescription.trim() || undefined,
      contactInfo: editContactInfo.trim() || undefined,
    });
  };

  const company = companyQuery.data;
  const processes = processesQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const interviews = interviewsQuery.data ?? [];

  // --- Status helpers ---
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    draft: { label: "Черновик", variant: "secondary" },
    active: { label: "Активный", variant: "default" },
    archived: { label: "Архив", variant: "outline" },
    completed: { label: "Завершено", variant: "default" },
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] ?? {
      label: status,
      variant: "secondary" as const,
    };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "archived":
        return <Archive className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  // --- Loading / Error ---
  if (companyQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (companyQuery.error || !company) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Компания не найдена
        </h2>
        <p className="text-gray-500 mb-6">
          Компания не существует или у вас нет доступа
        </p>
        <Button variant="outline" onClick={() => navigate("/companies")}>
          <ArrowLeft className="w-4 h-4" />
          К списку компаний
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb + header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/companies")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Все компании
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {company.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{company.industry}</Badge>
              <span className="text-sm text-gray-400">
                Обновлена {formatDate(company.updatedAt)}
              </span>
            </div>
          </div>

          {/* Create process button */}
          <Dialog
            open={interviewDialogOpen}
            onOpenChange={setInterviewDialogOpen}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4" />
                Создать процесс
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Новый бизнес-процесс</DialogTitle>
                <DialogDescription>
                  Выберите режим интервью для создания бизнес-процесса
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Режим интервью</Label>
                  <Select
                    value={interviewMode}
                    onValueChange={(v) =>
                      setInterviewMode(v as InterviewMode)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">
                        Полный режим (~30 мин)
                      </SelectItem>
                      <SelectItem value="express">
                        Экспресс режим (~15 мин)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div
                    className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                      interviewMode === "full"
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setInterviewMode("full")}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <GitBranch className="w-4 h-4 text-purple-600" />
                      <span className="font-medium text-gray-900">
                        Полный режим
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Детальное интервью из 7 блоков вопросов. Рекомендуется для
                      первого использования.
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                      interviewMode === "express"
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setInterviewMode("express")}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="font-medium text-gray-900">
                        Экспресс режим
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Сокращённое интервью с ключевыми вопросами. Быстрый
                      результат за 15 минут.
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setInterviewDialogOpen(false)}
                  disabled={createInterviewMutation.isPending}
                >
                  Отмена
                </Button>
                <Button
                  onClick={handleCreateInterview}
                  disabled={createInterviewMutation.isPending}
                >
                  {createInterviewMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Создание...
                    </>
                  ) : (
                    "Начать интервью"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="processes">
        <TabsList className="mb-6">
          <TabsTrigger value="processes" className="gap-1.5">
            <GitBranch className="w-4 h-4" />
            Процессы
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="w-4 h-4" />
            Документы
          </TabsTrigger>
          <TabsTrigger value="info" className="gap-1.5">
            <Info className="w-4 h-4" />
            Информация
          </TabsTrigger>
        </TabsList>

        {/* ===== PROCESSES TAB ===== */}
        <TabsContent value="processes">
          {processesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
            </div>
          ) : processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <GitBranch className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Нет процессов
              </h3>
              <p className="text-gray-500 mb-6 max-w-sm">
                Создайте бизнес-процесс, пройдя интервью с ИИ-ассистентом
              </p>
              <Button onClick={() => setInterviewDialogOpen(true)}>
                <Plus className="w-4 h-4" />
                Создать процесс
              </Button>

              {/* Show pending interviews if any */}
              {interviews.length > 0 && (
                <div className="mt-8 w-full max-w-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Незавершённые интервью
                  </h4>
                  <div className="space-y-2">
                    {interviews
                      .filter((i) => i.status === "draft")
                      .map((interview) => (
                        <Card
                          key={interview.id}
                          className="cursor-pointer hover:border-purple-300 transition-colors"
                          onClick={() =>
                            navigate(`/interview/${interview.id}`)
                          }
                        >
                          <CardContent className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                              <Clock className="w-4 h-4 text-yellow-500" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  Интервью ({interview.mode === "full" ? "полный" : "экспресс"})
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDateTime(interview.createdAt)} --{" "}
                                  {interview.completionPercent}% завершено
                                </p>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm">
                              Продолжить
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {processes.map((process) => (
                <Card
                  key={process.id}
                  className="hover:border-purple-300 hover:shadow-sm transition-all"
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <Link
                      to={`/process/${process.id}`}
                      className="flex items-center gap-4 flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getStatusIcon(process.status)}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {process.data?.name || `Процесс #${process.id}`}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {getStatusBadge(process.status)}
                            <span className="text-xs text-gray-400">
                              {formatDate(process.createdAt)}
                            </span>
                            {process.data?.roles && (
                              <span className="text-xs text-gray-400">
                                {process.data.roles.length} ролей
                              </span>
                            )}
                            {process.data?.blocks && (
                              <span className="text-xs text-gray-400">
                                {process.data.blocks.length} шагов
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>

                    <div className="flex items-center gap-1 ml-4 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                      >
                        <Link to={`/process/${process.id}`}>
                          <GitBranch className="w-4 h-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDeleteProcess(process.id, e)}
                        disabled={deleteProcessMutation.isPending}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Pending interviews section */}
              {interviews.filter((i) => i.status === "draft").length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Незавершённые интервью
                  </h4>
                  <div className="space-y-2">
                    {interviews
                      .filter((i) => i.status === "draft")
                      .map((interview) => (
                        <Card
                          key={interview.id}
                          className="cursor-pointer hover:border-yellow-300 transition-colors border-dashed"
                          onClick={() =>
                            navigate(`/interview/${interview.id}`)
                          }
                        >
                          <CardContent className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                              <Clock className="w-4 h-4 text-yellow-500" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  Интервью ({interview.mode === "full" ? "полный" : "экспресс"} режим)
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDateTime(interview.createdAt)} -- {interview.completionPercent}% завершено
                                </p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm">
                              Продолжить
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ===== DOCUMENTS TAB ===== */}
        <TabsContent value="documents">
          {documentsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Нет документов
              </h3>
              <p className="text-gray-500 max-w-sm">
                Документы появятся после генерации бизнес-процессов
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {doc.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-xs">
                            {doc.fileType}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            {(doc.fileSize / 1024).toFixed(1)} КБ
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDate(doc.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {doc.fileUrl && (
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== INFO TAB ===== */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Информация о компании</CardTitle>
                {!isEditing && (
                  <Button variant="outline" size="sm" onClick={startEditing}>
                    <PenLine className="w-4 h-4" />
                    Редактировать
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <form onSubmit={handleSaveCompany} className="space-y-4">
                  {editError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{editError}</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Название *</Label>
                    <Input
                      id="edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={updateCompanyMutation.isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-industry">Отрасль *</Label>
                    <Input
                      id="edit-industry"
                      value={editIndustry}
                      onChange={(e) => setEditIndustry(e.target.value)}
                      disabled={updateCompanyMutation.isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Описание</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                      disabled={updateCompanyMutation.isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-contact">
                      Контактная информация
                    </Label>
                    <Input
                      id="edit-contact"
                      value={editContactInfo}
                      onChange={(e) => setEditContactInfo(e.target.value)}
                      disabled={updateCompanyMutation.isPending}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      type="submit"
                      disabled={updateCompanyMutation.isPending}
                    >
                      {updateCompanyMutation.isPending ? (
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
                      onClick={() => setIsEditing(false)}
                      disabled={updateCompanyMutation.isPending}
                    >
                      Отмена
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">
                        Название
                      </p>
                      <p className="text-gray-900">{company.name}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">
                        Отрасль
                      </p>
                      <p className="text-gray-900">{company.industry}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-sm font-medium text-gray-500 mb-1">
                        Описание
                      </p>
                      <p className="text-gray-900">
                        {company.description || (
                          <span className="text-gray-400 italic">
                            Не указано
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">
                        Контактная информация
                      </p>
                      <p className="text-gray-900">
                        {company.contactInfo || (
                          <span className="text-gray-400 italic">
                            Не указана
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">
                        Дата создания
                      </p>
                      <p className="text-gray-900">
                        {formatDateTime(company.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Stats summary */}
                  <div className="border-t border-gray-100 pt-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                      Статистика
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-gray-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-purple-600">
                          {processes.length}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Процессов</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-blue-600">
                          {documents.length}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Документов
                        </p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-yellow-600">
                          {interviews.length}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Интервью</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
