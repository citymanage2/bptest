/**
 * bpmn/index.ts
 * =============
 * Фабрика: принимает ProcessData → возвращает Modeling + CommandStack,
 * готовые к использованию.
 *
 * Использование:
 *   const { modeling, commandStack } = createBpmnContext(data);
 *   modeling.connect("blockA", "blockB");
 *   commandStack.undo();
 *   const connectionsMap = modeling.serializeConnections();
 */

import type { ProcessData, ProcessBlock } from "@shared/types";
import type { BpmnContext, ProcessBlockBO, ConnectionBO } from "./types";
import { addConnectionRefs } from "./Updater";
import { CommandStack } from "./CommandStack";
import { Modeling } from "./Modeling";
import { v4 as uuidv4 } from "uuid";

export { Modeling } from "./Modeling";
export { CommandStack } from "./CommandStack";
export { canConnect } from "./ConnectionRules";
export type {
  ConnectionBO,
  ProcessBlockBO,
  ConnectionType,
  BpmnContext,
  BpmnCommand,
} from "./types";

// ── Factory ──────────────────────────────────────────────────────────────────

export interface BpmnSession {
  modeling: Modeling;
  commandStack: CommandStack;
  /** Прямой доступ к картам для чтения */
  ctx: BpmnContext;
}

/**
 * Создаёт BPMN-сессию из `ProcessData`.
 *
 * 1. Строит ProcessBlockBO для каждого блока.
 * 2. Строит ConnectionBO для каждой пары (block → connId)
 *    из массивов `block.connections`.
 * 3. Синхронизирует incoming/outgoing через Updater.
 */
export function createBpmnContext(data: ProcessData): BpmnSession {
  const ctx: BpmnContext = {
    blocks: new Map(),
    connections: new Map(),
  };

  // Pass 1: создать все BO-блоки без соединений
  for (const block of data.blocks) {
    const bo: ProcessBlockBO = {
      id: block.id,
      name: block.name,
      type: block.type,
      role: block.role,
      incoming: [],
      outgoing: [],
    };
    ctx.blocks.set(block.id, bo);
  }

  // Pass 2: создать соединения из connections[]
  for (const block of data.blocks) {
    const sourceBO = ctx.blocks.get(block.id);
    if (!sourceBO) continue;

    for (const targetId of block.connections) {
      const targetBO = ctx.blocks.get(targetId);
      if (!targetBO) continue;

      // Определить тип потока по правилам
      const type = resolveConnectionType(sourceBO, targetBO);

      const conn: ConnectionBO = {
        id: uuidv4(),
        type,
        sourceRef: sourceBO,
        targetRef: targetBO,
        conditionLabel: findConditionLabel(data.blocks, block.id, targetId),
      };

      ctx.connections.set(conn.id, conn);
      addConnectionRefs(conn);
    }
  }

  const commandStack = new CommandStack();
  const modeling = new Modeling(ctx, commandStack);

  return { modeling, commandStack, ctx };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { ConnectionType } from "./types";

function resolveConnectionType(
  source: ProcessBlockBO,
  target: ProcessBlockBO,
): ConnectionType {
  if (source.type === "product" || target.type === "product") {
    return "DataAssociation";
  }
  if (source.role !== target.role) {
    return "MessageFlow";
  }
  return "SequenceFlow";
}

function findConditionLabel(
  blocks: ProcessBlock[],
  _sourceId: string,
  targetId: string,
): string | undefined {
  const targetBlock = blocks.find((b) => b.id === targetId);
  return targetBlock?.conditionLabel;
}
