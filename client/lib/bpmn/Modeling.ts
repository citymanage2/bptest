/**
 * bpmn/Modeling.ts
 * ================
 * Layer 2 — Точка входа для всех операций изменения модели.
 *
 * Методы этого класса:
 *  • проверяют правила (Layer 1, ConnectionRules)
 *  • регистрируют команды (Layer 3, CommandStack)
 *  • обновляют businessObject-ссылки (Layer 4, Updater)
 *
 * После каждого изменения вызывается `onChange` — колбэк для
 * синхронизации состояния ProcessData (массивы connections[]).
 */

import { v4 as uuidv4 } from "uuid";
import { canConnect, canDisconnect } from "./ConnectionRules";
import { CommandStack } from "./CommandStack";
import { addConnectionRefs, removeConnectionRefs } from "./Updater";
import type {
  ProcessBlockBO,
  ConnectionBO,
  ConnectionType,
  BpmnContext,
} from "./types";

// ── Modeling class ───────────────────────────────────────────────────────────

export class Modeling {
  private commandStack: CommandStack;
  private ctx: BpmnContext;

  /**
   * @param ctx     Контекст BpmnContext (blocks + connections maps)
   * @param cmdStack Общий стек команд (может быть один на весь процесс)
   */
  constructor(ctx: BpmnContext, cmdStack: CommandStack) {
    this.ctx = ctx;
    this.commandStack = cmdStack;
  }

  // ── connect ────────────────────────────────────────────────────────────────

  /**
   * Создаёт соединение между двумя блоками.
   *
   * @param sourceId   ID блока-источника
   * @param targetId   ID блока-цели
   * @param attrs      Дополнительные атрибуты (conditionLabel и т.п.)
   * @returns          Созданный ConnectionBO или null, если правило запрещает
   */
  connect(
    sourceId: string,
    targetId: string,
    attrs?: Partial<Pick<ConnectionBO, "conditionLabel" | "type">>,
  ): ConnectionBO | null {
    const source = this.ctx.blocks.get(sourceId);
    const target = this.ctx.blocks.get(targetId);

    if (!source || !target) return null;

    const result = canConnect(source, target);
    if (!result.allowed) {
      console.warn(`[Modeling.connect] ${result.reason}`);
      return null;
    }

    const connType: ConnectionType = attrs?.type ?? result.type;
    const conn: ConnectionBO = {
      id: uuidv4(),
      type: connType,
      sourceRef: source,
      targetRef: target,
      conditionLabel: attrs?.conditionLabel,
    };

    const { ctx } = this;
    this.commandStack.executeRaw({
      execute() {
        ctx.connections.set(conn.id, conn);
        addConnectionRefs(conn);
      },
      revert() {
        ctx.connections.delete(conn.id);
        removeConnectionRefs(conn);
      },
    });

    return conn;
  }

  // ── disconnect ─────────────────────────────────────────────────────────────

  /**
   * Удаляет соединение по его ID.
   *
   * @returns true если удалено, false если не найдено или запрещено
   */
  disconnect(connectionId: string): boolean {
    const result = canDisconnect(connectionId, this.ctx.connections);
    if (!result.allowed) {
      console.warn(`[Modeling.disconnect] ${result.reason}`);
      return false;
    }

    const conn = this.ctx.connections.get(connectionId)!;
    const { ctx } = this;

    this.commandStack.executeRaw({
      execute() {
        ctx.connections.delete(conn.id);
        removeConnectionRefs(conn);
      },
      revert() {
        ctx.connections.set(conn.id, conn);
        addConnectionRefs(conn);
      },
    });

    return true;
  }

  /**
   * Удаляет все соединения между двумя конкретными блоками.
   * Удобно для UI: «убрать связь A → B».
   */
  disconnectByEndpoints(sourceId: string, targetId: string): boolean {
    const toRemove: string[] = [];
    for (const [id, conn] of this.ctx.connections) {
      if (conn.sourceRef.id === sourceId && conn.targetRef.id === targetId) {
        toRemove.push(id);
      }
    }
    if (toRemove.length === 0) return false;
    toRemove.forEach((id) => this.disconnect(id));
    return true;
  }

  // ── splitFlow (drop-on-flow) ───────────────────────────────────────────────

  /**
   * Разбивает существующее соединение, вставляя `newBlockId` в середину:
   *   source ──conn──► target
   * превращается в:
   *   source ──conn1──► newBlock ──conn2──► target
   *
   * Используется при перетаскивании блока на стрелку (drop-on-flow).
   *
   * @returns [conn1, conn2] или null если операция недопустима
   */
  splitFlow(
    connectionId: string,
    newBlockId: string,
  ): [ConnectionBO, ConnectionBO] | null {
    const original = this.ctx.connections.get(connectionId);
    const newBlock = this.ctx.blocks.get(newBlockId);

    if (!original || !newBlock) return null;

    const source = original.sourceRef;
    const target = original.targetRef;

    // Проверить, что оба новых соединения допустимы
    const r1 = canConnect(source, newBlock);
    const r2 = canConnect(newBlock, target);
    if (!r1.allowed || !r2.allowed) {
      const reason = !r1.allowed ? r1.reason : (!r2.allowed ? r2.reason : "");
      console.warn(`[Modeling.splitFlow] Недопустимое разбиение: ${reason}`);
      return null;
    }

    const conn1: ConnectionBO = {
      id: uuidv4(),
      type: r1.type,
      sourceRef: source,
      targetRef: newBlock,
      conditionLabel: original.conditionLabel,
    };

    const conn2: ConnectionBO = {
      id: uuidv4(),
      type: r2.type,
      sourceRef: newBlock,
      targetRef: target,
    };

    const { ctx } = this;

    this.commandStack.executeRaw({
      execute() {
        // Удалить оригинальное соединение
        ctx.connections.delete(original.id);
        removeConnectionRefs(original);
        // Добавить два новых
        ctx.connections.set(conn1.id, conn1);
        addConnectionRefs(conn1);
        ctx.connections.set(conn2.id, conn2);
        addConnectionRefs(conn2);
      },
      revert() {
        // Восстановить оригинал
        ctx.connections.set(original.id, original);
        addConnectionRefs(original);
        // Удалить два новых
        ctx.connections.delete(conn1.id);
        removeConnectionRefs(conn1);
        ctx.connections.delete(conn2.id);
        removeConnectionRefs(conn2);
      },
    });

    return [conn1, conn2];
  }

  // ── serialize ──────────────────────────────────────────────────────────────

  /**
   * Сериализует текущее состояние соединений обратно в формат
   * `ProcessBlock.connections: string[]` для сохранения в БД.
   *
   * @returns Map<blockId, targetIds[]>
   */
  serializeConnections(): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const block of this.ctx.blocks.values()) {
      result.set(
        block.id,
        block.outgoing.map((c) => c.targetRef.id),
      );
    }

    return result;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  get commandStackRef(): CommandStack {
    return this.commandStack;
  }
}
