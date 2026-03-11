/**
 * svgDiagramExport.ts
 * ====================
 * Generates a standalone SVG string that visually mirrors the canvas-rendered
 * BPMN diagram. Uses the same layout info produced by computeLayout() so
 * positions are pixel-perfect with the canvas output.
 */

import type { ProcessData, ProcessBlock, BlockType } from "@shared/types";
import { BLOCK_CONFIG, SWIMLANE_COLORS } from "@shared/types";
import {
  SegmentLaner,
  applyLaneOffsets,
  routeConnection as routeConnectionHelper,
} from "../components/routingHelpers";
import type { LayoutBlock as HLayoutBlock, Point } from "../components/routingHelpers";
import type { LayoutBlock as SvgLayoutBlock, LayoutInfo as SvgLayoutInfo } from "../components/SwimlaneCanvas";

export type { SvgLayoutBlock, SvgLayoutInfo };

// ── Constants (mirror SwimlaneCanvas.tsx) ───────────────────────────────────
const STAGE_HEADER_WIDTH = 120;
const ROLE_HEADER_HEIGHT = 56;
const FONT_FAMILY = "'Inter', system-ui, -apple-system, sans-serif";

// ── SVG escaping ─────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Text helpers (canvas-based measurement for accurate line breaks) ──────────
let _measCtx: CanvasRenderingContext2D | null = null;
function getMeasCtx(): CanvasRenderingContext2D {
  if (!_measCtx) {
    const c = document.createElement("canvas");
    _measCtx = c.getContext("2d")!;
  }
  return _measCtx;
}

function wrapSvg(text: string, font: string, maxWidth: number, maxLines: number): string[] {
  if (!text) return [];
  const ctx = getMeasCtx();
  ctx.font = font;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        let last = lines[lines.length - 1];
        while (last.length > 0 && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
        lines[lines.length - 1] = last + "…";
        return lines;
      }
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function measureSvg(text: string, font: string): number {
  const ctx = getMeasCtx();
  ctx.font = font;
  return ctx.measureText(text).width;
}

// ── Pill path (start/end) ─────────────────────────────────────────────────────
function pillPath(x: number, y: number, w: number, h: number): string {
  const r = h / 2;
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    `Z`,
  ].join(" ");
}

// ── Hexagon points (action) ───────────────────────────────────────────────────
function hexPoints(x: number, y: number, w: number, h: number): string {
  const i = 28;
  return [
    `${x + i},${y}`,
    `${x + w - i},${y}`,
    `${x + w},${y + h / 2}`,
    `${x + w - i},${y + h}`,
    `${x + i},${y + h}`,
    `${x},${y + h / 2}`,
  ].join(" ");
}

// ── Diamond points (decision) ─────────────────────────────────────────────────
function diamondPoints(x: number, y: number, w: number, h: number): string {
  return [
    `${x + w / 2},${y}`,
    `${x + w},${y + h / 2}`,
    `${x + w / 2},${y + h}`,
    `${x},${y + h / 2}`,
  ].join(" ");
}

// ── Triangle points (split) ───────────────────────────────────────────────────
function trianglePoints(x: number, y: number, w: number, h: number): string {
  return [`${x + 10},${y}`, `${x + w - 10},${y}`, `${x + w / 2},${y + h}`].join(" ");
}

// ── Block fill ────────────────────────────────────────────────────────────────
function blockFill(type: BlockType): string {
  switch (type) {
    case "start": return "#f0fdf4";
    case "action": return "#ffffff";
    case "product": return "#f9fafb";
    case "decision": return "#eff6ff";
    case "split": return "#eff6ff";
    case "end": return "#fef2f2";
    default: return "#ffffff";
  }
}

// ── Render one block shape ────────────────────────────────────────────────────
function renderShape(lb: SvgLayoutBlock): string {
  const { block, x, y, w, h } = lb;
  const inactive = block.isActive === false;
  const config = BLOCK_CONFIG[block.type];
  const fill = inactive ? "#f3f4f6" : blockFill(block.type);
  const stroke = inactive ? "#9ca3af" : config.borderColor;
  const sw = 2;
  const opacity = inactive ? 0.55 : 1;
  const filter = `filter="url(#shadow)"`;

  let shape = "";
  switch (config.shape) {
    case "pill":
      shape = `<path d="${pillPath(x, y, w, h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${filter} opacity="${opacity}"/>`;
      break;
    case "hexagon":
      shape = `<polygon points="${hexPoints(x, y, w, h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${filter} opacity="${opacity}"/>`;
      break;
    case "rounded-rect":
      shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" ry="12" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${filter} opacity="${opacity}"/>`;
      break;
    case "diamond":
      shape = `<polygon points="${diamondPoints(x, y, w, h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${filter} opacity="${opacity}"/>`;
      break;
    case "triangle":
      shape = `<polygon points="${trianglePoints(x, y, w, h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${filter} opacity="${opacity}"/>`;
      break;
    case "double-rect":
      shape = [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${filter} opacity="${opacity}"/>`,
        `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="5" ry="5" fill="none" stroke="${stroke}" stroke-width="${sw * 0.7}" opacity="${opacity}"/>`,
      ].join("\n");
      break;
  }
  return shape;
}

// ── Render block text content ─────────────────────────────────────────────────
function renderContent(lb: SvgLayoutBlock): string {
  const { block, x, y, w, h } = lb;
  const config = BLOCK_CONFIG[block.type];
  const cx = x + w / 2;
  const parts: string[] = [];

  let textMaxW: number;
  let textTop: number;
  switch (config.shape) {
    case "diamond":  textMaxW = w * 0.45; textTop = y + h * 0.18; break;
    case "hexagon":  textMaxW = w - 72;   textTop = y + 12;       break;
    case "triangle": textMaxW = w * 0.55; textTop = y + 8;        break;
    default:         textMaxW = w - 32;   textTop = y + 12;       break;
  }

  // Type label
  parts.push(
    `<text x="${cx}" y="${textTop + 8}" text-anchor="middle" dominant-baseline="middle" ` +
    `fill="#9ca3af" font-family="${FONT_FAMILY}" font-size="10" font-weight="600">` +
    `${esc(config.label.toUpperCase())}</text>`
  );
  let curY = textTop + 15;

  if (block.type === "decision") {
    parts.push(
      `<text x="${cx}" y="${curY + 11}" text-anchor="middle" dominant-baseline="middle" ` +
      `fill="#3b82f6" font-family="${FONT_FAMILY}" font-size="22" font-weight="bold">?</text>`
    );
    curY += 26;
    const nameFont = `bold 12px ${FONT_FAMILY}`;
    const nameLines = wrapSvg(block.name, nameFont, textMaxW, 2);
    for (const line of nameLines) {
      parts.push(
        `<text x="${cx}" y="${curY + 6}" text-anchor="middle" dominant-baseline="middle" ` +
        `fill="#1e3a5f" font-family="${FONT_FAMILY}" font-size="12" font-weight="bold">` +
        `${esc(line)}</text>`
      );
      curY += 15;
    }
    return parts.join("\n");
  }

  // Name
  const nameFont = `bold 13px ${FONT_FAMILY}`;
  const nameLines = wrapSvg(block.name, nameFont, textMaxW, 3);
  for (const line of nameLines) {
    parts.push(
      `<text x="${cx}" y="${curY + 8}" text-anchor="middle" dominant-baseline="middle" ` +
      `fill="#111827" font-family="${FONT_FAMILY}" font-size="13" font-weight="bold">` +
      `${esc(line)}</text>`
    );
    curY += 17;
  }

  // Description
  if ((block.type === "action" || block.type === "product") && block.description) {
    curY += 3;
    const reservedBottom = block.type === "action" ? 38 : 8;
    const availH = y + h - curY - reservedBottom;
    const descMaxLines = Math.max(1, Math.min(2, Math.floor(availH / 15)));
    const descFont = `12px ${FONT_FAMILY}`;
    const descLines = wrapSvg(block.description, descFont, textMaxW, descMaxLines);
    for (const line of descLines) {
      parts.push(
        `<text x="${cx}" y="${curY + 7}" text-anchor="middle" dominant-baseline="middle" ` +
        `fill="#6b7280" font-family="${FONT_FAMILY}" font-size="12">` +
        `${esc(line)}</text>`
      );
      curY += 15;
    }
  }

  // Badges for action blocks
  if (block.type === "action") {
    curY += 8;
    const badges: string[] = [];
    if (block.timeEstimate) badges.push("⏱ " + block.timeEstimate);
    const docCount = (block.inputDocuments?.length || 0) + (block.outputDocuments?.length || 0);
    if (docCount > 0) badges.push("📄 " + docCount);
    if (block.infoSystems?.length) badges.push("🖥 " + block.infoSystems.length);
    if (block.checklist?.length) badges.push("✓ " + block.checklist.length);

    if (badges.length > 0) {
      const badgeFont = `11px ${FONT_FAMILY}`;
      const padH = 8;
      const badgeH = 22;
      const badgeGap = 8;
      const badgeWidths = badges.map((b) => measureSvg(b, badgeFont) + padH * 2);
      const totalBW = badgeWidths.reduce((a, v) => a + v, 0) + (badges.length - 1) * badgeGap;
      let bx = cx - totalBW / 2;

      for (let i = 0; i < badges.length; i++) {
        const bw = badgeWidths[i];
        parts.push(
          `<rect x="${bx}" y="${curY}" width="${bw}" height="${badgeH}" rx="6" ry="6" fill="#f3f4f6" stroke="#e5e7eb" stroke-width="1"/>`
        );
        parts.push(
          `<text x="${bx + bw / 2}" y="${curY + badgeH / 2}" text-anchor="middle" dominant-baseline="middle" ` +
          `fill="#4b5563" font-family="${FONT_FAMILY}" font-size="11">${esc(badges[i])}</text>`
        );
        bx += bw + badgeGap;
      }
    }
  }

  return parts.join("\n");
}

// ── Arrow marker defs ─────────────────────────────────────────────────────────
function arrowMarkerDef(id: string, color: string): string {
  return (
    `<marker id="${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">` +
    `<polygon points="0 0, 10 3.5, 0 7" fill="${color}"/>` +
    `</marker>`
  );
}

// ── Render connections ────────────────────────────────────────────────────────
function renderConnections(data: ProcessData, layout: SvgLayoutInfo): string {
  const allBlocks = data.blocks;
  const blockMap: Record<string, SvgLayoutBlock> = {};
  for (const lb of layout.blocks) blockMap[lb.block.id] = lb;

  const hBlockMap: Record<string, HLayoutBlock> = {};
  for (const lb of layout.blocks) {
    hBlockMap[lb.block.id] = {
      id: lb.block.id,
      x: lb.x,
      y: lb.y,
      w: lb.w,
      h: lb.h,
      block: { type: lb.block.type, conditionLabel: lb.block.conditionLabel, isDefault: lb.block.isDefault },
      connections: lb.block.connections,
    };
  }
  const allHBlocks = Object.values(hBlockMap);

  const activeSet = new Set(allBlocks.filter((b) => b.isActive !== false).map((b) => b.id));

  function resolveActiveTargets(targetId: string, visited = new Set<string>()): string[] {
    if (visited.has(targetId)) return [];
    visited.add(targetId);
    if (activeSet.has(targetId)) return [targetId];
    const b = allBlocks.find((x) => x.id === targetId);
    if (!b) return [];
    const out: string[] = [];
    for (const nxt of b.connections) out.push(...resolveActiveTargets(nxt, new Set(visited)));
    return out;
  }

  type DrawEdge = { sourceBlock: ProcessBlock; targetId: string; bypassed: boolean };
  const drawEdges: DrawEdge[] = [];
  for (const block of allBlocks) {
    if (!activeSet.has(block.id)) continue;
    for (const connId of block.connections) {
      if (activeSet.has(connId)) {
        drawEdges.push({ sourceBlock: block, targetId: connId, bypassed: false });
      } else {
        for (const tid of resolveActiveTargets(connId)) {
          drawEdges.push({ sourceBlock: block, targetId: tid, bypassed: true });
        }
      }
    }
  }

  const laner = new SegmentLaner();
  const routeCache = new Map<string, Point[]>();
  for (let ei = 0; ei < drawEdges.length; ei++) {
    const { sourceBlock, targetId } = drawEdges[ei];
    const source = hBlockMap[sourceBlock.id];
    const target = hBlockMap[targetId];
    if (!source || !target) continue;
    const edgesFromSource = drawEdges.filter((e) => e.sourceBlock.id === sourceBlock.id);
    const ci = edgesFromSource.indexOf(drawEdges[ei]);
    const rawPts = routeConnectionHelper(source, target, ci, edgesFromSource.length, allHBlocks);
    const adjPts = applyLaneOffsets(rawPts, laner);
    routeCache.set(`${sourceBlock.id}->${targetId}`, adjPts);
  }

  const svgParts: string[] = [];
  for (const { sourceBlock: block, targetId, bypassed } of drawEdges) {
    const points = routeCache.get(`${block.id}->${targetId}`);
    if (!points || points.length < 2) continue;

    const color = bypassed ? "#9ca3af" : "#6b7280";
    const markerId = bypassed ? "arr-gray" : "arr-dark";
    const dash = bypassed ? `stroke-dasharray="6 4"` : "";
    const ptStr = points.map((p) => `${p.x},${p.y}`).join(" ");

    svgParts.push(
      `<polyline points="${ptStr}" fill="none" stroke="${color}" stroke-width="2" ${dash} marker-end="url(#${markerId})"/>`
    );

    // Default slash mark
    const targetBlock = allBlocks.find((b) => b.id === targetId);
    if (
      targetBlock?.isDefault &&
      (block.type === "decision" || block.type === "split")
    ) {
      const midIdx = Math.min(1, points.length - 1);
      const mpx = (points[0].x + points[midIdx].x) / 2;
      const mpy = (points[0].y + points[midIdx].y) / 2;
      svgParts.push(
        `<line x1="${mpx - 6}" y1="${mpy - 6}" x2="${mpx + 6}" y2="${mpy + 6}" stroke="${color}" stroke-width="2.5"/>`
      );
    }

    // Condition label
    if (
      targetBlock?.conditionLabel &&
      (block.type === "decision" || block.type === "split")
    ) {
      const mid = points[Math.floor(points.length / 2)];
      const label = targetBlock.conditionLabel;
      const lw = measureSvg(label, `12px ${FONT_FAMILY}`) + 12;
      const lh = 18;
      svgParts.push(
        `<rect x="${mid.x - lw / 2}" y="${mid.y - lh / 2}" width="${lw}" height="${lh}" rx="4" fill="white" stroke="#e5e7eb" stroke-width="1"/>`
      );
      svgParts.push(
        `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="middle" ` +
        `fill="#374151" font-family="${FONT_FAMILY}" font-size="12">${esc(label)}</text>`
      );
    }
  }
  return svgParts.join("\n");
}

// ── Main entry point ──────────────────────────────────────────────────────────
export function generateDiagramSVG(data: ProcessData, layout: SvgLayoutInfo): string {
  const { totalWidth, totalHeight, lanePositions, stagePositions, stageHeights, roleOrder, stageOrder, laneWidth: LANE_WIDTH } = layout;

  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order);

  const lines: string[] = [];

  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`,
  );

  // ── Defs ─────────────────────────────────────────────────────────────────
  lines.push("<defs>");
  lines.push(
    `<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.10)"/>` +
    `</filter>`,
  );
  // Gradient for role headers
  for (let i = 0; i < data.roles.length; i++) {
    lines.push(
      `<linearGradient id="rhgrad${i}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="white" stop-opacity="0.15"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="0.10"/>` +
      `</linearGradient>`,
    );
  }
  // Arrow markers
  lines.push(arrowMarkerDef("arr-dark", "#6b7280"));
  lines.push(arrowMarkerDef("arr-gray", "#9ca3af"));
  lines.push("</defs>");

  // ── Background ────────────────────────────────────────────────────────────
  lines.push(`<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#f8fafc"/>`);

  // ── Lane backgrounds ──────────────────────────────────────────────────────
  for (let i = 0; i < roleOrder.length; i++) {
    const lx = lanePositions[i];
    const color = SWIMLANE_COLORS[i % SWIMLANE_COLORS.length];
    lines.push(
      `<rect x="${lx}" y="${ROLE_HEADER_HEIGHT}" width="${LANE_WIDTH}" height="${totalHeight - ROLE_HEADER_HEIGHT}" fill="${color}" opacity="0.4"/>`,
    );
  }

  // ── Grid lines ────────────────────────────────────────────────────────────
  // Vertical lane dividers
  for (let i = 0; i <= roleOrder.length; i++) {
    const lx = STAGE_HEADER_WIDTH + i * LANE_WIDTH;
    lines.push(`<line x1="${lx}" y1="0" x2="${lx}" y2="${totalHeight}" stroke="#e2e8f0" stroke-width="1"/>`);
  }
  // Role header bottom line
  lines.push(`<line x1="0" y1="${ROLE_HEADER_HEIGHT}" x2="${totalWidth}" y2="${ROLE_HEADER_HEIGHT}" stroke="#e2e8f0" stroke-width="1"/>`);
  // Stage dividers
  for (let i = 0; i < stageOrder.length; i++) {
    const sy = stagePositions[i] + stageHeights[i];
    lines.push(`<line x1="0" y1="${sy}" x2="${totalWidth}" y2="${sy}" stroke="#e2e8f0" stroke-width="1"/>`);
  }

  // ── Stage headers ─────────────────────────────────────────────────────────
  for (let i = 0; i < sortedStages.length; i++) {
    const stage = sortedStages[i];
    const sy = stagePositions[i];
    const sh = stageHeights[i];

    lines.push(`<rect x="0" y="${sy}" width="${STAGE_HEADER_WIDTH}" height="${sh}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>`);
    // Stage number
    lines.push(
      `<text x="${STAGE_HEADER_WIDTH / 2}" y="${sy + 16}" text-anchor="middle" dominant-baseline="middle" ` +
      `fill="#94a3b8" font-family="${FONT_FAMILY}" font-size="11" font-weight="bold">${i + 1}</text>`,
    );
    // Stage name (wrapped, vertically centered)
    const nameFont = `bold 13px ${FONT_FAMILY}`;
    const stageLines = wrapSvg(stage.name, nameFont, STAGE_HEADER_WIDTH - 24, 3);
    const lineH = 17;
    const textStartY = sy + sh / 2 - ((stageLines.length - 1) * lineH) / 2;
    for (let li = 0; li < stageLines.length; li++) {
      lines.push(
        `<text x="${STAGE_HEADER_WIDTH / 2}" y="${textStartY + li * lineH}" text-anchor="middle" dominant-baseline="middle" ` +
        `fill="#374151" font-family="${FONT_FAMILY}" font-size="13" font-weight="bold">${esc(stageLines[li])}</text>`,
      );
    }
  }

  // ── Role headers ──────────────────────────────────────────────────────────
  for (let i = 0; i < data.roles.length; i++) {
    const role = data.roles[i];
    const ri = roleOrder.indexOf(role.id);
    if (ri === -1) continue;
    const lx = lanePositions[ri];

    // Color fill
    lines.push(`<rect x="${lx}" y="0" width="${LANE_WIDTH}" height="${ROLE_HEADER_HEIGHT}" fill="${role.color}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>`);
    // Gradient overlay
    lines.push(`<rect x="${lx}" y="0" width="${LANE_WIDTH}" height="${ROLE_HEADER_HEIGHT}" fill="url(#rhgrad${i})"/>`);

    const nameY = role.department ? ROLE_HEADER_HEIGHT / 2 - 7 : ROLE_HEADER_HEIGHT / 2;
    const maxNameW = LANE_WIDTH - 24;
    const roleNameFont = `bold 14px ${FONT_FAMILY}`;
    const ctx = getMeasCtx();
    ctx.font = roleNameFont;
    let roleName = role.name;
    while (roleName.length > 0 && ctx.measureText(roleName).width > maxNameW) {
      roleName = roleName.slice(0, -1);
    }
    if (roleName !== role.name) roleName += "…";

    lines.push(
      `<text x="${lx + LANE_WIDTH / 2}" y="${nameY}" text-anchor="middle" dominant-baseline="middle" ` +
      `fill="#1f2937" font-family="${FONT_FAMILY}" font-size="14" font-weight="bold">${esc(roleName)}</text>`,
    );
    if (role.department) {
      let dept = role.department;
      ctx.font = `11px ${FONT_FAMILY}`;
      while (dept.length > 0 && ctx.measureText(dept).width > maxNameW) dept = dept.slice(0, -1);
      if (dept !== role.department) dept += "…";
      lines.push(
        `<text x="${lx + LANE_WIDTH / 2}" y="${ROLE_HEADER_HEIGHT / 2 + 12}" text-anchor="middle" dominant-baseline="middle" ` +
        `fill="#4b5563" font-family="${FONT_FAMILY}" font-size="11">${esc(dept)}</text>`,
      );
    }
  }

  // ── Top-left corner ───────────────────────────────────────────────────────
  lines.push(`<rect x="0" y="0" width="${STAGE_HEADER_WIDTH}" height="${ROLE_HEADER_HEIGHT}" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1"/>`);

  // ── Connections (behind blocks) ───────────────────────────────────────────
  lines.push(`<g id="connections">`);
  lines.push(renderConnections(data, layout));
  lines.push("</g>");

  // ── Blocks ────────────────────────────────────────────────────────────────
  lines.push(`<g id="blocks">`);
  for (const lb of layout.blocks) {
    lines.push(`<g id="block-${lb.block.id}">`);
    lines.push(renderShape(lb));
    lines.push(renderContent(lb));
    lines.push("</g>");
  }
  lines.push("</g>");

  lines.push("</svg>");

  return lines.join("\n");
}
