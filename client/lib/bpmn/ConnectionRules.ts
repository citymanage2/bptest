/**
 * bpmn/ConnectionRules.ts
 * =======================
 * Layer 1 — Правила соединений.
 *
 * Чистые функции без побочных эффектов: решают, разрешено ли
 * соединение и каким типом потока оно должно быть.
 */

import type { ProcessBlockBO, ConnectionType } from "./types";

// ── Result type ──────────────────────────────────────────────────────────────

export type CanConnectResult =
  | { allowed: true; type: ConnectionType }
  | { allowed: false; reason: string };

// ── Rule constants ───────────────────────────────────────────────────────────

/** Типы блоков, которые нельзя использовать как источник */
const NO_SOURCE_TYPES = new Set(["end"]);

/** Типы блоков, которые нельзя использовать как цель */
const NO_TARGET_TYPES = new Set(["start"]);

/** Тип блока «объект данных» → DataAssociation */
const DATA_OBJECT_TYPES = new Set(["product"]);

// ── canConnect ───────────────────────────────────────────────────────────────

/**
 * Проверяет, можно ли провести соединение из `source` в `target`.
 *
 * Правила (в порядке приоритета):
 * 1. Самосвязь запрещена.
 * 2. EndEvent не может быть источником.
 * 3. StartEvent не может быть целью.
 * 4. Дублирующие соединения запрещены.
 * 5. Объект данных (тип 'product') → DataAssociation.
 * 6. Разные пулы (роли) → MessageFlow.
 * 7. Иначе → SequenceFlow.
 */
export function canConnect(
  source: ProcessBlockBO,
  target: ProcessBlockBO,
): CanConnectResult {
  // 1. Самосвязь
  if (source.id === target.id) {
    return { allowed: false, reason: "Самосвязь не разрешена" };
  }

  // 2. EndEvent как источник
  if (NO_SOURCE_TYPES.has(source.type)) {
    return {
      allowed: false,
      reason: `Блок типа '${source.type}' не может быть источником соединения`,
    };
  }

  // 3. StartEvent как цель
  if (NO_TARGET_TYPES.has(target.type)) {
    return {
      allowed: false,
      reason: `Блок типа '${target.type}' не может быть целью соединения`,
    };
  }

  // 4. Дублирующее соединение
  const alreadyConnected = source.outgoing.some(
    (c) => c.targetRef.id === target.id,
  );
  if (alreadyConnected) {
    return {
      allowed: false,
      reason: "Соединение между этими блоками уже существует",
    };
  }

  // 5. Объект данных
  if (DATA_OBJECT_TYPES.has(source.type) || DATA_OBJECT_TYPES.has(target.type)) {
    return { allowed: true, type: "DataAssociation" };
  }

  // 6. Разные пулы
  if (source.role !== target.role) {
    return { allowed: true, type: "MessageFlow" };
  }

  // 7. Стандартный поток
  return { allowed: true, type: "SequenceFlow" };
}

// ── canDisconnect ────────────────────────────────────────────────────────────

/**
 * Всегда разрешает удаление соединения, если оно существует.
 * Расширяемо: можно добавить защиту обязательных потоков.
 */
export function canDisconnect(connectionId: string, connections: Map<string, import("./types").ConnectionBO>): CanConnectResult {
  if (!connections.has(connectionId)) {
    return { allowed: false, reason: "Соединение не найдено" };
  }
  return { allowed: true, type: "SequenceFlow" }; // тип не используется при удалении
}
