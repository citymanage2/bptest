/**
 * routingHelpers.ts
 * =================
 * Три улучшения маршрутизации стрелок BPMN:
 *   1. Block-aware routing  — линии обходят блоки
 *   2. SegmentLaner         — параллельные линии не сливаются
 *   3. drawConnectionLabel  — подписи с переносом и обходом блоков
 */

/* ──────────────────────────────────────────────────────────────
   Базовые типы
   ────────────────────────────────────────────────────────────── */
export type Point = { x: number; y: number };

export interface LayoutBlock {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  block: {
    type: string;
    conditionLabel?: string;
    isDefault?: boolean;
  };
  connections: string[];
}

/* ══════════════════════════════════════════════════════════════
   1.  КОЛЛИЗИИ  — проверка попадания сегмента в блок
   ══════════════════════════════════════════════════════════════ */

const BLOCK_PAD = 18; // визуальный отступ от края блока — линии не должны подходить ближе

/** Горизонтальный отрезок y=const, x ∈ [x1,x2] задевает блок? */
export function hSegCollides(
  blocks: LayoutBlock[],
  x1: number, x2: number,
  y: number,
  skip: Set<string>,
  pad = BLOCK_PAD,
): boolean {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  return blocks.some(
    (b) =>
      !skip.has(b.id) &&
      y > b.y - pad && y < b.y + b.h + pad &&
      hi > b.x - pad && lo < b.x + b.w + pad,
  );
}

/** Вертикальный отрезок x=const, y ∈ [y1,y2] задевает блок? */
export function vSegCollides(
  blocks: LayoutBlock[],
  x: number,
  y1: number, y2: number,
  skip: Set<string>,
  pad = BLOCK_PAD,
): boolean {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  return blocks.some(
    (b) =>
      !skip.has(b.id) &&
      x > b.x - pad && x < b.x + b.w + pad &&
      hi > b.y - pad && lo < b.y + b.h + pad,
  );
}

function rectOverlapsBlock(
  rx: number, ry: number, rw: number, rh: number,
  blocks: LayoutBlock[],
  skip: Set<string>,
  pad = 4,
): boolean {
  return blocks.some(
    (b) =>
      !skip.has(b.id) &&
      rx < b.x + b.w + pad && rx + rw > b.x - pad &&
      ry < b.y + b.h + pad && ry + rh > b.y - pad,
  );
}

function findClearMidY(
  blocks: LayoutBlock[],
  sx: number, tx: number,
  sy: number, ty: number,
  skip: Set<string>,
): number {
  const span = ty - sy;
  const fractions = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.1, 0.9];
  for (const f of fractions) {
    const y = sy + span * f;
    if (y > sy + 5 && y < ty - 5 && !hSegCollides(blocks, sx, tx, y, skip))
      return y;
  }
  return sy + span * 0.5;
}

/**
 * Находит ближайший X (в обе стороны от startX),
 * где вертикальный отрезок [y1,y2] не задевает ни одного блока.
 */
function findClearSideX(
  blocks: LayoutBlock[],
  y1: number, y2: number,
  startX: number,
  skip: Set<string>,
): number {
  if (!vSegCollides(blocks, startX, y1, y2, skip)) return startX;
  // Ищем в обе стороны одновременно — берём ближайший свободный X
  for (let i = 1; i <= 15; i++) {
    const step = i * 12;
    const xl = startX - step;
    const xr = startX + step;
    if (!vSegCollides(blocks, xl, y1, y2, skip)) return xl;
    if (!vSegCollides(blocks, xr, y1, y2, skip)) return xr;
  }
  return startX;
}

/**
 * Строит стандартный Z-маршрут (вперёд, ty > sy)
 * с проверкой коллизий для ВСЕХ трёх отрезков:
 * левого вертикального, горизонтального и правого вертикального.
 *
 * Если вертикальный отрезок у source или target задевает блок —
 * добавляет горизонтальный джог в сторону, где коридор свободен.
 */
function buildZRoute(
  allBlocks: LayoutBlock[],
  sx: number, sy: number,
  tx: number, ty: number,
  skip: Set<string>,
): Point[] {
  const STUB = 22; // короткий вертикальный стаб от блока перед горизонтальным джогом

  // 1. Найти midY, где горизонтальный отрезок свободен
  const midY = findClearMidY(allBlocks, sx, tx, sy, ty, skip);

  // 2. Проверить вертикальные отрезки
  //    Стаб (sy → sy+STUB) заведомо свободен (между стадиями), поэтому
  //    проверяем от sy+STUB до midY и от midY до ty-STUB.
  const leftCollides  = vSegCollides(allBlocks, sx, sy + STUB, midY, skip);
  const rightCollides = vSegCollides(allBlocks, tx, midY, ty - STUB, skip);

  // 3. Построить левую часть маршрута: (sx,sy) → (?,midY)
  let leftPts: Point[];
  if (leftCollides) {
    const clearX = findClearSideX(allBlocks, sy + STUB, midY, sx, skip);
    leftPts = [
      { x: sx,     y: sy },
      { x: sx,     y: sy + STUB },
      { x: clearX, y: sy + STUB },
      { x: clearX, y: midY },
    ];
  } else {
    leftPts = [
      { x: sx, y: sy },
      { x: sx, y: midY },
    ];
  }

  // 4. Построить правую часть маршрута: (?,midY) → (tx,ty)
  let rightPts: Point[];
  if (rightCollides) {
    const clearX = findClearSideX(allBlocks, midY, ty - STUB, tx, skip);
    rightPts = [
      { x: clearX, y: midY },
      { x: clearX, y: ty - STUB },
      { x: tx,     y: ty - STUB },
      { x: tx,     y: ty },
    ];
  } else {
    rightPts = [
      { x: tx, y: midY },
      { x: tx, y: ty },
    ];
  }

  // 5. Объединить: левая часть заканчивается на (lx, midY),
  //    правая начинается на (rx, midY).
  //    Если lx ≠ rx — между ними автоматически нарисуется горизонтальный отрезок.
  return [...leftPts, ...rightPts];
}


/* ══════════════════════════════════════════════════════════════
   2.  SEGMENT LANER  — развод параллельных линий по полосам
   ══════════════════════════════════════════════════════════════ */

interface LaneSeg {
  lo: number;
  hi: number;
  lane: number;
}

export class SegmentLaner {
  private hBuckets = new Map<number, LaneSeg[]>();
  private vBuckets = new Map<number, LaneSeg[]>();
  private static readonly QUANT = 4;
  private static readonly PROX = 14;
  private static readonly STEP = 6;
  private static readonly LANE_SEQ = [0, 1, -1, 2, -2, 3, -3, 4, -4];

  private quant(v: number): number {
    return Math.round(v / SegmentLaner.QUANT) * SegmentLaner.QUANT;
  }

  reserveH(y: number, x1: number, x2: number): number {
    return this._reserve(this.hBuckets, this.quant(y), Math.min(x1, x2), Math.max(x1, x2));
  }

  reserveV(x: number, y1: number, y2: number): number {
    return this._reserve(this.vBuckets, this.quant(x), Math.min(y1, y2), Math.max(y1, y2));
  }

  private _reserve(
    map: Map<number, LaneSeg[]>,
    key: number,
    lo: number,
    hi: number,
  ): number {
    const usedLanes = new Set<number>();
    for (const [k, segs] of map) {
      if (Math.abs(k - key) > SegmentLaner.PROX) continue;
      for (const s of segs) {
        if (Math.max(lo, s.lo) < Math.min(hi, s.hi) - 5) {
          usedLanes.add(s.lane);
        }
      }
    }
    let lane = 0;
    for (const l of SegmentLaner.LANE_SEQ) {
      if (!usedLanes.has(l)) { lane = l; break; }
    }
    const bucket = map.get(key) ?? [];
    bucket.push({ lo, hi, lane });
    map.set(key, bucket);
    return lane * SegmentLaner.STEP;
  }
}

export function applyLaneOffsets(points: Point[], laner: SegmentLaner): Point[] {
  const n = points.length;
  if (n < 2) return [...points];

  const segFrom = n > 3 ? 1 : 0;
  const segTo   = n > 3 ? n - 2 : n - 1;

  const offsets    = new Array<number>(n - 1).fill(0);
  const segIsHoriz = new Array<boolean>(n - 1).fill(false);

  for (let i = segFrom; i < segTo; i++) {
    const p = points[i], q = points[i + 1];
    const isH = Math.abs(p.y - q.y) < 2;
    const isV = Math.abs(p.x - q.x) < 2;
    segIsHoriz[i] = isH;
    if (isH)      offsets[i] = laner.reserveH(p.y,  p.x, q.x);
    else if (isV) offsets[i] = laner.reserveV(p.x, p.y,  q.y);
  }

  if (offsets.every((o) => o === 0)) return [...points];

  const dy = new Array<number>(n).fill(0);
  const dx = new Array<number>(n).fill(0);

  for (let i = segFrom; i < segTo; i++) {
    if (offsets[i] === 0) continue;
    if (segIsHoriz[i]) {
      if (i > 0)          dy[i]     += offsets[i];
      if (i + 1 < n - 1) dy[i + 1] += offsets[i];
    } else {
      if (i > 0)          dx[i]     += offsets[i];
      if (i + 1 < n - 1) dx[i + 1] += offsets[i];
    }
  }

  return points.map((p, i) => ({ x: p.x + dx[i], y: p.y + dy[i] }));
}

/* ══════════════════════════════════════════════════════════════
   3.  ROUTING  — обновлённая маршрутизация с обходом блоков
   ══════════════════════════════════════════════════════════════ */

export function routeConnection(
  source: LayoutBlock,
  target: LayoutBlock,
  connIndex: number,
  totalConns: number,
  allBlocks: LayoutBlock[],
): Point[] {
  const skip = new Set<string>([source.id, target.id]);
  const tx = target.x + target.w / 2;
  const ty = target.y;

  /* ── Decision (ромб) ──────────────────────────────────────── */
  if (source.block.type === "decision") {
    const condLbl = target.block.conditionLabel?.toLowerCase();
    const cy = source.y + source.h / 2;

    if (condLbl === "да") {
      // Выход из левого угла ромба
      const sx = source.x;
      const sy = cy;
      const baseX = Math.min(source.x - 35, tx - 20);
      const routeX = findClearSideX(allBlocks, sy, ty - 35, baseX, skip);
      const approachY = hSegCollides(allBlocks, routeX, tx, ty - 35, skip)
        ? ty - 60
        : ty - 35;
      return [
        { x: sx,     y: sy },
        { x: routeX, y: sy },
        { x: routeX, y: approachY },
        { x: tx,     y: approachY },
        { x: tx,     y: ty },
      ];
    }

    if (condLbl === "нет") {
      // Выход из правого угла ромба
      const sx = source.x + source.w;
      const sy = cy;
      const baseX = Math.max(source.x + source.w + 35, tx + 20);
      const routeX = findClearSideX(allBlocks, sy, ty - 35, baseX, skip);
      const approachY = hSegCollides(allBlocks, tx, routeX, ty - 35, skip)
        ? ty - 60
        : ty - 35;
      return [
        { x: sx,     y: sy },
        { x: routeX, y: sy },
        { x: routeX, y: approachY },
        { x: tx,     y: approachY },
        { x: tx,     y: ty },
      ];
    }

    // Ветка по умолчанию — из нижней точки ромба
    const sx = source.x + source.w / 2;
    const sy = source.y + source.h;
    if (ty > sy + 5) {
      if (Math.abs(sx - tx) < 8 && !vSegCollides(allBlocks, sx, sy, ty, skip))
        return [{ x: sx, y: sy }, { x: tx, y: ty }];
      return buildZRoute(allBlocks, sx, sy, tx, ty, skip);
    }
  }

  /* ── Обычный блок ─────────────────────────────────────────── */
  const spread = Math.min(totalConns - 1, 4) * 14;
  const exitOffset =
    totalConns > 1
      ? -spread / 2 + connIndex * (spread / Math.max(totalConns - 1, 1))
      : 0;

  const sx = source.x + source.w / 2 + exitOffset;
  const sy = source.y + source.h;

  if (ty > sy + 5) {
    // Прямая вертикаль — только если путь полностью свободен
    if (Math.abs(sx - tx) < 8 && !vSegCollides(allBlocks, sx, sy, ty, skip))
      return [{ x: sx, y: sy }, { x: tx, y: ty }];
    return buildZRoute(allBlocks, sx, sy, tx, ty, skip);
  }

  // Боковой / обратный маршрут (target выше или на том же уровне)
  const gap = 35;
  const isRight = tx > sx;
  const baseX = isRight
    ? Math.max(source.x + source.w, target.x + target.w) + gap
    : Math.min(source.x, target.x) - gap;
  const sideX = findClearSideX(allBlocks, sy + gap, ty - gap, baseX, skip);

  return [
    { x: sx,    y: sy },
    { x: sx,    y: sy + gap },
    { x: sideX, y: sy + gap },
    { x: sideX, y: ty - gap },
    { x: tx,    y: ty - gap },
    { x: tx,    y: ty },
  ];
}

/* ══════════════════════════════════════════════════════════════
   4.  ПОДПИСЬ НА СТРЕЛКЕ  — с переносом и обходом блоков
   ══════════════════════════════════════════════════════════════ */

function wrapLabelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function drawConnectionLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  points: Point[],
  allBlocks: LayoutBlock[],
  skip: Set<string>,
): void {
  const FONT_SIZE = 11;
  const LINE_H    = 14;
  const PAD       = 4;
  const MAX_W     = 88;

  ctx.save();
  ctx.font = `${FONT_SIZE}px sans-serif`;

  const displayText = `[${label}]`;
  const lines = wrapLabelText(ctx, displayText, MAX_W);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = textW + PAD * 2;
  const boxH = lines.length * LINE_H + PAD * 2;

  const candidates: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i], q = points[i + 1];
    const segLen = Math.hypot(q.x - p.x, q.y - p.y);
    if (segLen < boxW + 16) continue;
    for (const frac of [0.25, 0.5, 0.75]) {
      candidates.push({
        x: p.x + (q.x - p.x) * frac,
        y: p.y + (q.y - p.y) * frac,
      });
    }
  }

  if (candidates.length === 0) {
    const p = points[0];
    const q = points[Math.min(1, points.length - 1)];
    candidates.push({ x: (p.x + q.x) / 2 + 20, y: (p.y + q.y) / 2 });
  }

  let chosen = candidates[0];
  for (const c of candidates) {
    if (!rectOverlapsBlock(c.x - boxW / 2, c.y - boxH / 2, boxW, boxH, allBlocks, skip)) {
      chosen = c;
      break;
    }
  }

  const bx = Math.round(chosen.x - boxW / 2);
  const by = Math.round(chosen.y - boxH / 2);

  ctx.fillStyle = "white";
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(bx, by, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#3b82f6";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    ctx.fillText(line, bx + PAD, by + PAD + i * LINE_H);
  });

  ctx.restore();
}
