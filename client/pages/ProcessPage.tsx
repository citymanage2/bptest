import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth";
import { cn, formatDateTime } from "@/lib/utils";
import { exportToPNG, exportToBPMN, exportToPDF } from "@/lib/export";
import { createBpmnContext, canConnect } from "@/lib/bpmn";
import type { BpmnSession } from "@/lib/bpmn";

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
  SwimlaneCanvas,
  type SwimlaneCanvasHandle,
} from "@/components/SwimlaneCanvas";
import { KpiMotivationTab } from "@/components/KpiMotivationTab";

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
  BlockFile,
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
  BookOpen,
  Archive,
  Undo2,
  Redo2,
  Paperclip,
  Upload,
  Trash2,
  Medal,
} from "lucide-react";
import { toast } from "@/components/ui/toaster";
import ReactMarkdown from "react-markdown";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import JSZip from "jszip";

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
  if (data.blocks.length < 3) return [];

  // Pass 1: extract gates
  const gates = extractGates(data);

  // Pass 2: aggregate into L0 stages
  const l0Stages = aggregateToFunnelStages(data, gates);

  // Build L0+L1 hierarchy
  const allStages = buildSubStages(data, l0Stages);

  // Statuses
  const statuses = generateStatuses(data);

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

// ============================================
// Markdown renderer with built-in pipe table support
// (no remark-gfm required)
// ============================================

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ children }) => (
    <h3 className="text-base font-bold text-gray-900 mt-5 mb-2 first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="text-sm font-semibold text-gray-900 mt-4 mb-2 first:mt-0 border-b border-gray-100 pb-1">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="text-sm font-semibold text-gray-800 mt-3 mb-1.5">{children}</h5>
  ),
  h4: ({ children }) => (
    <h6 className="text-sm font-medium text-gray-700 mt-2 mb-1">{children}</h6>
  ),
  p: ({ children }) => <p className="text-sm text-gray-600 mb-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => (
    <ul className="text-sm text-gray-600 mb-2 space-y-0.5 pl-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-sm text-gray-600 list-decimal list-inside mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-gray-600 ml-4 list-disc">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
};

const isSepRow = (line: string) => /^\s*\|[\s\-:|]+\|\s*$/.test(line);

function PipeTable({ lines }: { lines: string[] }) {
  const rows = lines.filter((l) => /^\s*\|/.test(l));
  if (rows.length < 2) return null;
  const parseRow = (line: string) =>
    line.split("|").slice(1, -1).map((c) => c.trim());
  const headers = parseRow(rows[0]);
  const dataRows = rows.slice(1).filter((r) => !isSepRow(r)).map(parseRow);
  if (!headers.length || !dataRows.length) return null;
  const priorityCls = (cell: string) => {
    if (cell === "Высокий" || cell === "P1")
      return "bg-red-50 text-red-700 font-medium";
    if (cell === "Средний" || cell === "P2")
      return "bg-yellow-50 text-yellow-700 font-medium";
    if (cell === "Низкий" || cell === "P3")
      return "bg-green-50 text-green-700 font-medium";
    return "";
  };
  return (
    <div className="overflow-x-auto my-3 rounded-lg border border-gray-200">
      <table className="min-w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap border-b border-gray-200"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {dataRows.map((cells, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 text-xs text-gray-700 align-top ${priorityCls(cell)}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function preprocessMarkdown(text: string): string {
  return text
    .replace(/^(\s*)- \[x\] /gim, "$1- ☑ ")
    .replace(/^(\s*)- \[ \] /gm, "$1- ☐ ");
}

function MarkdownContent({ text }: { text: string }) {
  const processedText = preprocessMarkdown(text);
  const segments: Array<{ type: "md" | "table"; lines: string[] }> = [];
  let current: { type: "md" | "table"; lines: string[] } | null = null;
  for (const line of processedText.split("\n")) {
    const isTable = line.trimStart().startsWith("|");
    if (isTable) {
      if (current?.type === "table") {
        current.lines.push(line);
      } else {
        if (current) segments.push(current);
        current = { type: "table", lines: [line] };
      }
    } else {
      if (current?.type === "md") {
        current.lines.push(line);
      } else {
        if (current) segments.push(current);
        current = { type: "md", lines: [line] };
      }
    }
  }
  if (current) segments.push(current);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "table" ? (
          <PipeTable key={i} lines={seg.lines} />
        ) : (
          <ReactMarkdown key={i} components={MD_COMPONENTS}>
            {seg.lines.join("\n")}
          </ReactMarkdown>
        )
      )}
    </>
  );
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
  const [pendingChangeRequest, setPendingChangeRequest] = useState<ChangeRequest | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBefore, setPreviewBefore] = useState<ProcessData | null>(null);
  const [previewAfter, setPreviewAfter] = useState<ProcessData | null>(null);
  const [previewType, setPreviewType] = useState<"regenerate" | "change" | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasHandleRef = useRef<SwimlaneCanvasHandle>(null);
  const capturedBeforeRef = useRef<ProcessData | null>(null);

  // ---- Undo / Redo ----
  const undoStackRef = useRef<ProcessData[]>([]);
  const redoStackRef = useRef<ProcessData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isUndoRedoRef = useRef(false);

  // Must be declared before handlers that use it
  const pushToHistoryRef = useRef<((snapshot: ProcessData) => void) | null>(null);

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
  const [editConditionLabel, setEditConditionLabel] = useState("");
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [editConnections, setEditConnections] = useState<string[]>([]);
  const [editConnectionError, setEditConnectionError] = useState<string | null>(null);
  /** Live BPMN session rebuilt whenever `data` changes */
  const bpmnSessionRef = useRef<BpmnSession | null>(null);
  const [editFunnelStage, setEditFunnelStage] = useState("");
  const [editChecklist, setEditChecklist] = useState("");

  // ---- Mutations ----
  const updateDataMutation = trpc.process.updateData.useMutation({
    onSuccess: () => {
      utils.process.getById.invalidate({ id: processId });
    },
  });

  const regenerateMutation = trpc.process.regenerate.useMutation({
    onSuccess: (result) => {
      // Store preview instead of applying immediately
      setPreviewBefore(capturedBeforeRef.current);
      setPreviewAfter(result.data as ProcessData);
      setPreviewType("regenerate");
      setPreviewOpen(true);
    },
  });

  const requestChangeMutation = trpc.process.requestChange.useMutation({
    onSuccess: (changeRequest) => {
      const cr = changeRequest as ChangeRequest;
      setPendingChangeRequest(cr);
      setPreviewBefore(cr.previousData);
      setPreviewAfter(cr.newData);
      setPreviewType("change");
      setChangeDialogOpen(false);
      setPreviewOpen(true);
    },
  });

  const applyChangeMutation = trpc.process.applyChange.useMutation({
    onSuccess: () => {
      setPendingChangeRequest(null);
      setChangeDialogOpen(false);
      setChangeDescription("");
      setPreviewOpen(false);
      setPreviewBefore(null);
      setPreviewAfter(null);
      setPreviewType(null);
      utils.process.getById.invalidate({ id: processId });
    },
  });

  const rejectChangeMutation = trpc.process.rejectChange.useMutation({
    onSuccess: () => {
      setPendingChangeRequest(null);
      setPreviewOpen(false);
      setPreviewBefore(null);
      setPreviewAfter(null);
      setPreviewType(null);
    },
  });

  // ---- Computed ----
  const process = processQuery.data;
  const data = process?.data as ProcessData | undefined;

  // ---- BPMN session (rebuilt when data changes) ----
  useEffect(() => {
    if (data) {
      bpmnSessionRef.current = createBpmnContext(data);
    }
  }, [data]);

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
      setEditStage(block.stage || "");
      setEditTimeEstimate(block.timeEstimate || "");
      setEditInputDocuments(block.inputDocuments?.join(", ") || "");
      setEditOutputDocuments(block.outputDocuments?.join(", ") || "");
      setEditInfoSystems(block.infoSystems?.join(", ") || "");
      setEditConditionLabel(block.conditionLabel || "");
      setEditIsDefault(block.isDefault || false);
      setEditConnections(block.connections || []);
      setEditConnectionError(null);
      setEditFunnelStage(block.funnelStage || "");
      setEditChecklist(block.checklist?.join("\n") || "");
    },
    []
  );

  const handleSaveEdit = useCallback(() => {
    if (!data || !editingBlock) return;

    const parseCommaSeparated = (str: string): string[] =>
      str.split(",").map((s) => s.trim()).filter(Boolean);

    const updatedBlocks = data.blocks.map((b) =>
      b.id === editingBlock.id
        ? {
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
            conditionLabel: editConditionLabel || undefined,
            isDefault: editIsDefault,
            connections: editConnections,
            funnelStage: editFunnelStage || undefined,
            checklist: editChecklist.split("\n").map((s) => s.trim()).filter(Boolean).length
              ? editChecklist.split("\n").map((s) => s.trim()).filter(Boolean)
              : undefined,
          }
        : b
    );

    pushToHistoryRef.current?.(data);
    updateDataMutation.mutate({
      id: processId,
      data: { ...data, blocks: updatedBlocks },
    });
    setEditingBlock(null);
  }, [data, editingBlock, editName, editDescription, editType, editRole, editStage, editTimeEstimate, editInputDocuments, editOutputDocuments, editInfoSystems, editConditionLabel, editIsDefault, editConnections, editFunnelStage, editChecklist, processId, updateDataMutation]);

  const handleCancelEdit = useCallback(() => {
    setEditingBlock(null);
  }, []);

  const pushToHistory = useCallback((snapshot: ProcessData) => {
    if (isUndoRedoRef.current) return;
    undoStackRef.current = [...undoStackRef.current.slice(-19), snapshot];
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);
  pushToHistoryRef.current = pushToHistory;

  const handleUndo = useCallback(() => {
    if (!data || undoStackRef.current.length === 0) return;
    isUndoRedoRef.current = true;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [data, ...redoStackRef.current.slice(0, 19)];
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
    updateDataMutation.mutate({ id: processId, data: prev }, {
      onSettled: () => { isUndoRedoRef.current = false; },
    });
  }, [data, processId, updateDataMutation]);

  const handleRedo = useCallback(() => {
    if (!data || redoStackRef.current.length === 0) return;
    isUndoRedoRef.current = true;
    const next = redoStackRef.current[0];
    redoStackRef.current = redoStackRef.current.slice(1);
    undoStackRef.current = [...undoStackRef.current.slice(-19), data];
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
    updateDataMutation.mutate({ id: processId, data: next }, {
      onSettled: () => { isUndoRedoRef.current = false; },
    });
  }, [data, processId, updateDataMutation]);

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo, handleRedo]);

  const handleToggleActive = useCallback((blockId: string) => {
    if (!data) return;
    const updatedBlocks = data.blocks.map((b) =>
      b.id === blockId ? { ...b, isActive: b.isActive === false ? true : false } : b
    );
    pushToHistoryRef.current?.(data);
    toast({ title: "Применяем изменения…" });
    updateDataMutation.mutate(
      { id: processId, data: { ...data, blocks: updatedBlocks } },
      {
        onSuccess: () => {
          toast({ title: "Изменения сохранены" });
        },
      }
    );
  }, [data, processId, updateDataMutation]);

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

  const clearPreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewBefore(null);
    setPreviewAfter(null);
    setPreviewType(null);
  }, []);

  const handlePreviewSave = useCallback(() => {
    if (previewType === "regenerate") {
      clearPreview();
      utils.process.getById.invalidate({ id: processId });
    } else if (previewType === "change" && pendingChangeRequest) {
      applyChangeMutation.mutate({ changeRequestId: pendingChangeRequest.id });
    }
  }, [previewType, pendingChangeRequest, processId, utils, applyChangeMutation, clearPreview]);

  const handlePreviewCancel = useCallback(() => {
    if (previewType === "regenerate" && previewBefore) {
      updateDataMutation.mutate({ id: processId, data: previewBefore });
    } else if (previewType === "change" && pendingChangeRequest) {
      rejectChangeMutation.mutate({ changeRequestId: pendingChangeRequest.id });
      return; // rejectChangeMutation.onSuccess will call clearPreview
    }
    clearPreview();
    setPendingChangeRequest(null);
  }, [previewType, previewBefore, processId, updateDataMutation, pendingChangeRequest, rejectChangeMutation, clearPreview]);

  const handlePreviewRetry = useCallback(() => {
    const type = previewType;
    const before = previewBefore;
    const cr = pendingChangeRequest;
    clearPreview();
    setPendingChangeRequest(null);
    if (type === "regenerate" && before) {
      updateDataMutation.mutate({ id: processId, data: before });
    } else if (type === "change" && cr) {
      rejectChangeMutation.mutate({ changeRequestId: cr.id });
      setChangeDialogOpen(true);
    }
  }, [previewType, previewBefore, pendingChangeRequest, processId, updateDataMutation, rejectChangeMutation, clearPreview]);

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

        <div className="flex items-center gap-2">
          {/* Change Request Dialog */}
          <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Send className="w-4 h-4" />
                Изменить диаграмму
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-purple-600" />
                  Изменить диаграмму процесса
                </DialogTitle>
                <DialogDescription>
                  Изменения затронут только диаграмму (блоки, связи, роли).
                  После генерации будет показан предпросмотр. Стоимость: {TOKEN_COSTS.change_request} токенов.
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
            </DialogContent>
          </Dialog>

          {/* Preview Dialog */}
          <Dialog open={previewOpen} onOpenChange={() => {}}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Eye className="w-5 h-5 text-purple-600" />
                  Предпросмотр изменений
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500">
                  {previewType === "regenerate"
                    ? "AI сгенерировал новую версию процесса. Проверьте изменения перед сохранением."
                    : "AI предлагает следующие изменения. Проверьте их перед применением."}
                </DialogDescription>
              </DialogHeader>

              {previewBefore && previewAfter && (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-6 py-4 gap-4">
                  {/* Before / After stats header */}
                  <div className="grid grid-cols-2 gap-3 flex-shrink-0">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Текущая версия</span>
                      </div>
                      <div className="text-sm font-semibold text-gray-800 truncate">{previewBefore.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {previewBefore.blocks.length} блоков · {previewBefore.stages.length} этапов · {previewBefore.roles.length} ролей
                      </div>
                    </div>
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                        <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">Новая версия</span>
                      </div>
                      <div className="text-sm font-semibold text-purple-900 truncate">{previewAfter.name}</div>
                      <div className="text-xs text-purple-600 mt-1">
                        {previewAfter.blocks.length} блоков · {previewAfter.stages.length} этапов · {previewAfter.roles.length} ролей
                      </div>
                    </div>
                  </div>

                  {/* Diff list */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="text-sm font-medium text-gray-700 mb-2 flex-shrink-0">Список изменений:</div>
                    <div className="flex-1 overflow-y-auto space-y-1.5 rounded-lg border border-gray-200 p-3">
                      {(() => {
                        const items = computeProcessDiff(previewBefore, previewAfter);
                        return items.length === 0 ? (
                          <p className="text-sm text-gray-400 italic text-center py-6">Значимых изменений не обнаружено</p>
                        ) : (
                          items.map((item, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-start gap-2 px-3 py-2 rounded-md text-sm",
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
                                {item.details && <div className="text-gray-500 mt-0.5 text-xs">{item.details}</div>}
                              </div>
                            </div>
                          ))
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={handlePreviewCancel}
                  disabled={applyChangeMutation.isPending || rejectChangeMutation.isPending || updateDataMutation.isPending}
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                >
                  {(rejectChangeMutation.isPending || updateDataMutation.isPending) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  Отменить
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handlePreviewRetry}
                    disabled={applyChangeMutation.isPending || rejectChangeMutation.isPending || updateDataMutation.isPending}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Запросить заново
                  </Button>
                  <Button
                    onClick={handlePreviewSave}
                    disabled={applyChangeMutation.isPending || rejectChangeMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
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
              </DialogFooter>
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
                  onClick={() => {
                    capturedBeforeRef.current = data ?? null;
                    regenerateMutation.mutate({ id: processId });
                  }}
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
          <TabsTrigger value="regulations">Регламенты</TabsTrigger>
          <TabsTrigger value="passport">Паспорт</TabsTrigger>
          <TabsTrigger value="quality">Качество</TabsTrigger>
          <TabsTrigger value="recommendations">Рекомендации</TabsTrigger>
          <TabsTrigger value="kpi">KPI и мотивация</TabsTrigger>
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
            editStage={editStage}
            editTimeEstimate={editTimeEstimate}
            editInputDocuments={editInputDocuments}
            editOutputDocuments={editOutputDocuments}
            editInfoSystems={editInfoSystems}
            editConditionLabel={editConditionLabel}
            editIsDefault={editIsDefault}
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
            onSetEditConditionLabel={setEditConditionLabel}
            onSetEditIsDefault={setEditIsDefault}
            editConnections={editConnections}
            editConnectionError={editConnectionError}
            editFunnelStage={editFunnelStage}
            editChecklist={editChecklist}
            onSetEditConnections={(ids) => {
              setEditConnections(ids);
              setEditConnectionError(null);
            }}
            onAddEditConnection={(targetId) => {
              if (!editingBlock || !data) return;
              const session = bpmnSessionRef.current;
              if (!session) {
                // Fallback: no validation
                if (!editConnections.includes(targetId)) {
                  setEditConnections([...editConnections, targetId]);
                }
                return;
              }
              // Rebuild a temporary context with current editConnections state
              // so canConnect sees live incoming/outgoing
              const tempData = {
                ...data,
                blocks: data.blocks.map((b) =>
                  b.id === editingBlock.id
                    ? { ...b, connections: editConnections }
                    : b,
                ),
              };
              const tempSession = createBpmnContext(tempData);
              const sourceBO = tempSession.ctx.blocks.get(editingBlock.id);
              const targetBO = tempSession.ctx.blocks.get(targetId);
              if (!sourceBO || !targetBO) return;
              const result = canConnect(sourceBO, targetBO);
              if (!result.allowed) {
                setEditConnectionError(result.reason);
                return;
              }
              setEditConnectionError(null);
              setEditConnections([...editConnections, targetId]);
            }}
            onSetEditFunnelStage={setEditFunnelStage}
            onSetEditChecklist={setEditChecklist}
            onScaleChange={setCanvasScale}
            onExportPNG={handleExportPNG}
            onExportBPMN={handleExportBPMN}
            onExportPDF={handleExportPDF}
            onToggleActive={handleToggleActive}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
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
          <CrmFunnelsTab
            funnels={data.crmOverride ? [data.crmOverride] : crmFunnels}
            data={data}
            processId={processId}
          />
        </TabsContent>

        {/* ======== Tab: Regulations ======== */}
        <TabsContent value="regulations">
          <RegulationsTab
            data={data}
            processId={processId}
            companyName={process?.companyName ?? ""}
          />
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
          <RecommendationsTab processId={processId} data={data} />
        </TabsContent>

        {/* ======== Tab: KPI & Motivation ======== */}
        <TabsContent value="kpi">
          {data && (
            <KpiMotivationTab
              processId={processId}
              companyId={process!.companyId}
              data={data}
            />
          )}
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
  editStage: string;
  editTimeEstimate: string;
  editInputDocuments: string;
  editOutputDocuments: string;
  editInfoSystems: string;
  editConditionLabel: string;
  editIsDefault: boolean;
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
  onSetEditConditionLabel: (v: string) => void;
  onSetEditIsDefault: (v: boolean) => void;
  editConnections: string[];
  editConnectionError: string | null;
  editFunnelStage: string;
  editChecklist: string;
  onSetEditConnections: (v: string[]) => void;
  onAddEditConnection: (targetId: string) => void;
  onSetEditFunnelStage: (v: string) => void;
  onSetEditChecklist: (v: string) => void;
  onScaleChange: (scale: number) => void;
  onExportPNG: () => void;
  onExportBPMN: () => void;
  onExportPDF: () => void;
  onToggleActive: (blockId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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
  editConditionLabel,
  editIsDefault,
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
  onSetEditConditionLabel,
  onSetEditIsDefault,
  editConnections,
  editConnectionError,
  editFunnelStage,
  editChecklist,
  onSetEditConnections,
  onAddEditConnection,
  onSetEditFunnelStage,
  onSetEditChecklist,
  onScaleChange,
  onExportPNG,
  onExportBPMN,
  onExportPDF,
  onToggleActive,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
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

            <div className="w-px h-5 bg-gray-200 mx-1" />

            <Button
              variant="outline"
              size="icon"
              onClick={onUndo}
              disabled={!canUndo}
              title="Отменить (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onRedo}
              disabled={!canRedo}
              title="Вернуть (Ctrl+Y)"
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
                <div className="flex items-center gap-2">
                  {/* iOS-style toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={selectedBlock.isActive !== false}
                    title={selectedBlock.isActive === false ? "Включить блок" : "Выключить блок"}
                    onClick={() => onToggleActive(selectedBlock.id)}
                    className={cn(
                      "relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400",
                      selectedBlock.isActive === false ? "bg-gray-200" : "bg-green-500"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-[22px] w-[22px] rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out",
                        selectedBlock.isActive === false ? "translate-x-0" : "translate-x-[20px]"
                      )}
                    />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onClosePanel}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {selectedBlock.isActive === false && (
                <p className="text-xs text-gray-400 mt-1">Блок выключен</p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {editingBlock?.id === selectedBlock.id ? (
                /* Editing Mode */
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
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
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Этап воронки
                    </label>
                    <Input
                      value={editFunnelStage}
                      onChange={(e) => onSetEditFunnelStage(e.target.value)}
                      placeholder="напр. Лид, Квалификация"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Чек-лист выполнения
                    </label>
                    <Textarea
                      value={editChecklist}
                      onChange={(e) => onSetEditChecklist(e.target.value)}
                      placeholder={"Каждый шаг — с новой строки:\nПроверить данные\nСогласовать с руководителем\nОтправить клиенту"}
                      rows={4}
                      className="text-sm font-mono"
                    />
                    <p className="text-xs text-gray-400">Каждый пункт — отдельная строка</p>
                  </div>
                  <BlockFilesSection processId={processId} blockId={editingBlock.id} />
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">
                      Следующий этап
                    </label>
                    <div className="space-y-1">
                      {editConnections.map((connId) => {
                        const connBlock = data.blocks.find((b) => b.id === connId);
                        return (
                          <div
                            key={connId}
                            className="flex items-center justify-between bg-gray-50 rounded px-2 py-1"
                          >
                            <span className="text-xs text-gray-700 truncate flex-1">
                              {connBlock?.name || connId}
                            </span>
                            <button
                              type="button"
                              className="ml-1 shrink-0 text-gray-400 hover:text-red-500"
                              onClick={() =>
                                onSetEditConnections(editConnections.filter((id) => id !== connId))
                              }
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                      <select
                        className={`flex h-7 w-full rounded-md border bg-transparent px-2 text-xs ${editConnectionError ? "border-red-400" : "border-gray-300"}`}
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            onAddEditConnection(e.target.value);
                          }
                          e.target.value = "";
                        }}
                      >
                        <option value="">+ Добавить связь</option>
                        {data.blocks
                          .filter(
                            (b) =>
                              b.id !== editingBlock.id &&
                              !editConnections.includes(b.id),
                          )
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                      </select>
                      {editConnectionError && (
                        <p className="text-xs text-red-500 mt-0.5">{editConnectionError}</p>
                      )}
                    </div>
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

                  {selectedBlock.funnelStage && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Этап воронки
                      </div>
                      <p className="text-sm text-gray-900">
                        {selectedBlock.funnelStage}
                      </p>
                    </div>
                  )}

                  <BlockFilesSection processId={processId} blockId={selectedBlock.id} />

                  {selectedBlock.checklist && selectedBlock.checklist.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Чек-лист ({selectedBlock.checklist.length})
                      </div>
                      <ul className="space-y-1">
                        {selectedBlock.checklist.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded border border-gray-300 bg-white flex items-center justify-center">
                              <span className="w-2 h-2 rounded-sm bg-transparent" />
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedBlock.connections.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Следующий этап ({selectedBlock.connections.length})
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

  const handleExportWord = useCallback(async () => {
    const children: Paragraph[] = [
      new Paragraph({ text: data.name, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: "Этапы бизнес-процесса", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: "" }),
    ];

    const stageBlockMap = new Map<string, ProcessBlock[]>();
    for (const stage of sortedStages) {
      const stageBlocks = data.blocks.filter(
        (b) => b.stage === stage.name || b.stage === stage.id
      );
      stageBlockMap.set(stage.id, orderBlocksByConnections(stageBlocks, data.blocks));
    }

    for (let i = 0; i < sortedStages.length; i++) {
      const stage = sortedStages[i];
      const blocks = stageBlockMap.get(stage.id) || [];
      children.push(
        new Paragraph({ text: `${i + 1}. ${stage.name}`, heading: HeadingLevel.HEADING_3 })
      );
      if (blocks.length === 0) {
        children.push(new Paragraph({ text: "Нет блоков на этом этапе", style: "Normal" }));
      }
      for (const block of blocks) {
        const status = block.isActive === false ? " [выкл.]" : "";
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: `${block.name}${status}`, bold: true }),
              new TextRun({ text: `  (${BLOCK_CONFIG[block.type]?.label || block.type})` }),
            ],
          })
        );
        const meta: string[] = [];
        if (block.role) meta.push(`Роль: ${roleMap.get(block.role) || block.role}`);
        if (block.timeEstimate) meta.push(`Время: ${block.timeEstimate}`);
        if (meta.length > 0) {
          children.push(
            new Paragraph({
              bullet: { level: 1 },
              children: [new TextRun({ text: meta.join("  |  "), color: "555555" })],
            })
          );
        }
        if (block.description) {
          children.push(
            new Paragraph({
              bullet: { level: 1 },
              children: [new TextRun({ text: block.description })],
            })
          );
        }
      }
      children.push(new Paragraph({ text: "" }));
    }

    const doc = new Document({ sections: [{ properties: {}, children }] });
    const blob = await Packer.toBlob(doc);
    triggerDownload(blob, `Этапы — ${data.name}.docx`);
  }, [data, sortedStages, roleMap]);

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
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportWord} className="gap-2">
          <Download className="w-4 h-4" />
          Экспорт в Word
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
                  {blocks.map((block) => {
                    const isInactive = block.isActive === false;
                    return (
                    <div
                      key={block.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors",
                        isInactive
                          ? "border-gray-100 bg-gray-100/70 opacity-60"
                          : "border-gray-100 hover:border-gray-200 bg-gray-50/50"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-2 h-8 rounded-full shrink-0"
                          style={{
                            backgroundColor: isInactive
                              ? "#9ca3af"
                              : BLOCK_CONFIG[block.type]?.borderColor || "#6b7280",
                          }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-medium truncate", isInactive ? "text-gray-400 line-through" : "text-gray-900")}>
                              {block.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {BLOCK_CONFIG[block.type]?.label}
                            </Badge>
                            {isInactive && (
                              <span className="text-[10px] text-gray-400 shrink-0">выкл.</span>
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
                          {block.description && (
                            <p className={cn("mt-1.5 text-xs leading-relaxed", isInactive ? "text-gray-400" : "text-gray-600")}>
                              {block.description}
                            </p>
                          )}
                        </div>
                      </div>
                      {block.connections.length > 0 && (
                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                      )}
                    </div>
                  )})}
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
  // salary per roleId (monthly, RUB) — local state for cost calculation
  const [salaries, setSalaries] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.roles.map((r) => [r.id, ""]))
  );

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

  // Role workload — match blocks by role.id OR role.name
  const roleWorkload = data.roles.map((role) => {
    const roleBlocks = data.blocks.filter(
      (b) => b.role === role.id || b.role === role.name
    );
    const totalMinutes = roleBlocks.reduce(
      (sum, b) => sum + parseTimeEstimate(b.timeEstimate),
      0
    );
    const monthlySalary = parseFloat(salaries[role.id] || "0") || 0;
    const hourlyRate = monthlySalary / 168;
    const cost = (totalMinutes / 60) * hourlyRate;
    return {
      role,
      blockCount: roleBlocks.length,
      totalTime: formatMinutes(totalMinutes),
      totalMinutes,
      cost,
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
                const maxBlocks = Math.max(
                  ...roleWorkload.map((r) => r.blockCount),
                  1
                );
                const timeBarWidth = Math.round((totalMinutes / maxMinutes) * 100);
                const blockBarWidth = Math.round((blockCount / maxBlocks) * 100);
                return (
                  <div key={role.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-medium truncate max-w-[180px]">{role.name}</span>
                      <span className="text-gray-500 shrink-0 ml-2">{blockCount} бл. / {totalTime}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-[10px] text-gray-400 w-12 shrink-0">Блоков</span>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${blockBarWidth || 2}%`,
                            backgroundColor: role.color || "#7c3aed",
                            opacity: 0.55,
                            minWidth: "12px",
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-[10px] text-gray-400 w-12 shrink-0">Время</span>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${timeBarWidth || 2}%`,
                            backgroundColor: role.color || "#7c3aed",
                            minWidth: "12px",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Process Cost */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Стоимость процесса</CardTitle>
          <CardDescription>
            Укажите месячную зарплату (руб.) для каждой роли. Стоимость = время роли × (зарплата / 168)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {roleWorkload
              .sort((a, b) => b.totalMinutes - a.totalMinutes)
              .map(({ role, totalTime, totalMinutes, cost }) => (
                <div key={role.id} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-40 shrink-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: role.color || "#7c3aed" }}
                    />
                    <span className="text-sm text-gray-700 truncate">{role.name}</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Зарплата/мес"
                    className="w-36 h-8 text-sm shrink-0"
                    value={salaries[role.id] ?? ""}
                    onChange={(e) =>
                      setSalaries((prev) => ({ ...prev, [role.id]: e.target.value }))
                    }
                  />
                  <div className="text-xs text-gray-400 shrink-0 w-20">{totalTime}</div>
                  <div className="flex-1 text-right text-sm font-medium text-gray-800">
                    {cost > 0
                      ? `${cost.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`
                      : <span className="text-gray-300">—</span>}
                  </div>
                </div>
              ))}
          </div>

          {/* Total */}
          {roleWorkload.some((r) => r.cost > 0) && (
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Итого стоимость процесса</span>
              <span className="text-lg font-bold text-purple-700">
                {roleWorkload
                  .reduce((sum, r) => sum + r.cost, 0)
                  .toLocaleString("ru-RU", { maximumFractionDigits: 0 })}{" "}₽
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
}: {
  funnels: CrmFunnel[];
  data: ProcessData;
  processId: number;
}) {
  const utils = trpc.useUtils();
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [showQuality, setShowQuality] = useState(false);
  const [crmChangeOpen, setCrmChangeOpen] = useState(false);
  const [crmDescription, setCrmDescription] = useState("");
  const [crmVariants, setCrmVariants] = useState<CrmFunnel[] | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<number>(0);

  const generateCrmVariantsMutation = trpc.process.generateCrmVariants.useMutation({
    onSuccess: (variants) => {
      setCrmVariants(variants);
      setSelectedVariant(0);
      setCrmChangeOpen(false);
    },
  });

  const updateDataMutation = trpc.process.updateData.useMutation({
    onSuccess: () => {
      utils.process.getById.invalidate({ id: processId });
      toast({ title: "CRM-воронка сохранена" });
    },
  });

  const handleSaveVariant = useCallback(() => {
    if (!crmVariants) return;
    updateDataMutation.mutate({
      id: processId,
      data: { ...data, crmOverride: crmVariants[selectedVariant] },
    });
    setCrmVariants(null);
  }, [crmVariants, selectedVariant, data, processId, updateDataMutation]);

  const handleClearOverride = useCallback(() => {
    updateDataMutation.mutate({
      id: processId,
      data: { ...data, crmOverride: undefined },
    });
  }, [data, processId, updateDataMutation]);

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
    <div className="space-y-6">
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
              <div className="flex items-center gap-2">
                {data.crmOverride && (
                  <Button variant="ghost" size="sm" className="text-xs text-gray-400" onClick={handleClearOverride}>
                    Сбросить к авто
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCrmChangeOpen(true)}
                  disabled={generateCrmVariantsMutation.isPending}
                >
                  <Send className="w-4 h-4" />
                  Изменить воронку
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowQuality((v) => !v)}
                >
                  <ClipboardCheck className="w-4 h-4" />
                  {showQuality ? "Скрыть проверки" : "Проверки качества"}
                </Button>
              </div>
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

                            {/* Checklist */}
                            {stage.checklist.length > 0 && (
                              <div className="text-xs text-gray-600 bg-white rounded border border-gray-100 p-2">
                                <div className="font-medium text-gray-700 mb-1 flex items-center gap-1">
                                  <ListChecks className="w-3 h-3" />
                                  Чек-лист ({stage.checklist.length})
                                </div>
                                <div className="space-y-0.5">
                                  {stage.checklist.map((item, i) => (
                                    <div key={i} className="flex items-start gap-1.5">
                                      <div className="w-3.5 h-3.5 rounded border border-gray-300 shrink-0 mt-0.5 flex items-center justify-center">
                                        <span className="text-[8px] text-gray-400">{i + 1}</span>
                                      </div>
                                      <span>{item}</span>
                                    </div>
                                  ))}
                                </div>
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

      {/* ── CRM Change Request Dialog ── */}
      <Dialog open={crmChangeOpen} onOpenChange={setCrmChangeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-purple-600" />
              Изменить CRM-воронку
            </DialogTitle>
            <DialogDescription>
              ИИ сгенерирует 2–3 варианта воронки, из которых вы выберете лучший.
              Стоимость: {TOKEN_COSTS.crm_variants} токенов.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Например: сделай воронку с 5 этапами с фокусом на квалификацию лидов..."
            value={crmDescription}
            onChange={(e) => setCrmDescription(e.target.value)}
            rows={4}
            disabled={generateCrmVariantsMutation.isPending}
          />
          {generateCrmVariantsMutation.error && (
            <p className="text-sm text-red-500">{generateCrmVariantsMutation.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCrmChangeOpen(false)} disabled={generateCrmVariantsMutation.isPending}>
              Отмена
            </Button>
            <Button
              onClick={() => generateCrmVariantsMutation.mutate({ processId, description: crmDescription })}
              disabled={generateCrmVariantsMutation.isPending || !crmDescription.trim()}
            >
              {generateCrmVariantsMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Генерация...</>
              ) : (
                <><Sparkles className="w-4 h-4" />Сгенерировать варианты</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CRM Variants Preview Dialog ── */}
      <Dialog open={!!crmVariants} onOpenChange={() => {}}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-purple-600" />
              Предпросмотр: выберите вариант CRM-воронки
            </DialogTitle>
            <DialogDescription>
              ИИ предлагает {crmVariants?.length ?? 0} варианта. Выберите подходящий и сохраните.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {(crmVariants ?? []).map((variant, idx) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariant(idx)}
                  className={cn(
                    "text-left rounded-xl border-2 p-4 transition-all focus:outline-none",
                    selectedVariant === idx
                      ? "border-purple-500 bg-purple-50 shadow-md"
                      : "border-gray-200 hover:border-purple-300 bg-white"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                      selectedVariant === idx ? "border-purple-500 bg-purple-500" : "border-gray-300"
                    )}>
                      {selectedVariant === idx && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className="font-semibold text-sm text-gray-900">{variant.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{variant.description}</p>
                  <div className="space-y-1">
                    {variant.stages.filter((s) => s.level === 0).map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-xs text-gray-700">
                        <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                        <span>{s.name}</span>
                        {s.conversionTarget && (
                          <span className="ml-auto text-gray-400">{s.conversionTarget}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="px-6 py-4 border-t flex-shrink-0 flex justify-between">
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setCrmVariants(null); setCrmDescription(""); }}>
              <XCircle className="w-4 h-4" />
              Отменить
            </Button>
            <Button onClick={handleSaveVariant} disabled={updateDataMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
              {updateDataMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Сохранение...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" />Сохранить вариант {selectedVariant + 1}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Tab: Recommendations
// ============================================

function RecommendationsTab({ processId, data }: { processId: number; data?: ProcessData }) {
  const utils = trpc.useUtils();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary", "backlog"])
  );

  const recommendationsQuery = trpc.process.getRecommendations.useQuery({
    processId,
  });

  const generateMutation = trpc.process.generateRecommendations.useMutation({
    onSuccess: () => {
      utils.process.getRecommendations.invalidate({ processId });
    },
  });

  // ── Recommendations change request state ──
  const [recChangeOpen, setRecChangeOpen] = useState(false);
  const [recDescription, setRecDescription] = useState("");
  type RecPreview = { category: string; title: string; description: string; priority: string; relatedSteps: string[] };
  const [recPreview, setRecPreview] = useState<{ previous: RecPreview[]; updated: RecPreview[] } | null>(null);

  const requestRecChangeMutation = trpc.process.requestRecommendationChange.useMutation({
    onSuccess: (result) => {
      setRecPreview(result as { previous: RecPreview[]; updated: RecPreview[] });
      setRecChangeOpen(false);
    },
  });

  const replaceRecsMutation = trpc.process.replaceRecommendations.useMutation({
    onSuccess: () => {
      utils.process.getRecommendations.invalidate({ processId });
      setRecPreview(null);
      setRecDescription("");
      toast({ title: "Рекомендации обновлены" });
    },
  });

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
        <div className="flex items-center gap-2">
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
          {recommendations.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setRecChangeOpen(true)}
              disabled={requestRecChangeMutation.isPending}
            >
              {requestRecChangeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Генерация...</>
              ) : (
                <><Send className="w-4 h-4" />Изменить рекомендации</>
              )}
            </Button>
          )}
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
                {recommendations.length > 0 ? "Обновить анализ" : "Сгенерировать анализ"}
              </>
            )}
          </Button>
        </div>
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
                    <div className="pl-12">
                      <MarkdownContent text={rec.description} />
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

      {/* ── Rec Change Request Dialog ── */}
      <Dialog open={recChangeOpen} onOpenChange={setRecChangeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-600" />
              Изменить рекомендации
            </DialogTitle>
            <DialogDescription>
              ИИ обновит рекомендации согласно вашему запросу с возможностью предпросмотра.
              Стоимость: {TOKEN_COSTS.recommendations} токенов.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Например: сделай акцент на автоматизации, убери раздел про управление данными..."
            value={recDescription}
            onChange={(e) => setRecDescription(e.target.value)}
            rows={4}
            disabled={requestRecChangeMutation.isPending}
          />
          {requestRecChangeMutation.error && (
            <p className="text-sm text-red-500">{requestRecChangeMutation.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecChangeOpen(false)} disabled={requestRecChangeMutation.isPending}>
              Отмена
            </Button>
            <Button
              onClick={() => requestRecChangeMutation.mutate({ processId, description: recDescription })}
              disabled={requestRecChangeMutation.isPending || !recDescription.trim()}
            >
              {requestRecChangeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Генерация...</>
              ) : (
                <><Sparkles className="w-4 h-4" />Сгенерировать изменения</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rec Preview Dialog ── */}
      <Dialog open={!!recPreview} onOpenChange={() => {}}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-600" />
              Предпросмотр: изменения рекомендаций
            </DialogTitle>
            <DialogDescription>
              Ознакомьтесь с изменениями перед сохранением.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Текущие ({recPreview?.previous.length ?? 0})</p>
                {(recPreview?.previous ?? []).map((r, i) => (
                  <div key={i} className="p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <p className="text-xs font-medium text-gray-700">{r.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{r.category}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Новые ({recPreview?.updated.length ?? 0})</p>
                {(recPreview?.updated ?? []).map((r, i) => (
                  <div key={i} className="p-2 rounded-lg bg-purple-50 border border-purple-100">
                    <p className="text-xs font-medium text-gray-800">{r.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{r.category}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="px-6 py-4 border-t flex-shrink-0 flex justify-between">
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setRecPreview(null); setRecDescription(""); }}>
              <XCircle className="w-4 h-4" />
              Отменить
            </Button>
            <Button
              onClick={() => recPreview && replaceRecsMutation.mutate({ processId, newRecs: recPreview.updated })}
              disabled={replaceRecsMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {replaceRecsMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Сохранение...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" />Сохранить изменения</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
  // Sort categories: those with errors first, then warnings, then all-passed
  const categories = [...new Set(result.items.map(i => i.category))].sort((a, b) => {
    const aItems = result.items.filter(i => i.category === a);
    const bItems = result.items.filter(i => i.category === b);
    const severity = (items: typeof result.items) => {
      if (items.some(i => !i.passed && i.severity === "error")) return 0;
      if (items.some(i => !i.passed && i.severity === "warning")) return 1;
      return 2;
    };
    return severity(aItems) - severity(bItems);
  });
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
        const catErrors = catItems.filter(i => !i.passed && i.severity === "error").length;
        const catWarnings = catItems.filter(i => !i.passed && i.severity === "warning").length;
        const allOk = catPassed === catItems.length;
        return (
          <Card key={category} className={cn(catErrors > 0 ? "border-red-200" : catWarnings > 0 ? "border-yellow-200" : "")}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className={cn("w-4 h-4", catErrors > 0 ? "text-red-500" : catWarnings > 0 ? "text-yellow-500" : "text-green-500")} />
                  {category}
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  {catErrors > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                      <XCircle className="w-3 h-3" />{catErrors}
                    </span>
                  )}
                  {catWarnings > 0 && (
                    <span className="flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">
                      <AlertCircle className="w-3 h-3" />{catWarnings}
                    </span>
                  )}
                  <Badge variant={allOk ? "default" : "secondary"}>
                    {catPassed}/{catItems.length}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 py-3 px-3 rounded-lg text-sm",
                      item.passed
                        ? "bg-green-50"
                        : item.severity === "error"
                          ? "bg-red-50 border border-red-200"
                          : item.severity === "warning"
                            ? "bg-yellow-50 border border-yellow-200"
                            : "bg-gray-50"
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
                        <AlertCircle className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium",
                        item.passed
                          ? "text-green-800"
                          : item.severity === "error"
                            ? "text-red-800"
                            : item.severity === "warning"
                              ? "text-yellow-900"
                              : "text-gray-800"
                      )}>
                        {item.rule}
                      </p>
                      <p className={cn(
                        "text-xs mt-1 leading-relaxed",
                        item.passed ? "text-green-700" : item.severity === "error" ? "text-red-700" : item.severity === "warning" ? "text-yellow-800" : "text-gray-500"
                      )}>
                        {item.details}
                      </p>
                      {!item.passed && item.howToFix && (
                        <div className={cn(
                          "mt-2 pt-2 border-t text-xs leading-relaxed",
                          item.severity === "error" ? "border-red-200 text-red-900" : "border-yellow-200 text-yellow-900"
                        )}>
                          <span className="font-semibold">Как исправить: </span>
                          {item.howToFix}
                        </div>
                      )}
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

// ============================================
// Tab: Regulations
// ============================================

function parseBoldRuns(text: string): TextRun[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? new TextRun({ text: part.slice(2, -2), bold: true })
        : new TextRun({ text: part })
    );
}

async function createDocxBlob(markdown: string, title: string): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: "" }),
  ];
  for (const line of markdown.split("\n")) {
    if (!line.trim()) {
      children.push(new Paragraph({ text: "" }));
    } else if (line.startsWith("#### ")) {
      children.push(new Paragraph({ text: line.slice(5), heading: HeadingLevel.HEADING_4 }));
    } else if (line.startsWith("### ")) {
      children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith("## ")) {
      children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith("# ")) {
      children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
    } else if (/^(\s*)- \[[ x]\] /.test(line)) {
      // Checklist item: render as indented bullet with checkbox symbol
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const checked = /- \[x\]/i.test(line);
      const text = line.replace(/^\s*- \[[ x]\] /i, "");
      children.push(new Paragraph({
        bullet: { level: Math.min(Math.floor(indent / 2), 2) },
        children: [
          new TextRun({ text: (checked ? "☑ " : "☐ ") + text }),
        ],
      }));
    } else if (/^(\s*)[-*] /.test(line)) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const text = line.replace(/^\s*[-*] /, "");
      children.push(new Paragraph({
        bullet: { level: Math.min(Math.floor(indent / 2), 2) },
        children: parseBoldRuns(text),
      }));
    } else {
      children.push(new Paragraph({ children: parseBoldRuns(line) }));
    }
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================
// Block Files Section
// ============================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function BlockFilesSection({ processId, blockId }: { processId: number; blockId: string }) {
  const [files, setFiles] = useState<BlockFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authHeader = () => {
    const token = localStorage.getItem("auth_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/blocks/files?processId=${processId}&blockId=${encodeURIComponent(blockId)}`, {
        headers: authHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [processId, blockId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("processId", String(processId));
      form.append("blockId", blockId);
      const res = await fetch("/api/blocks/upload", {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      if (res.ok) {
        toast({ title: "Файл загружен", description: `${file.name} — списано ${TOKEN_COSTS.file_upload} токенов` });
        await loadFiles();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Ошибка загрузки", description: err.error ?? "Неизвестная ошибка", variant: "destructive" });
      }
    } finally {
      setUploading(false);
    }
  }, [processId, blockId, loadFiles]);

  const handleDelete = useCallback(async (fileId: number, fileName: string) => {
    if (!confirm(`Удалить файл «${fileName}»?`)) return;
    const res = await fetch(`/api/files/${fileId}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    if (res.ok) {
      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast({ title: "Файл удалён" });
    } else {
      toast({ title: "Ошибка удаления", variant: "destructive" });
    }
  }, []);

  const handleDownload = useCallback((fileId: number) => {
    const token = localStorage.getItem("auth_token");
    const a = document.createElement("a");
    a.href = `/api/files/${fileId}${token ? `?token=${token}` : ""}`;
    // Use fetch + blob to pass auth header
    fetch(`/api/files/${fileId}`, { headers: authHeader() })
      .then(r => r.ok ? r.blob() : Promise.reject(r))
      .then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
      });
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />
          Прикреплённые файлы
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          Загрузить ({TOKEN_COSTS.file_upload} токенов)
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
      </div>

      {loading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">Нет прикреплённых файлов</p>
      ) : (
        <div className="space-y-1">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5">
              <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-xs text-gray-700 truncate flex-1" title={f.originalName}>{f.originalName}</span>
              <span className="text-xs text-gray-400 shrink-0">{formatBytes(f.fileSize)}</span>
              <button
                type="button"
                onClick={() => handleDownload(f.id)}
                className="text-gray-400 hover:text-blue-600 shrink-0"
                title="Скачать"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(f.id, f.originalName)}
                className="text-gray-400 hover:text-red-500 shrink-0"
                title="Удалить"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type DocType = "regulation" | "job_instruction";

// Pseudo-progress: smoothly advances to 90% while waiting for AI, then jumps to 100%.
function useGenerationProgress(active: boolean) {
  const [pct, setPct] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (active) {
      setPct(0);
      timerRef.current = setInterval(() => {
        setPct((p) => {
          if (p >= 90) { clearInterval(timerRef.current!); return 90; }
          // Accelerate early, decelerate near 90
          const step = p < 30 ? 3 : p < 60 ? 2 : 0.8;
          return Math.min(90, p + step);
        });
      }, 400);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setPct(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active]);
  return active ? pct : 0;
}

function RegulationsTab({
  data,
  processId,
  companyName,
}: {
  data?: ProcessData;
  processId: number;
  companyName: string;
}) {
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [genProgress, setGenProgress] = useState<Record<string, number>>({});
  const [allGenProgress, setAllGenProgress] = useState<{ done: number; total: number } | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});
  const generateMutation = trpc.process.generateDocument.useMutation();
  const genTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const anyGenerating = Object.values(generating).some(Boolean) || generatingAll;

  // Warn before unload during generation
  useEffect(() => {
    if (!anyGenerating) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Идёт генерация документов. Покинуть страницу?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyGenerating]);

  const startProgressTimer = useCallback((key: string) => {
    if (genTimers.current[key]) clearInterval(genTimers.current[key]);
    setGenProgress((p) => ({ ...p, [key]: 0 }));
    genTimers.current[key] = setInterval(() => {
      setGenProgress((p) => {
        const cur = p[key] ?? 0;
        if (cur >= 90) { clearInterval(genTimers.current[key]); return p; }
        const step = cur < 30 ? 3 : cur < 60 ? 2 : 0.8;
        return { ...p, [key]: Math.min(90, cur + step) };
      });
    }, 400);
  }, []);

  const stopProgressTimer = useCallback((key: string, done: boolean) => {
    clearInterval(genTimers.current[key]);
    delete genTimers.current[key];
    setGenProgress((p) => ({ ...p, [key]: done ? 100 : 0 }));
    if (done) setTimeout(() => setGenProgress((p) => { const n = { ...p }; delete n[key]; return n; }), 800);
  }, []);

  const handleGenerate = useCallback(
    async (roleName: string, docType: DocType) => {
      const key = `${roleName}:${docType}`;
      setGenerating((prev) => ({ ...prev, [key]: true }));
      startProgressTimer(key);
      try {
        const result = await generateMutation.mutateAsync({ processId, roleName, docType });
        setDocuments((prev) => ({ ...prev, [key]: result.text }));
        setExpandedDocs((prev) => ({ ...prev, [key]: true }));
        stopProgressTimer(key, true);
      } catch {
        stopProgressTimer(key, false);
      } finally {
        setGenerating((prev) => ({ ...prev, [key]: false }));
      }
    },
    [processId, generateMutation, startProgressTimer, stopProgressTimer]
  );

  const roles = data?.roles ?? [];

  const handleGenerateAll = useCallback(async () => {
    setGeneratingAll(true);
    const pairs = roles.flatMap((r) =>
      (["regulation", "job_instruction"] as DocType[]).map((dt) => ({ role: r, dt }))
    );
    setAllGenProgress({ done: 0, total: pairs.length });
    try {
      for (let i = 0; i < pairs.length; i++) {
        const { role, dt } = pairs[i];
        const key = `${role.name}:${dt}`;
        setGenerating((prev) => ({ ...prev, [key]: true }));
        startProgressTimer(key);
        try {
          const result = await generateMutation.mutateAsync({ processId, roleName: role.name, docType: dt });
          setDocuments((prev) => ({ ...prev, [key]: result.text }));
          stopProgressTimer(key, true);
        } catch {
          stopProgressTimer(key, false);
        } finally {
          setGenerating((prev) => ({ ...prev, [key]: false }));
          setAllGenProgress({ done: i + 1, total: pairs.length });
        }
      }
    } finally {
      setGeneratingAll(false);
      setTimeout(() => setAllGenProgress(null), 1500);
    }
  }, [roles, processId, generateMutation, startProgressTimer, stopProgressTimer]);

  const handleDownload = useCallback(
    async (roleName: string, docType: DocType) => {
      const text = documents[`${roleName}:${docType}`];
      if (!text) return;
      const label = docType === "regulation" ? "Регламент" : "Должностная инструкция";
      const blob = await createDocxBlob(text, `${label} ${roleName} — ${companyName}`);
      triggerDownload(blob, `${label} ${roleName} ${companyName}.docx`);
    },
    [documents, companyName]
  );

  const handleDownloadAll = useCallback(async () => {
    const entries = Object.entries(documents);
    if (!entries.length) return;
    const zip = new JSZip();
    for (const [key, text] of entries) {
      const colonIdx = key.indexOf(":");
      const roleName = key.slice(0, colonIdx);
      const docType = key.slice(colonIdx + 1) as DocType;
      const label = docType === "regulation" ? "Регламент" : "Должностная инструкция";
      const blob = await createDocxBlob(text, `${label} ${roleName} — ${companyName}`);
      zip.file(`${label} ${roleName} ${companyName}.docx`, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    triggerDownload(content, `Документы ${companyName}.zip`);
  }, [documents, companyName]);

  const generatedCount = Object.keys(documents).length;
  const totalDocs = roles.length * 2;

  if (!roles.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BookOpen className="w-12 h-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Нет должностей</h3>
        <p className="text-gray-500">В процессе не определены роли</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Generation warning banner */}
      {anyGenerating && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Loader2 className="w-4 h-4 text-amber-600 animate-spin mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800">Идёт генерация документов</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Это может занять несколько минут. Пожалуйста, не покидайте страницу до завершения.
            </p>
            {allGenProgress && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-amber-700">
                    {allGenProgress.done} из {allGenProgress.total} документов
                  </span>
                  <span className="text-xs font-semibold text-amber-800">
                    {Math.round((allGenProgress.done / allGenProgress.total) * 100)}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-amber-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${(allGenProgress.done / allGenProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                Регламенты и должностные инструкции
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {roles.length} должност{roles.length === 1 ? "ь" : roles.length < 5 ? "и" : "ей"} · {TOKEN_COSTS.document} токенов за документ · {roles.length * 2 * TOKEN_COSTS.document} токенов за все
              </p>
              {generatedCount > 0 && (
                <p className="text-xs text-green-700 mt-1">
                  Сгенерировано: {generatedCount} из {totalDocs} документов
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateAll}
                disabled={anyGenerating}
                className="gap-1.5"
              >
                {generatingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {generatingAll ? "Генерация..." : "Сгенерировать все"}
              </Button>
              {generatedCount > 0 && (
                <Button size="sm" variant="outline" onClick={handleDownloadAll} className="gap-1.5">
                  <Archive className="w-3.5 h-3.5" />
                  Скачать архивом ({generatedCount})
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role cards */}
      {roles.map((role) => {
        const regKey = `${role.name}:regulation`;
        const jiKey = `${role.name}:job_instruction`;
        const hasReg = !!documents[regKey];
        const hasJI = !!documents[jiKey];
        const roleBlocks = data?.blocks.filter(b => b.role === role.id || b.role === role.name) ?? [];

        return (
          <Card key={role.id} className={cn("overflow-hidden", (hasReg || hasJI) && "border-blue-100")}>
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: role.color }} />
                  <div>
                    <div className="font-semibold text-gray-900">{role.name}</div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {role.department && (
                        <span className="text-xs text-gray-500">{role.department}</span>
                      )}
                      <span className="text-xs text-gray-400">{roleBlocks.length} шагов в процессе</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap shrink-0">
                  <Button
                    size="sm"
                    variant={hasReg ? "outline" : "default"}
                    onClick={() => handleGenerate(role.name, "regulation")}
                    disabled={anyGenerating}
                    className="gap-1.5 relative overflow-hidden"
                  >
                    {generating[regKey] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BookOpen className="w-3.5 h-3.5" />
                    )}
                    {generating[regKey]
                      ? `Генерация... ${Math.round(genProgress[regKey] ?? 0)}%`
                      : hasReg ? "Обновить регламент" : "Регламент"}
                  </Button>
                  <Button
                    size="sm"
                    variant={hasJI ? "outline" : "default"}
                    onClick={() => handleGenerate(role.name, "job_instruction")}
                    disabled={anyGenerating}
                    className="gap-1.5 relative overflow-hidden"
                  >
                    {generating[jiKey] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ScrollText className="w-3.5 h-3.5" />
                    )}
                    {generating[jiKey]
                      ? `Генерация... ${Math.round(genProgress[jiKey] ?? 0)}%`
                      : hasJI ? "Обновить инструкцию" : "Должностная инструкция"}
                  </Button>
                </div>
              </div>

              {/* Per-doc progress bars */}
              {(generating[regKey] || generating[jiKey]) && (
                <div className="mx-4 mb-3 space-y-1.5">
                  {(["regulation", "job_instruction"] as DocType[]).map((dt) => {
                    const key = `${role.name}:${dt}`;
                    if (!generating[key]) return null;
                    const pct = Math.round(genProgress[key] ?? 0);
                    const label = dt === "regulation" ? "Регламент" : "Должностная инструкция";
                    return (
                      <div key={dt}>
                        <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                          <span>{label}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-gray-400 mt-1">
                    Это может занять несколько минут — не покидайте страницу
                  </p>
                </div>
              )}
            </CardHeader>

            {(hasReg || hasJI) && (
              <CardContent className="px-4 pb-4 pt-0 space-y-4 border-t border-gray-100">
                {(["regulation", "job_instruction"] as DocType[]).map((dt) => {
                  const key = `${role.name}:${dt}`;
                  const text = documents[key];
                  if (!text) return null;
                  const label = dt === "regulation" ? "Регламент" : "Должностная инструкция";
                  const isExpanded = expandedDocs[key] ?? true;
                  return (
                    <div key={dt} className="pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-gray-900"
                          onClick={() => setExpandedDocs(p => ({ ...p, [key]: !isExpanded }))}
                        >
                          {dt === "regulation"
                            ? <BookOpen className="w-4 h-4 text-blue-600" />
                            : <ScrollText className="w-4 h-4 text-purple-600" />
                          }
                          {label}
                          <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownload(role.name, dt)}
                          className="text-blue-600 hover:text-blue-700 gap-1.5 h-7 text-xs"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Скачать .docx
                        </Button>
                      </div>
                      {isExpanded && (
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 max-h-96 overflow-y-auto">
                          <MarkdownContent text={text} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
