/**
 * __tests__/connections.test.ts
 * =============================
 * Тесты полного флоу BPMN-соединений.
 *
 * Запуск: npx tsx client/lib/bpmn/__tests__/connections.test.ts
 *
 * Проверяет:
 *   1. StartEvent → Task → Gateway → EndEvent
 *      (sourceRef, targetRef, incoming, outgoing)
 *   2. Правила: самосвязь, EndEvent как источник, StartEvent как цель,
 *      дублирование соединений
 *   3. Undo / Redo
 *   4. splitFlow (drop-on-flow)
 *   5. serializeConnections → обратно в ProcessBlock.connections[]
 */

import { createBpmnContext } from "../index";
import { canConnect } from "../ConnectionRules";
import type { ProcessData } from "../../../../shared/types";

// ── Minimal ProcessData fixture ───────────────────────────────────────────────

const BLK = (id: string, name: string, type: ProcessData["blocks"][0]["type"], role: string) => ({
  id, name, type, role, description: "", stage: "", connections: [] as string[],
});

const FIXTURE: ProcessData = {
  blocks: [
    BLK("s1", "Старт",  "start",    "manager"),
    BLK("t1", "Задача", "action",   "manager"),
    BLK("g1", "Шлюз",  "decision", "manager"),
    BLK("e1", "Конец",  "end",      "manager"),
  ],
  roles: [{ id: "r1", name: "Менеджер", color: "#3b82f6", description: "" }],
  stages: [],
  name: "Test process",
  goal: "",
  owner: "",
  startEvent: "s1",
  endEvent: "e1",
};

// ── Tiny assertion helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
  );
}

function suite(name: string, fn: () => void): void {
  console.log(`\n▶ ${name}`);
  fn();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite("canConnect — правила", () => {
  const { ctx } = createBpmnContext(FIXTURE);
  const s1 = ctx.blocks.get("s1")!;
  const t1 = ctx.blocks.get("t1")!;
  const g1 = ctx.blocks.get("g1")!;
  const e1 = ctx.blocks.get("e1")!;

  const r1 = canConnect(s1, s1);
  assert(!r1.allowed, "самосвязь запрещена");

  const r2 = canConnect(e1, t1);
  assert(!r2.allowed, "EndEvent не может быть источником");

  const r3 = canConnect(t1, s1);
  assert(!r3.allowed, "StartEvent не может быть целью");

  const r4 = canConnect(s1, t1);
  assert(r4.allowed, "StartEvent → Task разрешено");
  if (r4.allowed) assertEquals(r4.type, "SequenceFlow", "тип — SequenceFlow");

  const r5 = canConnect(g1, e1);
  assert(r5.allowed, "Gateway → EndEvent разрешено");
});

suite("Полный флоу: StartEvent → Task → Gateway → EndEvent", () => {
  const { modeling, ctx } = createBpmnContext(FIXTURE);

  // Строим цепочку
  const c1 = modeling.connect("s1", "t1")!;
  const c2 = modeling.connect("t1", "g1")!;
  const c3 = modeling.connect("g1", "e1")!;

  assert(!!c1, "s1 → t1 создано");
  assert(!!c2, "t1 → g1 создано");
  assert(!!c3, "g1 → e1 создано");

  // Проверить sourceRef / targetRef
  assertEquals(c1.sourceRef.id, "s1", "c1.sourceRef = s1");
  assertEquals(c1.targetRef.id, "t1", "c1.targetRef = t1");
  assertEquals(c2.sourceRef.id, "t1", "c2.sourceRef = t1");
  assertEquals(c2.targetRef.id, "g1", "c2.targetRef = g1");
  assertEquals(c3.sourceRef.id, "g1", "c3.sourceRef = g1");
  assertEquals(c3.targetRef.id, "e1", "c3.targetRef = e1");

  // Проверить incoming / outgoing
  const s1 = ctx.blocks.get("s1")!;
  const t1 = ctx.blocks.get("t1")!;
  const g1 = ctx.blocks.get("g1")!;
  const e1 = ctx.blocks.get("e1")!;

  assertEquals(s1.incoming.length, 0, "s1.incoming пуст");
  assertEquals(s1.outgoing.length, 1, "s1.outgoing = 1");
  assertEquals(s1.outgoing[0].id, c1.id, "s1.outgoing[0] = c1");

  assertEquals(t1.incoming.length, 1, "t1.incoming = 1");
  assertEquals(t1.incoming[0].id, c1.id, "t1.incoming[0] = c1");
  assertEquals(t1.outgoing.length, 1, "t1.outgoing = 1");
  assertEquals(t1.outgoing[0].id, c2.id, "t1.outgoing[0] = c2");

  assertEquals(g1.incoming.length, 1, "g1.incoming = 1");
  assertEquals(g1.outgoing.length, 1, "g1.outgoing = 1");

  assertEquals(e1.incoming.length, 1, "e1.incoming = 1");
  assertEquals(e1.outgoing.length, 0, "e1.outgoing пуст");
});

suite("Дублирующие соединения", () => {
  const { modeling } = createBpmnContext(FIXTURE);
  modeling.connect("s1", "t1");
  const dup = modeling.connect("s1", "t1");
  assert(dup === null, "дублирующее соединение возвращает null");
});

suite("disconnect", () => {
  const { modeling, ctx } = createBpmnContext(FIXTURE);
  const conn = modeling.connect("s1", "t1")!;
  const s1 = ctx.blocks.get("s1")!;
  const t1 = ctx.blocks.get("t1")!;

  modeling.disconnect(conn.id);

  assertEquals(s1.outgoing.length, 0, "s1.outgoing пуст после disconnect");
  assertEquals(t1.incoming.length, 0, "t1.incoming пуст после disconnect");
  assert(!ctx.connections.has(conn.id), "соединение удалено из ctx");
});

suite("Undo / Redo", () => {
  const { modeling, commandStack, ctx } = createBpmnContext(FIXTURE);
  const s1 = ctx.blocks.get("s1")!;
  const t1 = ctx.blocks.get("t1")!;

  modeling.connect("s1", "t1");
  assertEquals(s1.outgoing.length, 1, "после connect outgoing = 1");

  commandStack.undo();
  assertEquals(s1.outgoing.length, 0, "после undo outgoing = 0");
  assertEquals(t1.incoming.length, 0, "после undo incoming = 0");

  commandStack.redo();
  assertEquals(s1.outgoing.length, 1, "после redo outgoing = 1");
  assertEquals(t1.incoming.length, 1, "после redo incoming = 1");
});

suite("splitFlow (drop-on-flow)", () => {
  const data: ProcessData = {
    ...FIXTURE,
    blocks: [
      BLK("s1", "Старт",  "start",  "r1"),
      BLK("t1", "Задача", "action", "r1"),
      BLK("e1", "Конец",  "end",    "r1"),
      BLK("n1", "Новый",  "action", "r1"),
    ],
  };
  const { modeling, commandStack, ctx } = createBpmnContext(data);

  // s1 → e1 (прямое соединение)
  const original = modeling.connect("s1", "e1")!;
  assert(!!original, "исходное соединение создано");

  // Вставить n1 в середину: s1 → n1 → e1
  const parts = modeling.splitFlow(original.id, "n1");
  assert(parts !== null, "splitFlow вернул результат");

  if (parts) {
    const [c1, c2] = parts;
    assertEquals(c1.sourceRef.id, "s1", "c1.source = s1");
    assertEquals(c1.targetRef.id, "n1", "c1.target = n1");
    assertEquals(c2.sourceRef.id, "n1", "c2.source = n1");
    assertEquals(c2.targetRef.id, "e1", "c2.target = e1");

    // Оригинальное соединение должно быть удалено
    assert(!ctx.connections.has(original.id), "оригинальное соединение удалено");

    const n1 = ctx.blocks.get("n1")!;
    assertEquals(n1.incoming.length, 1, "n1.incoming = 1");
    assertEquals(n1.outgoing.length, 1, "n1.outgoing = 1");

    // Undo splitFlow
    commandStack.undo();
    assert(ctx.connections.has(original.id), "после undo оригинал восстановлен");
    assertEquals(n1.incoming.length, 0, "после undo n1.incoming = 0");
    assertEquals(n1.outgoing.length, 0, "после undo n1.outgoing = 0");
  }
});

suite("serializeConnections", () => {
  const { modeling } = createBpmnContext(FIXTURE);
  modeling.connect("s1", "t1");
  modeling.connect("t1", "g1");
  modeling.connect("g1", "e1");

  const map = modeling.serializeConnections();
  assertEquals(map.get("s1"), ["t1"], "s1 → [t1]");
  assertEquals(map.get("t1"), ["g1"], "t1 → [g1]");
  assertEquals(map.get("g1"), ["e1"], "g1 → [e1]");
  assertEquals(map.get("e1"), [], "e1 → []");
});

suite("MessageFlow (разные роли)", () => {
  const data: ProcessData = {
    ...FIXTURE,
    blocks: [
      BLK("a1", "A", "action", "sales"),
      BLK("b1", "B", "action", "support"),
    ],
  };
  const { modeling } = createBpmnContext(data);
  const conn = modeling.connect("a1", "b1");
  assert(!!conn, "соединение между разными ролями создано");
  if (conn) assertEquals(conn.type, "MessageFlow", "тип — MessageFlow");
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Результат: ${passed} ✓  ${failed} ✗`);
if (failed > 0) process.exit(1);
