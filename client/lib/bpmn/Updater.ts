/**
 * bpmn/Updater.ts
 * ===============
 * Layer 4 — Синхронизация ссылок BusinessObject.
 *
 * Единственная зона ответственности: поддерживать актуальность
 * массивов incoming / outgoing на ProcessBlockBO при любом изменении
 * ConnectionBO.
 */

import type { ConnectionBO, ProcessBlockBO } from "./types";

/**
 * Регистрирует соединение в массивах incoming/outgoing обоих концов.
 * Идемпотентна: повторный вызов с тем же соединением не создаёт дублей.
 */
export function addConnectionRefs(conn: ConnectionBO): void {
  const { sourceRef, targetRef } = conn;

  if (!sourceRef.outgoing.includes(conn)) {
    sourceRef.outgoing.push(conn);
  }

  if (!targetRef.incoming.includes(conn)) {
    targetRef.incoming.push(conn);
  }
}

/**
 * Удаляет соединение из массивов incoming/outgoing обоих концов.
 * Безопасна, если соединение уже отсутствует.
 */
export function removeConnectionRefs(conn: ConnectionBO): void {
  const { sourceRef, targetRef } = conn;

  sourceRef.outgoing = sourceRef.outgoing.filter((c) => c !== conn);
  targetRef.incoming = targetRef.incoming.filter((c) => c !== conn);
}

/**
 * Перемещает соединение на новый источник.
 * Используется при перетаскивании конца стрелки.
 */
export function reconnectSource(
  conn: ConnectionBO,
  newSource: ProcessBlockBO,
): void {
  removeConnectionRefs(conn);
  conn.sourceRef = newSource;
  addConnectionRefs(conn);
}

/**
 * Перемещает соединение на новую цель.
 * Используется при перетаскивании конца стрелки.
 */
export function reconnectTarget(
  conn: ConnectionBO,
  newTarget: ProcessBlockBO,
): void {
  removeConnectionRefs(conn);
  conn.targetRef = newTarget;
  addConnectionRefs(conn);
}
