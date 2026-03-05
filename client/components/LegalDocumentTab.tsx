import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toaster";
import {
  Scale,
  Save,
  Loader2,
  Plus,
  Trash2,
  Download,
  FileText,
  Building2,
  Sparkles,
  ChevronRight,
  AlertCircle,
  Upload,
  ImageIcon,
  FileDown,
  Printer,
} from "lucide-react";
import type { LegalDocType, CompanyRequisites, LegalDocument } from "@shared/types";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from "docx";
import { useAuth } from "@/lib/auth";

// ─── Types & constants ────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<LegalDocType, string> = {
  letter: "📄 Деловое письмо / уведомление",
  claim_response: "⚠️ Ответ на претензию",
  claim: "🔔 Претензия / требование",
  dispute_protocol: "⚖️ Протокол разногласий",
  contract_analysis: "🔍 Анализ договора на риски",
  contract_edit: "✏️ Юридическая правка договора",
  complaint: "📋 Жалоба в контролирующий орган",
};

const DOC_TYPE_TEMPLATES: Record<LegalDocType, string> = {
  letter: `Составь деловое письмо / уведомление.

Роль нашей компании:   [Подрядчик / Заказчик / Исполнитель / другое]
Адресат:               [должность, ФИО, организация]
Договор:               № [номер] от [дата], предмет: [краткое описание]
Суть письма:           [что сообщаем / уведомляем / запрашиваем]
Ключевые факты:        [хронология, суммы, ссылки на пункты договора]
Что должен сделать адресат и в какой срок: [конкретное действие и дедлайн]
Приложения:            [перечень, если есть]`,

  claim_response: `Составь ответ на претензию.

Роль нашей компании:       [Подрядчик / Заказчик / Исполнитель]
Претензия:                 № [номер] от [дата], от [организация]
Суть претензии:            [что требует контрагент, сумма, основание]
Договор:                   № [номер] от [дата]
Наша позиция:              [претензия необоснована / частично обоснована — почему]
Наши доказательства:       [письма, акты, уведомления с датами и номерами]
Нарушения другой стороны:  [если задержка / проблема возникла по вине контрагента]
Наше предложение:          [отказать / урегулировать / частично удовлетворить]`,

  claim: `Составь претензию (требование) к контрагенту.

Роль нашей компании:   [Заказчик / Подрядчик / другое]
Контрагент:            [наименование, адрес]
Договор:               № [номер] от [дата], предмет: [описание]
Нарушение:             [нарушение сроков / качества / неоплата / иное]
Факты:                 [конкретные даты, суммы, объёмы]
Договорная ответственность: [пункт договора о неустойке, размер]
Расчёт санкций:        [сумма × ставка × дней = итог]
Требование:            [что должен сделать контрагент и в какой срок]
Последствия неисполнения: [судебный порядок / расторжение / регресс]`,

  dispute_protocol: `Составь протокол разногласий к проекту договора.

Роль нашей компании:  [Подрядчик / Заказчик]
Договор:              [наименование, номер, дата, стороны]

Спорные пункты:

Пункт [X.X]:
— Редакция договора:    "[текст как есть]"
— Наша редакция:        "[предлагаемый текст]"
— Обоснование правки:   [почему наша редакция справедливее]

Пункт [X.X]: [аналогично]`,

  contract_analysis: `Проанализируй договор и выяви риски для нашей компании.

Роль нашей компании: [Подрядчик / Заказчик / Поставщик / Исполнитель]

[ВСТАВИТЬ ТЕКСТ ДОГОВОРА ИЛИ КЛЮЧЕВЫЕ ПУНКТЫ]

Особое внимание:
□ Одностороннее изменение ТЗ, объёмов, условий
□ Размер, порядок начисления и предел неустойки
□ Условия авансирования и порядок оплаты
□ Основания для одностороннего расторжения
□ Ответственность за задержки по вине другой стороны
□ Претензионный порядок и подсудность`,

  contract_edit: `Внеси юридические правки в договор в интересах нашей компании.

Роль нашей компании: [Подрядчик / Заказчик / Исполнитель]

[ВСТАВИТЬ ТЕКСТ ДОГОВОРА ИЛИ КОНКРЕТНЫЕ ПУНКТЫ]

Задачи правки:
□ Сбалансировать ответственность сторон
□ Ограничить неустойку (не более 0,1% в день / не более 10% от цены)
□ Привязать начало сроков к авансированию
□ Добавить основания продления сроков
□ Добавить право приостановить работы при задержке оплаты (ст. 719 ГК РФ)`,

  complaint: `Составь жалобу в контролирующий орган.

Орган:               [УФАС / прокуратура / ФАС / Роспотребнадзор / иной]
Нарушитель:          [наименование организации, ИНН]
Основание:           [номер закупки / договора / иного документа]
Нарушение:           [конкретная норма закона и в чём выразилось нарушение]
Факты:               [хронология событий]
Правовое обоснование: [нормы 44-ФЗ / 223-ФЗ / ГК РФ / иного закона]
Требование:          [признать незаконным / обязать пересмотреть / выдать предписание]`,
};

const REQUISITES_FIELDS: { key: keyof CompanyRequisites; label: string; placeholder: string }[] = [
  { key: "fullName", label: "Полное наименование", placeholder: "ООО «Название компании»" },
  { key: "shortName", label: "Краткое наименование", placeholder: "ООО «Название»" },
  { key: "legalAddress", label: "Юридический адрес", placeholder: "123456, г. Москва, ул. ..." },
  { key: "inn", label: "ИНН", placeholder: "1234567890" },
  { key: "kpp", label: "КПП", placeholder: "123456789" },
  { key: "ogrn", label: "ОГРН", placeholder: "1234567890123" },
  { key: "bankAccount", label: "Расчётный счёт (р/с)", placeholder: "40702810..." },
  { key: "bik", label: "БИК банка", placeholder: "044525..." },
  { key: "corrAccount", label: "Корреспондентский счёт", placeholder: "30101810..." },
  { key: "bankName", label: "Наименование банка", placeholder: "ПАО Сбербанк" },
  { key: "signatoryTitle", label: "Должность подписанта", placeholder: "Генеральный директор" },
  { key: "signatoryName", label: "ФИО подписанта", placeholder: "Иванов Иван Иванович" },
  { key: "phone", label: "Телефон", placeholder: "+7 (495) 123-45-67" },
  { key: "email", label: "Email", placeholder: "info@company.ru" },
];

// ─── DOCX export helper ───────────────────────────────────────────────────────

async function exportToDocx(title: string, content: string, requisites: CompanyRequisites | null) {
  const paragraphs: Paragraph[] = [];

  // Header with company info if requisites available
  if (requisites?.fullName) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: requisites.fullName, bold: true, size: 20 })],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 40 },
      })
    );
    if (requisites.legalAddress) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: requisites.legalAddress, size: 18 })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 40 },
        })
      );
    }
    if (requisites.inn || requisites.ogrn) {
      const parts = [];
      if (requisites.inn) parts.push(`ИНН: ${requisites.inn}`);
      if (requisites.ogrn) parts.push(`ОГРН: ${requisites.ogrn}`);
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: parts.join(" | "), size: 18 })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 200 },
        })
      );
    }
    // Separator line
    paragraphs.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" } },
        spacing: { after: 200 },
      })
    );
  }

  // Document content
  const lines = content.split("\n");
  let isFirst = true;
  for (const line of lines) {
    const trimmed = line.trim();
    if (isFirst && trimmed) {
      paragraphs.push(
        new Paragraph({
          text: trimmed,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      );
      isFirst = false;
    } else {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed || " ", size: 24, font: "Times New Roman" })],
          spacing: { after: 80 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1800 },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.slice(0, 80)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF print helper ─────────────────────────────────────────────────────────

function printToPdf(title: string, content: string, requisites: CompanyRequisites | null, letterheadUrl?: string | null) {
  const headerHtml = requisites?.fullName
    ? `<div style="text-align:right;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:16px;font-size:11pt">
        <strong>${requisites.fullName}</strong><br/>
        ${requisites.legalAddress ? `${requisites.legalAddress}<br/>` : ""}
        ${[
          requisites.inn ? `ИНН: ${requisites.inn}` : "",
          requisites.ogrn ? `ОГРН: ${requisites.ogrn}` : "",
          requisites.phone ? `Тел: ${requisites.phone}` : "",
        ].filter(Boolean).join(" &nbsp;|&nbsp; ")}
      </div>`
    : "";

  const letterheadImg = letterheadUrl
    ? `<div style="text-align:center;margin-bottom:16px"><img src="${letterheadUrl}" style="max-width:100%;max-height:120px;object-fit:contain" /></div>`
    : "";

  const contentHtml = content
    .split("\n")
    .map((line) => `<p style="margin:4px 0;font-size:12pt;font-family:'Times New Roman',serif">${line || "&nbsp;"}</p>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 25mm 20mm 20mm 30mm; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; }
    h1 { font-size: 14pt; text-align: center; margin: 12pt 0; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  ${letterheadImg}
  ${headerHtml}
  ${contentHtml}
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) { toast({ title: "Ошибка", description: "Не удалось открыть окно печати. Разрешите всплывающие окна." }); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

// ─── Requisites Form ──────────────────────────────────────────────────────────

interface RequisitesFormProps {
  companyId: number;
}

function RequisitesForm({ companyId }: RequisitesFormProps) {
  const utils = trpc.useUtils();
  const { data: savedRequisites, isLoading } = trpc.legalDocuments.getRequisites.useQuery({ companyId });
  const saveMutation = trpc.legalDocuments.saveRequisites.useMutation({
    onSuccess: () => {
      utils.legalDocuments.getRequisites.invalidate({ companyId });
      toast({ title: "Реквизиты сохранены" });
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [letterheadUrl, setLetterheadUrl] = useState<string | null>(null);

  // Initialize form from saved data
  if (savedRequisites && !initialized) {
    const initial: Record<string, string> = {};
    REQUISITES_FIELDS.forEach(({ key }) => {
      initial[key] = (savedRequisites as any)[key] ?? "";
    });
    setForm(initial);
    setLetterheadUrl(savedRequisites.letterheadUrl ?? null);
    setInitialized(true);
  }

  const handleSave = () => {
    const data: Record<string, string | null> = {};
    REQUISITES_FIELDS.forEach(({ key }) => {
      data[key] = form[key] || null;
    });
    data.letterheadUrl = letterheadUrl;
    saveMutation.mutate({ companyId, data: data as any });
  };

  const handleLetterheadUpload = async (file: File) => {
    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("companyId", String(companyId));
      const res = await fetch("/api/company/letterhead", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const json = await res.json();
      setLetterheadUrl(json.url);
      toast({ title: "Фирменный бланк загружен" });
    } catch {
      toast({ title: "Ошибка загрузки файла" });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Letterhead */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Фирменный бланк
          </CardTitle>
          <CardDescription className="text-xs">
            Логотип или шапка компании для оформления документов
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {letterheadUrl ? (
              <div className="border rounded-lg p-2 bg-muted/30">
                <img src={letterheadUrl} alt="Бланк" className="h-16 object-contain max-w-xs" />
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-4 flex items-center gap-3 text-muted-foreground text-sm w-56 justify-center">
                <ImageIcon className="h-5 w-5" />
                Нет бланка
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLetterheadUpload(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                {letterheadUrl ? "Заменить" : "Загрузить"}
              </Button>
              {letterheadUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setLetterheadUrl(null)}
                >
                  Удалить
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requisites fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Реквизиты компании
          </CardTitle>
          <CardDescription className="text-xs">
            Используются при генерации юридических документов
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {REQUISITES_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key} className={cn(
                key === "fullName" || key === "legalAddress" ? "col-span-2" : ""
              )}>
                <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                <Input
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Сохранить реквизиты
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Create Document Form ─────────────────────────────────────────────────────

interface CreateDocFormProps {
  companyId: number;
  onGenerated: (doc: LegalDocument) => void;
}

function CreateDocForm({ companyId, onGenerated }: CreateDocFormProps) {
  const [docType, setDocType] = useState<LegalDocType>("letter");
  const [prompt, setPrompt] = useState(DOC_TYPE_TEMPLATES.letter);

  const generateMutation = trpc.legalDocuments.generate.useMutation({
    onSuccess: (doc) => {
      onGenerated(doc);
      toast({ title: "Документ готов", description: doc.title });
    },
    onError: (e) => toast({ title: "Ошибка", description: e.message }),
  });

  const handleTypeChange = (type: LegalDocType) => {
    setDocType(type);
    setPrompt(DOC_TYPE_TEMPLATES[type]);
  };

  return (
    <div className="space-y-4">
      {/* Quick commands row */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Быстрые команды</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(DOC_TYPE_LABELS) as [LegalDocType, string][]).map(([type, label]) => (
            <button
              key={type}
              className={cn(
                "text-xs px-2.5 py-1 rounded border transition-colors",
                docType === type
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              )}
              onClick={() => handleTypeChange(type)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Doc type select */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Тип документа</label>
        <Select value={docType} onValueChange={(v) => handleTypeChange(v as LegalDocType)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(DOC_TYPE_LABELS) as [LegalDocType, string][]).map(([type, label]) => (
              <SelectItem key={type} value={type}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Prompt */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-muted-foreground">Данные для документа</label>
          <span className="text-xs text-muted-foreground">Заполните поля в [скобках]</span>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[260px] text-sm font-mono resize-y"
          placeholder="Опишите задачу или заполните шаблон выше..."
        />
      </div>

      {/* Token info + Generate button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Стоимость: <strong className="text-foreground">100 токенов</strong></span>
        </div>
        <Button
          onClick={() => generateMutation.mutate({ companyId, type: docType, prompt })}
          disabled={generateMutation.isPending || prompt.trim().length < 10}
          className="gap-1.5"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generateMutation.isPending ? "Генерирую..." : "Создать документ"}
        </Button>
      </div>
    </div>
  );
}

// ─── Document Viewer ──────────────────────────────────────────────────────────

interface DocViewerProps {
  doc: LegalDocument;
  requisites: CompanyRequisites | null;
  onDelete: () => void;
}

function DocViewer({ doc, requisites, onDelete }: DocViewerProps) {
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs">
          {DOC_TYPE_LABELS[doc.type]}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date(doc.createdAt).toLocaleDateString("ru-RU")}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => exportToDocx(doc.title, doc.content, requisites)}
        >
          <FileDown className="h-3.5 w-3.5" />
          DOCX
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => printToPdf(doc.title, doc.content, requisites, requisites?.letterheadUrl)}
        >
          <Printer className="h-3.5 w-3.5" />
          PDF
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
              <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={onDelete}>
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Letterhead preview */}
      {requisites?.letterheadUrl && (
        <div className="flex justify-center border-b pb-3">
          <img src={requisites.letterheadUrl} alt="Бланк" className="max-h-20 object-contain" />
        </div>
      )}

      {/* Company header if requisites */}
      {requisites?.fullName && (
        <div className="text-right text-sm border-b pb-3 space-y-0.5">
          <p className="font-semibold">{requisites.fullName}</p>
          {requisites.legalAddress && <p className="text-xs text-muted-foreground">{requisites.legalAddress}</p>}
          <p className="text-xs text-muted-foreground">
            {[
              requisites.inn ? `ИНН: ${requisites.inn}` : "",
              requisites.ogrn ? `ОГРН: ${requisites.ogrn}` : "",
            ].filter(Boolean).join("  |  ")}
          </p>
        </div>
      )}

      {/* Document content */}
      <div className="bg-white dark:bg-card border rounded-lg p-6 shadow-sm">
        <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
          {doc.content}
        </pre>
      </div>
    </div>
  );
}

// ─── Documents List ───────────────────────────────────────────────────────────

interface DocsListProps {
  companyId: number;
  requisites: CompanyRequisites | null;
  onView: (doc: LegalDocument) => void;
}

function DocsList({ companyId, requisites, onView }: DocsListProps) {
  const utils = trpc.useUtils();
  const { data: docs = [], isLoading } = trpc.legalDocuments.listDocuments.useQuery({ companyId });
  const deleteMutation = trpc.legalDocuments.delete.useMutation({
    onSuccess: () => utils.legalDocuments.listDocuments.invalidate({ companyId }),
  });

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
        <div className="p-4 rounded-full bg-muted">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Нет сохранённых документов</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
          onClick={() => onView(doc)}
        >
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{doc.title}</p>
            <p className="text-xs text-muted-foreground">
              {DOC_TYPE_LABELS[doc.type]} · {new Date(doc.createdAt).toLocaleDateString("ru-RU")}
            </p>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); exportToDocx(doc.title, doc.content, requisites); }}
            >
              <FileDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); printToPdf(doc.title, doc.content, requisites, requisites?.letterheadUrl); }}
            >
              <Printer className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
                  <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate({ id: doc.id })}
                  >
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface LegalDocumentTabProps {
  companyId: number;
}

export function LegalDocumentTab({ companyId }: LegalDocumentTabProps) {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"create" | "documents" | "requisites">("create");
  const [viewingDoc, setViewingDoc] = useState<LegalDocument | null>(null);

  const { data: requisites } = trpc.legalDocuments.getRequisites.useQuery({ companyId });
  const deleteMutation = trpc.legalDocuments.delete.useMutation({
    onSuccess: () => {
      utils.legalDocuments.listDocuments.invalidate({ companyId });
      setViewingDoc(null);
    },
  });

  const handleGenerated = (doc: LegalDocument) => {
    utils.legalDocuments.listDocuments.invalidate({ companyId });
    setViewingDoc(doc);
    setActiveTab("documents");
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {([
          ["create", <><Sparkles className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />Создать документ</>],
          ["documents", <><FileText className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />Мои документы</>],
          ["requisites", <><Building2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />Реквизиты и бланк</>],
        ] as [string, React.ReactNode][]).map(([tab, label]) => (
          <button
            key={tab}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => { setActiveTab(tab as any); setViewingDoc(null); }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Create tab */}
      {activeTab === "create" && (
        <div className="grid grid-cols-[1fr_auto] gap-6">
          <CreateDocForm companyId={companyId} onGenerated={handleGenerated} />
          <div className="w-56 shrink-0">
            <Card className="bg-muted/30">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Scale className="h-4 w-4 text-primary" />
                  Юридический ИИ
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ассистент готовит официально-деловые документы с ссылками на нормы ГК РФ, защищая интересы вашей компании.
                </p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Что умеет:</p>
                  {["Претензии и ответы", "Протоколы разногласий", "Анализ договоров", "Правка договоров", "Деловые письма", "Жалобы в органы"].map((item) => (
                    <div key={item} className="flex items-center gap-1.5">
                      <div className="h-1 w-1 rounded-full bg-primary shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                {!requisites?.fullName && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Рекомендуем заполнить реквизиты компании — они будут автоматически добавлены в документы.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full h-7 text-xs"
                      onClick={() => setActiveTab("requisites")}
                    >
                      Заполнить реквизиты
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Documents tab */}
      {activeTab === "documents" && (
        viewingDoc ? (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setViewingDoc(null)}
            >
              ← К списку документов
            </Button>
            <DocViewer
              doc={viewingDoc}
              requisites={requisites ?? null}
              onDelete={() => deleteMutation.mutate({ id: viewingDoc.id })}
            />
          </div>
        ) : (
          <DocsList
            companyId={companyId}
            requisites={requisites ?? null}
            onView={setViewingDoc}
          />
        )
      )}

      {/* Requisites tab */}
      {activeTab === "requisites" && <RequisitesForm companyId={companyId} />}
    </div>
  );
}
