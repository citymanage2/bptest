/**
 * bpmn/CommandStack.ts
 * ====================
 * Layer 3 — Стек команд (undo / redo).
 *
 * Хранит историю выполненных команд и поддерживает отмену / повтор
 * в стиле Command Pattern (GoF).
 *
 * Каждый обработчик зарегистрирован под строковым ключом и возвращает
 * пару { execute, revert } для конкретного контекста.
 */

import type { BpmnCommand } from "./types";

// ── Handler registry ─────────────────────────────────────────────────────────

type CommandHandler<TContext> = (ctx: TContext) => BpmnCommand;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, CommandHandler<any>>();

/**
 * Регистрирует обработчик под именем `name`.
 * Вызывается один раз при инициализации модуля.
 */
export function registerHandler<TContext>(
  name: string,
  handler: CommandHandler<TContext>,
): void {
  registry.set(name, handler);
}

// ── CommandStack class ───────────────────────────────────────────────────────

const MAX_HISTORY = 50;

export class CommandStack {
  private undoStack: BpmnCommand[] = [];
  private redoStack: BpmnCommand[] = [];

  /** Количество отменяемых шагов */
  get undoSize(): number {
    return this.undoStack.length;
  }

  /** Количество повторяемых шагов */
  get redoSize(): number {
    return this.redoStack.length;
  }

  /**
   * Выполняет именованную команду с переданным контекстом.
   * Команда помещается в стек undo; стек redo очищается.
   */
  execute<TContext>(name: string, ctx: TContext): void {
    const handler = registry.get(name);
    if (!handler) {
      throw new Error(`CommandStack: обработчик '${name}' не зарегистрирован`);
    }
    const cmd = handler(ctx);
    cmd.execute();
    this.undoStack = [...this.undoStack.slice(-(MAX_HISTORY - 1)), cmd];
    this.redoStack = [];
  }

  /**
   * Выполняет команду, созданную вне реестра (например, составная).
   * Также помещает её в стек undo.
   */
  executeRaw(cmd: BpmnCommand): void {
    cmd.execute();
    this.undoStack = [...this.undoStack.slice(-(MAX_HISTORY - 1)), cmd];
    this.redoStack = [];
  }

  /** Отменяет последнюю команду */
  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.revert();
    this.redoStack.push(cmd);
  }

  /** Повторяет последнюю отменённую команду */
  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
  }

  /** Полная очистка истории */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
