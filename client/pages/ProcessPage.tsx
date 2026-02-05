import { useState, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth";
import { cn, formatDateTime } from "@/lib/utils";
import { exportToPNG, exportToBPMN, exportToPDF } from "@/lib/export";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { SwimlaneCanvas } from "@/components/SwimlaneCanvas";

import type {
  ProcessData,
  ProcessBlock,
  ProcessRole,
  ProcessStage,
  BlockType,
  ChangeRequest,
  Recommendation,
  ProcessVersion,
  CrmFunnel,
  CrmFunnelStage,
  ProcessMetrics,
  ProcessPassport,
  QualityCheckResult,
  QualityCheckItem,
} from "@shared/types";
import { BLOCK_CONFIG, TOKEN_COSTS } from "@shared/types";

import {
  ArrowLeft,
  Loader2,
  FileImage,
  FileCode2,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  X,
  Save,
  Clock,
  Users,
  GitFork,
  Layers,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Brain,
  MessageSquare,
  Table,
  Database,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  History,
  RotateCcw,
  Sparkles,
  Send,
  Eye,
  ArrowRightLeft,
  TrendingUp,
  Filter,
  ClipboardCheck,
  ScrollText,
  Shield,
  Target,
  FileCheck,
} from "lucide-react";

// ============================================
// Helper Functions
// ============================================

/**
 * Parse a Russian time estimate string to total minutes.
 * Supports: "X мин", "X ч", "X дн", "X час", combined like "1 ч 30 мин"
 */
function parseTimeEstimate(estimate: string | undefined): number {
  if (!estimate) return 0;
  let totalMinutes = 0;

  // Parse days
  const dayMatch = estimate.match(/(\d+(?:[.,]\d+)?)\s*(?:дн|дней|день|д\.?)/i);
  if (dayMatch) totalMinutes += parseFloat(dayMatch[1].replace(",", ".")) * 480; // 8h workday

  // Parse hours
  const hourMatch = estimate.match(/(\d+(?:[.,]\d+)?)\s*(?:ч|час|часов|часа)/i);
  if (hourMatch) totalMinutes += parseFloat(hourMatch[1].replace(",", ".")) * 60;

  // Parse minutes
  const minMatch = estimate.match(/(\d+(?:[.,]\d+)?)\s*(?:мин|минут|минуты)/i);
  if (minMatch) totalMinutes += parseFloat(minMatch[1].replace(",", "."));

  // If nothing matched, try to parse a plain number as minutes
  if (totalMinutes === 0) {
    const plainNumber = parseFloat(estimate.replace(",", "."));
    if (!isNaN(plainNumber)) totalMinutes = plainNumber;
  }

  return totalMinutes;
}

/**
 * Format total minutes back to a human-readable Russian string.
 */
function formatMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 мин";
  const days = Math.floor(totalMinutes / 480);
  const remaining = totalMinutes % 480;
  const hours = Math.floor(remaining / 60);
  const minutes = Math.round(remaining % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} дн`);
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  return parts.join(" ") || "0 мин";
}

/**
 * Calculate process metrics from ProcessData.
 */
function calculateMetrics(data: ProcessData): ProcessMetrics {
  const steps = data.blocks.filter(
    (b) => b.type !== "start" && b.type !== "end"
  ).length;

  const decisionPoints = data.blocks.filter(
    (b) => b.type === "decision"
  ).length;

  const rolesCount = data.roles.length;

  // Count handoffs: transitions between blocks belonging to different roles
  let handoffs = 0;
  for (const block of data.blocks) {
    for (const connId of block.connections) {
      const target = data.blocks.find((b) => b.id === connId);
      if (target && target.role !== block.role) {
        handoffs++;
      }
    }
  }

  // Total time
  let totalMinutes = 0;
  for (const block of data.blocks) {
    totalMinutes += parseTimeEstimate(block.timeEstimate);
  }

  // Critical path (longest path by time)
  const criticalPathMinutes = computeCriticalPath(data);

  return {
    steps,
    decisionPoints,
    roles: rolesCount,
    handoffs,
    totalTime: formatMinutes(totalMinutes),
    criticalPath: formatMinutes(criticalPathMinutes),
  };
}

/**
 * Compute the critical path duration using longest-path traversal from start blocks.
 */
function computeCriticalPath(data: ProcessData): number {
  const startBlocks = data.blocks.filter((b) => b.type === "start");
  const memo = new Map<string, number>();

  function longestFrom(blockId: string, visited: Set<string>): number {
    if (visited.has(blockId)) return 0;
    if (memo.has(blockId)) return memo.get(blockId)!;

    visited.add(blockId);
    const block = data.blocks.find((b) => b.id === blockId);
    if (!block) return 0;

    const ownTime = parseTimeEstimate(block.timeEstimate);
    let maxChild = 0;
    for (const connId of block.connections) {
      const childTime = longestFrom(connId, new Set(visited));
      if (childTime > maxChild) maxChild = childTime;
    }
    const total = ownTime + maxChild;
    memo.set(blockId, total);
    return total;
  }

  let maxPath = 0;
  for (const start of startBlocks) {
    const pathTime = longestFrom(start.id, new Set());
    if (pathTime > maxPath) maxPath = pathTime;
  }
  return maxPath;
}

/**
 * Generate CRM funnel variants from ProcessData.
 */
function generateCrmFunnels(data: ProcessData): CrmFunnel[] {
  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order);

  // Variant 1: Simple funnel (3-5 stages based on major stages)
  const simpleFunnel = buildSimpleFunnel(data, sortedStages);

  // Variant 2: Detailed funnel (one CRM stage per process stage)
  const detailedFunnel = buildDetailedFunnel(data, sortedStages);

  // Variant 3: Extended funnel (stages + sub-stages from blocks)
  const extendedFunnel = buildExtendedFunnel(data, sortedStages);

  return [simpleFunnel, detailedFunnel, extendedFunnel];
}

function buildSimpleFunnel(data: ProcessData, sortedStages: ProcessStage[]): CrmFunnel {
  // Pick evenly spaced stages to form 3-5 stages
  const targetCount = Math.min(5, Math.max(3, sortedStages.length));
  const step = Math.max(1, Math.floor(sortedStages.length / targetCount));
  const selectedStages: ProcessStage[] = [];
  for (let i = 0; i < sortedStages.length && selectedStages.length < targetCount; i += step) {
    selectedStages.push(sortedStages[i]);
  }
  // Always include the last stage
  if (selectedStages.length > 0 && selectedStages[selectedStages.length - 1].id !== sortedStages[sortedStages.length - 1].id) {
    if (selectedStages.length >= targetCount) {
      selectedStages[selectedStages.length - 1] = sortedStages[sortedStages.length - 1];
    } else {
      selectedStages.push(sortedStages[sortedStages.length - 1]);
    }
  }

  const stages: CrmFunnelStage[] = selectedStages.map((stage, idx) => {
    const relatedBlocks = data.blocks.filter((b) => b.stage === stage.name || b.stage === stage.id);
    return {
      id: `simple-${stage.id}`,
      name: stage.name,
      order: idx + 1,
      relatedBlockIds: relatedBlocks.map((b) => b.id),
      automations: relatedBlocks
        .filter((b) => b.infoSystems && b.infoSystems.length > 0)
        .flatMap((b) => b.infoSystems || [])
        .filter((v, i, a) => a.indexOf(v) === i),
      conversionTarget: Math.round(100 - (idx / (selectedStages.length - 1)) * 70),
    };
  });

  return {
    id: "funnel-simple",
    name: "Простая воронка",
    variant: 1,
    stages,
  };
}

function buildDetailedFunnel(data: ProcessData, sortedStages: ProcessStage[]): CrmFunnel {
  const stages: CrmFunnelStage[] = sortedStages.map((stage, idx) => {
    const relatedBlocks = data.blocks.filter((b) => b.stage === stage.name || b.stage === stage.id);
    return {
      id: `detailed-${stage.id}`,
      name: stage.name,
      order: idx + 1,
      relatedBlockIds: relatedBlocks.map((b) => b.id),
      automations: relatedBlocks
        .filter((b) => b.infoSystems && b.infoSystems.length > 0)
        .flatMap((b) => b.infoSystems || [])
        .filter((v, i, a) => a.indexOf(v) === i),
      conversionTarget: Math.round(100 - (idx / Math.max(sortedStages.length - 1, 1)) * 60),
    };
  });

  return {
    id: "funnel-detailed",
    name: "Детальная воронка",
    variant: 2,
    stages,
  };
}

function buildExtendedFunnel(data: ProcessData, sortedStages: ProcessStage[]): CrmFunnel {
  const stages: CrmFunnelStage[] = [];
  let order = 1;

  for (const stage of sortedStages) {
    const relatedBlocks = data.blocks.filter((b) => b.stage === stage.name || b.stage === stage.id);
    const actionBlocks = relatedBlocks.filter(
      (b) => b.type === "action" || b.type === "product" || b.type === "decision"
    );

    // Add main stage
    stages.push({
      id: `ext-stage-${stage.id}`,
      name: stage.name,
      order: order++,
      relatedBlockIds: relatedBlocks.map((b) => b.id),
      automations: [],
      conversionTarget: Math.round(100 - ((order - 2) / Math.max(sortedStages.length * 2, 1)) * 70),
    });

    // Add sub-stages from action/product blocks
    for (const block of actionBlocks) {
      stages.push({
        id: `ext-sub-${block.id}`,
        name: `  ${block.name}`,
        order: order++,
        relatedBlockIds: [block.id],
        automations: block.infoSystems || [],
        conversionTarget: Math.round(100 - ((order - 2) / Math.max(sortedStages.length * 3, 1)) * 70),
      });
    }
  }

  return {
    id: "funnel-extended",
    name: "Расширенная воронка",
    variant: 3,
    stages,
  };
}

/**
 * Compute the diff between two ProcessData objects for display.
 */
interface DiffItem {
  type: "added" | "removed" | "changed";
  category: "block" | "role" | "stage" | "meta";
  label: string;
  details?: string;
}

function computeProcessDiff(
  oldData: ProcessData,
  newData: ProcessData
): DiffItem[] {
  const items: DiffItem[] = [];

  // Meta changes
  if (oldData.name !== newData.name) {
    items.push({
      type: "changed",
      category: "meta",
      label: `Название: "${oldData.name}" -> "${newData.name}"`,
    });
  }
  if (oldData.goal !== newData.goal) {
    items.push({
      type: "changed",
      category: "meta",
      label: `Цель: изменена`,
      details: newData.goal,
    });
  }
  if (oldData.owner !== newData.owner) {
    items.push({
      type: "changed",
      category: "meta",
      label: `Владелец: "${oldData.owner}" -> "${newData.owner}"`,
    });
  }

  // Role diff
  const oldRoleIds = new Set(oldData.roles.map((r) => r.id));
  const newRoleIds = new Set(newData.roles.map((r) => r.id));
  for (const role of newData.roles) {
    if (!oldRoleIds.has(role.id)) {
      items.push({ type: "added", category: "role", label: `Роль: ${role.name}` });
    }
  }
  for (const role of oldData.roles) {
    if (!newRoleIds.has(role.id)) {
      items.push({ type: "removed", category: "role", label: `Роль: ${role.name}` });
    }
  }

  // Stage diff
  const oldStageIds = new Set(oldData.stages.map((s) => s.id));
  const newStageIds = new Set(newData.stages.map((s) => s.id));
  for (const stage of newData.stages) {
    if (!oldStageIds.has(stage.id)) {
      items.push({ type: "added", category: "stage", label: `Этап: ${stage.name}` });
    }
  }
  for (const stage of oldData.stages) {
    if (!newStageIds.has(stage.id)) {
      items.push({ type: "removed", category: "stage", label: `Этап: ${stage.name}` });
    }
  }

  // Block diff
  const oldBlockMap = new Map(oldData.blocks.map((b) => [b.id, b]));
  const newBlockMap = new Map(newData.blocks.map((b) => [b.id, b]));

  for (const [id, block] of newBlockMap) {
    if (!oldBlockMap.has(id)) {
      items.push({
        type: "added",
        category: "block",
        label: `Блок: ${block.name}`,
        details: `Тип: ${BLOCK_CONFIG[block.type]?.label}, Роль: ${block.role}`,
      });
    } else {
      const oldBlock = oldBlockMap.get(id)!;
      const changes: string[] = [];
      if (oldBlock.name !== block.name) changes.push(`название: "${oldBlock.name}" -> "${block.name}"`);
      if (oldBlock.type !== block.type) changes.push(`тип: ${BLOCK_CONFIG[oldBlock.type]?.label} -> ${BLOCK_CONFIG[block.type]?.label}`);
      if (oldBlock.role !== block.role) changes.push(`роль: "${oldBlock.role}" -> "${block.role}"`);
      if (oldBlock.description !== block.description) changes.push("описание изменено");
      if (JSON.stringify(oldBlock.connections) !== JSON.stringify(block.connections)) changes.push("связи изменены");
      if (changes.length > 0) {
        items.push({
          type: "changed",
          category: "block",
          label: `Блок: ${block.name}`,
          details: changes.join("; "),
        });
      }
    }
  }

  for (const [id, block] of oldBlockMap) {
    if (!newBlockMap.has(id)) {
      items.push({
        type: "removed",
        category: "block",
        label: `Блок: ${block.name}`,
        details: `Тип: ${BLOCK_CONFIG[block.type]?.label}, Роль: ${block.role}`,
      });
    }
  }

  return items;
}

// Category icon mapping for recommendations
const CATEGORY_ICONS: Record<string, typeof Brain> = {
  ai: Brain,
  crm: Users,
  chatbot: MessageSquare,
  spreadsheet: Table,
  "1c": Database,
};

const CATEGORY_LABELS: Record<string, string> = {
  ai: "Искусственный интеллект",
  crm: "CRM-система",
  chatbot: "Чат-бот",
  spreadsheet: "Электронные таблицы",
  "1c": "1С",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

// ============================================
// Main ProcessPage Component
// ============================================

export function ProcessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const processId = Number(id);

  // ---- Data Queries ----
  const processQuery = trpc.process.getById.useQuery(
    { id: processId },
    { enabled: !!processId }
  );

  // ---- State ----
  const [activeTab, setActiveTab] = useState("diagram");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [changeDescription, setChangeDescription] = useState("");
  const [pendingChangeRequest, setPendingChangeRequest] = useState<ChangeRequest | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Block editing state
  const [editingBlock, setEditingBlock] = useState<ProcessBlock | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<BlockType>("action");
  const [editRole, setEditRole] = useState("");

  // ---- Mutations ----
  const updateDataMutation = trpc.process.updateData.useMutation({
    onSuccess: () => {
      utils.process.getById.invalidate({ id: processId });
    },
  });

  const regenerateMutation = trpc.process.regenerate.useMutation({
    onSuccess: () => {
      utils.process.getById.invalidate({ id: processId });
    },
  });

  const requestChangeMutation = trpc.process.requestChange.useMutation({
    onSuccess: (changeRequest) => {
      setPendingChangeRequest(changeRequest as ChangeRequest);
    },
  });

  const applyChangeMutation = trpc.process.applyChange.useMutation({
    onSuccess: () => {
      setPendingChangeRequest(null);
      setChangeDialogOpen(false);
      setChangeDescription("");
      utils.process.getById.invalidate({ id: processId });
    },
  });

  const rejectChangeMutation = trpc.process.rejectChange.useMutation({
    onSuccess: () => {
      setPendingChangeRequest(null);
    },
  });

  // ---- Computed ----
  const process = processQuery.data;
  const data = process?.data as ProcessData | undefined;

  const selectedBlock = useMemo(() => {
    if (!data || !selectedBlockId) return null;
    return data.blocks.find((b) => b.id === selectedBlockId) || null;
  }, [data, selectedBlockId]);

  const metrics = useMemo(() => {
    if (!data) return null;
    return calculateMetrics(data);
  }, [data]);

  const crmFunnels = useMemo(() => {
    if (!data) return [];
    return generateCrmFunnels(data);
  }, [data]);

  // ---- Handlers ----
  const handleBlockClick = useCallback((blockId: string) => {
    setSelectedBlockId((prev) => (prev === blockId ? null : blockId));
  }, []);

  const handleStartEdit = useCallback(
    (block: ProcessBlock) => {
      setEditingBlock(block);
      setEditName(block.name);
      setEditDescription(block.description);
      setEditType(block.type);
      setEditRole(block.role);
    },
    []
  );

  const handleSaveEdit = useCallback(() => {
    if (!data || !editingBlock) return;

    const updatedBlocks = data.blocks.map((b) =>
      b.id === editingBlock.id
        ? { ...b, name: editName, description: editDescription, type: editType, role: editRole }
        : b
    );

    updateDataMutation.mutate({
      id: processId,
      data: { ...data, blocks: updatedBlocks },
    });
    setEditingBlock(null);
  }, [data, editingBlock, editName, editDescription, editType, editRole, processId, updateDataMutation]);

  const handleCancelEdit = useCallback(() => {
    setEditingBlock(null);
  }, []);

  const handleExportPNG = useCallback(() => {
    if (canvasContainerRef.current) {
      exportToPNG(canvasContainerRef.current, `${data?.name || "process"}.png`);
    }
  }, [data?.name]);

  const handleExportBPMN = useCallback(() => {
    if (data) {
      exportToBPMN(data, `${data.name || "process"}.bpmn`);
    }
  }, [data]);

  const handleExportPDF = useCallback(() => {
    if (canvasContainerRef.current && data) {
      exportToPDF(canvasContainerRef.current, `${data.name || "process"}.pdf`, data.name);
    }
  }, [data]);

  const handleRequestChange = useCallback(() => {
    if (!changeDescription.trim()) return;
    requestChangeMutation.mutate({
      processId,
      description: changeDescription.trim(),
    });
  }, [changeDescription, processId, requestChangeMutation]);

  const handleApplyChange = useCallback(() => {
    if (!pendingChangeRequest) return;
    applyChangeMutation.mutate({ changeRequestId: pendingChangeRequest.id });
  }, [pendingChangeRequest, applyChangeMutation]);

  const handleRejectChange = useCallback(() => {
    if (!pendingChangeRequest) return;
    rejectChangeMutation.mutate({ changeRequestId: pendingChangeRequest.id });
  }, [pendingChangeRequest, rejectChangeMutation]);

  // ---- Loading State ----
  if (processQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (processQuery.error || !process || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Не удалось загрузить процесс
        </h2>
        <p className="text-gray-500 mb-4">
          {processQuery.error?.message || "Процесс не найден"}
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
          Назад
        </Button>
      </div>
    );
  }

  // ---- Diff view for pending change request ----
  const diffItems = pendingChangeRequest
    ? computeProcessDiff(pendingChangeRequest.previousData, pendingChangeRequest.newData)
    : [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="mt-0.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
            <p className="text-gray-500 mt-1">{data.goal}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{data.owner}</Badge>
              <Badge
                variant="outline"
                className={cn(
                  process.status === "active" && "border-green-300 text-green-700 bg-green-50",
                  process.status === "draft" && "border-yellow-300 text-yellow-700 bg-yellow-50",
                  process.status === "archived" && "border-gray-300 text-gray-500 bg-gray-50"
                )}
              >
                {process.status === "active"
                  ? "Активный"
                  : process.status === "draft"
                    ? "Черновик"
                    : "Архив"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Change Request Dialog */}
          <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Send className="w-4 h-4" />
                Запросить изменения
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Запросить изменения процесса</DialogTitle>
                <DialogDescription>
                  Опишите, какие изменения нужно внести. ИИ предложит обновленную
                  версию процесса. Стоимость: {TOKEN_COSTS.change_request} токенов.
                </DialogDescription>
              </DialogHeader>

              {!pendingChangeRequest ? (
                <div className="space-y-4">
                  <Textarea
                    placeholder="Например: Добавить этап согласования с юридическим отделом перед подписанием договора..."
                    value={changeDescription}
                    onChange={(e) => setChangeDescription(e.target.value)}
                    rows={4}
                    disabled={requestChangeMutation.isPending}
                  />
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setChangeDialogOpen(false);
                        setChangeDescription("");
                      }}
                      disabled={requestChangeMutation.isPending}
                    >
                      Отмена
                    </Button>
                    <Button
                      onClick={handleRequestChange}
                      disabled={requestChangeMutation.isPending || !changeDescription.trim()}
                    >
                      {requestChangeMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Генерация...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Сгенерировать изменения
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 font-medium mb-2">
                    Предлагаемые изменения:
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2 rounded-lg border border-gray-200 p-3">
                    {diffItems.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">
                        Изменений не обнаружено
                      </p>
                    ) : (
                      diffItems.map((item, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-start gap-2 px-3 py-2 rounded-md text-sm",
                            item.type === "added" && "bg-green-50 border border-green-200",
                            item.type === "removed" && "bg-red-50 border border-red-200",
                            item.type === "changed" && "bg-blue-50 border border-blue-200"
                          )}
                        >
                          {item.type === "added" && (
                            <Plus className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                          )}
                          {item.type === "removed" && (
                            <Minus className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                          )}
                          {item.type === "changed" && (
                            <ArrowRightLeft className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                          )}
                          <div>
                            <div
                              className={cn(
                                "font-medium",
                                item.type === "added" && "text-green-700",
                                item.type === "removed" && "text-red-700",
                                item.type === "changed" && "text-blue-700"
                              )}
                            >
                              {item.label}
                            </div>
                            {item.details && (
                              <div className="text-gray-500 mt-0.5">{item.details}</div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={handleRejectChange}
                      disabled={applyChangeMutation.isPending || rejectChangeMutation.isPending}
                    >
                      {rejectChangeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      Отменить
                    </Button>
                    <Button
                      onClick={handleApplyChange}
                      disabled={applyChangeMutation.isPending || rejectChangeMutation.isPending}
                    >
                      {applyChangeMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Применение...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Применить
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Regenerate Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4" />
                Сгенерировать заново
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Перегенерация процесса</AlertDialogTitle>
                <AlertDialogDescription>
                  Текущая версия процесса будет заменена новой, сгенерированной
                  ИИ на основе данных интервью. Текущая версия сохранится в
                  истории. Стоимость: {TOKEN_COSTS.regeneration} токенов.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => regenerateMutation.mutate({ id: processId })}
                  disabled={regenerateMutation.isPending}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {regenerateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Генерация...
                    </>
                  ) : (
                    "Перегенерировать"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="diagram">Диаграмма</TabsTrigger>
          <TabsTrigger value="stages">Этапы</TabsTrigger>
          <TabsTrigger value="metrics">Метрики</TabsTrigger>
          <TabsTrigger value="crm">CRM-воронки</TabsTrigger>
          <TabsTrigger value="passport">Паспорт</TabsTrigger>
          <TabsTrigger value="quality">Качество</TabsTrigger>
          <TabsTrigger value="recommendations">Рекомендации</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>

        {/* ======== Tab: Diagram ======== */}
        <TabsContent value="diagram">
          <DiagramTab
            data={data}
            processId={processId}
            selectedBlockId={selectedBlockId}
            selectedBlock={selectedBlock}
            editingBlock={editingBlock}
            editName={editName}
            editDescription={editDescription}
            editType={editType}
            editRole={editRole}
            zoom={zoom}
            canvasContainerRef={canvasContainerRef}
            updateDataMutation={updateDataMutation}
            onBlockClick={handleBlockClick}
            onStartEdit={handleStartEdit}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onClosePanel={() => setSelectedBlockId(null)}
            onSetEditName={setEditName}
            onSetEditDescription={setEditDescription}
            onSetEditType={setEditType}
            onSetEditRole={setEditRole}
            onSetZoom={setZoom}
            onExportPNG={handleExportPNG}
            onExportBPMN={handleExportBPMN}
            onExportPDF={handleExportPDF}
          />
        </TabsContent>

        {/* ======== Tab: Stages ======== */}
        <TabsContent value="stages">
          <StagesTab data={data} />
        </TabsContent>

        {/* ======== Tab: Metrics ======== */}
        <TabsContent value="metrics">
          <MetricsTab metrics={metrics} data={data} />
        </TabsContent>

        {/* ======== Tab: CRM Funnels ======== */}
        <TabsContent value="crm">
          <CrmFunnelsTab funnels={crmFunnels} data={data} />
        </TabsContent>

        {/* ======== Tab: Passport ======== */}
        <TabsContent value="passport">
          <PassportTab processId={processId} />
        </TabsContent>

        {/* ======== Tab: Quality ======== */}
        <TabsContent value="quality">
          <QualityTab processId={processId} />
        </TabsContent>

        {/* ======== Tab: Recommendations ======== */}
        <TabsContent value="recommendations">
          <RecommendationsTab processId={processId} />
        </TabsContent>

        {/* ======== Tab: History ======== */}
        <TabsContent value="history">
          <HistoryTab processId={processId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// Tab: Diagram
// ============================================

interface DiagramTabProps {
  data: ProcessData;
  processId: number;
  selectedBlockId: string | null;
  selectedBlock: ProcessBlock | null;
  editingBlock: ProcessBlock | null;
  editName: string;
  editDescription: string;
  editType: BlockType;
  editRole: string;
  zoom: number;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  updateDataMutation: { isPending: boolean };
  onBlockClick: (blockId: string) => void;
  onStartEdit: (block: ProcessBlock) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onClosePanel: () => void;
  onSetEditName: (v: string) => void;
  onSetEditDescription: (v: string) => void;
  onSetEditType: (v: BlockType) => void;
  onSetEditRole: (v: string) => void;
  onSetZoom: (v: number | ((prev: number) => number)) => void;
  onExportPNG: () => void;
  onExportBPMN: () => void;
  onExportPDF: () => void;
}

function DiagramTab({
  data,
  selectedBlockId,
  selectedBlock,
  editingBlock,
  editName,
  editDescription,
  editType,
  editRole,
  zoom,
  canvasContainerRef,
  updateDataMutation,
  onBlockClick,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onClosePanel,
  onSetEditName,
  onSetEditDescription,
  onSetEditType,
  onSetEditRole,
  onSetZoom,
  onExportPNG,
  onExportBPMN,
  onExportPDF,
}: DiagramTabProps) {
  return (
    <div className="flex gap-4">
      {/* Main Canvas Area */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onSetZoom((z: number) => Math.max(0.25, z - 0.1))}
              title="Уменьшить"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-gray-500 w-14 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onSetZoom((z: number) => Math.min(3, z + 0.1))}
              title="Увеличить"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onSetZoom(1)}
              title="Сбросить масштаб"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onExportPNG}>
              <FileImage className="w-4 h-4" />
              PNG
            </Button>
            <Button variant="outline" size="sm" onClick={onExportBPMN}>
              <FileCode2 className="w-4 h-4" />
              BPMN
            </Button>
            <Button variant="outline" size="sm" onClick={onExportPDF}>
              <FileText className="w-4 h-4" />
              PDF
            </Button>
          </div>
        </div>

        {/* Canvas Container */}
        <div
          ref={canvasContainerRef}
          className="border border-gray-200 rounded-xl bg-white overflow-auto"
          style={{ minHeight: "500px", maxHeight: "calc(100vh - 320px)" }}
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              transition: "transform 0.15s ease",
            }}
          >
            <SwimlaneCanvas
              data={data}
              onBlockClick={onBlockClick}
              selectedBlockId={selectedBlockId}
            />
          </div>
        </div>
      </div>

      {/* Side Panel - Block Details */}
      {selectedBlock && (
        <div className="w-80 shrink-0">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Блок</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onClosePanel}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {editingBlock?.id === selectedBlock.id ? (
                /* Editing Mode */
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Название
                    </label>
                    <Input
                      value={editName}
                      onChange={(e) => onSetEditName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Описание
                    </label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => onSetEditDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Тип
                    </label>
                    <select
                      className="flex h-9 w-full rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm"
                      value={editType}
                      onChange={(e) => onSetEditType(e.target.value as BlockType)}
                    >
                      {Object.entries(BLOCK_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>
                          {cfg.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Роль
                    </label>
                    <select
                      className="flex h-9 w-full rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm"
                      value={editRole}
                      onChange={(e) => onSetEditRole(e.target.value)}
                    >
                      {data.roles.map((role) => (
                        <option key={role.id} value={role.name}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={onSaveEdit}
                      disabled={updateDataMutation.isPending}
                    >
                      {updateDataMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Сохранить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onCancelEdit}
                    >
                      Отмена
                    </Button>
                  </div>
                </>
              ) : (
                /* View Mode */
                <>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {selectedBlock.name}
                    </h3>
                    <Badge
                      variant="secondary"
                      className="mt-1"
                      style={{
                        borderColor: BLOCK_CONFIG[selectedBlock.type]?.borderColor,
                        borderWidth: "1px",
                      }}
                    >
                      {BLOCK_CONFIG[selectedBlock.type]?.label}
                    </Badge>
                  </div>

                  {selectedBlock.description && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Описание
                      </div>
                      <p className="text-sm text-gray-700">
                        {selectedBlock.description}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Роль
                      </div>
                      <p className="text-sm text-gray-900">{selectedBlock.role}</p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Этап
                      </div>
                      <p className="text-sm text-gray-900">{selectedBlock.stage}</p>
                    </div>
                  </div>

                  {selectedBlock.timeEstimate && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Время выполнения
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-900">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {selectedBlock.timeEstimate}
                      </div>
                    </div>
                  )}

                  {selectedBlock.inputDocuments && selectedBlock.inputDocuments.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Входные документы
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedBlock.inputDocuments.map((doc, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {doc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedBlock.outputDocuments && selectedBlock.outputDocuments.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Выходные документы
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedBlock.outputDocuments.map((doc, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {doc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedBlock.infoSystems && selectedBlock.infoSystems.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Информационные системы
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedBlock.infoSystems.map((sys, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {sys}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedBlock.conditionLabel && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Условие
                      </div>
                      <p className="text-sm text-gray-900">
                        {selectedBlock.conditionLabel}
                      </p>
                    </div>
                  )}

                  {selectedBlock.connections.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Связи ({selectedBlock.connections.length})
                      </div>
                      <div className="space-y-1">
                        {selectedBlock.connections.map((connId) => {
                          const connBlock = data.blocks.find((b) => b.id === connId);
                          return (
                            <button
                              key={connId}
                              className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-700 hover:underline w-full text-left"
                              onClick={() => onBlockClick(connId)}
                            >
                              <ChevronRight className="w-3 h-3 shrink-0" />
                              {connBlock?.name || connId}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => onStartEdit(selectedBlock)}
                  >
                    Редактировать
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================
// Tab: Stages
// ============================================

function StagesTab({ data }: { data: ProcessData }) {
  const sortedStages = useMemo(
    () => [...data.stages].sort((a, b) => a.order - b.order),
    [data.stages]
  );

  const blocksByStage = useMemo(() => {
    const map = new Map<string, ProcessBlock[]>();
    for (const stage of sortedStages) {
      const stageBlocks = data.blocks.filter(
        (b) => b.stage === stage.name || b.stage === stage.id
      );
      // Order blocks by following connections where possible
      map.set(stage.id, orderBlocksByConnections(stageBlocks, data.blocks));
    }
    return map;
  }, [data.blocks, sortedStages, data]);

  return (
    <div className="space-y-6">
      {sortedStages.map((stage, stageIdx) => {
        const blocks = blocksByStage.get(stage.id) || [];
        return (
          <Card key={stage.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-sm font-bold">
                  {stageIdx + 1}
                </div>
                <div>
                  <CardTitle className="text-base">{stage.name}</CardTitle>
                  <CardDescription>
                    {blocks.length}{" "}
                    {blocks.length === 1
                      ? "блок"
                      : blocks.length < 5
                        ? "блока"
                        : "блоков"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {blocks.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  Нет блоков на этом этапе
                </p>
              ) : (
                <div className="space-y-2">
                  {blocks.map((block) => (
                    <div
                      key={block.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors bg-gray-50/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-2 h-8 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              BLOCK_CONFIG[block.type]?.borderColor || "#6b7280",
                          }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {block.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {BLOCK_CONFIG[block.type]?.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {block.role}
                            </span>
                            {block.timeEstimate && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {block.timeEstimate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {block.connections.length > 0 && (
                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Unassigned blocks */}
      {(() => {
        const stageNames = new Set(data.stages.map((s) => s.name));
        const stageIds = new Set(data.stages.map((s) => s.id));
        const unassigned = data.blocks.filter(
          (b) => !stageNames.has(b.stage) && !stageIds.has(b.stage)
        );
        if (unassigned.length === 0) return null;
        return (
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-gray-500">
                Без этапа
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {unassigned.map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/30"
                  >
                    <div
                      className="w-2 h-8 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          BLOCK_CONFIG[block.type]?.borderColor || "#6b7280",
                      }}
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {block.name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 ml-2"
                      >
                        {BLOCK_CONFIG[block.type]?.label}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}

/**
 * Order blocks within a stage by following connections when possible.
 */
function orderBlocksByConnections(
  stageBlocks: ProcessBlock[],
  allBlocks: ProcessBlock[]
): ProcessBlock[] {
  if (stageBlocks.length <= 1) return stageBlocks;

  const stageBlockIds = new Set(stageBlocks.map((b) => b.id));
  const incomingCount = new Map<string, number>();
  for (const b of stageBlocks) {
    incomingCount.set(b.id, 0);
  }
  for (const b of allBlocks) {
    for (const connId of b.connections) {
      if (stageBlockIds.has(connId) && stageBlockIds.has(b.id)) {
        incomingCount.set(connId, (incomingCount.get(connId) || 0) + 1);
      }
    }
  }

  // Topological sort
  const ordered: ProcessBlock[] = [];
  const visited = new Set<string>();
  const queue = stageBlocks
    .filter((b) => (incomingCount.get(b.id) || 0) === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  while (queue.length > 0) {
    const block = queue.shift()!;
    if (visited.has(block.id)) continue;
    visited.add(block.id);
    ordered.push(block);

    for (const connId of block.connections) {
      if (stageBlockIds.has(connId) && !visited.has(connId)) {
        const connBlock = stageBlocks.find((b) => b.id === connId);
        if (connBlock) queue.push(connBlock);
      }
    }
  }

  // Add any blocks that weren't reachable
  for (const b of stageBlocks) {
    if (!visited.has(b.id)) {
      ordered.push(b);
    }
  }

  return ordered;
}

// ============================================
// Tab: Metrics
// ============================================

function MetricsTab({
  metrics,
  data,
}: {
  metrics: ProcessMetrics | null;
  data: ProcessData;
}) {
  if (!metrics) return null;

  const metricCards = [
    {
      label: "Всего шагов",
      value: metrics.steps,
      icon: Layers,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      label: "Ролей",
      value: metrics.roles,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      label: "Точки решений",
      value: metrics.decisionPoints,
      icon: GitFork,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
    },
    {
      label: "Передачи между ролями",
      value: metrics.handoffs,
      icon: ArrowRightLeft,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      label: "Общее время",
      value: metrics.totalTime,
      icon: Clock,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      label: "Критический путь",
      value: metrics.criticalPath,
      icon: TrendingUp,
      color: "text-red-600",
      bgColor: "bg-red-100",
    },
  ];

  // Compute type distribution
  const typeDistribution = data.blocks.reduce(
    (acc, block) => {
      acc[block.type] = (acc[block.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Role workload
  const roleWorkload = data.roles.map((role) => {
    const roleBlocks = data.blocks.filter((b) => b.role === role.name);
    const totalMinutes = roleBlocks.reduce(
      (sum, b) => sum + parseTimeEstimate(b.timeEstimate),
      0
    );
    return {
      role,
      blockCount: roleBlocks.length,
      totalTime: formatMinutes(totalMinutes),
      totalMinutes,
    };
  });

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metricCards.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    metric.bgColor
                  )}
                >
                  <metric.icon className={cn("w-5 h-5", metric.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">{metric.label}</p>
                  <p className="text-lg font-bold text-gray-900">{metric.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Распределение по типам блоков</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(typeDistribution).map(([type, count]) => {
              const config = BLOCK_CONFIG[type as BlockType];
              const percentage = Math.round(
                (count / data.blocks.length) * 100
              );
              return (
                <div key={type} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-gray-600 shrink-0">
                    {config?.label || type}
                  </div>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: config?.borderColor || "#6b7280",
                        minWidth: "24px",
                      }}
                    />
                  </div>
                  <div className="w-16 text-sm text-gray-500 text-right shrink-0">
                    {count} ({percentage}%)
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Role Workload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Нагрузка по ролям</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {roleWorkload
              .sort((a, b) => b.totalMinutes - a.totalMinutes)
              .map(({ role, blockCount, totalTime, totalMinutes }) => {
                const maxMinutes = Math.max(
                  ...roleWorkload.map((r) => r.totalMinutes),
                  1
                );
                const barWidth = Math.round((totalMinutes / maxMinutes) * 100);
                return (
                  <div key={role.id} className="flex items-center gap-3">
                    <div className="w-32 text-sm text-gray-600 truncate shrink-0">
                      {role.name}
                    </div>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barWidth || 2}%`,
                          backgroundColor: role.color || "#7c3aed",
                          minWidth: "24px",
                        }}
                      />
                    </div>
                    <div className="w-28 text-sm text-gray-500 text-right shrink-0">
                      {blockCount} бл. / {totalTime}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Tab: CRM Funnels
// ============================================

function CrmFunnelsTab({
  funnels,
  data,
}: {
  funnels: CrmFunnel[];
  data: ProcessData;
}) {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  const toggleStage = useCallback((stageId: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  }, []);

  if (funnels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Filter className="w-12 h-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Воронки недоступны
        </h3>
        <p className="text-gray-500">
          Недостаточно данных для генерации CRM-воронок
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {funnels.map((funnel) => (
        <Card key={funnel.id}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold">
                {funnel.variant}
              </div>
              <div>
                <CardTitle className="text-base">{funnel.name}</CardTitle>
                <CardDescription>
                  {funnel.stages.length}{" "}
                  {funnel.stages.length === 1
                    ? "этап"
                    : funnel.stages.length < 5
                      ? "этапа"
                      : "этапов"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {funnel.stages.map((stage, idx) => {
                const isExpanded = expandedStages.has(stage.id);
                const relatedBlocks = stage.relatedBlockIds
                  .map((bid) => data.blocks.find((b) => b.id === bid))
                  .filter(Boolean) as ProcessBlock[];

                // Funnel width decreases from top to bottom
                const widthPercent =
                  100 -
                  (idx / Math.max(funnel.stages.length - 1, 1)) * 40;
                const isSubStage = stage.name.startsWith("  ");

                return (
                  <div key={stage.id} className="mb-1">
                    <button
                      className={cn(
                        "w-full text-left transition-all",
                        "rounded-md border px-3 py-2",
                        isSubStage
                          ? "bg-gray-50 border-gray-200 ml-4"
                          : "bg-purple-50 border-purple-200 hover:bg-purple-100"
                      )}
                      style={{
                        maxWidth: isSubStage ? `${widthPercent - 5}%` : `${widthPercent}%`,
                        marginLeft: isSubStage ? "16px" : "auto",
                        marginRight: "auto",
                      }}
                      onClick={() => toggleStage(stage.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "text-sm font-medium truncate",
                              isSubStage ? "text-gray-600" : "text-purple-800"
                            )}
                          >
                            {stage.name.trim()}
                          </span>
                          {stage.conversionTarget !== undefined && !isSubStage && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0 shrink-0 border-purple-300 text-purple-600"
                            >
                              {stage.conversionTarget}%
                            </Badge>
                          )}
                        </div>
                        {relatedBlocks.length > 0 && (
                          <ChevronDown
                            className={cn(
                              "w-3.5 h-3.5 text-gray-400 transition-transform shrink-0",
                              isExpanded && "rotate-180"
                            )}
                          />
                        )}
                      </div>
                    </button>

                    {isExpanded && relatedBlocks.length > 0 && (
                      <div
                        className="mt-1 mb-2 space-y-1 pl-6"
                        style={{ maxWidth: `${widthPercent - 5}%` }}
                      >
                        {relatedBlocks.map((block) => (
                          <div
                            key={block.id}
                            className="flex items-center gap-2 text-xs text-gray-600 py-1 px-2 rounded bg-white border border-gray-100"
                          >
                            <div
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  BLOCK_CONFIG[block.type]?.borderColor || "#6b7280",
                              }}
                            />
                            <span className="truncate">{block.name}</span>
                          </div>
                        ))}
                        {stage.automations.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {stage.automations.map((auto, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {auto}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================
// Tab: Recommendations
// ============================================

function RecommendationsTab({ processId }: { processId: number }) {
  const utils = trpc.useUtils();

  const recommendationsQuery = trpc.process.getRecommendations.useQuery({
    processId,
  });

  const generateMutation = trpc.process.generateRecommendations.useMutation({
    onSuccess: () => {
      utils.process.getRecommendations.invalidate({ processId });
    },
  });

  const recommendations = (recommendationsQuery.data || []) as Recommendation[];

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, Recommendation[]>();
    for (const rec of recommendations) {
      const list = map.get(rec.category) || [];
      list.push(rec);
      map.set(rec.category, list);
    }
    return map;
  }, [recommendations]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Рекомендации по оптимизации
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            ИИ-рекомендации для улучшения бизнес-процесса
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate({ processId })}
          disabled={generateMutation.isPending}
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Генерация...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Сгенерировать рекомендации
            </>
          )}
        </Button>
      </div>

      {recommendationsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      ) : recommendations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Рекомендаций пока нет
            </h3>
            <p className="text-gray-500 text-sm max-w-sm">
              Нажмите кнопку "Сгенерировать рекомендации", чтобы получить
              ИИ-рекомендации по оптимизации процесса.
              Стоимость: {TOKEN_COSTS.recommendations} токенов.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([category, recs]) => {
            const IconComp = CATEGORY_ICONS[category] || Brain;
            const categoryLabel = CATEGORY_LABELS[category] || category;

            return (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                      <IconComp className="w-4 h-4 text-purple-600" />
                    </div>
                    <CardTitle className="text-base">{categoryLabel}</CardTitle>
                    <Badge variant="secondary" className="ml-auto">
                      {recs.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recs.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-3 rounded-lg border border-gray-100 bg-gray-50/50"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-sm font-medium text-gray-900">
                            {rec.title}
                          </h4>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0 shrink-0",
                              PRIORITY_COLORS[rec.priority]
                            )}
                          >
                            {PRIORITY_LABELS[rec.priority]}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">{rec.description}</p>
                        {rec.relatedSteps.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {rec.relatedSteps.map((step, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {step}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// Tab: History
// ============================================

function HistoryTab({ processId }: { processId: number }) {
  const utils = trpc.useUtils();

  const versionsQuery = trpc.process.getVersions.useQuery({ processId });
  const changeRequestsQuery = trpc.process.getChangeRequests.useQuery({
    processId,
  });

  const rollbackMutation = trpc.process.rollback.useMutation({
    onSuccess: () => {
      utils.process.getById.invalidate({ id: processId });
      utils.process.getVersions.invalidate({ processId });
    },
  });

  const versions = (versionsQuery.data || []) as ProcessVersion[];
  const changeRequests = (changeRequestsQuery.data || []) as ChangeRequest[];

  const [historyTab, setHistoryTab] = useState<"versions" | "changes">("versions");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant={historyTab === "versions" ? "default" : "outline"}
          size="sm"
          onClick={() => setHistoryTab("versions")}
        >
          <History className="w-4 h-4" />
          Версии ({versions.length})
        </Button>
        <Button
          variant={historyTab === "changes" ? "default" : "outline"}
          size="sm"
          onClick={() => setHistoryTab("changes")}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Запросы изменений ({changeRequests.length})
        </Button>
      </div>

      {historyTab === "versions" && (
        <VersionsList
          versions={versions}
          isLoading={versionsQuery.isLoading}
          rollbackMutation={rollbackMutation}
        />
      )}

      {historyTab === "changes" && (
        <ChangeRequestsList
          changeRequests={changeRequests}
          isLoading={changeRequestsQuery.isLoading}
        />
      )}
    </div>
  );
}

function VersionsList({
  versions,
  isLoading,
  rollbackMutation,
}: {
  versions: ProcessVersion[];
  isLoading: boolean;
  rollbackMutation: { mutate: (input: { versionId: number }) => void; isPending: boolean };
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <History className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Нет сохраненных версий
          </h3>
          <p className="text-gray-500 text-sm">
            Версии создаются автоматически при изменении процесса
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {versions.map((version, idx) => (
        <Card key={version.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">
                  v{versions.length - idx}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {version.description || `Версия ${versions.length - idx}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {formatDateTime(version.createdAt)}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                    <span>{version.data.blocks.length} блоков</span>
                    <span className="text-gray-300">|</span>
                    <span>{version.data.roles.length} ролей</span>
                    <span className="text-gray-300">|</span>
                    <span>{version.data.stages.length} этапов</span>
                  </div>
                </div>
              </div>

              {idx > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <RotateCcw className="w-4 h-4" />
                      Откатить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Откат к версии</AlertDialogTitle>
                      <AlertDialogDescription>
                        Текущая версия процесса будет заменена на выбранную.
                        Текущая версия сохранится в истории.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          rollbackMutation.mutate({ versionId: version.id })
                        }
                        disabled={rollbackMutation.isPending}
                      >
                        {rollbackMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Откат...
                          </>
                        ) : (
                          "Откатить"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChangeRequestsList({
  changeRequests,
  isLoading,
}: {
  changeRequests: ChangeRequest[];
  isLoading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  if (changeRequests.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Send className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Нет запросов изменений
          </h3>
          <p className="text-gray-500 text-sm">
            Используйте кнопку "Запросить изменения" для создания запроса
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {changeRequests.map((cr) => {
        const isExpanded = expandedId === cr.id;
        const diffItems =
          isExpanded && cr.previousData && cr.newData
            ? computeProcessDiff(cr.previousData, cr.newData)
            : [];

        return (
          <Card key={cr.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        cr.status === "applied" &&
                          "border-green-300 text-green-700 bg-green-50",
                        cr.status === "rejected" &&
                          "border-red-300 text-red-700 bg-red-50",
                        cr.status === "pending" &&
                          "border-yellow-300 text-yellow-700 bg-yellow-50"
                      )}
                    >
                      {cr.status === "applied"
                        ? "Применено"
                        : cr.status === "rejected"
                          ? "Отклонено"
                          : "Ожидание"}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(cr.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900">{cr.description}</p>
                </div>

                {cr.previousData && cr.newData && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedId(isExpanded ? null : cr.id)}
                  >
                    <Eye className="w-4 h-4" />
                    {isExpanded ? "Скрыть" : "Детали"}
                  </Button>
                )}
              </div>

              {isExpanded && diffItems.length > 0 && (
                <div className="mt-3 space-y-1.5 rounded-lg border border-gray-200 p-3">
                  {diffItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-start gap-2 px-2 py-1.5 rounded text-xs",
                        item.type === "added" && "bg-green-50 text-green-700",
                        item.type === "removed" && "bg-red-50 text-red-700",
                        item.type === "changed" && "bg-blue-50 text-blue-700"
                      )}
                    >
                      {item.type === "added" && <Plus className="w-3 h-3 mt-0.5 shrink-0" />}
                      {item.type === "removed" && <Minus className="w-3 h-3 mt-0.5 shrink-0" />}
                      {item.type === "changed" && (
                        <ArrowRightLeft className="w-3 h-3 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className="font-medium">{item.label}</span>
                        {item.details && (
                          <span className="text-gray-500 ml-1">
                            ({item.details})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================
// Tab: Passport (Process Passport)
// ============================================

function PassportTab({ processId }: { processId: number }) {
  const passportQuery = trpc.process.getPassport.useQuery({ processId });

  if (passportQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-gray-500">Формирование паспорта...</span>
      </div>
    );
  }

  if (passportQuery.error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-500">
          Ошибка загрузки паспорта: {passportQuery.error.message}
        </CardContent>
      </Card>
    );
  }

  const p = passportQuery.data!;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-blue-600" />
            <CardTitle>Паспорт процесса</CardTitle>
          </div>
          <CardDescription>
            Полное описание процесса в формате текстового паспорта BPMN
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Название</p>
              <p className="font-medium">{p.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Владелец</p>
              <p className="font-medium">{p.owner}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Цель</p>
              <p className="text-sm">{p.goal}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Версия</p>
              <p className="text-sm">{p.version} | {new Date(p.lastUpdated).toLocaleDateString("ru")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Boundaries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4" /> Границы процесса
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-xs text-green-700 font-semibold mb-1">Вход / Триггер</p>
              <p className="text-sm">{p.boundaries.start}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700 font-semibold mb-1">Масштаб</p>
              <p className="text-sm">{p.boundaries.scope}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <p className="text-xs text-red-700 font-semibold mb-1">Выход / Результат</p>
              <p className="text-sm">{p.boundaries.end}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roles (RACI) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Роли (RACI)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Роль</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Отдел</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">RACI</th>
                </tr>
              </thead>
              <tbody>
                {p.roles.map((role, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 px-3">{role.name}</td>
                    <td className="py-2 px-3 text-gray-500">{role.department || "—"}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant={role.raci === "A" ? "default" : "secondary"}>
                        {role.raci}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Main Flow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ChevronRight className="w-4 h-4" /> Основной поток
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {p.mainFlow.map((step) => (
              <div key={step.order} className="flex items-start gap-3 py-2 border-b last:border-0">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {step.order}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{step.name}</p>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">{step.role}</span> — {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Documents & Systems */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Документы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {p.documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm">
                  <Badge variant="outline" className="text-xs">
                    {doc.type === "input" ? "Вход" : doc.type === "output" ? "Выход" : "Промеж."}
                  </Badge>
                  <span>{doc.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4" /> Информационные системы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {p.systems.map((sys, i) => (
                <Badge key={i} variant="secondary">{sys}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SLA & Risks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" /> SLA / Метрики
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {p.sla.slice(0, 10).map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span className="text-gray-700 truncate mr-2">{item.metric}</span>
                  <Badge variant="outline">{item.target}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" /> Риски и контроли
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {p.risks.map((risk, i) => (
                <div key={i} className="text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={risk.impact === "high" ? "destructive" : "secondary"} className="text-xs">
                      {risk.impact}
                    </Badge>
                    <span>{risk.description}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 ml-14">{risk.control}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exceptions */}
      {p.exceptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Исключения / Альтернативы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {p.exceptions.map((exc, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-orange-500 mt-0.5">&#9679;</span>
                  {exc}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// Tab: Quality (Checklist)
// ============================================

function QualityTab({ processId }: { processId: number }) {
  const qualityQuery = trpc.process.validateQuality.useQuery({ processId });

  if (qualityQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-gray-500">Проверка качества...</span>
      </div>
    );
  }

  if (qualityQuery.error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-500">
          Ошибка проверки: {qualityQuery.error.message}
        </CardContent>
      </Card>
    );
  }

  const result = qualityQuery.data!;
  const categories = [...new Set(result.items.map(i => i.category))];
  const scoreColor = result.score >= 80 ? "text-green-600" : result.score >= 60 ? "text-yellow-600" : "text-red-600";
  const scoreBg = result.score >= 80 ? "bg-green-50" : result.score >= 60 ? "bg-yellow-50" : "bg-red-50";

  return (
    <div className="space-y-4">
      {/* Score Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-600" />
            <CardTitle>Контроль качества модели</CardTitle>
          </div>
          <CardDescription>
            Автоматическая проверка диаграммы по стандартам BPMN 2.0
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className={cn("w-24 h-24 rounded-full flex items-center justify-center", scoreBg)}>
              <span className={cn("text-3xl font-bold", scoreColor)}>{result.score}</span>
            </div>
            <div className="flex-1">
              <p className="text-lg font-medium mb-1">{result.summary}</p>
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  {result.items.filter(i => i.passed).length} пройдено
                </span>
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="w-4 h-4" />
                  {result.items.filter(i => !i.passed && i.severity === "error").length} ошибок
                </span>
                <span className="flex items-center gap-1 text-yellow-600">
                  <AlertCircle className="w-4 h-4" />
                  {result.items.filter(i => !i.passed && i.severity === "warning").length} предупреждений
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Check Items by Category */}
      {categories.map((category) => {
        const catItems = result.items.filter(i => i.category === category);
        const catPassed = catItems.filter(i => i.passed).length;
        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="w-4 h-4" />
                  {category}
                </CardTitle>
                <Badge variant={catPassed === catItems.length ? "default" : "secondary"}>
                  {catPassed}/{catItems.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 py-2 px-3 rounded-lg text-sm",
                      item.passed ? "bg-green-50" : item.severity === "error" ? "bg-red-50" : item.severity === "warning" ? "bg-yellow-50" : "bg-gray-50"
                    )}
                  >
                    <div className="mt-0.5">
                      {item.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : item.severity === "error" ? (
                        <XCircle className="w-4 h-4 text-red-600" />
                      ) : item.severity === "warning" ? (
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={cn("font-medium", item.passed ? "text-green-800" : item.severity === "error" ? "text-red-800" : "text-gray-800")}>
                        {item.rule}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
