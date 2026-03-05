/**
 * bpmn/types.ts
 * =============
 * Business-Object layer — обёртки над ProcessBlock с полноценными
 * refs sourceRef / targetRef / incoming / outgoing в стиле bpmn-js.
 */

import type { BlockType } from "@shared/types";

// ── Connection types ─────────────────────────────────────────────────────────

/** Тип потока в терминах BPMN 2.0 */
export type ConnectionType =
  | "SequenceFlow"   // внутри одного пула (одна роль / процесс)
  | "MessageFlow"    // между разными пулами (разные роли/процессы)
  | "DataAssociation"// связь с объектом данных (тип блока 'product')
  | "Association";   // нотационная ассоциация (комментарий и т.п.)

// ── Business Objects ─────────────────────────────────────────────────────────

/**
 * Бизнес-объект блока: расширяет ProcessBlock живыми ссылками
 * на входящие и исходящие соединения.
 */
export interface ProcessBlockBO {
  /** Идентификатор (совпадает с ProcessBlock.id) */
  id: string;
  name: string;
  type: BlockType;
  /** Идентификатор роли / пула */
  role: string;
  /** Входящие соединения */
  incoming: ConnectionBO[];
  /** Исходящие соединения */
  outgoing: ConnectionBO[];
}

/**
 * Бизнес-объект соединения: хранит живые ссылки на оба конца.
 * Соответствует sequenceFlow / messageFlow из спецификации BPMN 2.0.
 */
export interface ConnectionBO {
  id: string;
  type: ConnectionType;
  sourceRef: ProcessBlockBO;
  targetRef: ProcessBlockBO;
  conditionLabel?: string;
}

// ── Command interface ────────────────────────────────────────────────────────

/**
 * Атомарная команда, поддерживающая отмену.
 */
export interface BpmnCommand {
  /** Выполнить команду */
  execute(): void;
  /** Отменить команду */
  revert(): void;
}

// ── Context (returned by factory) ───────────────────────────────────────────

export interface BpmnContext {
  /** Индекс блоков по id */
  blocks: Map<string, ProcessBlockBO>;
  /** Индекс соединений по id */
  connections: Map<string, ConnectionBO>;
}
