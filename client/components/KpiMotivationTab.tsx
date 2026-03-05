import { useState, useMemo, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Plus,
  Trash2,
  Save,
  Target,
  Users,
  TrendingUp,
  DollarSign,
  Clock,
  Star,
  ChevronDown,
  ChevronRight,
  Link,
  Edit,
  BarChart3,
  Award,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type {
  ProcessData,
  ProcessRole,
  KpiDefinition,
  KpiType,
  KpiSourceLink,
  MotivationPart,
  MotivationPartType,
  RoleKpiPlan,
  KpiPlan,
  KpiPlanInput,
  BusinessModel,
} from "@shared/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

const KPI_TYPE_LABELS: Record<KpiType, string> = {
  revenue: "Выручка",
  deals: "Кол-во сделок",
  conversion: "Конверсия",
  avg_ticket: "Средний чек",
  time: "Время / SLA",
  quality: "Качество",
  custom: "Произвольный",
};

const KPI_TYPE_ICONS: Record<KpiType, React.ReactNode> = {
  revenue: <DollarSign className="h-3.5 w-3.5" />,
  deals: <BarChart3 className="h-3.5 w-3.5" />,
  conversion: <TrendingUp className="h-3.5 w-3.5" />,
  avg_ticket: <DollarSign className="h-3.5 w-3.5" />,
  time: <Clock className="h-3.5 w-3.5" />,
  quality: <Star className="h-3.5 w-3.5" />,
  custom: <Target className="h-3.5 w-3.5" />,
};

const MOTIVATION_TYPE_LABELS: Record<MotivationPartType, string> = {
  fixed: "Фиксированный оклад",
  variable_kpi: "Переменная часть (% от KPI)",
  bonus_threshold: "Бонус за достижение порога",
};

const SOURCE_LINK_LABELS: Record<KpiSourceLink, string> = {
  bm_revenue: "Из БМ: Выручка",
  bm_deals: "Из БМ: Сделки",
  bm_avg_ticket: "Из БМ: Средний чек",
  bm_profit: "Из БМ: Прибыль",
  manual: "Вручную",
};

function defaultKpi(): KpiDefinition {
  return {
    id: nanoid(),
    name: "",
    description: "",
    type: "custom",
    unit: "шт",
    targetValue: null,
    weight: 0,
    sourceLink: "manual",
    linkedBlockId: null,
  };
}

function defaultMotivationPart(): MotivationPart {
  return {
    id: nanoid(),
    name: "Фиксированный оклад",
    type: "fixed",
    amount: null,
    pctOfBase: null,
    thresholdPct: null,
    bonusAmount: null,
    kpiIds: [],
  };
}

function defaultRolePlan(role: ProcessRole): RoleKpiPlan {
  return {
    roleId: role.id,
    roleName: role.name,
    kpis: [],
    motivationParts: [{ ...defaultMotivationPart() }],
  };
}

// ─── Summary helpers ──────────────────────────────────────────────────────────

function calcTotalWeight(kpis: KpiDefinition[]) {
  return kpis.reduce((s, k) => s + (k.weight ?? 0), 0);
}

function calcMonthlyBase(parts: MotivationPart[]): number {
  return parts
    .filter((p) => p.type === "fixed")
    .reduce((s, p) => s + (p.amount ?? 0), 0);
}

function calcMaxVariable(parts: MotivationPart[], base: number): number {
  const varPct = parts
    .filter((p) => p.type === "variable_kpi")
    .reduce((s, p) => s + (p.pctOfBase ?? 0), 0);
  const bonuses = parts
    .filter((p) => p.type === "bonus_threshold")
    .reduce((s, p) => s + (p.bonusAmount ?? 0), 0);
  return (base * varPct) / 100 + bonuses;
}

function formatMoney(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} тыс`;
  return `${v.toLocaleString("ru-RU")}`;
}

// ─── Suggest KPIs from business model ────────────────────────────────────────

function suggestKpisFromBm(
  role: ProcessRole,
  bm: BusinessModel,
  processData: ProcessData
): KpiDefinition[] {
  const annualRevenue = bm.output.financial.annual.revenue;
  const annualDeals = (bm.input.deals_count_by_month ?? [])
    .reduce((s, v) => s + (v ?? 0), 0);
  const annualAvgTicket =
    annualDeals > 0 ? annualRevenue / annualDeals : null;

  const suggested: KpiDefinition[] = [];

  // Revenue — likely for sales/commercial roles
  if (annualRevenue > 0) {
    suggested.push({
      id: nanoid(),
      name: "Выручка",
      description: "Объём продаж за период",
      type: "revenue",
      unit: "руб",
      targetValue: Math.round(annualRevenue / 12),
      weight: 50,
      sourceLink: "bm_revenue",
      linkedBlockId: null,
    });
  }

  // Deals count
  if (annualDeals > 0) {
    suggested.push({
      id: nanoid(),
      name: "Количество сделок",
      description: "Число закрытых сделок за месяц",
      type: "deals",
      unit: "шт",
      targetValue: Math.round(annualDeals / 12),
      weight: 30,
      sourceLink: "bm_deals",
      linkedBlockId: null,
    });
  }

  // Avg ticket
  if (annualAvgTicket) {
    suggested.push({
      id: nanoid(),
      name: "Средний чек",
      description: "Средняя сумма одной сделки",
      type: "avg_ticket",
      unit: "руб",
      targetValue: Math.round(annualAvgTicket),
      weight: 20,
      sourceLink: "bm_avg_ticket",
      linkedBlockId: null,
    });
  }

  // Normalize weights to 100
  const total = suggested.reduce((s, k) => s + k.weight, 0);
  if (total > 0 && total !== 100) {
    const factor = 100 / total;
    suggested.forEach((k) => (k.weight = Math.round(k.weight * factor)));
  }

  return suggested;
}

// ─── KpiEditor (per role) ─────────────────────────────────────────────────────

interface KpiEditorProps {
  plan: RoleKpiPlan;
  processData: ProcessData;
  businessModel: BusinessModel | null;
  onChange: (updated: RoleKpiPlan) => void;
}

function KpiEditor({ plan, processData, businessModel, onChange }: KpiEditorProps) {
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null);

  const updateKpi = (id: string, patch: Partial<KpiDefinition>) => {
    onChange({
      ...plan,
      kpis: plan.kpis.map((k) => (k.id === id ? { ...k, ...patch } : k)),
    });
  };

  const removeKpi = (id: string) => {
    onChange({ ...plan, kpis: plan.kpis.filter((k) => k.id !== id) });
  };

  const addKpi = () => {
    const kpi = defaultKpi();
    onChange({ ...plan, kpis: [...plan.kpis, kpi] });
    setExpandedKpi(kpi.id);
  };

  const totalWeight = calcTotalWeight(plan.kpis);

  return (
    <div className="space-y-2">
      {plan.kpis.length === 0 && (
        <p className="text-sm text-muted-foreground py-3 text-center">
          Нет KPI. Добавьте показатели ниже.
        </p>
      )}

      {plan.kpis.map((kpi) => (
        <div key={kpi.id} className="border rounded-lg overflow-hidden">
          {/* KPI header */}
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 select-none"
            onClick={() => setExpandedKpi(expandedKpi === kpi.id ? null : kpi.id)}
          >
            <span className="text-muted-foreground">
              {KPI_TYPE_ICONS[kpi.type]}
            </span>
            <span className="flex-1 font-medium text-sm truncate">
              {kpi.name || "Без названия"}
            </span>
            <Badge variant="outline" className="text-xs shrink-0">
              {kpi.unit}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-xs shrink-0",
                kpi.weight > 0 ? "border-primary/50 text-primary" : "opacity-50"
              )}
            >
              {kpi.weight}%
            </Badge>
            {expandedKpi === kpi.id ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </div>

          {/* KPI form */}
          {expandedKpi === kpi.id && (
            <div className="px-3 pb-3 pt-1 space-y-3 border-t bg-muted/20">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Название KPI</label>
                  <Input
                    value={kpi.name}
                    onChange={(e) => updateKpi(kpi.id, { name: e.target.value })}
                    placeholder="Например: Выручка за месяц"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Тип</label>
                  <Select
                    value={kpi.type}
                    onValueChange={(v) => updateKpi(kpi.id, { type: v as KpiType })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KPI_TYPE_LABELS) as KpiType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {KPI_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Единица измерения</label>
                  <Input
                    value={kpi.unit}
                    onChange={(e) => updateKpi(kpi.id, { unit: e.target.value })}
                    placeholder="руб, %, шт, дн..."
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Целевое значение</label>
                  <Input
                    type="number"
                    value={kpi.targetValue ?? ""}
                    onChange={(e) =>
                      updateKpi(kpi.id, {
                        targetValue: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="0"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Вес, %</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={kpi.weight}
                    onChange={(e) =>
                      updateKpi(kpi.id, { weight: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Источник цели</label>
                  <Select
                    value={kpi.sourceLink}
                    onValueChange={(v) => updateKpi(kpi.id, { sourceLink: v as KpiSourceLink })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SOURCE_LINK_LABELS) as KpiSourceLink[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {SOURCE_LINK_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Привязка к шагу процесса (необязательно)
                  </label>
                  <Select
                    value={kpi.linkedBlockId ?? "__none"}
                    onValueChange={(v) =>
                      updateKpi(kpi.id, { linkedBlockId: v === "__none" ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Не привязан" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Не привязан</SelectItem>
                      {processData.blocks
                        .filter((b) => b.type !== "start" && b.type !== "end")
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
                  <Textarea
                    value={kpi.description}
                    onChange={(e) => updateKpi(kpi.id, { description: e.target.value })}
                    placeholder="Как измеряется, периодичность, источник данных..."
                    className="text-sm resize-none"
                    rows={2}
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => removeKpi(kpi.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Удалить KPI
              </Button>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={addKpi}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Добавить KPI
        </Button>
        {businessModel && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const role = processData.roles.find((r) => r.id === plan.roleId);
              if (!role) return;
              const suggested = suggestKpisFromBm(role, businessModel, processData);
              if (suggested.length === 0) {
                toast({ title: "Нет данных", description: "Бизнес-модель не содержит финансовых плановых значений" });
                return;
              }
              onChange({ ...plan, kpis: [...plan.kpis, ...suggested] });
              toast({ title: "KPI добавлены", description: `Добавлено ${suggested.length} KPI из бизнес-модели` });
            }}
          >
            <Link className="h-3.5 w-3.5 mr-1" />
            Из бизнес-модели
          </Button>
        )}
        {plan.kpis.length > 0 && (
          <span
            className={cn(
              "text-xs ml-auto",
              totalWeight === 100
                ? "text-green-600"
                : totalWeight > 100
                ? "text-destructive"
                : "text-amber-500"
            )}
          >
            Сумма весов: {totalWeight}% {totalWeight !== 100 && "(должно быть 100%)"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── MotivationEditor (per role) ──────────────────────────────────────────────

interface MotivationEditorProps {
  plan: RoleKpiPlan;
  onChange: (updated: RoleKpiPlan) => void;
}

function MotivationEditor({ plan, onChange }: MotivationEditorProps) {
  const updatePart = (id: string, patch: Partial<MotivationPart>) => {
    onChange({
      ...plan,
      motivationParts: plan.motivationParts.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    });
  };

  const removePart = (id: string) => {
    onChange({
      ...plan,
      motivationParts: plan.motivationParts.filter((p) => p.id !== id),
    });
  };

  const addPart = () => {
    onChange({
      ...plan,
      motivationParts: [...plan.motivationParts, defaultMotivationPart()],
    });
  };

  const base = calcMonthlyBase(plan.motivationParts);
  const maxVar = calcMaxVariable(plan.motivationParts, base);
  const total = base + maxVar;

  return (
    <div className="space-y-3">
      {plan.motivationParts.map((part) => (
        <div key={part.id} className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <Input
                value={part.name}
                onChange={(e) => updatePart(part.id, { name: e.target.value })}
                placeholder="Название части"
                className="h-8 text-sm font-medium"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removePart(part.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">Тип части</label>
              <Select
                value={part.type}
                onValueChange={(v) =>
                  updatePart(part.id, { type: v as MotivationPartType })
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MOTIVATION_TYPE_LABELS) as MotivationPartType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {MOTIVATION_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {part.type === "fixed" && (
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Сумма в месяц, руб
                </label>
                <Input
                  type="number"
                  value={part.amount ?? ""}
                  onChange={(e) =>
                    updatePart(part.id, {
                      amount: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="Например: 80000"
                  className="h-8 text-sm"
                />
              </div>
            )}

            {part.type === "variable_kpi" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    % от оклада (макс)
                  </label>
                  <Input
                    type="number"
                    value={part.pctOfBase ?? ""}
                    onChange={(e) =>
                      updatePart(part.id, {
                        pctOfBase: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="Например: 50"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-muted-foreground pb-2">
                    Выплачивается пропорционально выполнению KPI
                  </p>
                </div>
                {plan.kpis.length > 0 && (
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">
                      KPI для расчёта (не выбрано = все)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.kpis.map((kpi) => (
                        <button
                          key={kpi.id}
                          type="button"
                          className={cn(
                            "text-xs px-2 py-0.5 rounded border transition-colors",
                            part.kpiIds.includes(kpi.id)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border hover:bg-muted"
                          )}
                          onClick={() => {
                            const ids = part.kpiIds.includes(kpi.id)
                              ? part.kpiIds.filter((id) => id !== kpi.id)
                              : [...part.kpiIds, kpi.id];
                            updatePart(part.id, { kpiIds: ids });
                          }}
                        >
                          {kpi.name || "Без названия"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {part.type === "bonus_threshold" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Порог выполнения KPI, %
                  </label>
                  <Input
                    type="number"
                    value={part.thresholdPct ?? ""}
                    onChange={(e) =>
                      updatePart(part.id, {
                        thresholdPct: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="Например: 110"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Сумма бонуса, руб
                  </label>
                  <Input
                    type="number"
                    value={part.bonusAmount ?? ""}
                    onChange={(e) =>
                      updatePart(part.id, {
                        bonusAmount: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="Например: 30000"
                    className="h-8 text-sm"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addPart}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        Добавить часть
      </Button>

      {/* Summary */}
      {plan.motivationParts.length > 0 && total > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-muted/50 border text-sm">
          <div className="font-medium mb-2 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            Итог мотивации
          </div>
          <div className="space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Фикс. оклад / мес:</span>
              <span className="font-medium text-foreground">{formatMoney(base)} руб</span>
            </div>
            {maxVar > 0 && (
              <div className="flex justify-between">
                <span>Переменная часть (макс):</span>
                <span className="font-medium text-foreground">+{formatMoney(maxVar)} руб</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 mt-1">
              <span>Максимальный доход / мес:</span>
              <span className="font-semibold text-foreground">{formatMoney(total)} руб</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary Table ────────────────────────────────────────────────────────────

function SummaryTable({ roles }: { roles: RoleKpiPlan[] }) {
  if (roles.length === 0) return null;

  const rows = roles.map((r) => {
    const base = calcMonthlyBase(r.motivationParts);
    const maxVar = calcMaxVariable(r.motivationParts, base);
    const kpiCount = r.kpis.length;
    const weightOk = kpiCount === 0 || calcTotalWeight(r.kpis) === 100;
    return { name: r.roleName, kpiCount, base, maxVar, total: base + maxVar, weightOk };
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b">
            <th className="text-left pb-2 font-medium">Роль</th>
            <th className="text-center pb-2 font-medium">KPI</th>
            <th className="text-right pb-2 font-medium">Оклад / мес</th>
            <th className="text-right pb-2 font-medium">Перем. (макс)</th>
            <th className="text-right pb-2 font-medium">Итого (макс)</th>
            <th className="text-center pb-2 font-medium">Веса</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-2 pr-3 font-medium">{row.name}</td>
              <td className="py-2 text-center">
                <Badge variant="secondary">{row.kpiCount}</Badge>
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {row.base > 0 ? `${formatMoney(row.base)} ₽` : "—"}
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {row.maxVar > 0 ? `+${formatMoney(row.maxVar)} ₽` : "—"}
              </td>
              <td className="py-2 text-right font-semibold">
                {row.total > 0 ? `${formatMoney(row.total)} ₽` : "—"}
              </td>
              <td className="py-2 text-center">
                {row.kpiCount === 0 ? (
                  <span className="text-muted-foreground text-xs">н/а</span>
                ) : row.weightOk ? (
                  <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                    ✓ 100%
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-500 border-amber-300 text-xs">
                    ⚠ не 100%
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="border-t">
              <td className="pt-2 font-medium text-muted-foreground" colSpan={2}>
                Итого по компании / мес
              </td>
              <td className="pt-2 text-right font-semibold">
                {formatMoney(rows.reduce((s, r) => s + r.base, 0))} ₽
              </td>
              <td className="pt-2 text-right font-semibold">
                +{formatMoney(rows.reduce((s, r) => s + r.maxVar, 0))} ₽
              </td>
              <td className="pt-2 text-right font-bold text-primary">
                {formatMoney(rows.reduce((s, r) => s + r.total, 0))} ₽
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface KpiMotivationTabProps {
  processId: number;
  companyId: number;
  data: ProcessData;
}

export function KpiMotivationTab({ processId, companyId, data }: KpiMotivationTabProps) {
  const utils = trpc.useUtils();

  // ── Data loading ──
  const { data: plans = [], isLoading: plansLoading } = trpc.kpiMotivation.listByProcess.useQuery(
    { processId },
    { retry: false }
  );

  const { data: businessModels = [] } = trpc.businessModel.listByCompany.useQuery(
    { companyId },
    { retry: false }
  );

  // ── Mutations ──
  const createMutation = trpc.kpiMotivation.create.useMutation({
    onSuccess: () => utils.kpiMotivation.listByProcess.invalidate({ processId }),
  });
  const updateMutation = trpc.kpiMotivation.update.useMutation({
    onSuccess: () => utils.kpiMotivation.listByProcess.invalidate({ processId }),
  });
  const deleteMutation = trpc.kpiMotivation.delete.useMutation({
    onSuccess: () => {
      utils.kpiMotivation.listByProcess.invalidate({ processId });
      setActivePlanId(null);
      setDraft(null);
    },
  });

  // ── Local state ──
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [draft, setDraft] = useState<KpiPlanInput | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "summary">("edit");
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [newPlanDialog, setNewPlanDialog] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanYear, setNewPlanYear] = useState(new Date().getFullYear());

  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;

  // Sync draft when active plan changes
  const loadPlan = useCallback(
    (plan: KpiPlan) => {
      setActivePlanId(plan.id);
      setDraft({
        name: plan.name,
        year: plan.year,
        linkedBusinessModelId: plan.linkedBusinessModelId,
        roles: plan.roles,
      });
      setActiveRoleId(plan.roles[0]?.roleId ?? null);
    },
    []
  );

  // Build initial roles from process data when creating new plan
  const buildInitialRoles = useCallback((): RoleKpiPlan[] => {
    return data.roles.map(defaultRolePlan);
  }, [data.roles]);

  const linkedBm = useMemo(
    () =>
      draft?.linkedBusinessModelId != null
        ? (businessModels.find((m) => m.id === draft.linkedBusinessModelId) ?? null)
        : null,
    [draft?.linkedBusinessModelId, businessModels]
  );

  const activeRolePlan = useMemo(
    () => draft?.roles.find((r) => r.roleId === activeRoleId) ?? null,
    [draft?.roles, activeRoleId]
  );

  // ── Handlers ──
  const handleCreatePlan = () => {
    if (!newPlanName.trim()) return;
    const input: KpiPlanInput = {
      name: newPlanName.trim(),
      year: newPlanYear,
      linkedBusinessModelId: null,
      roles: buildInitialRoles(),
    };
    createMutation.mutate(
      { processId, data: input },
      {
        onSuccess: (created) => {
          setNewPlanDialog(false);
          setNewPlanName("");
          loadPlan(created);
          toast({ title: "План создан", description: created.name });
        },
      }
    );
  };

  const handleSave = () => {
    if (!draft || activePlanId == null) return;
    updateMutation.mutate(
      { id: activePlanId, data: draft },
      {
        onSuccess: () => toast({ title: "Сохранено" }),
      }
    );
  };

  const updateRolePlan = (updated: RoleKpiPlan) => {
    if (!draft) return;
    setDraft({
      ...draft,
      roles: draft.roles.map((r) => (r.roleId === updated.roleId ? updated : r)),
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── Render: no plans yet ──
  if (!plansLoading && plans.length === 0 && !draft) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="p-4 rounded-full bg-primary/10">
          <Target className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">KPI и мотивация</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Разработайте KPI для каждой роли и настройте систему мотивации на основе бизнес-процесса
            {businessModels.length > 0 ? " и бизнес-модели" : ""}.
          </p>
        </div>
        <Button onClick={() => setNewPlanDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Создать план KPI
        </Button>
        <CreatePlanDialog
          open={newPlanDialog}
          onOpenChange={setNewPlanDialog}
          name={newPlanName}
          year={newPlanYear}
          onNameChange={setNewPlanName}
          onYearChange={setNewPlanYear}
          onConfirm={handleCreatePlan}
          loading={createMutation.isPending}
        />
      </div>
    );
  }

  if (plansLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Plan selector */}
        <Select
          value={activePlanId?.toString() ?? "__none"}
          onValueChange={(v) => {
            if (v === "__none") return;
            if (v === "__new") {
              setNewPlanDialog(true);
              return;
            }
            const plan = plans.find((p) => p.id === Number(v));
            if (plan) loadPlan(plan);
          }}
        >
          <SelectTrigger className="h-8 text-sm w-56">
            <SelectValue placeholder="Выбрать план..." />
          </SelectTrigger>
          <SelectContent>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                {p.name} ({p.year})
              </SelectItem>
            ))}
            <SelectItem value="__new">+ Новый план</SelectItem>
          </SelectContent>
        </Select>

        {draft && (
          <>
            {/* Link to business model */}
            <Select
              value={draft.linkedBusinessModelId?.toString() ?? "__none"}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  linkedBusinessModelId: v === "__none" ? null : Number(v),
                })
              }
            >
              <SelectTrigger className="h-8 text-sm w-52">
                <SelectValue placeholder="Бизнес-модель..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Без бизнес-модели</SelectItem>
                {businessModels.map((m) => (
                  <SelectItem key={m.id} value={m.id.toString()}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {linkedBm && (
              <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                <Link className="h-3 w-3 mr-1" />
                {linkedBm.name}
              </Badge>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Delete plan */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить план?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие нельзя отменить. Все KPI и мотивационные настройки будут удалены.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={() => activePlanId != null && deleteMutation.mutate({ id: activePlanId })}
                    >
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button size="sm" className="h-8" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Сохранить
              </Button>
            </div>
          </>
        )}
      </div>

      {draft && (
        <>
          {/* ── Sub-tabs ── */}
          <div className="flex gap-1 border-b">
            <button
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === "edit"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab("edit")}
            >
              <Target className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              KPI по ролям
            </button>
            <button
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === "summary"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab("summary")}
            >
              <BarChart3 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Сводная таблица
            </button>
          </div>

          {/* ── Edit tab ── */}
          {activeTab === "edit" && (
            <div className="grid grid-cols-[220px_1fr] gap-4">
              {/* Role list */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 pb-1">
                  Роли
                </p>
                {draft.roles.map((r) => {
                  const weightOk =
                    r.kpis.length === 0 || calcTotalWeight(r.kpis) === 100;
                  return (
                    <button
                      key={r.roleId}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                        activeRoleId === r.roleId
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted"
                      )}
                      onClick={() => setActiveRoleId(r.roleId)}
                    >
                      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{r.roleName}</span>
                      <div className="flex gap-1 shrink-0">
                        {r.kpis.length > 0 && (
                          <Badge variant="secondary" className="text-xs h-4 px-1">
                            {r.kpis.length}
                          </Badge>
                        )}
                        {!weightOk && (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Role detail */}
              {activeRolePlan ? (
                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {activeRolePlan.roleName}
                  </h3>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        KPI показатели
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Определите измеримые цели для роли. Сумма весов должна = 100%.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <KpiEditor
                        plan={activeRolePlan}
                        processData={data}
                        businessModel={linkedBm}
                        onChange={updateRolePlan}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Award className="h-4 w-4" />
                        Система мотивации
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Настройте структуру вознаграждения: оклад, переменная часть, бонусы.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <MotivationEditor plan={activeRolePlan} onChange={updateRolePlan} />
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  Выберите роль слева
                </div>
              )}
            </div>
          )}

          {/* ── Summary tab ── */}
          {activeTab === "summary" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Сводная таблица по ролям</CardTitle>
                <CardDescription className="text-xs">
                  {draft.name} — {draft.year} год
                  {linkedBm ? ` · Бизнес-модель: ${linkedBm.name}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SummaryTable roles={draft.roles} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Create plan dialog */}
      <CreatePlanDialog
        open={newPlanDialog}
        onOpenChange={setNewPlanDialog}
        name={newPlanName}
        year={newPlanYear}
        onNameChange={setNewPlanName}
        onYearChange={setNewPlanYear}
        onConfirm={handleCreatePlan}
        loading={createMutation.isPending}
      />
    </div>
  );
}

// ─── Create Plan Dialog ───────────────────────────────────────────────────────

function CreatePlanDialog({
  open,
  onOpenChange,
  name,
  year,
  onNameChange,
  onYearChange,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  name: string;
  year: number;
  onNameChange: (v: string) => void;
  onYearChange: (v: number) => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый план KPI</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Название плана</label>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Например: KPI отдела продаж 2025"
              onKeyDown={(e) => e.key === "Enter" && onConfirm()}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Год планирования</label>
            <Input
              type="number"
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              min={2020}
              max={2100}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={onConfirm} disabled={!name.trim() || loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
