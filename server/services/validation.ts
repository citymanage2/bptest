import type { ProcessData, QualityCheckItem, QualityCheckResult } from "../../shared/types";

export function validateProcess(data: ProcessData): QualityCheckResult {
  const items: QualityCheckItem[] = [];
  let checkId = 0;
  const id = () => `check_${++checkId}`;

  const blockMap = new Map(data.blocks.map(b => [b.id, b]));
  const allTargetIds = new Set(data.blocks.flatMap(b => b.connections));

  // ═══════════════════════════════════
  // 1. LOGICAL COMPLETENESS
  // ═══════════════════════════════════

  // Check: has start block
  const startBlocks = data.blocks.filter(b => b.type === "start");
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Процесс имеет стартовый блок",
    passed: startBlocks.length > 0,
    details: startBlocks.length > 0 ? `Найдено start-блоков: ${startBlocks.length}` : "Нет блока start!",
    severity: "error",
  });

  // Check: has end block
  const endBlocks = data.blocks.filter(b => b.type === "end");
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Процесс имеет конечный блок",
    passed: endBlocks.length > 0,
    details: endBlocks.length > 0 ? `Найдено end-блоков: ${endBlocks.length}` : "Нет блока end!",
    severity: "error",
  });

  // Check: no dangling flows (blocks not reachable from start)
  const reachable = new Set<string>();
  function traverse(blockId: string) {
    if (reachable.has(blockId)) return;
    reachable.add(blockId);
    const block = blockMap.get(blockId);
    if (block) block.connections.forEach(c => traverse(c));
  }
  startBlocks.forEach(s => traverse(s.id));

  const unreachable = data.blocks.filter(b => !reachable.has(b.id));
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Все блоки достижимы от start",
    passed: unreachable.length === 0,
    details: unreachable.length === 0
      ? "Все блоки связаны"
      : `Недостижимые блоки: ${unreachable.map(b => b.name).join(", ")}`,
    severity: "error",
  });

  // Check: end blocks have no outgoing connections
  const endWithConnections = endBlocks.filter(b => b.connections.length > 0);
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "End-блоки не имеют исходящих связей",
    passed: endWithConnections.length === 0,
    details: endWithConnections.length === 0
      ? "Все end-блоки корректны"
      : `End-блоки с исходящими: ${endWithConnections.map(b => b.name).join(", ")}`,
    severity: "error",
  });

  // Check: non-end blocks have connections (no dead ends)
  const deadEnds = data.blocks.filter(b => b.type !== "end" && b.connections.length === 0);
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Нет «мёртвых» концов (блоки без исходящих кроме end)",
    passed: deadEnds.length === 0,
    details: deadEnds.length === 0
      ? "Все блоки имеют продолжение"
      : `Тупики: ${deadEnds.map(b => b.name).join(", ")}`,
    severity: "error",
  });

  // Check: connections reference existing blocks
  const brokenConnections: string[] = [];
  for (const block of data.blocks) {
    for (const targetId of block.connections) {
      if (!blockMap.has(targetId)) {
        brokenConnections.push(`${block.name} → ${targetId}`);
      }
    }
  }
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Все связи ссылаются на существующие блоки",
    passed: brokenConnections.length === 0,
    details: brokenConnections.length === 0
      ? "Все связи корректны"
      : `Битые связи: ${brokenConnections.join("; ")}`,
    severity: "error",
  });

  // ═══════════════════════════════════
  // 2. GATEWAYS AND CONDITIONS
  // ═══════════════════════════════════

  const decisionBlocks = data.blocks.filter(b => b.type === "decision");

  // Check: decisions have 2+ outgoing connections
  const badDecisions = decisionBlocks.filter(b => b.connections.length < 2);
  items.push({
    id: id(),
    category: "Гейтвеи и условия",
    rule: "Decision-блоки имеют 2+ исходящих ветви",
    passed: badDecisions.length === 0,
    details: badDecisions.length === 0
      ? `${decisionBlocks.length} decision-блоков корректны`
      : `Неполные: ${badDecisions.map(b => b.name).join(", ")}`,
    severity: "error",
  });

  // Check: decision branches have condition labels
  for (const dec of decisionBlocks) {
    const targets = dec.connections.map(c => blockMap.get(c)).filter(Boolean);
    const unlabeled = targets.filter(t => !t!.conditionLabel && !t!.isDefault);
    items.push({
      id: id(),
      category: "Гейтвеи и условия",
      rule: `Ветви "${dec.name}" подписаны условиями`,
      passed: unlabeled.length === 0,
      details: unlabeled.length === 0
        ? "Все ветви подписаны"
        : `Без подписи: ${unlabeled.map(b => b!.name).join(", ")}`,
      severity: "warning",
    });
  }

  // Check: at least one default branch per decision
  for (const dec of decisionBlocks) {
    const targets = dec.connections.map(c => blockMap.get(c)).filter(Boolean);
    const hasDefault = targets.some(t => t!.isDefault);
    items.push({
      id: id(),
      category: "Гейтвеи и условия",
      rule: `"${dec.name}" имеет ветвь по умолчанию`,
      passed: hasDefault,
      details: hasDefault ? "isDefault ветвь найдена" : "Нет ветви по умолчанию",
      severity: "warning",
    });
  }

  // ═══════════════════════════════════
  // 3. ROLES AND HANDOFFS
  // ═══════════════════════════════════

  // Check: no empty lanes
  const rolesWithBlocks = new Set(data.blocks.map(b => b.role));
  const emptyRoles = data.roles.filter(r => !rolesWithBlocks.has(r.id));
  items.push({
    id: id(),
    category: "Роли и handoffs",
    rule: "Нет пустых дорожек (все роли имеют блоки)",
    passed: emptyRoles.length === 0,
    details: emptyRoles.length === 0
      ? `${data.roles.length} ролей, все используются`
      : `Пустые: ${emptyRoles.map(r => r.name).join(", ")}`,
    severity: "warning",
  });

  // Check: handoffs between roles (connections crossing lanes)
  let handoffCount = 0;
  for (const block of data.blocks) {
    for (const targetId of block.connections) {
      const target = blockMap.get(targetId);
      if (target && target.role !== block.role) handoffCount++;
    }
  }
  items.push({
    id: id(),
    category: "Роли и handoffs",
    rule: "Процесс перетекает между ролями (handoffs ≥ 5)",
    passed: handoffCount >= 5,
    details: `Handoffs: ${handoffCount}`,
    severity: handoffCount >= 3 ? "info" : "warning",
  });

  // Check: minimum roles
  items.push({
    id: id(),
    category: "Роли и handoffs",
    rule: "Минимум 3 роли в процессе",
    passed: data.roles.length >= 3,
    details: `Ролей: ${data.roles.length}`,
    severity: data.roles.length >= 2 ? "info" : "warning",
  });

  // ═══════════════════════════════════
  // 4. READABILITY
  // ═══════════════════════════════════

  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Количество блоков ≤ 50 на уровне (не перегружено)",
    passed: data.blocks.length <= 50,
    details: `Блоков: ${data.blocks.length}`,
    severity: "info",
  });

  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Минимум 3 этапа для структуры",
    passed: data.stages.length >= 3,
    details: `Этапов: ${data.stages.length}`,
    severity: "warning",
  });

  // Check: blocks have descriptions
  const noDesc = data.blocks.filter(b => !b.description || b.description.length < 5);
  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Блоки имеют описания",
    passed: noDesc.length === 0,
    details: noDesc.length === 0
      ? "Все блоки описаны"
      : `Без описания: ${noDesc.length} блоков`,
    severity: "info",
  });

  // ═══════════════════════════════════
  // 5. DATA AND DOCUMENTS
  // ═══════════════════════════════════

  const actionBlocks = data.blocks.filter(b => b.type === "action");

  // Check: actions have documents
  const noInputDocs = actionBlocks.filter(b => !b.inputDocuments || b.inputDocuments.length === 0);
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки имеют входные документы",
    passed: noInputDocs.length <= actionBlocks.length * 0.3,
    details: `Без входных документов: ${noInputDocs.length} из ${actionBlocks.length}`,
    severity: "info",
  });

  // Check: actions have systems
  const noSystems = actionBlocks.filter(b => !b.infoSystems || b.infoSystems.length === 0);
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки указывают информационные системы",
    passed: noSystems.length <= actionBlocks.length * 0.3,
    details: `Без систем: ${noSystems.length} из ${actionBlocks.length}`,
    severity: "info",
  });

  // Check: actions have time estimates
  const noTime = actionBlocks.filter(b => !b.timeEstimate);
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки имеют оценку времени",
    passed: noTime.length <= actionBlocks.length * 0.3,
    details: `Без timeEstimate: ${noTime.length} из ${actionBlocks.length}`,
    severity: "info",
  });

  // ═══════════════════════════════════
  // 6. PROCESS VALUE (BMC alignment)
  // ═══════════════════════════════════

  // Check: has product blocks (intermediate results)
  const productBlocks = data.blocks.filter(b => b.type === "product");
  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Есть промежуточные результаты (product-блоки)",
    passed: productBlocks.length >= 2,
    details: `Product-блоков: ${productBlocks.length}`,
    severity: "warning",
  });

  // Check: has decision points (process is not just linear)
  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Есть точки принятия решений (decision-блоки)",
    passed: decisionBlocks.length >= 1,
    details: `Decision-блоков: ${decisionBlocks.length}`,
    severity: "warning",
  });

  // Check: goal is set
  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Цель процесса указана",
    passed: Boolean(data.goal && data.goal.length > 3),
    details: data.goal || "Не указана",
    severity: "warning",
  });

  // ═══════════════════════════════════
  // 7. AUTOMATION POTENTIAL
  // ═══════════════════════════════════

  const allSystems = new Set(data.blocks.flatMap(b => b.infoSystems || []));
  items.push({
    id: id(),
    category: "Потенциал автоматизации",
    rule: "Информационные системы указаны в процессе",
    passed: allSystems.size >= 2,
    details: `Систем: ${allSystems.size} (${Array.from(allSystems).join(", ")})`,
    severity: "info",
  });

  // Calculate score
  const errors = items.filter(i => !i.passed && i.severity === "error");
  const warnings = items.filter(i => !i.passed && i.severity === "warning");
  const total = items.length;
  const passed = items.filter(i => i.passed).length;
  const score = Math.round((passed / total) * 100 - errors.length * 5 - warnings.length * 2);

  const summary = errors.length > 0
    ? `Найдено ${errors.length} критических ошибок. Необходима доработка.`
    : warnings.length > 0
      ? `Процесс корректен. ${warnings.length} рекомендаций к улучшению.`
      : "Процесс полностью соответствует стандартам BPMN.";

  return {
    score: Math.max(0, Math.min(100, score)),
    items,
    summary,
  };
}
