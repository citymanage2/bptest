import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { ProcessData, ProcessBlock, BlockType } from "@shared/types";
import { BLOCK_CONFIG, SWIMLANE_COLORS } from "@shared/types";

// ============================================================
// Constants
// ============================================================
const STAGE_HEADER_WIDTH = 140;
const ROLE_HEADER_HEIGHT = 60;
const LANE_WIDTH = 350;
const BLOCK_WIDTH = 280;
const BLOCK_PADDING = 40;
const MIN_STAGE_HEIGHT = 240;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_SENSITIVITY = 0.002;
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
}

interface Point {
  x: number;
  y: number;
}

export interface SwimlaneCanvasProps {
  data: ProcessData;
  onBlockClick?: (blockId: string) => void;
  selectedBlockId?: string | null;
  className?: string;
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
): Point[] {
  // Spread multiple exit points horizontally
  const spread = Math.min(totalConns - 1, 4) * 14;
  const exitOffset =
    totalConns > 1
      ? -spread / 2 +
        connIndex * (spread / Math.max(totalConns - 1, 1))
      : 0;

  const sx = source.x + source.w / 2 + exitOffset;
  const sy = source.y + source.h;
  const tx = target.x + target.w / 2;
  const ty = target.y;

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
) {
  const { block, x, y, w, h } = lb;
  const config = BLOCK_CONFIG[block.type];
  const fill = getBlockFill(block.type);
  const border = config.borderColor;
  const lw = isHighlighted || isSelected ? 3 : 2;

  // Shadow
  ctx.save();
  if (isHighlighted || isSelected) {
    ctx.shadowColor = hexToRgba(border, 0.35);
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
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

      const points = routeConnection(source, target, ci, totalConns);

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
      if (
        targetBlock?.conditionLabel &&
        (block.type === "decision" || block.type === "split")
      ) {
        const labelPt =
          points.length >= 3
            ? {
                x: (points[0].x + points[1].x) / 2 + 20,
                y: (points[0].y + points[1].y) / 2,
              }
            : {
                x: (points[0].x + last.x) / 2 + 20,
                y: (points[0].y + last.y) / 2,
              };

        const labelText = "[" + targetBlock.conditionLabel + "]";
        ctx.font = `italic 11px ${FONT_FAMILY}`;
        const tw = ctx.measureText(labelText).width + 12;
        const th = 20;

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

        // Label text
        ctx.fillStyle = "#3b82f6";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, labelPt.x, labelPt.y);
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
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "#ffffff";
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
      ctx.fillStyle = "rgba(255,255,255,0.75)";
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
  for (const lb of layoutBlocks) {
    const isHovered = lb.block.id === hoveredBlockId;
    const isSelected = lb.block.id === selectedBlockId;
    const isConnHL = hoveredBlockId
      ? isConnectedTo(lb.block.id, hoveredBlockId, data.blocks)
      : false;

    drawBlockShape(ctx, lb, isHovered || isConnHL, isSelected);
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
export function SwimlaneCanvas({
  data,
  onBlockClick,
  selectedBlockId,
  className,
}: SwimlaneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);

  // Refs for drag/click discrimination
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const mouseDownPosRef = useRef<Point>({ x: 0, y: 0 });
  const didDragRef = useRef(false);

  // Refs to access latest state from native event listeners
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;

  const layout = useMemo(() => computeLayout(data), [data]);

  // ---- Canvas Render ----
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and set transform: DPR scaling + user zoom/pan
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

    renderDiagram(ctx, data, layout, hoveredBlockId, selectedBlockId);
  }, [data, layout, scale, offset, hoveredBlockId, selectedBlockId]);

  useEffect(() => {
    render();
  }, [render]);

  // ---- Resize Observer ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(() => render());
    obs.observe(container);
    return () => obs.disconnect();
  }, [render]);

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
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      };
      didDragRef.current = false;
      setIsDragging(true);
    },
    [offset],
  );

  // ---- Mouse Move ----
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - mouseDownPosRef.current.x;
        const dy = e.clientY - mouseDownPosRef.current.y;
        if (Math.abs(dx) > CLICK_THRESHOLD || Math.abs(dy) > CLICK_THRESHOLD) {
          didDragRef.current = true;
        }
        setOffset({
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y,
        });
      }

      // Hover hit-test
      const cp = screenToCanvas(e.clientX, e.clientY);
      const bid = hitTestBlocks(cp.x, cp.y, layout);
      setHoveredBlockId(bid);
    },
    [isDragging, screenToCanvas, layout],
  );

  // ---- Mouse Up (click detection) ----
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(false);
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
    setIsDragging(false);
    setHoveredBlockId(null);
  }, []);

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

      // Zoom towards mouse position
      const ratio = newScale / oldScale;
      const newOx = mx - ratio * (mx - offsetRef.current.x);
      const newOy = my - ratio * (my - offsetRef.current.y);

      setScale(newScale);
      setOffset({ x: newOx, y: newOy });
    };

    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

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
    setScale(newScale);
    setOffset((prev) => ({
      x: centerX - ratio * (centerX - prev.x),
      y: centerY - ratio * (centerY - prev.y),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const oldScale = scaleRef.current;
    const newScale = Math.max(MIN_ZOOM, oldScale / 1.25);
    const ratio = newScale / oldScale;
    setScale(newScale);
    setOffset((prev) => ({
      x: centerX - ratio * (centerX - prev.x),
      y: centerY - ratio * (centerY - prev.y),
    }));
  }, []);

  const zoomReset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const fitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const sx = rect.width / layout.totalWidth;
    const sy = rect.height / layout.totalHeight;
    const s = Math.min(sx, sy) * 0.92;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s));
    setScale(clamped);
    setOffset({
      x: (rect.width - layout.totalWidth * clamped) / 2,
      y: (rect.height - layout.totalHeight * clamped) / 2,
    });
  }, [layout]);

  // ---- Cursor Style ----
  const cursorClass = hoveredBlockId
    ? "cursor-pointer"
    : isDragging
      ? "cursor-grabbing"
      : "cursor-grab";

  return (
    <div
      ref={containerRef}
      className={
        "relative w-full h-full overflow-hidden bg-slate-50 " +
        (className || "")
      }
    >
      <canvas
        ref={canvasRef}
        className={"block w-full h-full " + cursorClass}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />

      {/* Zoom Controls Overlay */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-0 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <button
          onClick={zoomIn}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-600 font-semibold text-lg"
          title="\u041F\u0440\u0438\u0431\u043B\u0438\u0437\u0438\u0442\u044C"
        >
          +
        </button>
        <div className="mx-2 h-px bg-gray-200" />
        <button
          onClick={zoomReset}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 text-xs font-medium"
          title="\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043C\u0430\u0441\u0448\u0442\u0430\u0431"
        >
          {Math.round(scale * 100)}%
        </button>
        <div className="mx-2 h-px bg-gray-200" />
        <button
          onClick={zoomOut}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-600 font-semibold text-lg"
          title="\u041E\u0442\u0434\u0430\u043B\u0438\u0442\u044C"
        >
          &minus;
        </button>
        <div className="mx-2 h-px bg-gray-200" />
        <button
          onClick={fitToScreen}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500"
          title="\u0412\u043F\u0438\u0441\u0430\u0442\u044C \u0432 \u044D\u043A\u0440\u0430\u043D"
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
      </div>

      {/* Mini-map style info in top-left */}
      {data.blocks.length > 0 && (
        <div className="absolute top-3 left-3 px-3 py-1.5 bg-white/80 backdrop-blur-sm rounded-lg border border-gray-200 text-xs text-gray-500 pointer-events-none select-none">
          {data.blocks.length} {"\u0431\u043B\u043E\u043A\u043E\u0432"} &middot;{" "}
          {data.roles.length} {"\u0440\u043E\u043B\u0435\u0439"} &middot;{" "}
          {data.stages.length} {"\u044D\u0442\u0430\u043F\u043E\u0432"}
        </div>
      )}
    </div>
  );
}
