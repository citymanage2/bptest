import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth";
import { cn, formatDateTime } from "@/lib/utils";
import { exportToPNG, exportToBPMN, exportToPDF } from "@/lib/export";
import { useGenerationProgress } from "@/hooks/useGenerationProgress";

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  SwimlaneCanvas,
  type SwimlaneCanvasHandle,
} from "@/components/SwimlaneCanvas";

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
  CrmFunnelStatus,
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
  TrendingDown,
  Filter,
  ClipboardCheck,
  ScrollText,
  Shield,
  Target,
  FileCheck,
  Fullscreen,
  UserCircle,
  Timer,
  ListChecks,
  LogOut,
  PauseCircle,
  XOctagon,
  Trophy,
  Search,
  Copy,
  Zap,
  GitBranch,
  Download,
  FileArchive,
  BookOpen,
  Briefcase,
  Check,
  Undo2,
  Redo2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { saveAs } from "file-saver";

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
  const active = data.blocks.filter((b) => b.isActive !== false);

  const steps = active.filter(
    (b) => b.type !== "start" && b.type !== "end"
  ).length;

  const decisionPoints = active.filter(
    (b) => b.type === "decision"
  ).length;

  const rolesCount = data.roles.length;

  // Count handoffs: transitions between active blocks belonging to different roles
  let handoffs = 0;
  for (const block of active) {
    for (const connId of block.connections) {
      const target = active.find((b) => b.id === connId);
      if (target && target.role !== block.role) {
        handoffs++;
      }
    }
  }

  // Total time (active only)
  let totalMinutes = 0;
  for (const block of active) {
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
  const activeOnly = data.blocks.filter((b) => b.isActive !== false);
  const startBlocks = activeOnly.filter((b) => b.type === "start");
  const memo = new Map<string, number>();

  function longestFrom(blockId: string, visited: Set<string>): number {
    if (visited.has(blockId)) return 0;
    if (memo.has(blockId)) return memo.get(blockId)!;

    visited.add(blockId);
    const block = activeOnly.find((b) => b.id === blockId);
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

// ============================================
// CRM Funnel Generation — Two-pass gate extraction
// ============================================

/**
 * PASS 1: Extract "gates" — decision blocks and product/end blocks that represent
 * natural transition points between funnel stages.
 */
function extractGates(data: ProcessData): ProcessBlock[] {
  const blockMap = new Map(data.blocks.map((b) => [b.id, b]));
  const gates: ProcessBlock[] = [];

  // Decision blocks are natural gates (go/no-go points)
  for (const block of data.blocks) {
    if (block.type === "decision") {
      gates.push(block);
    }
  }

  // Product blocks are intermediate results — also serve as gates
  for (const block of data.blocks) {
    if (block.type === "product") {
      gates.push(block);
    }
  }

  // End blocks mark final gates
  for (const block of data.blocks) {
    if (block.type === "end") {
      gates.push(block);
    }
  }

  // Sort gates by stage order, then by topological position within stage
  const stageOrder = new Map(data.stages.map((s, i) => [s.id, i]));
  const stageNameOrder = new Map(data.stages.map((s, i) => [s.name, i]));
  const blockOrder = new Map(data.blocks.map((b, i) => [b.id, i]));

  gates.sort((a, b) => {
    const sA = stageOrder.get(a.stage) ?? stageNameOrder.get(a.stage) ?? 999;
    const sB = stageOrder.get(b.stage) ?? stageNameOrder.get(b.stage) ?? 999;
    if (sA !== sB) return sA - sB;
    return (blockOrder.get(a.id) ?? 0) - (blockOrder.get(b.id) ?? 0);
  });

  // Deduplicate
  const seen = new Set<string>();
  return gates.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

/**
 * PASS 2: Aggregate gates into 5-12 L0 stages, assign blocks between gates,
 * derive exit criteria, owner roles, SLA, checklists.
 */
function aggregateToFunnelStages(data: ProcessData, gates: ProcessBlock[]): CrmFunnelStage[] {
  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order);
  const stageOrder = new Map(sortedStages.map((s, i) => [s.id, i]));
  const stageNameOrder = new Map(sortedStages.map((s, i) => [s.name, i]));
  const blockOrder = new Map(data.blocks.map((b, i) => [b.id, i]));

  // Sort all blocks by stage then position
  const sortedBlocks = [...data.blocks].sort((a, b) => {
    const sA = stageOrder.get(a.stage) ?? stageNameOrder.get(a.stage) ?? 999;
    const sB = stageOrder.get(b.stage) ?? stageNameOrder.get(b.stage) ?? 999;
    if (sA !== sB) return sA - sB;
    return (blockOrder.get(a.id) ?? 0) - (blockOrder.get(b.id) ?? 0);
  });

  // Gate positions in the sorted block list
  const gateIds = new Set(gates.map((g) => g.id));
  const gatePositions: number[] = [];
  for (let i = 0; i < sortedBlocks.length; i++) {
    if (gateIds.has(sortedBlocks[i].id)) {
      gatePositions.push(i);
    }
  }

  // If too few gates, add synthetic boundaries at stage transitions
  if (gatePositions.length < 4) {
    let prevStage = "";
    for (let i = 0; i < sortedBlocks.length; i++) {
      const blk = sortedBlocks[i];
      const st = blk.stage;
      if (st !== prevStage && prevStage !== "" && !gateIds.has(blk.id)) {
        gatePositions.push(i);
        gateIds.add(blk.id);
      }
      prevStage = st;
    }
    gatePositions.sort((a, b) => a - b);
  }

  // Build segments: blocks between consecutive gates
  type Segment = { blocks: ProcessBlock[]; gate: ProcessBlock | null };
  const segments: Segment[] = [];
  let lastIdx = 0;

  for (const gPos of gatePositions) {
    const segBlocks = sortedBlocks.slice(lastIdx, gPos + 1);
    if (segBlocks.length > 0) {
      segments.push({ blocks: segBlocks, gate: sortedBlocks[gPos] });
    }
    lastIdx = gPos + 1;
  }
  // Remaining blocks after last gate
  if (lastIdx < sortedBlocks.length) {
    const remaining = sortedBlocks.slice(lastIdx);
    if (remaining.length > 0) {
      segments.push({ blocks: remaining, gate: null });
    }
  }

  // Merge small segments to stay within 5-12 stages
  const merged: Segment[] = [];
  for (const seg of segments) {
    if (merged.length > 0 && merged.length >= 12) {
      // Too many — merge into last
      const last = merged[merged.length - 1];
      last.blocks.push(...seg.blocks);
      if (seg.gate) last.gate = seg.gate;
    } else if (seg.blocks.length <= 1 && merged.length > 0) {
      // Very small segment — merge with previous
      const last = merged[merged.length - 1];
      last.blocks.push(...seg.blocks);
      if (seg.gate) last.gate = seg.gate;
    } else {
      merged.push({ ...seg });
    }
  }

  // If still fewer than 5, split larger segments
  while (merged.length < 5 && merged.length > 0) {
    // Find the largest segment to split
    let maxIdx = 0;
    let maxLen = 0;
    for (let i = 0; i < merged.length; i++) {
      if (merged[i].blocks.length > maxLen) {
        maxLen = merged[i].blocks.length;
        maxIdx = i;
      }
    }
    if (maxLen <= 2) break; // Can't split further
    const seg = merged[maxIdx];
    const mid = Math.floor(seg.blocks.length / 2);
    const first: Segment = { blocks: seg.blocks.slice(0, mid), gate: seg.blocks[mid - 1] };
    const second: Segment = { blocks: seg.blocks.slice(mid), gate: seg.gate };
    merged.splice(maxIdx, 1, first, second);
  }

  // Role lookup
  const roleMap = new Map(data.roles.map((r) => [r.id, r.name]));

  // Build L0 stages
  const l0Stages: CrmFunnelStage[] = merged.map((seg, idx) => {
    const actionBlocks = seg.blocks.filter(
      (b) => b.type === "action" || b.type === "product" || b.type === "decision"
    );

    // Exit criteria from gate block
    const exitCriteria = seg.gate
      ? seg.gate.type === "decision"
        ? `Решение: ${seg.gate.name}`
        : seg.gate.type === "product"
          ? `Результат: ${seg.gate.name}`
          : seg.gate.type === "end"
            ? `Завершение: ${seg.gate.name}`
            : seg.gate.name
      : "Переход к следующему этапу";

    // Owner role — most frequent role in segment
    const roleCounts = new Map<string, number>();
    for (const b of seg.blocks) {
      roleCounts.set(b.role, (roleCounts.get(b.role) || 0) + 1);
    }
    let maxRole = "";
    let maxCount = 0;
    for (const [role, count] of roleCounts) {
      if (count > maxCount) {
        maxCount = count;
        maxRole = role;
      }
    }
    const ownerRole = roleMap.get(maxRole) || maxRole || "Не определено";

    // SLA days — estimate from time estimates on blocks
    let totalHours = 0;
    for (const b of actionBlocks) {
      if (b.timeEstimate) {
        const match = b.timeEstimate.match(/(\d+)/);
        if (match) {
          const val = parseInt(match[1], 10);
          if (b.timeEstimate.includes("дн") || b.timeEstimate.includes("day")) {
            totalHours += val * 8;
          } else if (b.timeEstimate.includes("час") || b.timeEstimate.includes("hour") || b.timeEstimate.includes("ч")) {
            totalHours += val;
          } else if (b.timeEstimate.includes("мин") || b.timeEstimate.includes("min")) {
            totalHours += val / 60;
          } else {
            totalHours += val; // Default to hours
          }
        }
      }
    }
    const slaDays = Math.max(1, Math.ceil(totalHours / 8));

    // Checklist from action block names
    const checklist = actionBlocks.map((b) => b.name);

    // Automations from info systems
    const automations = actionBlocks
      .flatMap((b) => b.infoSystems || [])
      .filter((v, i, a) => a.indexOf(v) === i);

    // Derive a stage name
    const stageIds = new Set(seg.blocks.map((b) => b.stage));
    const stageNames = sortedStages
      .filter((s) => stageIds.has(s.id) || stageIds.has(s.name))
      .map((s) => s.name);
    const stageName =
      stageNames.length > 0
        ? stageNames.length === 1
          ? stageNames[0]
          : `${stageNames[0]} — ${stageNames[stageNames.length - 1]}`
        : `Этап ${idx + 1}`;

    return {
      id: `l0-${idx}`,
      name: stageName,
      level: 0 as const,
      order: idx + 1,
      exitCriteria,
      ownerRole,
      slaDays,
      checklist,
      relatedBlockIds: seg.blocks.map((b) => b.id),
      automations,
      conversionTarget: Math.round(100 - (idx / Math.max(merged.length - 1, 1)) * 65),
    };
  });

  return l0Stages;
}

/**
 * Build L1 sub-stages (within each L0 stage, group by process stage)
 * and L2 actions (individual blocks within L1).
 */
function buildSubStages(data: ProcessData, l0Stages: CrmFunnelStage[]): CrmFunnelStage[] {
  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order);
  const stageOrder = new Map(sortedStages.map((s, i) => [s.id, i]));
  const stageNameOrder = new Map(sortedStages.map((s, i) => [s.name, i]));
  const blockMap = new Map(data.blocks.map((b) => [b.id, b]));
  const roleMap = new Map(data.roles.map((r) => [r.id, r.name]));

  const allStages: CrmFunnelStage[] = [];
  let globalOrder = 1;

  for (const l0 of l0Stages) {
    // Add L0 stage
    allStages.push({ ...l0, order: globalOrder++ });

    // Group blocks within this L0 by their process stage
    const blocksByStage = new Map<string, ProcessBlock[]>();
    for (const blockId of l0.relatedBlockIds) {
      const block = blockMap.get(blockId);
      if (block && block.type !== "start" && block.type !== "end") {
        const key = block.stage;
        if (!blocksByStage.has(key)) blocksByStage.set(key, []);
        blocksByStage.get(key)!.push(block);
      }
    }

    // Only create L1 sub-stages if there are multiple process stages in this L0
    if (blocksByStage.size > 1) {
      const sortedKeys = [...blocksByStage.keys()].sort((a, b) => {
        const oA = stageOrder.get(a) ?? stageNameOrder.get(a) ?? 999;
        const oB = stageOrder.get(b) ?? stageNameOrder.get(b) ?? 999;
        return oA - oB;
      });

      for (const stageKey of sortedKeys) {
        const blocks = blocksByStage.get(stageKey)!;
        const actionBlocks = blocks.filter((b) => b.type === "action" || b.type === "product");
        if (actionBlocks.length === 0) continue;

        const matchedStage = sortedStages.find((s) => s.id === stageKey || s.name === stageKey);
        const l1Name = matchedStage ? matchedStage.name : stageKey;

        // Owner: most frequent role
        const roleCounts = new Map<string, number>();
        for (const b of blocks) {
          roleCounts.set(b.role, (roleCounts.get(b.role) || 0) + 1);
        }
        let topRole = "";
        let topCount = 0;
        for (const [r, c] of roleCounts) {
          if (c > topCount) { topCount = c; topRole = r; }
        }

        const l1Id = `l1-${l0.id}-${stageKey}`;
        allStages.push({
          id: l1Id,
          name: l1Name,
          level: 1,
          order: globalOrder++,
          parentId: l0.id,
          exitCriteria: actionBlocks[actionBlocks.length - 1].name,
          ownerRole: roleMap.get(topRole) || topRole,
          checklist: actionBlocks.map((b) => b.name),
          relatedBlockIds: blocks.map((b) => b.id),
          automations: blocks
            .flatMap((b) => b.infoSystems || [])
            .filter((v, i, a) => a.indexOf(v) === i),
        });
      }
    }
  }

  return allStages;
}

/**
 * Generate funnel-external statuses: Pause, Lost, Won.
 */
function generateStatuses(data: ProcessData): CrmFunnelStatus[] {
  return [
    {
      id: "status-pause",
      name: "Пауза",
      type: "pause",
      description: "Сделка приостановлена — клиент попросил отложить или нет ресурсов для продвижения",
    },
    {
      id: "status-lost",
      name: "Проиграно",
      type: "lost",
      description: "Сделка проиграна — клиент выбрал конкурента, отказался или нет бюджета",
    },
    {
      id: "status-won",
      name: "Успешно",
      type: "won",
      description: "Сделка успешно завершена — контракт подписан, оплата получена",
    },
  ];
}

/**
 * Validate funnel quality and return notes.
 */
function validateFunnel(stages: CrmFunnelStage[]): string[] {
  const notes: string[] = [];
  const l0 = stages.filter((s) => s.level === 0);

  if (l0.length < 5) notes.push(`Мало L0-этапов (${l0.length}), рекомендуется 5-12`);
  if (l0.length > 12) notes.push(`Много L0-этапов (${l0.length}), рекомендуется 5-12`);

  for (const s of l0) {
    if (!s.exitCriteria || s.exitCriteria.length < 3) {
      notes.push(`Этап «${s.name}» не имеет критерия выхода`);
    }
    if (!s.ownerRole || s.ownerRole === "Не определено") {
      notes.push(`Этап «${s.name}» не имеет владельца`);
    }
    if (s.checklist.length === 0) {
      notes.push(`Этап «${s.name}» не имеет чек-листа`);
    }
  }

  if (notes.length === 0) notes.push("Воронка корректна. Все проверки пройдены.");
  return notes;
}

/**
 * Generate a single CRM funnel from ProcessData using two-pass gate extraction.
 */
function generateCrmFunnels(data: ProcessData): CrmFunnel[] {
  // Use only active blocks for CRM funnel generation
  const activeData: ProcessData = { ...data, blocks: data.blocks.filter(b => b.isActive !== false) };
  if (activeData.blocks.length < 3) return [];

  // Pass 1: extract gates
  const gates = extractGates(activeData);

  // Pass 2: aggregate into L0 stages
  const l0Stages = aggregateToFunnelStages(activeData, gates);

  // Build L0+L1 hierarchy
  const allStages = buildSubStages(activeData, l0Stages);

  // Statuses
  const statuses = generateStatuses(activeData);

  // Validate
  const qualityNotes = validateFunnel(allStages);

  return [
    {
      id: "funnel-main",
      name: "CRM-воронка",
      description: `${l0Stages.length} этапов (L0), ${allStages.filter((s) => s.level === 1).length} подэтапов (L1)`,
      stages: allStages,
      statuses,
      qualityNotes,
    },
  ];
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
  summary: FileText,
  diagnostics: Search,
  lean: TrendingDown,
  duplicates: Copy,
  automation: Zap,
  quality: Shield,
  data: Database,
  roles: Users,
  backlog: ListChecks,
  variants: GitBranch,
};

const CATEGORY_LABELS: Record<string, string> = {
  summary: "Краткое резюме",
  diagnostics: "Диагностика процесса",
  lean: "Потери LEAN",
  duplicates: "Дубли и задвоение",
  automation: "Автоматизация",
  quality: "Качество и риски",
  data: "Данные и документы",
  roles: "Роли и ответственность",
  backlog: "План внедрения",
  variants: "Варианты оптимизации",
};

const CATEGORY_ORDER = [
  "summary",
  "diagnostics",
  "lean",
  "duplicates",
  "automation",
  "quality",
  "data",
  "roles",
  "backlog",
  "variants",
];

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
  const [canvasScale, setCanvasScale] = useState(1);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [changeDescription, setChangeDescription] = useState("");
  const [previewState, setPreviewState] = useState<{
    previousData: ProcessData;
    newData: ProcessData;
    description: string;
    changeRequestId?: number;
    isRegeneration?: boolean;
    retryFn: () => void;
  } | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasHandleRef = useRef<SwimlaneCanvasHandle>(null);

  // Block editing state
  const [editingBlock, setEditingBlock] = useState<ProcessBlock | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<BlockType>("action");
  const [editRole, setEditRole] = useState("");
  const [editStage, setEditStage] = useState("");
  const [editTimeEstimate, setEditTimeEstimate] = useState("");
  const [editInputDocuments, setEditInputDocuments] = useState("");
  const [editOutputDocuments, setEditOutputDocuments] = useState("");
  const [editInfoSystems, setEditInfoSystems] = useState("");
  const [editChecklist, setEditChecklist] = useState("");
  const [editConditionLabel, setEditConditionLabel] = useState("");
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [rebuildProgress, setRebuildProgress] = useState<{ open: boolean; progress: number; label: string }>({ open: false, progress: 0, label: "" });
  const [editConnections, setEditConnections] = useState<string[]>([]);
  const [editConnectionLabels, setEditConnectionLabels] = useState<Record<string, string>>({});

  // Undo/Redo stacks (max 50 entries)
  const MAX_HISTORY = 50;
  const [undoStack, setUndoStack] = useState<ProcessBlock[][]>([]);
  const [redoStack, setRedoStack] = useState<ProcessBlock[][]>([]);

  // ---- Generation Progress ----
  const regenerateProgress = useGenerationProgress({ duration: 90000 });
  const changeProgress = useGenerationProgress({ duration: 60000 });

  // ---- Mutations ----
  const updateDataMutation = trpc.process.updateData.useMutation({
    onSuccess: () => {
      utils.process.getById.invalidate({ id: processId });
    },
  });

  const regenerateMutation = trpc.process.regenerate.useMutation({
    onSuccess: (result) => {
      regenerateProgress.finish();
      setPreviewState({
        previousData: data!,
        newData: result.data as ProcessData,
        description: "Полная регенерация процесса",
        isRegeneration: true,
        retryFn: () => {
          regenerateProgress.start();
          regenerateMutation.mutate({ id: processId });
        },
      });
    },
    onError: () => {
      regenerateProgress.reset();
    },
  });

  const requestChangeMutation = trpc.process.requestChange.useMutation({
    onSuccess: (changeRequest) => {
      changeProgress.finish();
      const cr = changeRequest as ChangeRequest;
      const desc = changeDescription.trim();
      setChangeDialogOpen(false);
      setPreviewState({
        previousData: cr.previousData,
        newData: cr.newData,
        description: cr.description,
        changeRequestId: cr.id,
        retryFn: () => {
          changeProgress.start();
          requestChangeMutation.mutate({ processId, description: desc });
        },
      });
    },
    onError: () => {
      changeProgress.reset();
    },
  });

  const applyChangeMutation = trpc.process.applyChange.useMutation({
    onSuccess: () => {
      setPreviewState(null);
      setChangeDialogOpen(false);
      setChangeDescription("");
      utils.process.getById.invalidate({ id: processId });
      utils.process.getRecommendations.invalidate({ processId });
    },
  });

  const rejectChangeMutation = trpc.process.rejectChange.useMutation({
    onSuccess: () => {
      setPreviewState(null);
    },
  });

  // ---- Beforeunload warning during generation ----
  const isAnyGenerating = regenerateMutation.isPending || requestChangeMutation.isPending;
  useEffect(() => {
    if (!isAnyGenerating) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isAnyGenerating]);

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
    // Use saved AI-generated funnels if available, else fall back to client-side generation
    if (data.crmFunnels && data.crmFunnels.length > 0) return data.crmFunnels;
    return generateCrmFunnels(data);
  }, [data]);

  const hasSavedCrmFunnels = !!(data?.crmFunnels && data.crmFunnels.length > 0);

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
      setEditStage(block.stage || "");
      setEditTimeEstimate(block.timeEstimate || "");
      setEditInputDocuments(block.inputDocuments?.join(", ") || "");
      setEditOutputDocuments(block.outputDocuments?.join(", ") || "");
      setEditInfoSystems(block.infoSystems?.join(", ") || "");
      setEditChecklist(block.checklist?.join(", ") || "");
      setEditConditionLabel(block.conditionLabel || "");
      setEditIsDefault(block.isDefault || false);
      setEditIsActive(block.isActive !== false);
      setEditConnections([...block.connections]);
      // Load connection labels from target blocks
      const labels: Record<string, string> = {};
      if (data) {
        for (const connId of block.connections) {
          const target = data.blocks.find((b) => b.id === connId);
          if (target?.conditionLabel) {
            labels[connId] = target.conditionLabel;
          }
        }
      }
      setEditConnectionLabels(labels);
    },
    [data]
  );

  const handleSaveEdit = useCallback(() => {
    if (!data || !editingBlock) return;

    const parseCommaSeparated = (str: string): string[] =>
      str.split(",").map((s) => s.trim()).filter(Boolean);

    const updatedBlocks = data.blocks.map((b) => {
      // Update the edited block itself
      if (b.id === editingBlock.id) {
        return {
          ...b,
          name: editName,
          description: editDescription,
          type: editType,
          role: editRole,
          stage: editStage,
          timeEstimate: editTimeEstimate || undefined,
          inputDocuments: parseCommaSeparated(editInputDocuments),
          outputDocuments: parseCommaSeparated(editOutputDocuments),
          infoSystems: parseCommaSeparated(editInfoSystems),
          checklist: parseCommaSeparated(editChecklist),
          isActive: editIsActive,
          conditionLabel: editConditionLabel || undefined,
          isDefault: editIsDefault,
          connections: editConnections,
        };
      }
      // Update conditionLabel on target blocks of this block's connections
      if (editConnections.includes(b.id)) {
        const newLabel = editConnectionLabels[b.id];
        return {
          ...b,
          conditionLabel: newLabel || undefined,
        };
      }
      return b;
    });

    // Check if isActive was toggled — show rebuild progress
    const wasActive = editingBlock.isActive !== false;
    const isActiveToggled = wasActive !== editIsActive;

    if (isActiveToggled) {
      setRebuildProgress({ open: true, progress: 0, label: editIsActive ? "Восстановление блока..." : "Перестроение процесса..." });
      const steps = [
        { p: 20, l: "Диаграмма" }, { p: 40, l: "Этапы" }, { p: 55, l: "Метрики" },
        { p: 70, l: "CRM-воронки" }, { p: 80, l: "Паспорт" }, { p: 90, l: "Рекомендации" }, { p: 95, l: "Качество" },
      ];
      let i = 0;
      const interval = setInterval(() => {
        if (i < steps.length) {
          setRebuildProgress({ open: true, progress: steps[i].p, label: steps[i].l });
          i++;
        } else {
          clearInterval(interval);
          setRebuildProgress({ open: true, progress: 100, label: "Процесс успешно обновлен" });
          setTimeout(() => setRebuildProgress({ open: false, progress: 0, label: "" }), 1500);
        }
      }, 200);
    }

    // Push current state to undo stack before applying edit
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), data.blocks]);
    setRedoStack([]);

    updateDataMutation.mutate({
      id: processId,
      data: { ...data, blocks: updatedBlocks },
    });
    setEditingBlock(null);
  }, [data, editingBlock, editName, editDescription, editType, editRole, editStage, editTimeEstimate, editInputDocuments, editOutputDocuments, editInfoSystems, editChecklist, editIsActive, editConditionLabel, editIsDefault, editConnections, editConnectionLabels, processId, updateDataMutation]);

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

  const handleUndo = useCallback(() => {
    if (!data || undoStack.length === 0) return;
    const newUndoStack = [...undoStack];
    const previousBlocks = newUndoStack.pop()!;
    setUndoStack(newUndoStack);
    setRedoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), data.blocks]);
    updateDataMutation.mutate({ id: processId, data: { ...data, blocks: previousBlocks } });
  }, [data, undoStack, processId, updateDataMutation]);

  const handleRedo = useCallback(() => {
    if (!data || redoStack.length === 0) return;
    const newRedoStack = [...redoStack];
    const nextBlocks = newRedoStack.pop()!;
    setRedoStack(newRedoStack);
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), data.blocks]);
    updateDataMutation.mutate({ id: processId, data: { ...data, blocks: nextBlocks } });
  }, [data, redoStack, processId, updateDataMutation]);

  const handleRequestChange = useCallback(() => {
    if (!changeDescription.trim()) return;
    changeProgress.start();
    requestChangeMutation.mutate({
      processId,
      description: changeDescription.trim(),
    });
  }, [changeDescription, processId, requestChangeMutation, changeProgress]);

  const handlePreviewAccept = useCallback(() => {
    if (!previewState) return;
    // Clear undo/redo stacks on major data changes
    setUndoStack([]);
    setRedoStack([]);
    if (previewState.isRegeneration) {
      utils.process.getById.invalidate({ id: processId });
      utils.process.getRecommendations.invalidate({ processId });
      setPreviewState(null);
    } else if (previewState.changeRequestId) {
      applyChangeMutation.mutate({ changeRequestId: previewState.changeRequestId });
    }
  }, [previewState, processId, applyChangeMutation, utils]);

  const handlePreviewReject = useCallback(() => {
    if (!previewState) return;
    if (previewState.isRegeneration) {
      updateDataMutation.mutate({ id: processId, data: previewState.previousData });
      setPreviewState(null);
    } else if (previewState.changeRequestId) {
      rejectChangeMutation.mutate({ changeRequestId: previewState.changeRequestId });
    }
  }, [previewState, processId, updateDataMutation, rejectChangeMutation]);

  const handlePreviewRetry = useCallback(() => {
    if (!previewState) return;
    const retryFn = previewState.retryFn;
    setPreviewState(null);
    retryFn();
  }, [previewState]);

  // ---- Undo/Redo Keyboard Shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only active on diagram tab
      if (activeTab !== "diagram") return;
      // Don't trigger when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z")
      ) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab, handleUndo, handleRedo]);

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
  const previewDiffItems = previewState
    ? computeProcessDiff(previewState.previousData, previewState.newData)
    : [];

  // ---- Group 1 action buttons (shared across process tabs) ----
  const processActionButtons = (
    <div className="space-y-2">
      <div className="flex items-center gap-2 shrink-0">
        {/* Change Request Dialog */}
        <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={requestChangeMutation.isPending}>
                    {changeProgress.phase === "done" ? (
                      <><Check className="w-4 h-4" /> Готово</>
                    ) : requestChangeMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Генерация... {changeProgress.progress}%</>
                    ) : (
                      <><Send className="w-4 h-4" /> Запросить изменения во всём процессе</>
                    )}
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Изменения затронут все вкладки процесса</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Запросить изменения процесса</DialogTitle>
            <DialogDescription>
              Опишите, какие изменения нужно внести. ИИ предложит обновленную
              версию процесса. Изменения затронут диаграмму, этапы, метрики и другие
              данные процесса. Стоимость: {TOKEN_COSTS.change_request} токенов.
            </DialogDescription>
          </DialogHeader>

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
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleRequestChange}
                        disabled={requestChangeMutation.isPending || !changeDescription.trim()}
                      >
                        {changeProgress.phase === "done" ? (
                          <>
                            <Check className="w-4 h-4" />
                            Готово
                          </>
                        ) : requestChangeMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Генерация... {changeProgress.progress}%
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Сгенерировать изменения
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Это может занять несколько минут</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </DialogFooter>
              {requestChangeMutation.isPending && (
                <div className="space-y-2">
                  <Progress value={changeProgress.progress} className="h-1.5" />
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Идет генерация. Пожалуйста, не покидайте страницу
                  </p>
                </div>
              )}
            </div>
        </DialogContent>
      </Dialog>

      {/* Regenerate Button */}
      <AlertDialog>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={regenerateMutation.isPending}>
                  {regenerateProgress.phase === "done" ? (
                    <><Check className="w-4 h-4" /> Готово</>
                  ) : regenerateMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Генерация... {regenerateProgress.progress}%</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> Сгенерировать заново</>
                  )}
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Это может занять несколько минут</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Перегенерация процесса</AlertDialogTitle>
            <AlertDialogDescription>
              Все данные процесса будут перезаписаны. Текущая версия будет
              заменена новой, сгенерированной ИИ на основе данных интервью.
              Текущая версия сохранится в истории.
              Стоимость: {TOKEN_COSTS.regeneration} токенов.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                regenerateProgress.start();
                regenerateMutation.mutate({ id: processId });
              }}
              disabled={regenerateMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {regenerateProgress.phase === "done" ? (
                <>
                  <Check className="w-4 h-4" />
                  Готово
                </>
              ) : regenerateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Генерация... {regenerateProgress.progress}%
                </>
              ) : (
                "Перегенерировать"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
          {regenerateMutation.isPending && (
            <div className="space-y-2">
              <Progress value={regenerateProgress.progress} className="h-1.5" />
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Идет генерация. Пожалуйста, не покидайте страницу
              </p>
            </div>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
    {(requestChangeMutation.isPending || regenerateMutation.isPending) && (
      <Progress
        value={requestChangeMutation.isPending ? changeProgress.progress : regenerateProgress.progress}
        className="h-1.5"
      />
    )}
    </div>
  );

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
          <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="diagram">Диаграмма</TabsTrigger>
          <TabsTrigger value="stages">Этапы</TabsTrigger>
          <TabsTrigger value="metrics">Метрики</TabsTrigger>
          <TabsTrigger value="crm">CRM-воронки</TabsTrigger>
          <TabsTrigger value="regulations">Регламенты</TabsTrigger>
          <TabsTrigger value="passport">Паспорт</TabsTrigger>
          <TabsTrigger value="quality">Качество</TabsTrigger>
          <TabsTrigger value="recommendations">Рекомендации</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>

        {/* ======== Tab: Diagram (Group 1) ======== */}
        <TabsContent value="diagram">
          <div className="space-y-4">
            <div className="flex justify-end">{processActionButtons}</div>
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
              editStage={editStage}
              editTimeEstimate={editTimeEstimate}
              editInputDocuments={editInputDocuments}
              editOutputDocuments={editOutputDocuments}
              editInfoSystems={editInfoSystems}
              editChecklist={editChecklist}
              editConditionLabel={editConditionLabel}
              editIsDefault={editIsDefault}
              editConnections={editConnections}
              editConnectionLabels={editConnectionLabels}
              canvasScale={canvasScale}
              canvasContainerRef={canvasContainerRef}
              canvasHandleRef={canvasHandleRef}
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
              onSetEditStage={setEditStage}
              onSetEditTimeEstimate={setEditTimeEstimate}
              onSetEditInputDocuments={setEditInputDocuments}
              onSetEditOutputDocuments={setEditOutputDocuments}
              onSetEditInfoSystems={setEditInfoSystems}
              onSetEditChecklist={setEditChecklist}
              onSetEditConditionLabel={setEditConditionLabel}
              onSetEditIsDefault={setEditIsDefault}
              onSetEditIsActive={setEditIsActive}
              editIsActive={editIsActive}
              onSetEditConnections={setEditConnections}
              onSetEditConnectionLabels={setEditConnectionLabels}
              onScaleChange={setCanvasScale}
              onExportPNG={handleExportPNG}
              onExportBPMN={handleExportBPMN}
              onExportPDF={handleExportPDF}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </div>
        </TabsContent>

        {/* ======== Tab: Stages (Group 1) ======== */}
        <TabsContent value="stages">
          <div className="space-y-4">
            <div className="flex justify-end">{processActionButtons}</div>
            <StagesTab data={data} />
          </div>
        </TabsContent>

        {/* ======== Tab: Metrics (Group 1) ======== */}
        <TabsContent value="metrics">
          <div className="space-y-4">
            <div className="flex justify-end">{processActionButtons}</div>
            <MetricsTab metrics={metrics} data={data} />
          </div>
        </TabsContent>

        {/* ======== Tab: CRM Funnels (Group 2 — local buttons inside) ======== */}
        <TabsContent value="crm">
          <CrmFunnelsTab funnels={crmFunnels} data={data} processId={processId} hasSavedFunnels={hasSavedCrmFunnels} onChangePreview={(cr, retryFn) => setPreviewState({ previousData: cr.previousData, newData: cr.newData, description: cr.description, changeRequestId: cr.id, retryFn })} />
        </TabsContent>

        {/* ======== Tab: Regulations (Group 1) ======== */}
        <TabsContent value="regulations">
          <div className="space-y-4">
            <div className="flex justify-end">{processActionButtons}</div>
            <RegulationsTab processId={processId} data={data} companyName={(process as any)?.companyName || ""} />
          </div>
        </TabsContent>

        {/* ======== Tab: Passport (Group 1) ======== */}
        <TabsContent value="passport">
          <div className="space-y-4">
            <div className="flex justify-end">{processActionButtons}</div>
            <PassportTab processId={processId} />
          </div>
        </TabsContent>

        {/* ======== Tab: Quality (Group 1) ======== */}
        <TabsContent value="quality">
          <div className="space-y-4">
            <div className="flex justify-end">{processActionButtons}</div>
            <QualityTab processId={processId} onNavigateToBlock={(blockId) => { setActiveTab("diagram"); setTimeout(() => setSelectedBlockId(blockId), 100); }} />
          </div>
        </TabsContent>

        {/* ======== Tab: Recommendations (Group 2 — local buttons inside) ======== */}
        <TabsContent value="recommendations">
          <RecommendationsTab processId={processId} data={data} onChangePreview={(cr, retryFn) => setPreviewState({ previousData: cr.previousData, newData: cr.newData, description: cr.description, changeRequestId: cr.id, retryFn })} />
        </TabsContent>

        {/* ======== Tab: History (Group 1) ======== */}
        <TabsContent value="history">
          <div className="space-y-4">
            <div className="flex justify-end">{processActionButtons}</div>
            <HistoryTab processId={processId} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Rebuild Progress Modal */}
      {/* ── Preview Modal ── */}
      {previewState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-purple-600" />
                Предпросмотр изменений
              </h2>
              <p className="text-sm text-gray-500 mt-1">{previewState.description}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {previewDiffItems.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  Структурных изменений не обнаружено (изменения могут касаться содержания блоков)
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                    <span className="flex items-center gap-1"><Plus className="w-3 h-3 text-green-500" /> Добавлено: {previewDiffItems.filter(i => i.type === "added").length}</span>
                    <span className="flex items-center gap-1"><Minus className="w-3 h-3 text-red-500" /> Удалено: {previewDiffItems.filter(i => i.type === "removed").length}</span>
                    <span className="flex items-center gap-1"><ArrowRightLeft className="w-3 h-3 text-blue-500" /> Изменено: {previewDiffItems.filter(i => i.type === "changed").length}</span>
                  </div>
                  {previewDiffItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-start gap-2 px-3 py-2 rounded-lg text-sm",
                        item.type === "added" && "bg-green-50 border border-green-200",
                        item.type === "removed" && "bg-red-50 border border-red-200",
                        item.type === "changed" && "bg-blue-50 border border-blue-200"
                      )}
                    >
                      {item.type === "added" && <Plus className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />}
                      {item.type === "removed" && <Minus className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />}
                      {item.type === "changed" && <ArrowRightLeft className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />}
                      <div>
                        <div className={cn(
                          "font-medium",
                          item.type === "added" && "text-green-700",
                          item.type === "removed" && "text-red-700",
                          item.type === "changed" && "text-blue-700"
                        )}>
                          {item.label}
                        </div>
                        {item.details && <div className="text-gray-500 mt-0.5">{item.details}</div>}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviewRetry}
                disabled={applyChangeMutation.isPending || rejectChangeMutation.isPending || regenerateMutation.isPending}
              >
                <RefreshCw className="w-4 h-4" />
                Запросить заново
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviewReject}
                disabled={applyChangeMutation.isPending || rejectChangeMutation.isPending || updateDataMutation.isPending}
              >
                {rejectChangeMutation.isPending || updateDataMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Отменить
              </Button>
              <Button
                size="sm"
                onClick={handlePreviewAccept}
                disabled={applyChangeMutation.isPending || rejectChangeMutation.isPending || updateDataMutation.isPending}
              >
                {applyChangeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Сохранить изменения
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {rebuildProgress.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80 space-y-4">
            <div className="flex items-center gap-3">
              {rebuildProgress.progress < 100 ? (
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {rebuildProgress.progress < 100 ? "Перестроение процесса..." : "Процесс успешно обновлен"}
                </p>
                {rebuildProgress.progress < 100 && (
                  <p className="text-xs text-gray-500 mt-0.5">{rebuildProgress.label}</p>
                )}
              </div>
            </div>
            <Progress value={rebuildProgress.progress} className="h-2" />
            <p className="text-right text-xs text-gray-400">{rebuildProgress.progress}%</p>
          </div>
        </div>
      )}
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
  editStage: string;
  editTimeEstimate: string;
  editInputDocuments: string;
  editOutputDocuments: string;
  editInfoSystems: string;
  editChecklist: string;
  editConditionLabel: string;
  editIsDefault: boolean;
  editIsActive: boolean;
  editConnections: string[];
  editConnectionLabels: Record<string, string>;
  canvasScale: number;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasHandleRef: React.RefObject<SwimlaneCanvasHandle | null>;
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
  onSetEditStage: (v: string) => void;
  onSetEditTimeEstimate: (v: string) => void;
  onSetEditInputDocuments: (v: string) => void;
  onSetEditOutputDocuments: (v: string) => void;
  onSetEditInfoSystems: (v: string) => void;
  onSetEditChecklist: (v: string) => void;
  onSetEditConditionLabel: (v: string) => void;
  onSetEditIsDefault: (v: boolean) => void;
  onSetEditIsActive: (v: boolean) => void;
  onSetEditConnections: (v: string[]) => void;
  onSetEditConnectionLabels: (v: Record<string, string>) => void;
  onScaleChange: (scale: number) => void;
  onExportPNG: () => void;
  onExportBPMN: () => void;
  onExportPDF: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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
  editStage,
  editTimeEstimate,
  editInputDocuments,
  editOutputDocuments,
  editInfoSystems,
  editChecklist,
  editConditionLabel,
  editIsDefault,
  editConnections,
  editConnectionLabels,
  canvasScale,
  canvasContainerRef,
  canvasHandleRef,
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
  onSetEditStage,
  onSetEditTimeEstimate,
  onSetEditInputDocuments,
  onSetEditOutputDocuments,
  onSetEditInfoSystems,
  onSetEditChecklist,
  onSetEditConditionLabel,
  onSetEditIsDefault,
  onSetEditIsActive,
  editIsActive,
  onSetEditConnections,
  onSetEditConnectionLabels,
  onScaleChange,
  onExportPNG,
  onExportBPMN,
  onExportPDF,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: DiagramTabProps) {
  return (
    <div className="flex gap-4">
      {/* Main Canvas Area */}
      <div className="flex-1 min-w-0">
        {/* Compact Toolbar */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => canvasHandleRef.current?.zoomOut()}
              title="Отдалить (Ctrl -)"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-gray-500 w-14 text-center tabular-nums">
              {Math.round(canvasScale * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => canvasHandleRef.current?.zoomIn()}
              title="Приблизить (Ctrl +)"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => canvasHandleRef.current?.fitToScreen()}
              title="Вписать в экран (Ctrl 0)"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => canvasHandleRef.current?.toggleFullscreen()}
              title="На весь экран"
            >
              <Fullscreen className="w-4 h-4" />
            </Button>

            <div className="w-px h-6 bg-gray-200 mx-1" />

            <Button
              variant="outline"
              size="icon"
              onClick={onUndo}
              disabled={!canUndo}
              title="Назад (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onRedo}
              disabled={!canRedo}
              title="Вперёд (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
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

        {/* Canvas Container — fills available viewport */}
        <div
          ref={canvasContainerRef}
          className="rounded-xl bg-white overflow-hidden border border-gray-200"
          style={{ height: "calc(100vh - 240px)", minHeight: "400px" }}
        >
          <SwimlaneCanvas
            ref={canvasHandleRef}
            data={data}
            onBlockClick={onBlockClick}
            selectedBlockId={selectedBlockId}
            externalToolbar
            onScaleChange={onScaleChange}
            autoFit
          />
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
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  <div className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2",
                    editIsActive ? "bg-green-50 border-green-200" : "bg-gray-100 border-gray-300"
                  )}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={editIsActive}
                      onClick={() => onSetEditIsActive(!editIsActive)}
                      className={cn(
                        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                        editIsActive
                          ? "bg-green-500 focus-visible:ring-green-500"
                          : "bg-gray-300 focus-visible:ring-gray-400"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out",
                          "absolute top-0.5",
                          editIsActive ? "translate-x-[22px]" : "translate-x-0.5"
                        )}
                      />
                    </button>
                    <span className={cn(
                      "text-sm font-medium select-none",
                      editIsActive ? "text-green-700" : "text-gray-500"
                    )}>
                      {editIsActive ? "Активен" : "Выключен"}
                    </span>
                    {!editIsActive && (
                      <span className="text-xs text-gray-400 ml-auto">Блок исключён из расчётов</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Название
                    </label>
                    <Input
                      value={editName}
                      onChange={(e) => onSetEditName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Описание
                    </label>
                    <Textarea
                      value={editDescription}
                      onChange={(e) => onSetEditDescription(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">
                        Тип
                      </label>
                      <select
                        className="flex h-8 w-full rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm"
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
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">
                        Роль
                      </label>
                      <select
                        className="flex h-8 w-full rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm"
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
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">
                        Этап
                      </label>
                      <select
                        className="flex h-8 w-full rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm"
                        value={editStage}
                        onChange={(e) => onSetEditStage(e.target.value)}
                      >
                        {data.stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">
                        Время
                      </label>
                      <Input
                        value={editTimeEstimate}
                        onChange={(e) => onSetEditTimeEstimate(e.target.value)}
                        placeholder="напр. 30 мин"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Входные документы
                    </label>
                    <Input
                      value={editInputDocuments}
                      onChange={(e) => onSetEditInputDocuments(e.target.value)}
                      placeholder="через запятую"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Выходные документы
                    </label>
                    <Input
                      value={editOutputDocuments}
                      onChange={(e) => onSetEditOutputDocuments(e.target.value)}
                      placeholder="через запятую"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Информационные системы
                    </label>
                    <Input
                      value={editInfoSystems}
                      onChange={(e) => onSetEditInfoSystems(e.target.value)}
                      placeholder="через запятую"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Чек-лист
                    </label>
                    <Textarea
                      value={editChecklist}
                      onChange={(e) => onSetEditChecklist(e.target.value)}
                      placeholder="через запятую: Проверить данные, Уведомить клиента..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  {(editType === "decision" || editingBlock.conditionLabel) && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700">
                        Метка условия
                      </label>
                      <Input
                        value={editConditionLabel}
                        onChange={(e) => onSetEditConditionLabel(e.target.value)}
                        placeholder="напр. Да / Нет"
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                  {editingBlock.conditionLabel && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isDefault"
                        checked={editIsDefault}
                        onChange={(e) => onSetEditIsDefault(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label htmlFor="isDefault" className="text-xs font-medium text-gray-700">
                        Ветка по умолчанию
                      </label>
                    </div>
                  )}
                  {/* Connections editor */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Связи ({editConnections.length})
                    </label>
                    {editConnections.length > 0 && (
                      <div className="space-y-2">
                        {editConnections.map((connId, idx) => {
                          const connBlock = data.blocks.find((b) => b.id === connId);
                          return (
                            <div
                              key={connId + "-" + idx}
                              className="rounded-md border border-gray-200 bg-gray-50/50 p-2 space-y-1.5 group"
                            >
                              <div className="flex items-center gap-1.5">
                                <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                                <span className="text-sm text-gray-700 truncate flex-1">
                                  {connBlock?.name || connId}
                                </span>
                                <button
                                  type="button"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50"
                                  onClick={() => {
                                    onSetEditConnections(editConnections.filter((_, i) => i !== idx));
                                    const updated = { ...editConnectionLabels };
                                    delete updated[connId];
                                    onSetEditConnectionLabels(updated);
                                  }}
                                  title="Удалить связь"
                                >
                                  <X className="w-3.5 h-3.5 text-red-500" />
                                </button>
                              </div>
                              <Input
                                value={editConnectionLabels[connId] || ""}
                                onChange={(e) => {
                                  onSetEditConnectionLabels({
                                    ...editConnectionLabels,
                                    [connId]: e.target.value,
                                  });
                                }}
                                placeholder="Метка (напр. Да, Нет, Одобрено)"
                                className="h-7 text-xs"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Add connection dropdown */}
                    {(() => {
                      const availableBlocks = data.blocks.filter(
                        (b) => b.id !== editingBlock.id && !editConnections.includes(b.id)
                      );
                      if (availableBlocks.length === 0) return null;
                      return (
                        <select
                          className="flex h-8 w-full rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm text-gray-500"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              onSetEditConnections([...editConnections, e.target.value]);
                            }
                          }}
                        >
                          <option value="">+ Добавить связь...</option>
                          {availableBlocks.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({BLOCK_CONFIG[b.type]?.label})
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t">
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
                </div>
              ) : (
                /* View Mode */
                <>
                  {selectedBlock.isActive === false && (
                    <div className="bg-gray-100 border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-500 font-medium flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                      Блок выключен
                    </div>
                  )}
                  <div>
                    <h3 className={cn("font-semibold", selectedBlock.isActive === false ? "text-gray-400" : "text-gray-900")}>
                      {selectedBlock.name}
                    </h3>
                    <Badge
                      variant="secondary"
                      className="mt-1"
                      style={{
                        borderColor: selectedBlock.isActive === false ? "#9ca3af" : BLOCK_CONFIG[selectedBlock.type]?.borderColor,
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
                      <p className="text-sm text-gray-900">
                        {data.roles.find((r) => r.id === selectedBlock.role)?.name ||
                          data.roles.find((r) => r.name === selectedBlock.role)?.name ||
                          selectedBlock.role}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Этап
                      </div>
                      <p className="text-sm text-gray-900">
                        {data.stages.find((s) => s.id === selectedBlock.stage)?.name ||
                          selectedBlock.stage}
                      </p>
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

                  {selectedBlock.checklist && selectedBlock.checklist.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                        <ListChecks className="w-3 h-3" />
                        Чек-лист ({selectedBlock.checklist.length})
                      </div>
                      <div className="space-y-1">
                        {selectedBlock.checklist.map((item, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                            <div className="w-4 h-4 rounded border border-gray-300 shrink-0 mt-0.5 flex items-center justify-center">
                              <span className="text-[9px] text-gray-400">{i + 1}</span>
                            </div>
                            <span>{item}</span>
                          </div>
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
  const roleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data.roles) {
      m.set(r.id, r.name);
      m.set(r.name, r.name);
    }
    return m;
  }, [data.roles]);

  const roleName = useCallback(
    (roleIdOrName: string) => roleMap.get(roleIdOrName) || roleIdOrName,
    [roleMap],
  );

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

  const handleDownloadWord = useCallback(async () => {
    const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } =
      await import("docx");

    const children: InstanceType<typeof Paragraph>[] = [];

    // Title
    children.push(
      new Paragraph({
        children: [new TextRun({ text: data.name, bold: true, size: 32 })],
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      })
    );

    for (let i = 0; i < sortedStages.length; i++) {
      const stage = sortedStages[i];
      const blocks = blocksByStage.get(stage.id) || [];

      // Stage heading: "1. Название этапа"
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${stage.name}`, bold: true, size: 26 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 120 },
        })
      );

      for (const block of blocks) {
        const typeLabel = BLOCK_CONFIG[block.type]?.label || block.type;
        const role = roleMap.get(block.role) || block.role;

        // Block name as bullet
        const headerRuns: InstanceType<typeof TextRun>[] = [
          new TextRun({ text: block.name, bold: true }),
          new TextRun({ text: `  [${typeLabel}]`, italics: true, color: "666666" }),
        ];
        children.push(
          new Paragraph({
            children: headerRuns,
            bullet: { level: 0 },
            spacing: { before: 100 },
          })
        );

        // Role + time
        const metaParts: string[] = [`Роль: ${role}`];
        if (block.timeEstimate) metaParts.push(`Время: ${block.timeEstimate}`);
        children.push(
          new Paragraph({
            children: [new TextRun({ text: metaParts.join("  |  "), color: "888888", size: 20 })],
            indent: { left: 720 },
          })
        );

        // Description
        if (block.description) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: block.description })],
              indent: { left: 720 },
              spacing: { before: 40, after: 40 },
            })
          );
        }

        // Documents / IS
        if (block.inputDocuments?.length) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "Входные документы: ", bold: true, size: 20 }),
                new TextRun({ text: block.inputDocuments.join(", "), size: 20 }),
              ],
              indent: { left: 720 },
            })
          );
        }
        if (block.outputDocuments?.length) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "Выходные документы: ", bold: true, size: 20 }),
                new TextRun({ text: block.outputDocuments.join(", "), size: 20 }),
              ],
              indent: { left: 720 },
            })
          );
        }
        if (block.infoSystems?.length) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "Информационные системы: ", bold: true, size: 20 }),
                new TextRun({ text: block.infoSystems.join(", "), size: 20 }),
              ],
              indent: { left: 720 },
            })
          );
        }
      }
    }

    const doc = new DocxDocument({
      sections: [{ children }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Этапы процесса ${data.name}.docx`);
  }, [data, sortedStages, blocksByStage, roleMap]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Этапы процесса</h2>
        <Button variant="outline" size="sm" onClick={handleDownloadWord}>
          <Download className="w-4 h-4" />
          Скачать Word
        </Button>
      </div>

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
                    {(() => {
                      const activeCount = blocks.filter((b) => b.isActive !== false).length;
                      const inactiveCount = blocks.length - activeCount;
                      return (
                        <>
                          {activeCount} {activeCount === 1 ? "блок" : activeCount < 5 ? "блока" : "блоков"}
                          {inactiveCount > 0 && (
                            <span className="text-gray-400"> ({inactiveCount} выкл.)</span>
                          )}
                        </>
                      );
                    })()}
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
                  {blocks.map((block) => {
                    const inactive = block.isActive === false;
                    return (
                    <div
                      key={block.id}
                      className={cn(
                        "rounded-lg border p-3",
                        inactive ? "border-gray-200 bg-gray-100 opacity-60" : "border-gray-100 bg-gray-50/50"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-2 h-8 rounded-full shrink-0"
                          style={{
                            backgroundColor: inactive ? "#9ca3af" : (BLOCK_CONFIG[block.type]?.borderColor || "#6b7280"),
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-medium", inactive ? "text-gray-400 line-through" : "text-gray-900")}>
                              {block.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {BLOCK_CONFIG[block.type]?.label}
                            </Badge>
                            {inactive && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-gray-300 text-gray-400">
                                Выключен
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {roleName(block.role)}
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
                      {block.description && (
                        <div className="mt-2 ml-5 pl-[0.25rem] border-l-2 border-gray-200">
                          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line pl-2">
                            {block.description}
                          </p>
                        </div>
                      )}
                      {(block.inputDocuments?.length || block.outputDocuments?.length || block.infoSystems?.length) ? (
                        <div className="mt-2 ml-5 pl-2 flex flex-col gap-1 text-xs text-gray-500">
                          {block.inputDocuments && block.inputDocuments.length > 0 && (
                            <span>
                              <span className="font-medium text-gray-600">Вход:</span>{" "}
                              {block.inputDocuments.join(", ")}
                            </span>
                          )}
                          {block.outputDocuments && block.outputDocuments.length > 0 && (
                            <span>
                              <span className="font-medium text-gray-600">Выход:</span>{" "}
                              {block.outputDocuments.join(", ")}
                            </span>
                          )}
                          {block.infoSystems && block.infoSystems.length > 0 && (
                            <span>
                              <span className="font-medium text-gray-600">ИС:</span>{" "}
                              {block.infoSystems.join(", ")}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
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

  const activeBlocks = data.blocks.filter((b) => b.isActive !== false);
  const inactiveCount = data.blocks.length - activeBlocks.length;

  // Compute type distribution (active blocks only)
  const typeDistribution = activeBlocks.reduce(
    (acc, block) => {
      acc[block.type] = (acc[block.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Role workload (active blocks only)
  const roleWorkload = data.roles.map((role) => {
    const roleBlocks = activeBlocks.filter(
      (b) => b.role === role.name || b.role === role.id
    );
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
      {inactiveCount > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {inactiveCount} {inactiveCount === 1 ? "блок выключен" : inactiveCount < 5 ? "блока выключены" : "блоков выключены"} — метрики рассчитаны без них
        </div>
      )}

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
                (count / (activeBlocks.length || 1)) * 100
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

      {/* Process Cost Calculation */}
      <ProcessCostCard roleWorkload={roleWorkload} />
    </div>
  );
}

const HOURS_PER_MONTH = 168;

function ProcessCostCard({
  roleWorkload,
}: {
  roleWorkload: { role: ProcessRole; blockCount: number; totalTime: string; totalMinutes: number }[];
}) {
  const roleCosts = roleWorkload
    .filter((rw) => rw.role.salary && rw.totalMinutes > 0)
    .map((rw) => {
      const hours = rw.totalMinutes / 60;
      const hourlyRate = rw.role.salary! / HOURS_PER_MONTH;
      const cost = hours * hourlyRate;
      return { ...rw, hours, hourlyRate, cost };
    })
    .sort((a, b) => b.cost - a.cost);

  const totalCost = roleCosts.reduce((sum, r) => sum + r.cost, 0);
  const rolesWithoutSalary = roleWorkload.filter(
    (rw) => !rw.role.salary && rw.totalMinutes > 0
  );

  if (roleCosts.length === 0 && rolesWithoutSalary.length === 0) return null;

  const fmtRub = (v: number) => Math.round(v).toLocaleString("ru-RU") + " ₽";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Стоимость процесса</CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Формула: время на процесс (ч) × (зарплата / {HOURS_PER_MONTH} ч)
        </p>
      </CardHeader>
      <CardContent>
        {roleCosts.length > 0 ? (
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_100px_100px_100px_120px] bg-gray-50 border-b border-gray-200">
                <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">Должность</div>
                <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-right">Зарплата/мес</div>
                <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-right">Ставка/ч</div>
                <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-right">Время</div>
                <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase text-right">Стоимость</div>
              </div>
              {roleCosts.map(({ role, hours, hourlyRate, cost }) => (
                <div
                  key={role.id}
                  className="grid grid-cols-[1fr_100px_100px_100px_120px] items-center border-b border-gray-100 last:border-b-0"
                >
                  <div className="px-3 py-2.5 flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: role.color || "#7c3aed" }}
                    />
                    <span className="text-sm text-gray-800 truncate">{role.name}</span>
                  </div>
                  <div className="px-3 py-2.5 text-sm text-gray-500 text-right tabular-nums">
                    {fmtRub(role.salary!)}
                  </div>
                  <div className="px-3 py-2.5 text-sm text-gray-500 text-right tabular-nums">
                    {fmtRub(hourlyRate)}
                  </div>
                  <div className="px-3 py-2.5 text-sm text-gray-500 text-right tabular-nums">
                    {hours < 1 ? `${Math.round(hours * 60)} мин` : `${hours.toFixed(1)} ч`}
                  </div>
                  <div className="px-3 py-2.5 text-sm font-medium text-gray-900 text-right tabular-nums">
                    {fmtRub(cost)}
                  </div>
                </div>
              ))}
              {/* Total row */}
              <div className="grid grid-cols-[1fr_100px_100px_100px_120px] items-center bg-purple-50 border-t border-purple-200">
                <div className="px-3 py-2.5 text-sm font-semibold text-purple-900">
                  Итого стоимость процесса
                </div>
                <div className="px-3 py-2.5" />
                <div className="px-3 py-2.5" />
                <div className="px-3 py-2.5" />
                <div className="px-3 py-2.5 text-base font-bold text-purple-700 text-right tabular-nums">
                  {fmtRub(totalCost)}
                </div>
              </div>
            </div>

            {rolesWithoutSalary.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Не указана зарплата: {rolesWithoutSalary.map((r) => r.role.name).join(", ")}. Укажите зарплату в анкете для точного расчёта.
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-6 text-center">
            <p className="text-sm text-gray-500">
              Зарплаты не указаны. Укажите зарплаты должностей в анкете для расчёта стоимости процесса.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Tab: CRM Funnels
// ============================================

const STATUS_ICONS: Record<string, typeof PauseCircle> = {
  pause: PauseCircle,
  lost: XOctagon,
  won: Trophy,
};

const STATUS_COLORS: Record<string, string> = {
  pause: "text-yellow-600 bg-yellow-50 border-yellow-200",
  lost: "text-red-600 bg-red-50 border-red-200",
  won: "text-green-600 bg-green-50 border-green-200",
};

function CrmFunnelsTab({
  funnels,
  data,
  processId,
  hasSavedFunnels,
  onChangePreview,
}: {
  funnels: CrmFunnel[];
  data: ProcessData;
  processId: number;
  hasSavedFunnels: boolean;
  onChangePreview: (cr: ChangeRequest, retryFn: () => void) => void;
}) {
  const utils = trpc.useUtils();
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [showQuality, setShowQuality] = useState(false);
  const [crmChangeOpen, setCrmChangeOpen] = useState(false);
  const [crmChangeDesc, setCrmChangeDesc] = useState("");
  const [variants, setVariants] = useState<CrmFunnel[] | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const crmChangeProgress = useGenerationProgress({ duration: 60000 });

  const crmChangeMutation = trpc.process.requestChange.useMutation({
    onSuccess: (changeRequest) => {
      crmChangeProgress.finish();
      const desc = `[Изменения только в CRM-воронках] ${crmChangeDesc.trim()}`;
      setCrmChangeOpen(false);
      setCrmChangeDesc("");
      onChangePreview(changeRequest as ChangeRequest, () => {
        crmChangeProgress.start();
        crmChangeMutation.mutate({ processId, description: desc });
      });
    },
    onError: () => {
      crmChangeProgress.reset();
    },
  });

  const handleCrmChange = useCallback(() => {
    if (!crmChangeDesc.trim()) return;
    crmChangeProgress.start();
    crmChangeMutation.mutate({
      processId,
      description: `[Изменения только в CRM-воронках] ${crmChangeDesc.trim()}`,
    });
  }, [crmChangeDesc, processId, crmChangeMutation, crmChangeProgress]);

  const crmGenProgress = useGenerationProgress({ duration: 90000 });

  const generateVariantsMutation = trpc.process.generateCrmVariants.useMutation({
    onSuccess: (data) => {
      crmGenProgress.finish();
      setVariants(data);
    },
    onError: () => {
      crmGenProgress.reset();
    },
  });

  const selectVariantMutation = trpc.process.selectCrmVariant.useMutation({
    onSuccess: () => {
      setVariants(null);
      setSelectedVariantId(null);
      utils.process.getById.invalidate({ id: processId });
    },
  });

  const handleGenerateVariants = useCallback(() => {
    crmGenProgress.start();
    generateVariantsMutation.mutate({ processId });
  }, [processId, generateVariantsMutation, crmGenProgress]);

  const handleSelectVariant = useCallback((funnel: CrmFunnel) => {
    setSelectedVariantId(funnel.id);
    selectVariantMutation.mutate({ processId, funnel });
  }, [processId, selectVariantMutation]);

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

  // --- Variant selection view ---
  if (variants && variants.length > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Выберите вариант CRM-воронки</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              ИИ сгенерировал {variants.length} варианта. Сравните и выберите подходящий.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setVariants(null)}>
            Отмена
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {variants.map((variant, idx) => {
            const l0Count = variant.stages.filter((s) => s.level === 0).length;
            const l1Count = variant.stages.filter((s) => s.level === 1).length;
            const isSelecting = selectVariantMutation.isPending && selectedVariantId === variant.id;
            return (
              <Card
                key={variant.id}
                className={cn(
                  "relative transition-all cursor-pointer hover:shadow-md",
                  selectedVariantId === variant.id && "ring-2 ring-purple-500"
                )}
                onClick={() => !selectVariantMutation.isPending && setSelectedVariantId(variant.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                      idx === 0 && "bg-blue-100 text-blue-700",
                      idx === 1 && "bg-purple-100 text-purple-700",
                      idx === 2 && "bg-amber-100 text-amber-700",
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm">{variant.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5 line-clamp-2">
                        {variant.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Stats */}
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {l0Count} L0-этапов
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {l1Count} L1-подэтапов
                    </Badge>
                  </div>

                  {/* Mini funnel preview */}
                  <div className="space-y-1">
                    {variant.stages
                      .filter((s) => s.level === 0)
                      .slice(0, 6)
                      .map((stage, sIdx) => {
                        const widthPercent = 100 - (sIdx / Math.max(l0Count - 1, 1)) * 35;
                        return (
                          <div
                            key={stage.id}
                            className="bg-purple-50 border border-purple-200 rounded px-2 py-1 mx-auto text-xs text-purple-800 truncate"
                            style={{ width: `${widthPercent}%` }}
                          >
                            {stage.name}
                          </div>
                        );
                      })}
                    {l0Count > 6 && (
                      <p className="text-xs text-gray-400 text-center">+{l0Count - 6} этапов</p>
                    )}
                  </div>

                  {/* Statuses */}
                  <div className="flex gap-1 flex-wrap">
                    {variant.statuses.map((s) => {
                      const colorCls = STATUS_COLORS[s.type] || "";
                      return (
                        <Badge key={s.id} variant="outline" className={cn("text-[10px]", colorCls)}>
                          {s.name}
                        </Badge>
                      );
                    })}
                  </div>

                  {/* Quality notes summary */}
                  {variant.qualityNotes.length > 0 && (
                    <p className="text-[11px] text-gray-400">
                      Замечаний: {variant.qualityNotes.length}
                    </p>
                  )}
                </CardContent>
                <div className="px-4 pb-4">
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={selectVariantMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectVariant(variant);
                    }}
                  >
                    {isSelecting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Сохранение...</>
                    ) : (
                      <><Check className="w-4 h-4" /> Выбрать этот вариант</>
                    )}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Empty state: no funnels at all ---
  if (funnels.length === 0 && !hasSavedFunnels) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Filter className="w-12 h-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          CRM-воронки не сгенерированы
        </h3>
        <p className="text-gray-500 mb-4">
          Сгенерируйте 2-3 варианта CRM-воронок с помощью ИИ и выберите подходящий
        </p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleGenerateVariants} disabled={generateVariantsMutation.isPending}>
                {crmGenProgress.phase === "done" ? (
                  <><Check className="w-4 h-4" /> Готово</>
                ) : generateVariantsMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Генерация... {crmGenProgress.progress}%</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Сгенерировать варианты CRM-воронок</>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Стоимость: {TOKEN_COSTS.crm_generation} токенов. Это может занять несколько минут.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {generateVariantsMutation.isPending && (
          <div className="w-full max-w-sm mt-4 space-y-2">
            <Progress value={crmGenProgress.progress} className="h-1.5" />
            <p className="text-xs text-amber-600 flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Идет генерация. Пожалуйста, не покидайте страницу
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CRM local action buttons */}
      <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <Dialog open={crmChangeOpen} onOpenChange={setCrmChangeOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={crmChangeMutation.isPending}>
              {crmChangeProgress.phase === "done" ? (
                <><Check className="w-4 h-4" /> Готово</>
              ) : crmChangeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Генерация... {crmChangeProgress.progress}%</>
              ) : (
                <><Send className="w-4 h-4" /> Запросить изменения в CRM</>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Изменения CRM-воронок</DialogTitle>
              <DialogDescription>
                Опишите изменения для CRM-воронок. ИИ обновит структуру процесса
                с учетом ваших пожеланий. Стоимость: {TOKEN_COSTS.change_request} токенов.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Например: Добавить этап квалификации лида перед первичным контактом..."
                value={crmChangeDesc}
                onChange={(e) => setCrmChangeDesc(e.target.value)}
                rows={4}
                disabled={crmChangeMutation.isPending}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setCrmChangeOpen(false)} disabled={crmChangeMutation.isPending}>
                  Отмена
                </Button>
                <Button onClick={handleCrmChange} disabled={crmChangeMutation.isPending || !crmChangeDesc.trim()}>
                  {crmChangeProgress.phase === "done" ? (
                    <><Check className="w-4 h-4" /> Готово</>
                  ) : crmChangeMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Генерация... {crmChangeProgress.progress}%</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Сгенерировать изменения</>
                  )}
                </Button>
              </DialogFooter>
              {crmChangeMutation.isPending && (
                <div className="space-y-2">
                  <Progress value={crmChangeProgress.progress} className="h-1.5" />
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Идет генерация. Пожалуйста, не покидайте страницу
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateVariants}
                disabled={generateVariantsMutation.isPending}
              >
                {crmGenProgress.phase === "done" ? (
                  <><Check className="w-4 h-4" /> Готово</>
                ) : generateVariantsMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Генерация... {crmGenProgress.progress}%</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Сгенерировать варианты заново</>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Стоимость: {TOKEN_COSTS.crm_generation} токенов</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {(crmChangeMutation.isPending || generateVariantsMutation.isPending) && (
        <Progress
          value={crmChangeMutation.isPending ? crmChangeProgress.progress : crmGenProgress.progress}
          className="h-1.5"
        />
      )}
      </div>

      {funnels.map((funnel) => {
        const l0Stages = funnel.stages.filter((s) => s.level === 0);
        const l1Stages = funnel.stages.filter((s) => s.level === 1);

        return (
          <div key={funnel.id} className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {funnel.name}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {funnel.description}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQuality((v) => !v)}
              >
                <ClipboardCheck className="w-4 h-4" />
                {showQuality ? "Скрыть проверки" : "Проверки качества"}
              </Button>
            </div>

            {/* Quality notes */}
            {showQuality && funnel.qualityNotes.length > 0 && (
              <Card>
                <CardContent className="py-3">
                  <div className="space-y-1">
                    {funnel.qualityNotes.map((note, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-start gap-2 text-sm",
                          note.includes("корректна") ? "text-green-700" : "text-amber-700"
                        )}
                      >
                        {note.includes("корректна") ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        )}
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Funnel visualization */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-purple-600" />
                  <CardTitle className="text-base">
                    Этапы воронки (L0)
                  </CardTitle>
                  <Badge variant="secondary" className="ml-auto">
                    {l0Stages.length} этапов
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {funnel.stages.map((stage, idx) => {
                    const isExpanded = expandedStages.has(stage.id);
                    const isL0 = stage.level === 0;
                    const isL1 = stage.level === 1;
                    const relatedBlocks = stage.relatedBlockIds
                      .map((bid) => data.blocks.find((b) => b.id === bid))
                      .filter(Boolean) as ProcessBlock[];

                    // Funnel width decreases for L0 stages
                    const l0Index = isL0 ? l0Stages.indexOf(stage) : -1;
                    const widthPercent = isL0
                      ? 100 - (l0Index / Math.max(l0Stages.length - 1, 1)) * 35
                      : 90;

                    return (
                      <div key={stage.id} className={cn("mb-1", isL1 && "ml-6")}>
                        <button
                          className={cn(
                            "w-full text-left transition-all",
                            "rounded-md border px-3 py-2",
                            isL0
                              ? "bg-purple-50 border-purple-200 hover:bg-purple-100"
                              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                          )}
                          style={{
                            maxWidth: isL0 ? `${widthPercent}%` : `${widthPercent}%`,
                            marginLeft: "auto",
                            marginRight: "auto",
                          }}
                          onClick={() => toggleStage(stage.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {isL0 && (
                                <span className="text-xs font-bold text-purple-500 shrink-0">
                                  L0.{l0Index + 1}
                                </span>
                              )}
                              {isL1 && (
                                <span className="text-xs font-medium text-gray-400 shrink-0">
                                  L1
                                </span>
                              )}
                              <span
                                className={cn(
                                  "text-sm font-medium truncate",
                                  isL0 ? "text-purple-800" : "text-gray-700"
                                )}
                              >
                                {stage.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isL0 && stage.slaDays !== undefined && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 border-blue-200 text-blue-600"
                                >
                                  <Timer className="w-2.5 h-2.5 mr-0.5" />
                                  {stage.slaDays}д
                                </Badge>
                              )}
                              {isL0 && stage.conversionTarget !== undefined && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 border-purple-300 text-purple-600"
                                >
                                  {stage.conversionTarget}%
                                </Badge>
                              )}
                              <ChevronDown
                                className={cn(
                                  "w-3.5 h-3.5 text-gray-400 transition-transform",
                                  isExpanded && "rotate-180"
                                )}
                              />
                            </div>
                          </div>

                          {/* Compact info for L0 */}
                          {isL0 && (
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                              <span className="flex items-center gap-0.5">
                                <UserCircle className="w-3 h-3" />
                                {stage.ownerRole}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <LogOut className="w-3 h-3" />
                                {stage.exitCriteria.length > 40
                                  ? stage.exitCriteria.slice(0, 40) + "..."
                                  : stage.exitCriteria}
                              </span>
                            </div>
                          )}
                        </button>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div
                            className={cn("mt-1 mb-2 space-y-2", isL0 ? "pl-4" : "pl-3")}
                            style={{ maxWidth: `${widthPercent - 2}%`, marginLeft: "auto", marginRight: "auto" }}
                          >
                            {/* Exit criteria */}
                            {isL0 && (
                              <div className="text-xs text-gray-600 bg-white rounded border border-gray-100 p-2">
                                <div className="font-medium text-gray-700 mb-1 flex items-center gap-1">
                                  <LogOut className="w-3 h-3" />
                                  Критерий выхода
                                </div>
                                <span>{stage.exitCriteria}</span>
                              </div>
                            )}

                            {/* Owner & SLA */}
                            {isL0 && (
                              <div className="flex gap-2">
                                <div className="flex-1 text-xs text-gray-600 bg-white rounded border border-gray-100 p-2">
                                  <div className="font-medium text-gray-700 mb-0.5 flex items-center gap-1">
                                    <UserCircle className="w-3 h-3" />
                                    Владелец
                                  </div>
                                  <span>{stage.ownerRole}</span>
                                </div>
                                {stage.slaDays !== undefined && (
                                  <div className="flex-1 text-xs text-gray-600 bg-white rounded border border-gray-100 p-2">
                                    <div className="font-medium text-gray-700 mb-0.5 flex items-center gap-1">
                                      <Timer className="w-3 h-3" />
                                      SLA
                                    </div>
                                    <span>
                                      {stage.slaDays}{" "}
                                      {stage.slaDays === 1
                                        ? "день"
                                        : stage.slaDays < 5
                                          ? "дня"
                                          : "дней"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Related blocks */}
                            {relatedBlocks.length > 0 && (
                              <div className="space-y-0.5">
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
                              </div>
                            )}

                            {/* Automations */}
                            {stage.automations.length > 0 && (
                              <div className="flex flex-wrap gap-1">
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

            {/* Statuses outside funnel */}
            {funnel.statuses.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Статусы вне воронки
                  </CardTitle>
                  <CardDescription>
                    Статусы, в которые сделка может перейти из любого этапа
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {funnel.statuses.map((status) => {
                      const IconComp = STATUS_ICONS[status.type] || PauseCircle;
                      const colorCls = STATUS_COLORS[status.type] || "";
                      return (
                        <div
                          key={status.id}
                          className={cn(
                            "rounded-lg border p-3",
                            colorCls
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <IconComp className="w-4 h-4" />
                            <span className="text-sm font-medium">{status.name}</span>
                          </div>
                          <p className="text-xs opacity-80">{status.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Tab: Recommendations
// ============================================

/**
 * Normalize recommendation description text so markdown tables render correctly.
 * The AI sometimes returns pipe-delimited tables as a single continuous string
 * without newlines. This function detects the separator row (|---|---|...)
 * and reconstructs proper markdown table rows.
 */
function normalizeMarkdownTables(raw: string): string {
  // Step 1: replace literal \n with real newlines
  let text = raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t");

  // If the text already has newlines before pipes, it's likely already formatted
  if (/\n\s*\|/.test(text)) return text;

  // Step 2: detect pipe-table separator pattern |---|---|...|
  const sepRegex = /(\|\s*-{2,}\s*(?:\|\s*-{2,}\s*)+\|)/;
  const sepMatch = text.match(sepRegex);
  if (!sepMatch) return text;

  // Count columns from separator
  const sepPipes = sepMatch[1].match(/\|/g);
  if (!sepPipes || sepPipes.length < 3) return text;
  const colCount = sepPipes.length - 1; // N pipes = N-1 columns

  // Find where the table starts (everything up to separator is prefix + header)
  const sepIndex = text.indexOf(sepMatch[1]);
  const beforeSep = text.substring(0, sepIndex);
  const separator = sepMatch[1];
  const afterSep = text.substring(sepIndex + separator.length);

  // Extract prefix text (non-table text before the header row)
  // The header row is the last pipe-group in beforeSep
  // Find header: count backwards from sepIndex to find pipe-row start
  let headerStart = -1;
  let pipesFound = 0;
  for (let i = beforeSep.length - 1; i >= 0; i--) {
    if (beforeSep[i] === "|") {
      pipesFound++;
      if (pipesFound === colCount + 1) {
        headerStart = i;
        break;
      }
    }
  }

  let prefix = "";
  let headerRow = beforeSep.trim();
  if (headerStart >= 0) {
    prefix = beforeSep.substring(0, headerStart).trim();
    headerRow = beforeSep.substring(headerStart).trim();
  }

  // Build result with prefix
  let result = prefix ? prefix + "\n\n" : "";
  result += headerRow + "\n" + separator + "\n";

  // Parse afterSep into rows by counting pipes
  let remaining = afterSep.trim();
  while (remaining.length > 0) {
    let pipeCount = 0;
    let rowEnd = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === "|") {
        pipeCount++;
        if (pipeCount === colCount + 1) {
          rowEnd = i;
          break;
        }
      }
    }
    if (rowEnd === -1) {
      // Remaining doesn't form a complete row — append as-is
      const leftover = remaining.trim();
      if (leftover) result += leftover + "\n";
      break;
    }
    result += remaining.substring(0, rowEnd + 1).trim() + "\n";
    remaining = remaining.substring(rowEnd + 1).trim();
  }

  return result.trim();
}

function RecommendationsTab({ processId, data, onChangePreview }: { processId: number; data?: ProcessData; onChangePreview: (cr: ChangeRequest, retryFn: () => void) => void }) {
  const utils = trpc.useUtils();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary", "backlog"])
  );
  const [recChangeOpen, setRecChangeOpen] = useState(false);
  const [recChangeDesc, setRecChangeDesc] = useState("");

  const recommendationsQuery = trpc.process.getRecommendations.useQuery({
    processId,
  });

  const recProgress = useGenerationProgress({ duration: 120000 });

  const generateMutation = trpc.process.generateRecommendations.useMutation({
    onSuccess: () => {
      recProgress.finish();
      utils.process.getRecommendations.invalidate({ processId });
    },
    onError: () => {
      recProgress.reset();
    },
  });

  const recChangeProgress = useGenerationProgress({ duration: 60000 });

  const recChangeMutation = trpc.process.requestChange.useMutation({
    onSuccess: (changeRequest) => {
      recChangeProgress.finish();
      const desc = `[Изменения только в Рекомендациях] ${recChangeDesc.trim()}`;
      setRecChangeOpen(false);
      setRecChangeDesc("");
      onChangePreview(changeRequest as ChangeRequest, () => {
        recChangeProgress.start();
        recChangeMutation.mutate({ processId, description: desc });
      });
    },
    onError: () => {
      recChangeProgress.reset();
    },
  });

  const handleRecChange = useCallback(() => {
    if (!recChangeDesc.trim()) return;
    recChangeProgress.start();
    recChangeMutation.mutate({
      processId,
      description: `[Изменения только в Рекомендациях] ${recChangeDesc.trim()}`,
    });
  }, [recChangeDesc, processId, recChangeMutation, recChangeProgress]);

  const recommendations = (recommendationsQuery.data || []) as Recommendation[];

  // Group by category and sort by CATEGORY_ORDER
  const sortedSections = useMemo(() => {
    const map = new Map<string, Recommendation>();
    for (const rec of recommendations) {
      // Take first recommendation per category (comprehensive analysis has one per section)
      if (!map.has(rec.category)) {
        map.set(rec.category, rec);
      }
    }
    // Sort by predefined order
    return CATEGORY_ORDER
      .filter((cat) => map.has(cat))
      .map((cat) => ({ category: cat, rec: map.get(cat)! }));
  }, [recommendations]);

  const toggleSection = useCallback((category: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSections(new Set(CATEGORY_ORDER));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedSections(new Set());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Комплексный анализ процесса
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Lean-диагностика, рекомендации по оптимизации и план внедрения
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {sortedSections.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={expandAll}>
                Развернуть всё
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Свернуть всё
              </Button>
            </>
          )}
          <Dialog open={recChangeOpen} onOpenChange={setRecChangeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={recChangeMutation.isPending}>
                {recChangeProgress.phase === "done" ? (
                  <><Check className="w-4 h-4" /> Готово</>
                ) : recChangeMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Генерация... {recChangeProgress.progress}%</>
                ) : (
                  <><Send className="w-4 h-4" /> Запросить изменения в Рекомендациях</>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Изменения рекомендаций</DialogTitle>
                <DialogDescription>
                  Опишите, что хотите изменить в рекомендациях. ИИ обновит анализ
                  с учётом ваших пожеланий. Стоимость: {TOKEN_COSTS.change_request} токенов.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  placeholder="Например: Добавить рекомендации по автоматизации отчётности..."
                  value={recChangeDesc}
                  onChange={(e) => setRecChangeDesc(e.target.value)}
                  rows={4}
                  disabled={recChangeMutation.isPending}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRecChangeOpen(false)} disabled={recChangeMutation.isPending}>
                    Отмена
                  </Button>
                  <Button onClick={handleRecChange} disabled={recChangeMutation.isPending || !recChangeDesc.trim()}>
                    {recChangeProgress.phase === "done" ? (
                      <><Check className="w-4 h-4" /> Готово</>
                    ) : recChangeMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Генерация... {recChangeProgress.progress}%</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> Сгенерировать изменения</>
                    )}
                  </Button>
                </DialogFooter>
                {recChangeMutation.isPending && (
                  <div className="space-y-2">
                    <Progress value={recChangeProgress.progress} className="h-1.5" />
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Идет генерация. Пожалуйста, не покидайте страницу
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    recProgress.start();
                    generateMutation.mutate({ processId });
                  }}
                  disabled={generateMutation.isPending}
                >
                  {recProgress.phase === "done" ? (
                    <>
                      <Check className="w-4 h-4" />
                      Готово
                    </>
                  ) : generateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Генерация... {recProgress.progress}%
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {recommendations.length > 0 ? "Сгенерировать Рекомендации заново" : "Сгенерировать анализ"}
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Это может занять несколько минут</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {(generateMutation.isPending || recChangeMutation.isPending) && (
        <div className="space-y-2">
          <Progress
            value={generateMutation.isPending ? recProgress.progress : recChangeProgress.progress}
            className="h-1.5"
          />
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Идет генерация. Пожалуйста, не покидайте страницу
          </p>
        </div>
      )}

      {recommendationsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      ) : recommendations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Анализ ещё не проводился
            </h3>
            <p className="text-gray-500 text-sm max-w-md">
              Нажмите "Сгенерировать анализ", чтобы получить комплексную
              Lean-диагностику процесса с рекомендациями по оптимизации,
              выявлением потерь и планом внедрения улучшений.
              <br />
              <span className="text-purple-600 font-medium">
                Стоимость: {TOKEN_COSTS.recommendations} токенов
              </span>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedSections.map(({ category, rec }) => {
            const IconComp = CATEGORY_ICONS[category] || Brain;
            const categoryLabel = CATEGORY_LABELS[category] || category;
            const isExpanded = expandedSections.has(category);

            return (
              <Card key={category} className="overflow-hidden">
                <button
                  onClick={() => toggleSection(category)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center",
                      category === "summary"
                        ? "bg-purple-100"
                        : category === "backlog"
                          ? "bg-green-100"
                          : category === "lean"
                            ? "bg-red-100"
                            : category === "automation"
                              ? "bg-blue-100"
                              : "bg-gray-100"
                    )}
                  >
                    <IconComp
                      className={cn(
                        "w-4.5 h-4.5",
                        category === "summary"
                          ? "text-purple-600"
                          : category === "backlog"
                            ? "text-green-600"
                            : category === "lean"
                              ? "text-red-600"
                              : category === "automation"
                                ? "text-blue-600"
                                : "text-gray-600"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {categoryLabel}
                    </h3>
                    <p className="text-xs text-gray-500 truncate">{rec.title}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] px-1.5 py-0 shrink-0",
                      PRIORITY_COLORS[rec.priority]
                    )}
                  >
                    {PRIORITY_LABELS[rec.priority]}
                  </Badge>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 px-4">
                    <div className="pl-12 prose prose-sm prose-gray max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h2: ({ children }) => (
                            <h4 className="text-sm font-semibold text-gray-900 mt-4 mb-2 first:mt-0">
                              {children}
                            </h4>
                          ),
                          h3: ({ children }) => (
                            <h5 className="text-sm font-medium text-gray-800 mt-3 mb-1.5">
                              {children}
                            </h5>
                          ),
                          p: ({ children }) => (
                            <p className="text-sm text-gray-600 mb-2">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="text-sm text-gray-600 list-disc list-inside mb-2 space-y-0.5">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="text-sm text-gray-600 list-decimal list-inside mb-2 space-y-0.5">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-sm text-gray-600">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-gray-900">
                              {children}
                            </strong>
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-3 -mx-2 px-2 border border-gray-200 rounded-lg">
                              <table className="min-w-full text-sm border-collapse">
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-gray-50 sticky top-0">{children}</thead>
                          ),
                          tbody: ({ children }) => (
                            <tbody className="divide-y divide-gray-100">
                              {children}
                            </tbody>
                          ),
                          tr: ({ children }) => (
                            <tr className="hover:bg-gray-50 transition-colors">{children}</tr>
                          ),
                          th: ({ children }) => (
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b-2 border-gray-200 whitespace-nowrap">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-3 py-2 text-sm text-gray-700 border-b border-gray-100 whitespace-nowrap">
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {normalizeMarkdownTables(rec.description || "")}
                      </ReactMarkdown>
                    </div>
                    {rec.relatedSteps.length > 0 && (
                      <div className="pl-12 mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-1.5">
                          Связанные блоки процесса:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {rec.relatedSteps.map((stepId, i) => {
                            const block = data?.blocks.find((b) => b.id === stepId);
                            const displayName = block?.name || stepId;
                            return (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                                title={stepId}
                              >
                                {displayName}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// Tab: Regulations
// ============================================

interface RegulationDoc {
  id: number;
  processId: number;
  roleName: string;
  docType: "regulation" | "job_description";
  content: string;
  createdAt: string;
}

function RegulationsTab({
  processId,
  data,
  companyName,
}: {
  processId: number;
  data?: ProcessData;
  companyName: string;
}) {
  const utils = trpc.useUtils();
  const [previewDoc, setPreviewDoc] = useState<RegulationDoc | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const regDocProgress = useGenerationProgress({ duration: 60000 });

  const regulationsQuery = trpc.process.getRegulations.useQuery({ processId });

  const generateMutation = trpc.process.generateRegulation.useMutation({
    onSuccess: () => {
      regDocProgress.finish();
      utils.process.getRegulations.invalidate({ processId });
      setGeneratingKey(null);
    },
    onError: () => {
      regDocProgress.reset();
      setGeneratingKey(null);
    },
  });

  const regulations = (regulationsQuery.data || []) as RegulationDoc[];

  const roles = useMemo(() => {
    if (!data) return [];
    return data.roles.map((r) => r.name);
  }, [data]);

  const getDoc = useCallback(
    (roleName: string, docType: "regulation" | "job_description") => {
      return regulations.find(
        (r) => r.roleName === roleName && r.docType === docType
      );
    },
    [regulations]
  );

  const handleGenerate = useCallback(
    (roleName: string, docType: "regulation" | "job_description") => {
      const key = `${roleName}:${docType}`;
      setGeneratingKey(key);
      regDocProgress.start();
      generateMutation.mutate({ processId, roleName, docType });
    },
    [generateMutation, processId, regDocProgress]
  );

  const docTypeLabel = (docType: "regulation" | "job_description") =>
    docType === "regulation" ? "Регламент" : "Должностная инструкция";

  const buildDocxBlob = useCallback(async (doc: RegulationDoc): Promise<Blob> => {
    const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } =
      await import("docx");

    const lines = doc.content.split("\n");
    const paragraphs: InstanceType<typeof Paragraph>[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        paragraphs.push(new Paragraph({ text: "" }));
        continue;
      }
      // Headings
      if (trimmed.startsWith("# ")) {
        paragraphs.push(
          new Paragraph({
            text: trimmed.slice(2),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 120 },
          })
        );
      } else if (trimmed.startsWith("## ")) {
        paragraphs.push(
          new Paragraph({
            text: trimmed.slice(3),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (trimmed.startsWith("### ")) {
        paragraphs.push(
          new Paragraph({
            text: trimmed.slice(4),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 160, after: 80 },
          })
        );
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: trimmed.slice(2) })],
            bullet: { level: 0 },
          })
        );
      } else if (/^\d+\.\s/.test(trimmed)) {
        const text = trimmed.replace(/^\d+\.\s/, "");
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text })],
            numbering: { reference: "default-numbering", level: 0 },
          })
        );
      } else {
        // Parse bold **text** in normal paragraphs
        const runs: InstanceType<typeof TextRun>[] = [];
        const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
        for (const part of parts) {
          if (part.startsWith("**") && part.endsWith("**")) {
            runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
          } else if (part) {
            runs.push(new TextRun({ text: part }));
          }
        }
        paragraphs.push(
          new Paragraph({
            children: runs,
            alignment: AlignmentType.JUSTIFIED,
          })
        );
      }
    }

    const docx = new DocxDocument({
      numbering: {
        config: [
          {
            reference: "default-numbering",
            levels: [
              {
                level: 0,
                format: "decimal" as any,
                text: "%1.",
                alignment: AlignmentType.LEFT,
              },
            ],
          },
        ],
      },
      sections: [{ children: paragraphs }],
    });

    return await Packer.toBlob(docx);
  }, []);

  const handleDownload = useCallback(
    async (doc: RegulationDoc) => {
      const blob = await buildDocxBlob(doc);
      const fileName = `${docTypeLabel(doc.docType)} ${doc.roleName} ${companyName}.docx`;
      saveAs(blob, fileName);
    },
    [buildDocxBlob, companyName]
  );

  const handleDownloadAll = useCallback(async () => {
    if (regulations.length === 0) return;
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    for (const doc of regulations) {
      const blob = await buildDocxBlob(doc);
      const fileName = `${docTypeLabel(doc.docType)} ${doc.roleName} ${companyName}.docx`;
      zip.file(fileName, blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, `Регламенты ${companyName}.zip`);
  }, [regulations, buildDocxBlob, companyName]);

  if (previewDoc) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreviewDoc(null)}>
              <ArrowLeft className="w-4 h-4" />
              Назад
            </Button>
            <h2 className="text-lg font-semibold text-gray-900">
              {docTypeLabel(previewDoc.docType)}: {previewDoc.roleName}
            </h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => handleDownload(previewDoc)}>
            <Download className="w-4 h-4" />
            Скачать .docx
          </Button>
        </div>

        <Card>
          <CardContent className="py-6">
            <div className="prose prose-sm prose-gray max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h2 className="text-xl font-bold text-gray-900 mt-6 mb-3 first:mt-0">{children}</h2>
                  ),
                  h2: ({ children }) => (
                    <h3 className="text-lg font-semibold text-gray-900 mt-5 mb-2">{children}</h3>
                  ),
                  h3: ({ children }) => (
                    <h4 className="text-base font-medium text-gray-800 mt-4 mb-2">{children}</h4>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="text-sm text-gray-700 list-disc list-inside mb-2 space-y-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="text-sm text-gray-700 list-decimal list-inside mb-2 space-y-1">{children}</ol>
                  ),
                  li: ({ children }) => <li className="text-sm text-gray-700">{children}</li>,
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-900">{children}</strong>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-3 border border-gray-200 rounded-lg">
                      <table className="min-w-full text-sm border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-gray-100">{children}</tbody>
                  ),
                  tr: ({ children }) => <tr className="hover:bg-gray-50">{children}</tr>,
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase border-b-2 border-gray-200">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 text-sm text-gray-700 border-b border-gray-100">{children}</td>
                  ),
                }}
              >
                {previewDoc.content}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Регламенты и должностные инструкции</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Генерация документов для каждой роли процесса
          </p>
        </div>
        {regulations.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownloadAll}>
            <FileArchive className="w-4 h-4" />
            Скачать все архивом
          </Button>
        )}
      </div>

      {regulationsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Роли не найдены</h3>
            <p className="text-gray-500 text-sm max-w-md">
              В процессе не определены роли. Добавьте роли на диаграмме процесса.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {roles.map((roleName) => {
            const regDoc = getDoc(roleName, "regulation");
            const jobDoc = getDoc(roleName, "job_description");
            const isGeneratingReg = generatingKey === `${roleName}:regulation`;
            const isGeneratingJob = generatingKey === `${roleName}:job_description`;

            return (
              <Card key={roleName}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <UserCircle className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{roleName}</h3>
                        <p className="text-xs text-gray-500">
                          {regDoc && jobDoc
                            ? "Оба документа готовы"
                            : regDoc || jobDoc
                              ? "1 из 2 документов готов"
                              : "Документы не сгенерированы"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Regulation */}
                    <div
                      className={cn(
                        "border rounded-lg p-3",
                        regDoc ? "border-green-200 bg-green-50/50" : "border-gray-200"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">Регламент</span>
                        {regDoc && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-700 border-green-300">
                            Готов
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {regDoc ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => setPreviewDoc(regDoc)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Просмотр
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(regDoc)}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isGeneratingReg}
                                    onClick={() => handleGenerate(roleName, "regulation")}
                                  >
                                    {isGeneratingReg && regDocProgress.phase === "done" ? (
                                      <Check className="w-3.5 h-3.5 text-green-600" />
                                    ) : isGeneratingReg ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Это может занять несколько минут</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  className="w-full"
                                  disabled={isGeneratingReg}
                                  onClick={() => handleGenerate(roleName, "regulation")}
                                >
                                  {isGeneratingReg && regDocProgress.phase === "done" ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      Готово
                                    </>
                                  ) : isGeneratingReg ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      Генерация... {regDocProgress.progress}%
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-3.5 h-3.5" />
                                      Сгенерировать ({TOKEN_COSTS.regulation_document} токенов)
                                    </>
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Это может занять несколько минут</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      {isGeneratingReg && regDocProgress.phase === "generating" && (
                        <div className="mt-2 space-y-1">
                          <Progress value={regDocProgress.progress} className="h-1" />
                          <p className="text-[10px] text-amber-600 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" />
                            Не покидайте страницу
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Job Description */}
                    <div
                      className={cn(
                        "border rounded-lg p-3",
                        jobDoc ? "border-green-200 bg-green-50/50" : "border-gray-200"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Briefcase className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">Должностная инструкция</span>
                        {jobDoc && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-700 border-green-300">
                            Готов
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {jobDoc ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => setPreviewDoc(jobDoc)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Просмотр
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(jobDoc)}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isGeneratingJob}
                                    onClick={() => handleGenerate(roleName, "job_description")}
                                  >
                                    {isGeneratingJob && regDocProgress.phase === "done" ? (
                                      <Check className="w-3.5 h-3.5 text-green-600" />
                                    ) : isGeneratingJob ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Это может занять несколько минут</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  className="w-full"
                                  disabled={isGeneratingJob}
                                  onClick={() => handleGenerate(roleName, "job_description")}
                                >
                                  {isGeneratingJob && regDocProgress.phase === "done" ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      Готово
                                    </>
                                  ) : isGeneratingJob ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      Генерация... {regDocProgress.progress}%
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-3.5 h-3.5" />
                                      Сгенерировать ({TOKEN_COSTS.regulation_document} токенов)
                                    </>
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Это может занять несколько минут</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      {isGeneratingJob && regDocProgress.phase === "generating" && (
                        <div className="mt-2 space-y-1">
                          <Progress value={regDocProgress.progress} className="h-1" />
                          <p className="text-[10px] text-amber-600 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" />
                            Не покидайте страницу
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {regulations.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Стоимость генерации: {TOKEN_COSTS.regulation_document} токенов за документ
        </p>
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

function QualityTab({ processId, onNavigateToBlock }: { processId: number; onNavigateToBlock?: (blockId: string) => void }) {
  const qualityQuery = trpc.process.validateQuality.useQuery({ processId });
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

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
  const errorCount = result.items.filter(i => !i.passed && i.severity === "error").length;
  const warningCount = result.items.filter(i => !i.passed && i.severity === "warning").length;
  const passedCount = result.items.filter(i => i.passed).length;
  const scoreColor = result.score >= 80 ? "text-green-600" : result.score >= 60 ? "text-yellow-600" : "text-red-600";
  const scoreBg = result.score >= 80 ? "bg-green-100" : result.score >= 60 ? "bg-yellow-100" : "bg-red-100";
  const scoreRing = result.score >= 80 ? "border-green-300" : result.score >= 60 ? "border-yellow-300" : "border-red-300";
  const barColor = result.score >= 80 ? "bg-green-500" : result.score >= 60 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-4">
      {/* Summary Card */}
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
        <CardContent className="space-y-4">
          <div className="flex items-center gap-6">
            <div className={cn("w-20 h-20 rounded-full flex items-center justify-center border-4 shrink-0", scoreBg, scoreRing)}>
              <span className={cn("text-2xl font-bold", scoreColor)}>{result.score}</span>
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-base font-medium text-gray-900">{result.summary}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                  <XCircle className="w-3.5 h-3.5" />
                  {errorCount} {errorCount === 1 ? "ошибка" : errorCount < 5 ? "ошибки" : "ошибок"}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {warningCount} {warningCount === 1 ? "предупреждение" : warningCount < 5 ? "предупреждения" : "предупреждений"}
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {passedCount} пройдено
                </span>
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Оценка качества</span>
              <span>{result.score} / 100</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${result.score}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Check Items by Category */}
      {categories.map((category) => {
        const catItems = result.items.filter(i => i.category === category);
        const catPassed = catItems.filter(i => i.passed).length;
        const catErrors = catItems.filter(i => !i.passed && i.severity === "error").length;
        const catWarnings = catItems.filter(i => !i.passed && i.severity === "warning").length;
        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="w-4 h-4" />
                  {category}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {catErrors > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{catErrors} ош.</Badge>}
                  {catWarnings > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-[10px] px-1.5 py-0">{catWarnings} пр.</Badge>}
                  <Badge variant={catPassed === catItems.length ? "default" : "secondary"}>
                    {catPassed}/{catItems.length}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {catItems.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const hasExtra = !item.passed && (item.consequence || item.recommendation || item.location);
                  const hasBlockNav = item.blockIds && item.blockIds.length > 0 && onNavigateToBlock;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg text-sm border transition-colors",
                        item.passed
                          ? "bg-green-50/60 border-green-200"
                          : item.severity === "error"
                            ? "bg-red-50/60 border-red-200"
                            : item.severity === "warning"
                              ? "bg-yellow-50/60 border-yellow-200"
                              : "bg-gray-50 border-gray-200"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => hasExtra && toggleExpand(item.id)}
                        className={cn(
                          "flex items-start gap-3 w-full text-left py-2.5 px-3",
                          hasExtra && "cursor-pointer"
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {item.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : item.severity === "error" ? (
                            <XCircle className="w-4 h-4 text-red-600" />
                          ) : item.severity === "warning" ? (
                            <AlertCircle className="w-4 h-4 text-yellow-600" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-blue-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "font-medium",
                            item.passed ? "text-green-800" : item.severity === "error" ? "text-red-800" : item.severity === "warning" ? "text-yellow-800" : "text-gray-800"
                          )}>
                            {item.rule}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{item.details}</p>
                          {item.passed && item.location && (
                            <p className="text-xs text-green-600 mt-1">{item.location}</p>
                          )}
                        </div>
                        {hasExtra && (
                          <div className="mt-0.5 shrink-0">
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-gray-400" />
                              : <ChevronRight className="w-4 h-4 text-gray-400" />
                            }
                          </div>
                        )}
                      </button>
                      {isExpanded && hasExtra && (
                        <div className={cn(
                          "px-3 pb-3 pt-0 ml-7 space-y-2 text-xs border-t",
                          item.severity === "error" ? "border-red-200" : "border-yellow-200"
                        )}>
                          {item.location && (
                            <div className="pt-2">
                              <span className="font-medium text-gray-700">Расположение: </span>
                              <span className="text-gray-600">{item.location}</span>
                            </div>
                          )}
                          {item.consequence && (
                            <div>
                              <span className="font-medium text-gray-700">Последствия: </span>
                              <span className="text-gray-600">{item.consequence}</span>
                            </div>
                          )}
                          {item.recommendation && (
                            <div>
                              <span className="font-medium text-gray-700">Рекомендация: </span>
                              <span className="text-gray-600">{item.recommendation}</span>
                            </div>
                          )}
                          {hasBlockNav && (
                            <div className="pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigateToBlock!(item.blockIds![0]);
                                }}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                Перейти к проблеме
                              </Button>
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
        );
      })}
    </div>
  );
}
