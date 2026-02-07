import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from "react";
import type { ProcessData, ProcessBlock, BlockType } from "@shared/types";
import { BLOCK_CONFIG, SWIMLANE_COLORS } from "@shared/types";

// ============================================================
// Constants
// ============================================================
const STAGE_HEADER_WIDTH = 120;
const ROLE_HEADER_HEIGHT = 56;
const BLOCK_PADDING = 36;
const MIN_STAGE_HEIGHT = 220;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_SENSITIVITY = 0.006; // Increased for better touchpad pinch-to-zoom
const CLICK_THRESHOLD = 5;
const FONT_FAMILY = "'Inter', system-ui, -apple-system, sans-serif";

// ============================================================
// Internal Types
// ============================================================
interface LayoutBlock {
  block: ProcessBlock;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LayoutInfo {
  blocks: LayoutBlock[];
  totalWidth: number;
  totalHeight: number;
  lanePositions: number[];
  stagePositions: number[];
  stageHeights: number[];
  roleOrder: string[];
  stageOrder: string[];
  laneWidth: number;
  blockWidth: number;
}

interface Point {
  x: number;
  y: number;
}

export interface SwimlaneCanvasHandle {
  fitToScreen: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  getScale: () => number;
  toggleFullscreen: () => void;
}

export interface SwimlaneCanvasProps {
  data: ProcessData;
  onBlockClick?: (blockId: string) => void;
  selectedBlockId?: string | null;
  className?: string;
  /** If true, hide internal zoom overlay (parent provides its own toolbar) */
  externalToolbar?: boolean;
  /** Called when scale changes so parent can display zoom % */
  onScaleChange?: (scale: number) => void;
  /** If true, auto fit-to-viewport on first render */
  autoFit?: boolean;
}

// ============================================================
// Helper: Block Heights
// ============================================================
function getBlockHeight(type: BlockType): number {
  switch (type) {
    case "start":
      return 80;
    case "end":
      return 80;
    case "split":
      return 80;
    case "product":
      return 100;
    case "decision":
      return 120;
    case "action":
      return 160;
    default:
      return 100;
  }
}

// ============================================================
// Helper: Text Utilities
// ============================================================
function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + "\u2026").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "\u2026";
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        if (lines.length > 0) {
          lines[lines.length - 1] = truncateText(
            ctx,
            lines[lines.length - 1],
            maxWidth,
          );
        }
        return lines;
      }
    } else {
      current = test;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (ctx.measureText(last).width > maxWidth) {
      lines[lines.length - 1] = truncateText(ctx, last, maxWidth);
    }
  }

  return lines;
}

// ============================================================
// Helper: Color Utilities
// ============================================================
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================
// Layout Computation
// ============================================================
function computeLayout(data: ProcessData): LayoutInfo {
  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order);
  const roleOrder = data.roles.map((r) => r.id);
  const stageOrder = sortedStages.map((s) => s.id);

  // Dynamic lane/block width based on role count
  const roleCount = roleOrder.length;
  const LANE_WIDTH = Math.max(180, Math.min(350, 2400 / Math.max(roleCount, 1)));
  const BLOCK_WIDTH = LANE_WIDTH - 60;

  const roleIndexMap: Record<string, number> = {};
  roleOrder.forEach((id, i) => {
    roleIndexMap[id] = i;
  });

  const stageIndexMap: Record<string, number> = {};
  stageOrder.forEach((id, i) => {
    stageIndexMap[id] = i;
  });

  // Group blocks by (stage, role) cell
  const cellBlocks: Record<string, ProcessBlock[]> = {};
  for (const block of data.blocks) {
    const ri = roleIndexMap[block.role];
    const si = stageIndexMap[block.stage];
    if (ri === undefined || si === undefined) continue;
    const key = `${block.stage}__${block.role}`;
    if (!cellBlocks[key]) cellBlocks[key] = [];
    cellBlocks[key].push(block);
  }

  // Calculate stage heights based on tallest cell in each stage row
  const stageHeights: number[] = stageOrder.map((stageId) => {
    let maxCellH = 0;
    for (const roleId of roleOrder) {
      const key = `${stageId}__${roleId}`;
      const blocks = cellBlocks[key] || [];
      let h = BLOCK_PADDING;
      for (const b of blocks) {
        h += getBlockHeight(b.type) + BLOCK_PADDING;
      }
      maxCellH = Math.max(maxCellH, h);
    }
    return Math.max(MIN_STAGE_HEIGHT, maxCellH);
  });

  // Cumulative stage Y positions
  const stagePositions: number[] = [];
  let cumY = ROLE_HEADER_HEIGHT;
  for (const h of stageHeights) {
    stagePositions.push(cumY);
    cumY += h;
  }

  // Lane X positions
  const lanePositions: number[] = roleOrder.map(
    (_, i) => STAGE_HEADER_WIDTH + i * LANE_WIDTH,
  );

  // Position blocks within their cells
  const layoutBlocks: LayoutBlock[] = [];
  for (let si = 0; si < stageOrder.length; si++) {
    const stageId = stageOrder[si];
    for (let ri = 0; ri < roleOrder.length; ri++) {
      const roleId = roleOrder[ri];
      const key = `${stageId}__${roleId}`;
      const blocks = cellBlocks[key] || [];
      if (blocks.length === 0) continue;

      // Calculate total height for vertical centering
      let totalH = 0;
      for (const b of blocks) totalH += getBlockHeight(b.type);
      totalH += (blocks.length - 1) * BLOCK_PADDING;

      const cellTop = stagePositions[si];
      const cellHeight = stageHeights[si];
      let yStart = cellTop + (cellHeight - totalH) / 2;

      for (const block of blocks) {
        const bh = getBlockHeight(block.type);
        const bx = lanePositions[ri] + (LANE_WIDTH - BLOCK_WIDTH) / 2;
        layoutBlocks.push({ block, x: bx, y: yStart, w: BLOCK_WIDTH, h: bh });
        yStart += bh + BLOCK_PADDING;
      }
    }
  }

  return {
    blocks: layoutBlocks,
    totalWidth: STAGE_HEADER_WIDTH + roleOrder.length * LANE_WIDTH,
    totalHeight: cumY,
    lanePositions,
    stagePositions,
    stageHeights,
    roleOrder,
    stageOrder,
    laneWidth: LANE_WIDTH,
    blockWidth: BLOCK_WIDTH,
  };
}

// ============================================================
// Connection Routing (orthogonal paths)
// ============================================================
function routeConnection(
  source: LayoutBlock,
  target: LayoutBlock,
  connIndex: number,
  totalConns: number,
  blockMap: Record<string, LayoutBlock>,
): Point[] {
  const tx = target.x + target.w / 2;
  const ty = target.y;

  // Special handling for decision blocks (diamonds) — exit from LEFT, RIGHT, or BOTTOM corners
  if (source.block.type === "decision") {
    const cy = source.y + source.h / 2; // Y of left/right corner points
    const gap = 35;

    // 1st connection -> LEFT, 2nd -> RIGHT, 3rd+ -> BOTTOM
    if (connIndex === 0) {
      // Exit from LEFT corner
      const sx = source.x;
      const routeX = Math.min(source.x - gap, tx);
      return [
        { x: sx, y: cy },
        { x: routeX, y: cy },
        { x: routeX, y: ty - gap },
        { x: tx, y: ty - gap },
        { x: tx, y: ty },
      ];
    } else if (connIndex === 1) {
      // Exit from RIGHT corner
      const sx = source.x + source.w;
      const routeX = Math.max(source.x + source.w + gap, tx);
      return [
        { x: sx, y: cy },
        { x: routeX, y: cy },
        { x: routeX, y: ty - gap },
        { x: tx, y: ty - gap },
        { x: tx, y: ty },
      ];
    } else {
      // 3rd+ connections: exit from BOTTOM corner
      const sx = source.x + source.w / 2;
      const sy = source.y + source.h;
      if (Math.abs(sx - tx) < 8) {
        return [
          { x: sx, y: sy },
          { x: tx, y: ty },
        ];
      }
      const midY = (sy + ty) / 2;
      return [
        { x: sx, y: sy },
        { x: sx, y: midY },
        { x: tx, y: midY },
        { x: tx, y: ty },
      ];
    }
  }

  // Standard routing for non-decision blocks
  // Spread multiple exit points horizontally
  const spread = Math.min(totalConns - 1, 4) * 14;
  const exitOffset =
    totalConns > 1
      ? -spread / 2 +
        connIndex * (spread / Math.max(totalConns - 1, 1))
      : 0;

  const sx = source.x + source.w / 2 + exitOffset;
  const sy = source.y + source.h;

  // Normal downward flow
  if (ty > sy + 5) {
    // Same column - straight vertical line
    if (Math.abs(sx - tx) < 8) {
      return [
        { x: sx, y: sy },
        { x: tx, y: ty },
      ];
    }
    // Z-route through midpoint
    const midY = (sy + ty) / 2;
    return [
      { x: sx, y: sy },
      { x: sx, y: midY },
      { x: tx, y: midY },
      { x: tx, y: ty },
    ];
  }

  // Backward or same-level flow - route around the side
  const gap = 35;
  const isRight = tx > sx;
  const sideX = isRight
    ? Math.max(source.x + source.w, target.x + target.w) + gap
    : Math.min(source.x, target.x) - gap;

  return [
    { x: sx, y: sy },
    { x: sx, y: sy + gap },
    { x: sideX, y: sy + gap },
    { x: sideX, y: ty - gap },
    { x: tx, y: ty - gap },
    { x: tx, y: ty },
  ];
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  toX: number,
  toY: number,
  fromX: number,
  fromY: number,
  size: number = 10,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - size * Math.cos(angle - Math.PI / 6),
    toY - size * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    toX - size * Math.cos(angle + Math.PI / 6),
    toY - size * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

// ============================================================
// Shape Drawing Functions
// ============================================================
function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  border: string,
  fill: string,
  lw: number,
) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  border: string,
  fill: string,
  lw: number,
) {
  const indent = 28;
  ctx.beginPath();
  ctx.moveTo(x + indent, y);
  ctx.lineTo(x + w - indent, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - indent, y + h);
  ctx.lineTo(x + indent, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  border: string,
  fill: string,
  lw: number,
  radius: number = 12,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  border: string,
  fill: string,
  lw: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawInvertedTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  border: string,
  fill: string,
  lw: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + 10, y);
  ctx.lineTo(x + w - 10, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawDoubleRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  border: string,
  fill: string,
  lw: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = lw;
  ctx.stroke();
  // Inner border
  const ins = 5;
  ctx.beginPath();
  ctx.roundRect(x + ins, y + ins, w - ins * 2, h - ins * 2, 5);
  ctx.strokeStyle = border;
  ctx.lineWidth = lw * 0.7;
  ctx.stroke();
}

// ============================================================
// Block Fill Colors
// ============================================================
function getBlockFill(type: BlockType): string {
  switch (type) {
    case "start":
      return "#f0fdf4";
    case "action":
      return "#ffffff";
    case "product":
      return "#f9fafb";
    case "decision":
      return "#eff6ff";
    case "split":
      return "#eff6ff";
    case "end":
      return "#fef2f2";
    default:
      return "#ffffff";
  }
}

// ============================================================
// Draw Single Block (shape + content)
// ============================================================
function drawBlockShape(
  ctx: CanvasRenderingContext2D,
  lb: LayoutBlock,
  isHighlighted: boolean,
  isSelected: boolean,
  isConnectedHighlight: boolean = false,
) {
  const { block, x, y, w, h } = lb;
  const config = BLOCK_CONFIG[block.type];
  const fill = getBlockFill(block.type);
  const border = config.borderColor;
  const lw = isHighlighted || isSelected ? 3 : isConnectedHighlight ? 2.5 : 2;

  // Shadow
  ctx.save();
  if (isHighlighted || isSelected) {
    ctx.shadowColor = hexToRgba(border, 0.35);
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
  } else if (isConnectedHighlight) {
    ctx.shadowColor = "rgba(99, 102, 241, 0.25)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;
  } else {
    ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;
  }

  switch (config.shape) {
    case "pill":
      drawPill(ctx, x, y, w, h, border, fill, lw);
      break;
    case "hexagon":
      drawHexagon(ctx, x, y, w, h, border, fill, lw);
      break;
    case "rounded-rect":
      drawRoundedRect(ctx, x, y, w, h, border, fill, lw);
      break;
    case "diamond":
      drawDiamond(ctx, x, y, w, h, border, fill, lw);
      break;
    case "triangle":
      drawInvertedTriangle(ctx, x, y, w, h, border, fill, lw);
      break;
    case "double-rect":
      drawDoubleRect(ctx, x, y, w, h, border, fill, lw);
      break;
  }

  ctx.restore();

  // Connected highlight: light tinted overlay
  if (isConnectedHighlight) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#6366f1";
    switch (config.shape) {
      case "pill":
        drawPill(ctx, x, y, w, h, "transparent", "#6366f1", 0);
        break;
      case "hexagon":
        drawHexagon(ctx, x, y, w, h, "transparent", "#6366f1", 0);
        break;
      case "rounded-rect":
        drawRoundedRect(ctx, x, y, w, h, "transparent", "#6366f1", 0);
        break;
      case "diamond":
        drawDiamond(ctx, x, y, w, h, "transparent", "#6366f1", 0);
        break;
      case "triangle":
        drawInvertedTriangle(ctx, x, y, w, h, "transparent", "#6366f1", 0);
        break;
      case "double-rect":
        drawDoubleRect(ctx, x, y, w, h, "transparent", "#6366f1", 0);
        break;
    }
    ctx.globalAlpha = 1;
    // Subtle colored border on top
    ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 14);
    ctx.stroke();
    ctx.restore();
  }

  // Selected indicator: dashed outline
  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.roundRect(x - 5, y - 5, w + 10, h + 10, 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function drawBlockContent(ctx: CanvasRenderingContext2D, lb: LayoutBlock) {
  const { block, x, y, w, h } = lb;
  const config = BLOCK_CONFIG[block.type];
  const cx = x + w / 2;

  // Calculate text area constraints based on shape
  let textMaxW: number;
  let textTop: number;

  switch (config.shape) {
    case "diamond":
      textMaxW = w * 0.45;
      textTop = y + h * 0.18;
      break;
    case "hexagon":
      textMaxW = w - 72;
      textTop = y + 12;
      break;
    case "triangle":
      textMaxW = w * 0.55;
      textTop = y + 8;
      break;
    default:
      textMaxW = w - 32;
      textTop = y + 12;
      break;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Type label (small uppercase)
  ctx.fillStyle = "#9ca3af";
  ctx.font = `600 10px ${FONT_FAMILY}`;
  ctx.fillText(config.label.toUpperCase(), cx, textTop);
  let curY = textTop + 15;

  // Decision block: large "?" icon then name
  if (block.type === "decision") {
    ctx.fillStyle = "#3b82f6";
    ctx.font = `bold 22px ${FONT_FAMILY}`;
    ctx.fillText("?", cx, curY);
    curY += 26;

    ctx.font = `bold 12px ${FONT_FAMILY}`;
    ctx.fillStyle = "#1e3a5f";
    const nameLines = wrapText(ctx, block.name, textMaxW, 2);
    for (const line of nameLines) {
      ctx.fillText(line, cx, curY);
      curY += 15;
    }
    return;
  }

  // Block name
  ctx.fillStyle = "#111827";
  ctx.font = `bold 13px ${FONT_FAMILY}`;
  const nameLines = wrapText(ctx, block.name, textMaxW, 2);
  for (const line of nameLines) {
    ctx.fillText(line, cx, curY);
    curY += 17;
  }

  // Description (for action and product blocks)
  if (
    (block.type === "action" || block.type === "product") &&
    block.description
  ) {
    curY += 3;
    ctx.fillStyle = "#6b7280";
    ctx.font = `12px ${FONT_FAMILY}`;
    const descLines = wrapText(ctx, block.description, textMaxW, 2);
    for (const line of descLines) {
      ctx.fillText(line, cx, curY);
      curY += 15;
    }
  }

  // Badges for action blocks (time, documents, systems)
  if (block.type === "action") {
    curY += 8;
    const badges: string[] = [];
    if (block.timeEstimate) badges.push("\u23F1 " + block.timeEstimate);
    const docCount =
      (block.inputDocuments?.length || 0) +
      (block.outputDocuments?.length || 0);
    if (docCount > 0) badges.push("\uD83D\uDCC4 " + docCount);
    if (block.infoSystems?.length)
      badges.push("\uD83D\uDDA5 " + block.infoSystems.length);

    if (badges.length > 0) {
      ctx.font = `11px ${FONT_FAMILY}`;
      const badgeGap = 8;
      const padH = 8;
      const badgeH = 22;
      const badgeWidths = badges.map(
        (b) => ctx.measureText(b).width + padH * 2,
      );
      const totalBW =
        badgeWidths.reduce((a, b) => a + b, 0) +
        (badges.length - 1) * badgeGap;
      let bx = cx - totalBW / 2;

      for (let i = 0; i < badges.length; i++) {
        const bw = badgeWidths[i];
        // Badge background
        ctx.fillStyle = "#f3f4f6";
        ctx.beginPath();
        ctx.roundRect(bx, curY, bw, badgeH, 6);
        ctx.fill();
        ctx.strokeStyle = "#e5e7eb";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Badge text
        ctx.fillStyle = "#4b5563";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badges[i], bx + bw / 2, curY + badgeH / 2);
        bx += bw + badgeGap;
      }
      // Reset alignment
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
    }
  }
}

// ============================================================
// Connection Highlight Helper
// ============================================================
function isConnectedTo(
  blockId: string,
  otherId: string,
  allBlocks: ProcessBlock[],
): boolean {
  for (const b of allBlocks) {
    if (b.id === otherId && b.connections.includes(blockId)) return true;
    if (b.id === blockId && b.connections.includes(otherId)) return true;
  }
  return false;
}

// ============================================================
// Draw All Connections
// ============================================================
function drawAllConnections(
  ctx: CanvasRenderingContext2D,
  allBlocks: ProcessBlock[],
  blockMap: Record<string, LayoutBlock>,
  hoveredBlockId: string | null,
  selectedBlockId: string | null | undefined,
) {
  for (const block of allBlocks) {
    const source = blockMap[block.id];
    if (!source) continue;

    const totalConns = block.connections.length;
    for (let ci = 0; ci < block.connections.length; ci++) {
      const targetId = block.connections[ci];
      const target = blockMap[targetId];
      if (!target) continue;

      const isHL =
        block.id === hoveredBlockId ||
        block.id === selectedBlockId ||
        targetId === hoveredBlockId ||
        targetId === selectedBlockId;

      const points = routeConnection(source, target, ci, totalConns, blockMap);

      // Draw the polyline path
      ctx.strokeStyle = isHL ? "#3b82f6" : "#6b7280";
      ctx.lineWidth = isHL ? 2.5 : 2;
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();

      // Arrow head at end
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      ctx.fillStyle = isHL ? "#3b82f6" : "#6b7280";
      drawArrowHead(ctx, last.x, last.y, prev.x, prev.y, 10);

      // Condition label for decision/split branches
      const targetBlock = allBlocks.find((b) => b.id === targetId);

      // For decision blocks: auto-generate labels if conditionLabel is missing
      // 1st branch = "Да", 2nd = "Нет", 3rd+ = use conditionLabel or index
      const autoDecisionLabels = ["Да", "Нет"];
      const shouldShowLabel =
        (block.type === "decision") ||
        (block.type === "split" && targetBlock?.conditionLabel);

      if (shouldShowLabel) {
        const exitPt = points[0];
        const nextPt = points[1];

        // Determine label text: use conditionLabel if present, otherwise auto-generate
        let rawLabel: string;
        if (targetBlock?.conditionLabel) {
          rawLabel = targetBlock.conditionLabel;
        } else if (block.type === "decision" && ci < autoDecisionLabels.length) {
          rawLabel = autoDecisionLabels[ci];
        } else {
          rawLabel = `Ветвь ${ci + 1}`;
        }

        let labelPt: Point;
        if (block.type === "decision") {
          // 1st -> left, 2nd -> right, 3rd+ -> bottom
          if (ci === 0) {
            labelPt = { x: exitPt.x - 22, y: exitPt.y - 14 };
          } else if (ci === 1) {
            labelPt = { x: exitPt.x + 22, y: exitPt.y - 14 };
          } else {
            labelPt = {
              x: (exitPt.x + nextPt.x) / 2 + 20,
              y: (exitPt.y + nextPt.y) / 2,
            };
          }
        } else {
          // Split: place along first segment
          labelPt = {
            x: (exitPt.x + nextPt.x) / 2 + 20,
            y: (exitPt.y + nextPt.y) / 2,
          };
        }

        const labelText = "[" + rawLabel + "]";
        ctx.font = `italic 11px ${FONT_FAMILY}`;
        const MAX_LABEL_WIDTH = 150;
        const labelLineH = 14;
        const labelPadH = 6;
        const labelPadV = 4;

        // Wrap label text if it exceeds max width
        const labelLines = wrapText(ctx, labelText, MAX_LABEL_WIDTH, 3);
        const maxLineW = Math.max(...labelLines.map((l) => ctx.measureText(l).width));
        const tw = maxLineW + labelPadH * 2;
        const th = labelLines.length * labelLineH + labelPadV * 2;

        // Label background
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.roundRect(labelPt.x - tw / 2, labelPt.y - th / 2, tw, th, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label text (multi-line centered)
        ctx.fillStyle = "#3b82f6";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const labelTextStartY = labelPt.y - ((labelLines.length - 1) * labelLineH) / 2;
        for (let li = 0; li < labelLines.length; li++) {
          ctx.fillText(labelLines[li], labelPt.x, labelTextStartY + li * labelLineH);
        }
      }

      // Default branch slash mark
      if (
        targetBlock?.isDefault &&
        (block.type === "decision" || block.type === "split")
      ) {
        const midIdx = Math.min(1, points.length - 1);
        const mp = {
          x: (points[0].x + points[midIdx].x) / 2,
          y: (points[0].y + points[midIdx].y) / 2,
        };
        ctx.strokeStyle = isHL ? "#3b82f6" : "#6b7280";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(mp.x - 6, mp.y - 6);
        ctx.lineTo(mp.x + 6, mp.y + 6);
        ctx.stroke();
      }
    }
  }
}

// ============================================================
// Full Diagram Render
// ============================================================
function renderDiagram(
  ctx: CanvasRenderingContext2D,
  data: ProcessData,
  layout: LayoutInfo,
  hoveredBlockId: string | null,
  selectedBlockId: string | null | undefined,
) {
  const {
    blocks: layoutBlocks,
    totalWidth,
    totalHeight,
    lanePositions,
    stagePositions,
    stageHeights,
    roleOrder,
    stageOrder,
    laneWidth: LANE_WIDTH,
  } = layout;

  // ---- Background ----
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(-100, -100, totalWidth + 200, totalHeight + 200);

  // ---- Lane backgrounds ----
  for (let i = 0; i < roleOrder.length; i++) {
    const lx = lanePositions[i];
    ctx.fillStyle = SWIMLANE_COLORS[i % SWIMLANE_COLORS.length];
    ctx.globalAlpha = 0.4;
    ctx.fillRect(
      lx,
      ROLE_HEADER_HEIGHT,
      LANE_WIDTH,
      totalHeight - ROLE_HEADER_HEIGHT,
    );
    ctx.globalAlpha = 1;
  }

  // ---- Grid lines ----
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;

  // Vertical lane dividers
  for (let i = 0; i <= roleOrder.length; i++) {
    const lx = STAGE_HEADER_WIDTH + i * LANE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, totalHeight);
    ctx.stroke();
  }

  // Horizontal: top of role header
  ctx.beginPath();
  ctx.moveTo(0, ROLE_HEADER_HEIGHT);
  ctx.lineTo(totalWidth, ROLE_HEADER_HEIGHT);
  ctx.stroke();

  // Horizontal stage dividers
  for (let i = 0; i < stageOrder.length; i++) {
    const sy = stagePositions[i] + stageHeights[i];
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(totalWidth, sy);
    ctx.stroke();
  }

  // ---- Stage headers (left column) ----
  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order);
  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i];
    const sy = stagePositions[i];
    const sh = stageHeights[i];

    // Background
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, sy, STAGE_HEADER_WIDTH, sh);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, sy, STAGE_HEADER_WIDTH, sh);

    // Stage number badge
    ctx.fillStyle = "#94a3b8";
    ctx.font = `bold 11px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), STAGE_HEADER_WIDTH / 2, sy + 16);

    // Stage name (wrapped, centered vertically)
    ctx.fillStyle = "#374151";
    ctx.font = `bold 13px ${FONT_FAMILY}`;
    const stageLines = wrapText(ctx, stage.name, STAGE_HEADER_WIDTH - 24, 3);
    const lineH = 17;
    const textStartY =
      sy + sh / 2 - ((stageLines.length - 1) * lineH) / 2;
    for (let li = 0; li < stageLines.length; li++) {
      ctx.fillText(
        stageLines[li],
        STAGE_HEADER_WIDTH / 2,
        textStartY + li * lineH,
      );
    }
  }

  // ---- Role headers (top row) ----
  for (let i = 0; i < data.roles.length; i++) {
    const role = data.roles[i];
    const ri = roleOrder.indexOf(role.id);
    if (ri === -1) continue;
    const lx = lanePositions[ri];

    // Background
    ctx.fillStyle = role.color;
    ctx.fillRect(lx, 0, LANE_WIDTH, ROLE_HEADER_HEIGHT);

    // Gradient overlay for depth
    const grad = ctx.createLinearGradient(lx, 0, lx, ROLE_HEADER_HEIGHT);
    grad.addColorStop(0, "rgba(255,255,255,0.15)");
    grad.addColorStop(1, "rgba(0,0,0,0.1)");
    ctx.fillStyle = grad;
    ctx.fillRect(lx, 0, LANE_WIDTH, ROLE_HEADER_HEIGHT);

    // Border
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(lx, 0, LANE_WIDTH, ROLE_HEADER_HEIGHT);

    // Role name
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.5)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "#1f2937";
    ctx.font = `bold 14px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const nameY = role.department
      ? ROLE_HEADER_HEIGHT / 2 - 7
      : ROLE_HEADER_HEIGHT / 2;
    ctx.fillText(
      truncateText(ctx, role.name, LANE_WIDTH - 24),
      lx + LANE_WIDTH / 2,
      nameY,
    );
    ctx.restore();

    // Department subtitle
    if (role.department) {
      ctx.fillStyle = "#4b5563";
      ctx.font = `11px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        truncateText(ctx, role.department, LANE_WIDTH - 24),
        lx + LANE_WIDTH / 2,
        ROLE_HEADER_HEIGHT / 2 + 12,
      );
    }
  }

  // ---- Top-left corner cell ----
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, 0, STAGE_HEADER_WIDTH, ROLE_HEADER_HEIGHT);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, STAGE_HEADER_WIDTH, ROLE_HEADER_HEIGHT);
  ctx.fillStyle = "#64748b";
  ctx.font = `bold 11px ${FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "\u042D\u0442\u0430\u043F\u044B / \u0420\u043E\u043B\u0438",
    STAGE_HEADER_WIDTH / 2,
    ROLE_HEADER_HEIGHT / 2,
  );

  // ---- Build block lookup map ----
  const blockMap: Record<string, LayoutBlock> = {};
  for (const lb of layoutBlocks) {
    blockMap[lb.block.id] = lb;
  }

  // ---- Connections (drawn behind blocks) ----
  drawAllConnections(
    ctx,
    data.blocks,
    blockMap,
    hoveredBlockId,
    selectedBlockId,
  );

  // ---- Blocks ----
  // Determine the "active" block (hovered or selected) for connected highlighting
  const activeBlockId = hoveredBlockId || selectedBlockId || null;

  for (const lb of layoutBlocks) {
    const isHovered = lb.block.id === hoveredBlockId;
    const isSelected = lb.block.id === selectedBlockId;

    // Check if this block is connected to the active (hovered or selected) block
    const isConnHL = activeBlockId && lb.block.id !== activeBlockId
      ? isConnectedTo(lb.block.id, activeBlockId, data.blocks)
      : false;

    drawBlockShape(ctx, lb, isHovered, isSelected, !!isConnHL);
    drawBlockContent(ctx, lb);
  }
}

// ============================================================
// Hit Testing
// ============================================================
function hitTestBlocks(
  px: number,
  py: number,
  layout: LayoutInfo,
): string | null {
  // Check in reverse order so topmost block wins
  for (let i = layout.blocks.length - 1; i >= 0; i--) {
    const lb = layout.blocks[i];
    if (
      px >= lb.x &&
      px <= lb.x + lb.w &&
      py >= lb.y &&
      py <= lb.y + lb.h
    ) {
      return lb.block.id;
    }
  }
  return null;
}

// ============================================================
// Main Component
// ============================================================
export const SwimlaneCanvas = forwardRef<SwimlaneCanvasHandle, SwimlaneCanvasProps>(
  function SwimlaneCanvas(
    {
      data,
      onBlockClick,
      selectedBlockId,
      className,
      externalToolbar = false,
      onScaleChange,
      autoFit = false,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Use refs for scale/offset to avoid re-render on every zoom/pan frame
    const scaleRef = useRef(1);
    const offsetRef = useRef<Point>({ x: 0, y: 0 });
    const [, forceRender] = useState(0);
    const scheduleRender = useCallback(() => forceRender((n) => n + 1), []);

    // Dragging state — ref-based to avoid re-renders
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef<Point>({ x: 0, y: 0 });
    const mouseDownPosRef = useRef<Point>({ x: 0, y: 0 });
    const didDragRef = useRef(false);

    // Space-held state for space+drag panning
    const spaceHeldRef = useRef(false);

    // Hover state — ref with debounced render
    const hoveredBlockIdRef = useRef<string | null>(null);
    const hoverRafRef = useRef<number>(0);

    // Fullscreen state
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Track whether initial fit was done
    const initialFitDoneRef = useRef(false);

    // Dev diagnostics
    const renderCountRef = useRef(0);

    const layout = useMemo(() => {
      const t0 = performance.now();
      const result = computeLayout(data);
      if (import.meta.env.DEV) {
        console.debug(`[SwimlaneCanvas] computeLayout: ${(performance.now() - t0).toFixed(1)}ms`);
      }
      return result;
    }, [data]);

    // ---- setScale/setOffset helpers that update refs + trigger render ----
    const applyZoom = useCallback(
      (newScale: number, newOffset: Point) => {
        scaleRef.current = newScale;
        offsetRef.current = newOffset;
        onScaleChange?.(newScale);
        scheduleRender();
      },
      [onScaleChange, scheduleRender],
    );

    // ---- Canvas Render (uses refs, not state) ----
    const renderCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const t0 = import.meta.env.DEV ? performance.now() : 0;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Only resize canvas buffer when container size actually changed
      const needsResize =
        canvas.width !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr);
      if (needsResize) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const scale = scaleRef.current;
      const offset = offsetRef.current;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(
        dpr * scale,
        0,
        0,
        dpr * scale,
        dpr * offset.x,
        dpr * offset.y,
      );

      renderDiagram(
        ctx,
        data,
        layout,
        hoveredBlockIdRef.current,
        selectedBlockId,
      );

      if (import.meta.env.DEV) {
        renderCountRef.current++;
        if (renderCountRef.current % 50 === 0) {
          console.debug(
            `[SwimlaneCanvas] render #${renderCountRef.current}: ${(performance.now() - t0).toFixed(1)}ms`,
          );
        }
      }
    }, [data, layout, selectedBlockId]);

    // Re-render whenever dependencies change
    useEffect(() => {
      renderCanvas();
    }, [renderCanvas]);

    // Also re-render when forceRender triggers
    useEffect(() => {
      renderCanvas();
    });

    // ---- Resize Observer with debounce ----
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const obs = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          renderCanvas();
        }, 60);
      });
      obs.observe(container);
      return () => {
        obs.disconnect();
        if (resizeTimer) clearTimeout(resizeTimer);
      };
    }, [renderCanvas]);

    // ---- Fit to Screen ----
    const fitToScreen = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const sx = rect.width / layout.totalWidth;
      const sy = rect.height / layout.totalHeight;
      const s = Math.min(sx, sy) * 0.92;
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s));
      applyZoom(clamped, {
        x: (rect.width - layout.totalWidth * clamped) / 2,
        y: (rect.height - layout.totalHeight * clamped) / 2,
      });
    }, [layout, applyZoom]);

    // ---- Auto fit on first render ----
    useEffect(() => {
      if (!autoFit || initialFitDoneRef.current) return;
      if (!containerRef.current || data.blocks.length === 0) return;
      // Delay slightly to ensure container has its final size
      const timer = setTimeout(() => {
        fitToScreen();
        initialFitDoneRef.current = true;
      }, 50);
      return () => clearTimeout(timer);
    }, [autoFit, fitToScreen, data.blocks.length]);

    // Reset initial fit flag when data changes significantly
    useEffect(() => {
      initialFitDoneRef.current = false;
    }, [data.blocks.length, data.roles.length, data.stages.length]);

    // ---- Debounced resize re-fit ----
    useEffect(() => {
      let resizeFitTimer: ReturnType<typeof setTimeout> | null = null;
      const handleResize = () => {
        if (resizeFitTimer) clearTimeout(resizeFitTimer);
        resizeFitTimer = setTimeout(() => {
          // Only auto re-fit if autoFit is enabled and we've done initial fit
          if (autoFit && initialFitDoneRef.current) {
            fitToScreen();
          }
        }, 200);
      };
      window.addEventListener("resize", handleResize);
      window.addEventListener("orientationchange", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("orientationchange", handleResize);
        if (resizeFitTimer) clearTimeout(resizeFitTimer);
      };
    }, [autoFit, fitToScreen]);

    // ---- Screen to Canvas coordinate conversion ----
    const screenToCanvas = useCallback(
      (sx: number, sy: number): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
          x: (sx - rect.left - offsetRef.current.x) / scaleRef.current,
          y: (sy - rect.top - offsetRef.current.y) / scaleRef.current,
        };
      },
      [],
    );

    // ---- Mouse Down ----
    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
        dragStartRef.current = {
          x: e.clientX - offsetRef.current.x,
          y: e.clientY - offsetRef.current.y,
        };
        didDragRef.current = false;
        isDraggingRef.current = true;
      },
      [],
    );

    // ---- Mouse Move (pan + hover) ----
    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (isDraggingRef.current) {
          const dx = e.clientX - mouseDownPosRef.current.x;
          const dy = e.clientY - mouseDownPosRef.current.y;
          if (
            Math.abs(dx) > CLICK_THRESHOLD ||
            Math.abs(dy) > CLICK_THRESHOLD
          ) {
            didDragRef.current = true;
          }
          offsetRef.current = {
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y,
          };
          scheduleRender();
          return; // Skip hover during drag for performance
        }

        // Debounced hover hit-test via rAF
        const clientX = e.clientX;
        const clientY = e.clientY;
        if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = requestAnimationFrame(() => {
          const cp = screenToCanvas(clientX, clientY);
          const bid = hitTestBlocks(cp.x, cp.y, layout);
          if (bid !== hoveredBlockIdRef.current) {
            hoveredBlockIdRef.current = bid;
            scheduleRender();
          }
        });
      },
      [screenToCanvas, layout, scheduleRender],
    );

    // ---- Mouse Up (click detection) ----
    const handleMouseUp = useCallback(
      (e: React.MouseEvent) => {
        isDraggingRef.current = false;
        if (!didDragRef.current) {
          const cp = screenToCanvas(e.clientX, e.clientY);
          const bid = hitTestBlocks(cp.x, cp.y, layout);
          if (bid && onBlockClick) {
            onBlockClick(bid);
          }
        }
      },
      [screenToCanvas, layout, onBlockClick],
    );

    // ---- Mouse Leave ----
    const handleMouseLeave = useCallback(() => {
      isDraggingRef.current = false;
      if (hoveredBlockIdRef.current !== null) {
        hoveredBlockIdRef.current = null;
        scheduleRender();
      }
    }, [scheduleRender]);

    // ---- Wheel Zoom (native listener for passive: false) ----
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handler = (e: WheelEvent) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const delta = -e.deltaY * ZOOM_SENSITIVITY;
        const oldScale = scaleRef.current;
        const newScale = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, oldScale * (1 + delta)),
        );

        const ratio = newScale / oldScale;
        const newOx = mx - ratio * (mx - offsetRef.current.x);
        const newOy = my - ratio * (my - offsetRef.current.y);

        applyZoom(newScale, { x: newOx, y: newOy });
      };

      canvas.addEventListener("wheel", handler, { passive: false });
      return () => canvas.removeEventListener("wheel", handler);
    }, [applyZoom]);

    // ---- Zoom Control Callbacks ----
    const zoomIn = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const oldScale = scaleRef.current;
      const newScale = Math.min(MAX_ZOOM, oldScale * 1.25);
      const ratio = newScale / oldScale;
      const prev = offsetRef.current;
      applyZoom(newScale, {
        x: centerX - ratio * (centerX - prev.x),
        y: centerY - ratio * (centerY - prev.y),
      });
    }, [applyZoom]);

    const zoomOut = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const oldScale = scaleRef.current;
      const newScale = Math.max(MIN_ZOOM, oldScale / 1.25);
      const ratio = newScale / oldScale;
      const prev = offsetRef.current;
      applyZoom(newScale, {
        x: centerX - ratio * (centerX - prev.x),
        y: centerY - ratio * (centerY - prev.y),
      });
    }, [applyZoom]);

    const zoomReset = useCallback(() => {
      applyZoom(1, { x: 0, y: 0 });
    }, [applyZoom]);

    // ---- Fullscreen ----
    const toggleFullscreen = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      if (!document.fullscreenElement) {
        container.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }, []);

    useEffect(() => {
      const onFullscreenChange = () => {
        const isFull = !!document.fullscreenElement;
        setIsFullscreen(isFull);
        // Re-fit after fullscreen transition
        if (isFull) {
          setTimeout(() => fitToScreen(), 100);
        }
      };
      document.addEventListener("fullscreenchange", onFullscreenChange);
      return () =>
        document.removeEventListener("fullscreenchange", onFullscreenChange);
    }, [fitToScreen]);

    // ---- Keyboard Shortcuts ----
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        const isModifier = e.ctrlKey || e.metaKey;

        // Ctrl/Cmd + 0 = fit to viewport
        if (isModifier && (e.key === "0" || e.code === "Digit0")) {
          e.preventDefault();
          fitToScreen();
          return;
        }

        // Ctrl/Cmd + = / + = zoom in
        if (isModifier && (e.key === "=" || e.key === "+")) {
          e.preventDefault();
          zoomIn();
          return;
        }

        // Ctrl/Cmd + - = zoom out
        if (isModifier && e.key === "-") {
          e.preventDefault();
          zoomOut();
          return;
        }

        // Space key tracking for space+drag pan
        if (e.code === "Space" && !e.repeat) {
          // Don't capture space if typing in an input
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
          e.preventDefault();
          spaceHeldRef.current = true;
        }

        // Escape to exit fullscreen
        if (e.key === "Escape" && isFullscreen) {
          document.exitFullscreen?.().catch(() => {});
        }
      };

      const keyUpHandler = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          spaceHeldRef.current = false;
        }
      };

      window.addEventListener("keydown", handler);
      window.addEventListener("keyup", keyUpHandler);
      return () => {
        window.removeEventListener("keydown", handler);
        window.removeEventListener("keyup", keyUpHandler);
      };
    }, [fitToScreen, zoomIn, zoomOut, isFullscreen]);

    // ---- Imperative Handle for parent ----
    useImperativeHandle(
      ref,
      () => ({
        fitToScreen,
        zoomIn,
        zoomOut,
        zoomReset,
        getScale: () => scaleRef.current,
        toggleFullscreen,
      }),
      [fitToScreen, zoomIn, zoomOut, zoomReset, toggleFullscreen],
    );

    // ---- Cursor Style ----
    const getCursorClass = () => {
      if (spaceHeldRef.current || isDraggingRef.current) return "cursor-grabbing";
      if (hoveredBlockIdRef.current) return "cursor-pointer";
      return "cursor-grab";
    };

    return (
      <div
        ref={containerRef}
        className={
          "relative w-full h-full overflow-hidden bg-slate-50 " +
          (isFullscreen ? "!fixed !inset-0 !z-50 " : "") +
          (className || "")
        }
        tabIndex={0}
      >
        <canvas
          ref={canvasRef}
          className={"block w-full h-full " + getCursorClass()}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />

        {/* Zoom Controls Overlay — shown when no external toolbar */}
        {!externalToolbar && (
          <div className="absolute bottom-4 right-4 flex flex-col gap-0 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <button
              onClick={zoomIn}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-600 font-semibold text-lg"
              title="Приблизить (Ctrl +)"
            >
              +
            </button>
            <div className="mx-2 h-px bg-gray-200" />
            <button
              onClick={zoomReset}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 text-xs font-medium"
              title="Сбросить масштаб"
            >
              {Math.round(scaleRef.current * 100)}%
            </button>
            <div className="mx-2 h-px bg-gray-200" />
            <button
              onClick={zoomOut}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-600 font-semibold text-lg"
              title="Отдалить (Ctrl -)"
            >
              &minus;
            </button>
            <div className="mx-2 h-px bg-gray-200" />
            <button
              onClick={fitToScreen}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500"
              title="Вписать в экран (Ctrl 0)"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="1" y="1" width="14" height="14" rx="2" />
                <path d="M5 1v14M1 5h14" />
              </svg>
            </button>
            <div className="mx-2 h-px bg-gray-200" />
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500"
              title={isFullscreen ? "Выйти из полноэкранного (Esc)" : "На весь экран"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                {isFullscreen ? (
                  <>
                    <polyline points="5,1 1,1 1,5" />
                    <polyline points="11,15 15,15 15,11" />
                    <polyline points="15,5 15,1 11,1" />
                    <polyline points="1,11 1,15 5,15" />
                  </>
                ) : (
                  <>
                    <polyline points="1,5 1,1 5,1" />
                    <polyline points="15,11 15,15 11,15" />
                    <polyline points="11,1 15,1 15,5" />
                    <polyline points="5,15 1,15 1,11" />
                  </>
                )}
              </svg>
            </button>
          </div>
        )}

        {/* Mini-map style info in top-left */}
        {data.blocks.length > 0 && (
          <div className="absolute top-3 left-3 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-lg border border-gray-200 text-xs text-gray-500 pointer-events-none select-none">
            {data.blocks.length} {"\u0431\u043B\u043E\u043A\u043E\u0432"} &middot;{" "}
            {data.roles.length} {"\u0440\u043E\u043B\u0435\u0439"} &middot;{" "}
            {data.stages.length} {"\u044D\u0442\u0430\u043F\u043E\u0432"}
          </div>
        )}

        {/* Fullscreen hint */}
        {isFullscreen && (
          <div className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 rounded-lg text-xs text-white pointer-events-none select-none">
            Esc — выход из полноэкранного режима
          </div>
        )}
      </div>
    );
  },
);
