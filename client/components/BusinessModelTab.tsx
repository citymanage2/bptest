/**
 * BusinessModelTab — financial model (P&L reverse planning) + Osterwalder BMC canvas
 * Shown inside CompanyPage as a separate tab.
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  BarChart3,
  LayoutGrid,
  ClipboardList,
  Save,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/toaster";
import type {
  BusinessModelInput,
  BusinessModelOutput,
  BmCostLine,
  FinancialMode,
  MoneyUnit,
  DealsRounding,
  BusinessModelCanvasInput,
} from "@shared/types";

// ─────────────────────────────────────────
// Constants / defaults
// ─────────────────────────────────────────

const MONTH_NAMES = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

const YEAR = new Date().getFullYear();

const DEFAULT_COST_LINES: BmCostLine[] = [
  { name: "Переменные расходы", percent: 65 },
  { name: "ФОТ", percent: 16 },
  { name: "Постоянные", percent: 3 },
  { name: "Налоги", percent: 2.5 },
  { name: "Проценты", percent: 0 },
  { name: "Дивиденды", percent: 4 },
];

const DEFAULT_INPUT: BusinessModelInput = {
  year: YEAR,
  mode: "REVENUE_DIRECT",
  rounding: { money_unit: "THOUSAND", deals: "ROUND", avg_ticket_unit: "THOUSAND" },
  tolerance: { avg_ticket_vs_deals_pct: 2.0 },
  target_profit_pct: null,
  cost_lines: DEFAULT_COST_LINES,
  dividends_needed_by_month: null,
  revenue_plan_by_month: Array(12).fill(null),
  profit_needed_by_month: null,
  deals_count_by_month: null,
  avg_ticket_by_month: null,
  canvas: {
    company_name: null,
    industry: null,
    geography: [],
    b2b_b2c: null,
    customer_segments: [],
    value_propositions: [],
    channels: [],
    customer_relationships: [],
    revenue_streams: [],
    key_resources: [],
    key_activities: [],
    key_partners: [],
    cost_structure: [],
    notes: null,
  },
};

function cloneInput(inp: BusinessModelInput): BusinessModelInput {
  return JSON.parse(JSON.stringify(inp));
}

// ─────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────

function formatMoney(v: number, unit: MoneyUnit): string {
  if (unit === "MILLION") return `${(v / 1_000_000).toFixed(2)} М`;
  if (unit === "THOUSAND") return `${(v / 1_000).toFixed(1)} тыс.`;
  return v.toFixed(0);
}

function pct(v: number) {
  return `${v.toFixed(1)}%`;
}

// ─────────────────────────────────────────
// Tag input component
// ─────────────────────────────────────────

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setDraft("");
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
          placeholder={placeholder ?? "Добавить..."}
          className="text-sm h-8"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} className="h-8 px-2">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
              {tag}
              <button type="button" onClick={() => remove(i)}>
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Month table row editor
// ─────────────────────────────────────────

function MonthRow({
  monthIdx,
  value,
  onChange,
  label,
}: {
  monthIdx: number;
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-xs font-medium text-gray-500">{MONTH_NAMES[monthIdx]}</span>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : parseFloat(e.target.value))
        }
        placeholder={label}
        className="h-7 text-sm flex-1"
      />
    </div>
  );
}

// ─────────────────────────────────────────
// Main component
// ─────────────────────────────────────────

interface Props {
  companyId: number;
  processCount: number; // must be > 0 to create
}

export function BusinessModelTab({ companyId, processCount }: Props) {
  const utils = trpc.useUtils();

  // ── List of saved models ──────────────────
  const listQuery = trpc.businessModel.listByCompany.useQuery(
    { companyId },
    { enabled: true }
  );
  const models = listQuery.data ?? [];

  // ── Active model selection ────────────────
  const [activeId, setActiveId] = useState<number | null>(null);
  const activeModel = models.find((m) => m.id === activeId) ?? null;

  // ── Form state ────────────────────────────
  const [formInput, setFormInput] = useState<BusinessModelInput>(cloneInput(DEFAULT_INPUT));
  const [modelName, setModelName] = useState("Бизнес-модель 1");
  const [previewOutput, setPreviewOutput] = useState<BusinessModelOutput | null>(null);
  const [innerTab, setInnerTab] = useState<"form" | "finance" | "canvas">("form");
  const [showMonthlyInputs, setShowMonthlyInputs] = useState(true);

  // ── Mutations ─────────────────────────────
  const previewMutation = trpc.businessModel.preview.useMutation({
    onSuccess: (data) => {
      setPreviewOutput(data as BusinessModelOutput);
      setInnerTab("finance");
    },
    onError: (err) => toast({ title: "Ошибка расчёта", description: err.message, variant: "destructive" }),
  });

  const createMutation = trpc.businessModel.create.useMutation({
    onSuccess: (data) => {
      toast({ title: "Бизнес-модель сохранена" });
      utils.businessModel.listByCompany.invalidate({ companyId });
      setActiveId(data.id);
      setPreviewOutput(data.output as BusinessModelOutput);
    },
    onError: (err) => toast({ title: "Ошибка", description: err.message, variant: "destructive" }),
  });

  const updateMutation = trpc.businessModel.update.useMutation({
    onSuccess: (data) => {
      toast({ title: "Обновлено" });
      utils.businessModel.listByCompany.invalidate({ companyId });
      setPreviewOutput(data.output as BusinessModelOutput);
    },
    onError: (err) => toast({ title: "Ошибка", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.businessModel.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Удалено" });
      utils.businessModel.listByCompany.invalidate({ companyId });
      setActiveId(null);
      setPreviewOutput(null);
      setFormInput(cloneInput(DEFAULT_INPUT));
      setModelName("Бизнес-модель 1");
    },
    onError: (err) => toast({ title: "Ошибка", description: err.message, variant: "destructive" }),
  });

  // ── Load model into form ──────────────────
  const loadModel = useCallback(
    (id: number) => {
      const m = models.find((x) => x.id === id);
      if (!m) return;
      setActiveId(id);
      setModelName(m.name);
      setFormInput(cloneInput(m.input as BusinessModelInput));
      setPreviewOutput(m.output as BusinessModelOutput);
      setInnerTab("finance");
    },
    [models]
  );

  // ── Form helpers ──────────────────────────
  const setArr = (
    field: "dividends_needed_by_month" | "revenue_plan_by_month" | "profit_needed_by_month" | "deals_count_by_month" | "avg_ticket_by_month",
    idx: number,
    val: number | null
  ) => {
    setFormInput((prev) => {
      const next = cloneInput(prev);
      if (!next[field]) next[field] = Array(12).fill(null);
      (next[field] as (number | null)[])[idx] = val;
      return next;
    });
  };

  const enableField = (
    field: "dividends_needed_by_month" | "revenue_plan_by_month" | "profit_needed_by_month" | "deals_count_by_month" | "avg_ticket_by_month",
    enable: boolean
  ) => {
    setFormInput((prev) => ({
      ...cloneInput(prev),
      [field]: enable ? Array(12).fill(null) : null,
    }));
  };

  const updateCanvas = (patch: Partial<BusinessModelCanvasInput>) => {
    setFormInput((prev) => ({
      ...cloneInput(prev),
      canvas: { ...prev.canvas, ...patch },
    }));
  };

  const setCostLine = (idx: number, patch: Partial<BmCostLine>) => {
    setFormInput((prev) => {
      const next = cloneInput(prev);
      next.cost_lines[idx] = { ...next.cost_lines[idx], ...patch };
      return next;
    });
  };

  const removeCostLine = (idx: number) => {
    setFormInput((prev) => {
      const next = cloneInput(prev);
      next.cost_lines.splice(idx, 1);
      return next;
    });
  };

  const addCostLine = () => {
    setFormInput((prev) => {
      const next = cloneInput(prev);
      next.cost_lines.push({ name: "Новая строка", percent: 0 });
      return next;
    });
  };

  const totalPct = formInput.cost_lines.reduce((s, c) => s + c.percent, 0);

  // ── Mode-driven primary input field ───────
  const primaryField =
    formInput.mode === "DIVIDENDS_TO_REVENUE"
      ? "dividends_needed_by_month"
      : formInput.mode === "REVENUE_DIRECT"
      ? "revenue_plan_by_month"
      : "profit_needed_by_month";

  const primaryLabel =
    formInput.mode === "DIVIDENDS_TO_REVENUE"
      ? "Дивиденды (план)"
      : formInput.mode === "REVENUE_DIRECT"
      ? "Выручка (план)"
      : "Прибыль (план)";

  // Ensure primary field is enabled when mode changes
  const setMode = (mode: FinancialMode) => {
    setFormInput((prev) => {
      const next = cloneInput(prev);
      next.mode = mode;
      // Enable the required array
      const fieldMap: Record<FinancialMode, "dividends_needed_by_month" | "revenue_plan_by_month" | "profit_needed_by_month"> = {
        DIVIDENDS_TO_REVENUE: "dividends_needed_by_month",
        REVENUE_DIRECT: "revenue_plan_by_month",
        PROFIT_TO_REVENUE: "profit_needed_by_month",
      };
      const f = fieldMap[mode];
      if (!next[f]) next[f] = Array(12).fill(null);
      // Clear the others
      for (const [m, field] of Object.entries(fieldMap)) {
        if (m !== mode) next[field as typeof f] = null;
      }
      return next;
    });
  };

  // ── Save / calculate ─────────────────────
  const handleCalculate = () => previewMutation.mutate(formInput);

  const handleSave = () => {
    if (activeId) {
      updateMutation.mutate({ id: activeId, name: modelName, input: formInput });
    } else {
      createMutation.mutate({ companyId, name: modelName, input: formInput });
    }
  };

  const output = previewOutput ?? (activeModel?.output as BusinessModelOutput | undefined);

  // ─────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Бизнес-модели</h2>
          <p className="text-sm text-gray-500">
            Финансовая модель (P&amp;L) и канвас Остервальдера
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Saved models selector */}
          {models.length > 0 && (
            <Select
              value={activeId?.toString() ?? ""}
              onValueChange={(v) => {
                if (v === "__new") {
                  setActiveId(null);
                  setFormInput(cloneInput(DEFAULT_INPUT));
                  setModelName(`Бизнес-модель ${models.length + 1}`);
                  setPreviewOutput(null);
                  setInnerTab("form");
                } else {
                  loadModel(Number(v));
                }
              }}
            >
              <SelectTrigger className="w-56 h-8 text-sm">
                <SelectValue placeholder="Выбрать модель..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new">+ Новая модель</SelectItem>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id.toString()}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {activeId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 h-8"
              onClick={() => {
                if (confirm("Удалить эту бизнес-модель?")) deleteMutation.mutate({ id: activeId });
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {processCount === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          Для создания бизнес-модели необходим хотя бы один процесс компании.
        </div>
      )}

      {/* Inner tabs */}
      <Tabs value={innerTab} onValueChange={(v) => setInnerTab(v as any)}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="form" className="gap-1.5">
              <ClipboardList className="w-4 h-4" />
              Анкета
            </TabsTrigger>
            <TabsTrigger value="finance" className="gap-1.5" disabled={!output}>
              <BarChart3 className="w-4 h-4" />
              Финансы
            </TabsTrigger>
            <TabsTrigger value="canvas" className="gap-1.5" disabled={!output}>
              <LayoutGrid className="w-4 h-4" />
              Канвас
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCalculate}
              disabled={previewMutation.isPending || processCount === 0}
            >
              {previewMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Рассчитать
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                createMutation.isPending || updateMutation.isPending || processCount === 0
              }
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {activeId ? "Обновить" : "Сохранить"}
            </Button>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            FORM TAB
            ══════════════════════════════════════════ */}
        <TabsContent value="form" className="space-y-6 pt-4">
          {/* Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Название модели</Label>
              <Input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Бизнес-модель 2025"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Год</Label>
              <Input
                type="number"
                value={formInput.year}
                onChange={(e) =>
                  setFormInput((p) => ({ ...cloneInput(p), year: parseInt(e.target.value) || YEAR }))
                }
              />
            </div>
          </div>

          {/* Mode + rounding */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Режим расчёта</Label>
              <Select value={formInput.mode} onValueChange={(v) => setMode(v as FinancialMode)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REVENUE_DIRECT">Прямая выручка</SelectItem>
                  <SelectItem value="DIVIDENDS_TO_REVENUE">Дивиденды → Выручка</SelectItem>
                  <SelectItem value="PROFIT_TO_REVENUE">Прибыль → Выручка</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Единица денег</Label>
              <Select
                value={formInput.rounding.money_unit}
                onValueChange={(v) =>
                  setFormInput((p) => ({
                    ...cloneInput(p),
                    rounding: { ...p.rounding, money_unit: v as MoneyUnit },
                  }))
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RUB">Рубли</SelectItem>
                  <SelectItem value="THOUSAND">Тысячи</SelectItem>
                  <SelectItem value="MILLION">Миллионы</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Округление сделок</Label>
              <Select
                value={formInput.rounding.deals}
                onValueChange={(v) =>
                  setFormInput((p) => ({
                    ...cloneInput(p),
                    rounding: { ...p.rounding, deals: v as DealsRounding },
                  }))
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ROUND">Стандартное</SelectItem>
                  <SelectItem value="CEIL">Вверх</SelectItem>
                  <SelectItem value="FLOOR">Вниз</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Целевая прибыль, %</Label>
              <Input
                type="number"
                value={formInput.target_profit_pct ?? ""}
                onChange={(e) =>
                  setFormInput((p) => ({
                    ...cloneInput(p),
                    target_profit_pct: e.target.value === "" ? null : parseFloat(e.target.value),
                  }))
                }
                placeholder="9.5"
              />
            </div>
          </div>

          {/* Cost lines */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Статьи затрат
                  <span
                    className={`ml-2 text-xs font-normal ${
                      Math.abs(totalPct - 100) < 0.1 ? "text-green-600" : "text-amber-600"
                    }`}
                  >
                    Итого: {totalPct.toFixed(1)}%
                  </span>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addCostLine} className="h-7 text-xs">
                  <Plus className="w-3 h-3" />
                  Добавить
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {formInput.cost_lines.map((cl, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={cl.name}
                    onChange={(e) => setCostLine(idx, { name: e.target.value })}
                    className="h-8 text-sm flex-1"
                    placeholder="Название"
                  />
                  <Input
                    type="number"
                    value={cl.percent}
                    onChange={(e) =>
                      setCostLine(idx, { percent: parseFloat(e.target.value) || 0 })
                    }
                    className="h-8 text-sm w-20"
                    step="0.5"
                  />
                  <span className="text-xs text-gray-400">%</span>
                  <button
                    type="button"
                    onClick={() => removeCostLine(idx)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Monthly inputs */}
          <Card>
            <CardHeader className="pb-3">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setShowMonthlyInputs((v) => !v)}
              >
                {showMonthlyInputs ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <CardTitle className="text-sm font-semibold">Помесячные данные</CardTitle>
              </button>
            </CardHeader>
            {showMonthlyInputs && (
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Primary field */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">{primaryLabel}</p>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <MonthRow
                        key={i}
                        monthIdx={i}
                        value={nullArr(formInput[primaryField], i)}
                        onChange={(v) => setArr(primaryField, i, v)}
                        label="0"
                      />
                    ))}
                  </div>

                  {/* Deals */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-700">Кол-во сделок</p>
                      <input
                        type="checkbox"
                        checked={!!formInput.deals_count_by_month}
                        onChange={(e) => enableField("deals_count_by_month", e.target.checked)}
                        className="w-3.5 h-3.5 cursor-pointer"
                      />
                    </div>
                    {formInput.deals_count_by_month ? (
                      Array.from({ length: 12 }).map((_, i) => (
                        <MonthRow
                          key={i}
                          monthIdx={i}
                          value={nullArr(formInput.deals_count_by_month, i)}
                          onChange={(v) => setArr("deals_count_by_month", i, v)}
                          label="0"
                        />
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 pt-1">Отключено</p>
                    )}
                  </div>

                  {/* Avg ticket */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-700">Средний чек</p>
                      <input
                        type="checkbox"
                        checked={!!formInput.avg_ticket_by_month}
                        onChange={(e) => enableField("avg_ticket_by_month", e.target.checked)}
                        className="w-3.5 h-3.5 cursor-pointer"
                      />
                    </div>
                    {formInput.avg_ticket_by_month ? (
                      Array.from({ length: 12 }).map((_, i) => (
                        <MonthRow
                          key={i}
                          monthIdx={i}
                          value={nullArr(formInput.avg_ticket_by_month, i)}
                          onChange={(v) => setArr("avg_ticket_by_month", i, v)}
                          label="0"
                        />
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 pt-1">Отключено</p>
                    )}
                  </div>

                  {/* Tolerance */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">Допуск расхождения, %</p>
                    <Input
                      type="number"
                      value={formInput.tolerance.avg_ticket_vs_deals_pct}
                      onChange={(e) =>
                        setFormInput((p) => ({
                          ...cloneInput(p),
                          tolerance: { avg_ticket_vs_deals_pct: parseFloat(e.target.value) || 0 },
                        }))
                      }
                      className="h-7 text-sm w-24"
                      step="0.5"
                    />
                    <p className="text-xs text-gray-400">
                      При превышении — предупреждение
                    </p>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Canvas form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Канвас Остервальдера</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Название компании</Label>
                  <Input
                    value={formInput.canvas.company_name ?? ""}
                    onChange={(e) => updateCanvas({ company_name: e.target.value || null })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Отрасль</Label>
                  <Input
                    value={formInput.canvas.industry ?? ""}
                    onChange={(e) => updateCanvas({ industry: e.target.value || null })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Тип клиентов</Label>
                  <Select
                    value={formInput.canvas.b2b_b2c ?? ""}
                    onValueChange={(v) => updateCanvas({ b2b_b2c: (v || null) as any })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Выбрать..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Не указано</SelectItem>
                      <SelectItem value="B2B">B2B</SelectItem>
                      <SelectItem value="B2C">B2C</SelectItem>
                      <SelectItem value="B2G">B2G</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {([
                ["customer_segments", "Сегменты клиентов"],
                ["value_propositions", "Ценностные предложения"],
                ["channels", "Каналы сбыта"],
                ["customer_relationships", "Отношения с клиентами"],
                ["revenue_streams", "Потоки доходов"],
                ["key_resources", "Ключевые ресурсы"],
                ["key_activities", "Ключевые активности"],
                ["key_partners", "Ключевые партнёры"],
                ["cost_structure", "Структура издержек"],
              ] as [keyof BusinessModelCanvasInput, string][]).map(([field, label]) => (
                <div key={field} className="space-y-1.5">
                  <Label className="text-xs font-medium">{label}</Label>
                  <TagInput
                    value={(formInput.canvas[field] as string[] | null) ?? []}
                    onChange={(v) => updateCanvas({ [field]: v })}
                    placeholder={`Добавить ${label.toLowerCase()}...`}
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Примечания</Label>
                <Textarea
                  value={formInput.canvas.notes ?? ""}
                  onChange={(e) => updateCanvas({ notes: e.target.value || null })}
                  rows={3}
                  className="text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════
            FINANCE TAB
            ══════════════════════════════════════════ */}
        <TabsContent value="finance" className="pt-4">
          {output ? (
            <FinancialResults output={output} unit={formInput.rounding.money_unit} />
          ) : (
            <EmptyResults />
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════
            CANVAS TAB
            ══════════════════════════════════════════ */}
        <TabsContent value="canvas" className="pt-4">
          {output ? (
            <CanvasResults canvas={output.canvas} />
          ) : (
            <EmptyResults />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────
// Helper for null arrays
// ─────────────────────────────────────────

function nullArr(arr: (number | null)[] | null | undefined, idx: number): number | null {
  if (!arr) return null;
  return arr[idx] ?? null;
}

// ─────────────────────────────────────────
// Financial Results
// ─────────────────────────────────────────

function EmptyResults() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <BarChart3 className="w-10 h-10 text-gray-300 mb-3" />
      <p className="text-gray-500 text-sm">Нажмите «Рассчитать» для просмотра результатов</p>
    </div>
  );
}

function FinancialResults({
  output,
  unit,
}: {
  output: BusinessModelOutput;
  unit: MoneyUnit;
}) {
  const fin = output.financial;

  return (
    <div className="space-y-4">
      {/* Errors */}
      {fin.errors.length > 0 && (
        <div className="space-y-1">
          {fin.errors.map((e, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {e}
            </div>
          ))}
        </div>
      )}
      {/* Warnings */}
      {fin.warnings.length > 0 && (
        <div className="space-y-1">
          {fin.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Annual summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Годовой итог</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Kpi label="Выручка" value={formatMoney(fin.annual.revenue, unit)} color="text-gray-900" />
            <Kpi label="Затраты" value={formatMoney(fin.annual.total_costs, unit)} color="text-gray-700" />
            <Kpi
              label="Остаточная прибыль"
              value={formatMoney(fin.annual.residual_profit, unit)}
              color={fin.annual.residual_profit >= 0 ? "text-green-600" : "text-red-600"}
            />
            <Kpi
              label="Маржа прибыли"
              value={pct(fin.annual.residual_profit_pct)}
              color={fin.annual.residual_profit_pct >= 0 ? "text-green-600" : "text-red-600"}
            />
          </div>

          {/* Annual cost line breakdown */}
          <div className="mt-4 space-y-1">
            {fin.annual.cost_lines.map((cl) => (
              <div key={cl.name} className="flex items-center justify-between text-xs text-gray-600">
                <span>{cl.name}</span>
                <span>{formatMoney(cl.amount, unit)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Monthly table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 bg-gray-50 text-left px-3 py-2 font-medium text-gray-600 border-b border-r border-gray-200 w-20">
                Месяц
              </th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">
                Выручка
              </th>
              {fin.rows[0]?.cost_lines.map((cl) => (
                <th
                  key={cl.name}
                  className="text-right px-3 py-2 font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap"
                >
                  {cl.name}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">
                Прибыль
              </th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">
                %
              </th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">
                Сделки
              </th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">
                Ср. чек
              </th>
            </tr>
          </thead>
          <tbody>
            {fin.rows.map((row) => (
              <tr key={row.month} className="hover:bg-gray-50 transition-colors">
                <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-gray-700 border-b border-r border-gray-100">
                  {MONTH_NAMES[row.month - 1]}
                </td>
                <td className="text-right px-3 py-1.5 text-gray-900 border-b border-gray-100">
                  {formatMoney(row.revenue, unit)}
                </td>
                {row.cost_lines.map((cl) => (
                  <td
                    key={cl.name}
                    className="text-right px-3 py-1.5 text-gray-700 border-b border-gray-100"
                  >
                    {formatMoney(cl.amount, unit)}
                  </td>
                ))}
                <td
                  className={`text-right px-3 py-1.5 font-medium border-b border-gray-100 ${
                    row.residual_profit >= 0 ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {formatMoney(row.residual_profit, unit)}
                </td>
                <td
                  className={`text-right px-3 py-1.5 border-b border-gray-100 ${
                    row.residual_profit_pct >= 0 ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {pct(row.residual_profit_pct)}
                </td>
                <td className="text-right px-3 py-1.5 text-gray-700 border-b border-gray-100">
                  {row.deals_count ?? "—"}
                </td>
                <td className="text-right px-3 py-1.5 text-gray-700 border-b border-gray-100">
                  {row.avg_ticket !== null ? formatMoney(row.avg_ticket, unit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────
// Canvas Results
// ─────────────────────────────────────────

const CANVAS_BLOCKS: { key: keyof ReturnType<typeof emptyCanvas>; label: string; desc: string; color: string }[] = [
  { key: "customer_segments", label: "Сегменты клиентов", desc: "Кто ваши клиенты?", color: "bg-blue-50 border-blue-200" },
  { key: "value_propositions", label: "Ценностные предложения", desc: "Что вы предлагаете?", color: "bg-purple-50 border-purple-200" },
  { key: "channels", label: "Каналы", desc: "Как достигаете клиентов?", color: "bg-green-50 border-green-200" },
  { key: "customer_relationships", label: "Отношения с клиентами", desc: "Как выстраиваете отношения?", color: "bg-teal-50 border-teal-200" },
  { key: "revenue_streams", label: "Потоки доходов", desc: "За что платят клиенты?", color: "bg-emerald-50 border-emerald-200" },
  { key: "key_resources", label: "Ключевые ресурсы", desc: "Что нужно для создания ценности?", color: "bg-orange-50 border-orange-200" },
  { key: "key_activities", label: "Ключевые активности", desc: "Что важно делать?", color: "bg-amber-50 border-amber-200" },
  { key: "key_partners", label: "Ключевые партнёры", desc: "Кто помогает?", color: "bg-rose-50 border-rose-200" },
  { key: "cost_structure", label: "Структура издержек", desc: "Основные статьи затрат", color: "bg-gray-50 border-gray-200" },
];

function emptyCanvas() {
  return {
    customer_segments: [] as string[],
    value_propositions: [] as string[],
    channels: [] as string[],
    customer_relationships: [] as string[],
    revenue_streams: [] as string[],
    key_resources: [] as string[],
    key_activities: [] as string[],
    key_partners: [] as string[],
    cost_structure: [] as string[],
  };
}

function CanvasResults({ canvas }: { canvas: BusinessModelOutput["canvas"] }) {
  return (
    <div className="space-y-4">
      {/* Meta */}
      <div className="flex flex-wrap gap-3 text-sm text-gray-600">
        {canvas.meta.company_name && <span className="font-semibold text-gray-900">{canvas.meta.company_name}</span>}
        {canvas.meta.industry && <Badge variant="outline">{canvas.meta.industry}</Badge>}
        {canvas.meta.b2b_b2c && <Badge variant="secondary">{canvas.meta.b2b_b2c}</Badge>}
        {canvas.meta.geography.map((g, i) => <Badge key={i} variant="outline">{g}</Badge>)}
      </div>

      {/* Warnings */}
      {canvas.warnings.length > 0 && (
        <div className="space-y-1">
          {canvas.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* 9-block canvas grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CANVAS_BLOCKS.map(({ key, label, desc, color }) => {
          const items = (canvas as any)[key] as string[];
          return (
            <div
              key={key}
              className={`rounded-lg border p-3 space-y-2 ${color}`}
            >
              <div>
                <p className="text-xs font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Не заполнено</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                      <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-gray-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {canvas.meta.notes && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-gray-500 mb-1">Примечания</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{canvas.meta.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
