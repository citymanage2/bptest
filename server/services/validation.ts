import type { ProcessData, QualityCheckItem, QualityCheckResult } from "../../shared/types";

export function validateProcess(data: ProcessData): QualityCheckResult {
  const items: QualityCheckItem[] = [];
  let checkId = 0;
  const id = () => `check_${++checkId}`;

  const blockMap = new Map(data.blocks.map(b => [b.id, b]));

  // ═══════════════════════════════════
  // 1. LOGICAL COMPLETENESS
  // ═══════════════════════════════════

  const startBlocks = data.blocks.filter(b => b.type === "start");
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Процесс имеет стартовый блок",
    passed: startBlocks.length > 0,
    details: startBlocks.length > 0
      ? `Найдено ${startBlocks.length} start-блок(а). Начало процесса определено корректно.`
      : "Стартовый блок отсутствует. Без него невозможно определить точку входа в процесс.",
    howToFix: startBlocks.length === 0
      ? "Добавьте блок типа «start» в начало диаграммы. Этот блок обозначает событие, которое инициирует процесс (например, «Получение заявки» или «Звонок клиента»)."
      : undefined,
    severity: "error",
  });

  const endBlocks = data.blocks.filter(b => b.type === "end");
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Процесс имеет конечный блок",
    passed: endBlocks.length > 0,
    details: endBlocks.length > 0
      ? `Найдено ${endBlocks.length} end-блок(а). Завершение процесса определено.`
      : "Конечный блок отсутствует. Без него процесс не имеет явного результата.",
    howToFix: endBlocks.length === 0
      ? "Добавьте блок типа «end» в конец каждой ветви процесса. Конечный блок фиксирует итог: «Сделка закрыта», «Заявка отклонена» и т.д."
      : undefined,
    severity: "error",
  });

  // Reachability from start
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
      ? "Все блоки связаны и достижимы из стартового блока."
      : `Недостижимые блоки (${unreachable.length}): ${unreachable.map(b => `«${b.name}»`).join(", ")}. Эти блоки изолированы от основного потока.`,
    howToFix: unreachable.length > 0
      ? `Проверьте, что блоки ${unreachable.map(b => `«${b.name}»`).join(", ")} подключены к схеме хотя бы одной входящей стрелкой. Возможно, пропущена связь от предыдущего блока.`
      : undefined,
    severity: "error",
  });

  // End blocks with outgoing connections
  const endWithConnections = endBlocks.filter(b => b.connections.length > 0);
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "End-блоки не имеют исходящих связей",
    passed: endWithConnections.length === 0,
    details: endWithConnections.length === 0
      ? "Все конечные блоки корректны — без лишних исходящих связей."
      : `End-блоки с исходящими связями: ${endWithConnections.map(b => `«${b.name}»`).join(", ")}. Это логическое противоречие: процесс не может продолжаться после завершения.`,
    howToFix: endWithConnections.length > 0
      ? `Удалите исходящие стрелки из блоков: ${endWithConnections.map(b => `«${b.name}»`).join(", ")}. Если после них действительно есть продолжение — замените тип блока с «end» на «action» или «product».`
      : undefined,
    severity: "error",
  });

  // Dead ends (non-end blocks with no connections)
  const deadEnds = data.blocks.filter(b => b.type !== "end" && b.connections.length === 0);
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Нет «мёртвых» концов (блоки без исходящих кроме end)",
    passed: deadEnds.length === 0,
    details: deadEnds.length === 0
      ? "Все блоки имеют продолжение — тупики отсутствуют."
      : `Тупики (${deadEnds.length}): ${deadEnds.map(b => `«${b.name}» (${b.type})`).join(", ")}. Эти блоки не ведут к следующему шагу и прерывают поток.`,
    howToFix: deadEnds.length > 0
      ? `Добавьте исходящие стрелки из блоков: ${deadEnds.map(b => `«${b.name}»`).join(", ")}. Каждый блок (кроме end) должен переходить к следующему действию или результату. Если это конечная точка — измените тип на «end».`
      : undefined,
    severity: "error",
  });

  // Broken connections
  const brokenConnections: string[] = [];
  for (const block of data.blocks) {
    for (const targetId of block.connections) {
      if (!blockMap.has(targetId)) {
        brokenConnections.push(`«${block.name}» → [удалённый блок ${targetId}]`);
      }
    }
  }
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Все связи ссылаются на существующие блоки",
    passed: brokenConnections.length === 0,
    details: brokenConnections.length === 0
      ? "Все связи между блоками корректны."
      : `Битые связи (${brokenConnections.length}): ${brokenConnections.join("; ")}. Эти стрелки ведут к несуществующим блокам.`,
    howToFix: brokenConnections.length > 0
      ? "Это обычно происходит после удаления блока. Найдите указанные связи на диаграмме и удалите их или перенаправьте к существующим блокам."
      : undefined,
    severity: "error",
  });

  // ═══════════════════════════════════
  // 2. GATEWAYS AND CONDITIONS
  // ═══════════════════════════════════

  const decisionBlocks = data.blocks.filter(b => b.type === "decision");

  const badDecisions = decisionBlocks.filter(b => b.connections.length < 2);
  items.push({
    id: id(),
    category: "Гейтвеи и условия",
    rule: "Decision-блоки имеют 2+ исходящих ветви",
    passed: badDecisions.length === 0,
    details: badDecisions.length === 0
      ? `Все ${decisionBlocks.length} decision-блоков имеют минимум 2 ветви.`
      : `Неполные decision-блоки (${badDecisions.length}): ${badDecisions.map(b => `«${b.name}» (${b.connections.length} ветвь)`).join(", ")}. Decision без развилки — это просто последовательный шаг, не требующий выбора.`,
    howToFix: badDecisions.length > 0
      ? `Добавьте минимум 2 исходящих стрелки к блокам: ${badDecisions.map(b => `«${b.name}»`).join(", ")}. Типичные ветви: «Да / Нет», «Одобрено / Отклонено», «Клиент согласен / Клиент отказался».`
      : undefined,
    severity: "error",
  });

  for (const dec of decisionBlocks) {
    const targets = dec.connections.map(c => blockMap.get(c)).filter(Boolean);
    const unlabeled = targets.filter(t => !t!.conditionLabel && !t!.isDefault);
    items.push({
      id: id(),
      category: "Гейтвеи и условия",
      rule: `Ветви «${dec.name}» подписаны условиями`,
      passed: unlabeled.length === 0,
      details: unlabeled.length === 0
        ? `Все ${targets.length} ветви блока «${dec.name}» имеют подписи условий.`
        : `Ветви без подписи (${unlabeled.length}): ${unlabeled.map(b => `«${b!.name}»`).join(", ")}. Без условий неясно, когда выбирается каждая ветвь.`,
      howToFix: unlabeled.length > 0
        ? `Откройте каждый блок (${unlabeled.map(b => `«${b!.name}»`).join(", ")}) и укажите «Метку условия» (conditionLabel) — краткое условие, при котором активируется эта ветвь. Пример: «Сумма > 100 000 руб.», «Согласовано», «Документы в порядке».`
        : undefined,
      severity: "warning",
    });
  }

  for (const dec of decisionBlocks) {
    const targets = dec.connections.map(c => blockMap.get(c)).filter(Boolean);
    const hasDefault = targets.some(t => t!.isDefault);
    items.push({
      id: id(),
      category: "Гейтвеи и условия",
      rule: `«${dec.name}» имеет ветвь по умолчанию`,
      passed: hasDefault,
      details: hasDefault
        ? `Ветвь по умолчанию для «${dec.name}» определена.`
        : `У блока «${dec.name}» нет ветви по умолчанию. При непредвиденных условиях процесс зависнет без чёткого продолжения.`,
      howToFix: !hasDefault
        ? `Выберите одну из ветвей блока «${dec.name}» и установите для неё флаг «По умолчанию» (isDefault). Ветвь по умолчанию активируется, если ни одно другое условие не выполнено. Как правило, это «базовый» или «стандартный» сценарий.`
        : undefined,
      severity: "warning",
    });
  }

  // ═══════════════════════════════════
  // 3. ROLES AND HANDOFFS
  // ═══════════════════════════════════

  const rolesWithBlocks = new Set(data.blocks.map(b => b.role));
  const emptyRoles = data.roles.filter(r => !rolesWithBlocks.has(r.id) && !rolesWithBlocks.has(r.name));
  items.push({
    id: id(),
    category: "Роли и handoffs",
    rule: "Нет пустых дорожек (все роли имеют блоки)",
    passed: emptyRoles.length === 0,
    details: emptyRoles.length === 0
      ? `Все ${data.roles.length} ролей участвуют в процессе.`
      : `Пустые роли (${emptyRoles.length}): ${emptyRoles.map(r => `«${r.name}»`).join(", ")}. Эти дорожки созданы, но ни один блок к ним не привязан.`,
    howToFix: emptyRoles.length > 0
      ? `Либо удалите неиспользуемые роли (${emptyRoles.map(r => `«${r.name}»`).join(", ")}), либо назначьте им хотя бы один блок процесса. Пустые дорожки перегружают схему и вводят в заблуждение.`
      : undefined,
    severity: "warning",
  });

  let handoffCount = 0;
  const handoffPairs: string[] = [];
  for (const block of data.blocks) {
    for (const targetId of block.connections) {
      const target = blockMap.get(targetId);
      if (target && target.role !== block.role) {
        handoffCount++;
        if (handoffPairs.length < 3) handoffPairs.push(`«${block.name}» → «${target.name}»`);
      }
    }
  }
  items.push({
    id: id(),
    category: "Роли и handoffs",
    rule: "Процесс перетекает между ролями (handoffs ≥ 5)",
    passed: handoffCount >= 5,
    details: handoffCount >= 5
      ? `Handoffs: ${handoffCount}. Процесс активно взаимодействует между ролями.`
      : `Handoffs: ${handoffCount}. Мало передач между ролями — процесс выглядит слабо взаимодействующим${handoffPairs.length ? `. Найденные: ${handoffPairs.join(", ")}` : ""}.`,
    howToFix: handoffCount < 5
      ? "Убедитесь, что блоки правильно назначены ролям. Если роль меняется при переходе от одного действия к другому — укажите это явно через атрибут «Роль» в каждом блоке."
      : undefined,
    severity: handoffCount >= 3 ? "info" : "warning",
  });

  items.push({
    id: id(),
    category: "Роли и handoffs",
    rule: "Минимум 3 роли в процессе",
    passed: data.roles.length >= 3,
    details: `Ролей: ${data.roles.length}${data.roles.length > 0 ? ` (${data.roles.map(r => r.name).join(", ")})` : ""}. ${data.roles.length >= 3 ? "Состав ролей достаточен." : "Малое количество ролей может указывать на неполноту модели."}`,
    howToFix: data.roles.length < 3
      ? "Добавьте отсутствующих участников процесса. Как правило, в бизнес-процессе участвуют: инициатор/клиент, исполнитель, и контролирующая роль (руководитель, согласующий)."
      : undefined,
    severity: data.roles.length >= 2 ? "info" : "warning",
  });

  // ═══════════════════════════════════
  // 4. READABILITY
  // ═══════════════════════════════════

  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Количество блоков ≤ 50 (не перегружено)",
    passed: data.blocks.length <= 50,
    details: `Блоков: ${data.blocks.length}. ${data.blocks.length <= 50 ? "Размер диаграммы в норме." : "Диаграмма перегружена. Схемы более 50 блоков сложно читать и сопровождать."}`,
    howToFix: data.blocks.length > 50
      ? "Рассмотрите декомпозицию: разбейте процесс на несколько связанных подпроцессов по этапам. Каждый подпроцесс должен решать одну задачу и умещаться на одном экране."
      : undefined,
    severity: "info",
  });

  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Минимум 3 этапа для структуры",
    passed: data.stages.length >= 3,
    details: data.stages.length >= 3
      ? `Этапов: ${data.stages.length} (${data.stages.map(s => s.name).join(", ")}). Структура процесса хорошо организована.`
      : `Этапов: ${data.stages.length}${data.stages.length > 0 ? ` (${data.stages.map(s => s.name).join(", ")})` : ""}. Недостаточно этапов для структурирования процесса.`,
    howToFix: data.stages.length < 3
      ? "Добавьте этапы, которые логически группируют блоки процесса. Например: «Подготовка → Исполнение → Контроль» или «Привлечение → Квалификация → Закрытие»."
      : undefined,
    severity: "warning",
  });

  const noDesc = data.blocks.filter(b => !b.description || b.description.length < 5);
  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Блоки имеют описания",
    passed: noDesc.length === 0,
    details: noDesc.length === 0
      ? "Все блоки содержат текстовые описания."
      : `Блоков без описания: ${noDesc.length} из ${data.blocks.length}. ${noDesc.length <= 5 ? `Это: ${noDesc.map(b => `«${b.name}»`).join(", ")}.` : `Первые 5: ${noDesc.slice(0, 5).map(b => `«${b.name}»`).join(", ")} и ещё ${noDesc.length - 5}.`} Описания нужны для понимания назначения каждого шага.`,
    howToFix: noDesc.length > 0
      ? "Добавьте описание к каждому блоку — 1–2 предложения о том, что происходит на этом шаге, кто и что конкретно делает. Это критично для регламентов и обучения новых сотрудников."
      : undefined,
    severity: "info",
  });

  // ═══════════════════════════════════
  // 5. DATA AND DOCUMENTS
  // ═══════════════════════════════════

  const actionBlocks = data.blocks.filter(b => b.type === "action");

  const noInputDocs = actionBlocks.filter(b => !b.inputDocuments || b.inputDocuments.length === 0);
  const noInputDocsPct = actionBlocks.length > 0 ? noInputDocs.length / actionBlocks.length : 0;
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки имеют входные документы",
    passed: noInputDocsPct <= 0.3,
    details: actionBlocks.length === 0
      ? "Action-блоков нет."
      : `Без входных документов: ${noInputDocs.length} из ${actionBlocks.length} action-блоков (${Math.round(noInputDocsPct * 100)}%).${noInputDocs.length > 0 && noInputDocs.length <= 5 ? ` Блоки: ${noInputDocs.map(b => `«${b.name}»`).join(", ")}.` : ""}`,
    howToFix: noInputDocsPct > 0.3
      ? `Укажите входные документы для action-блоков. Примеры: «Заявка клиента», «Договор», «Счёт на оплату», «Техническое задание». Это позволяет построить матрицу документооборота и понять, что нужно исполнителю для начала работы.`
      : undefined,
    severity: "info",
  });

  const noSystems = actionBlocks.filter(b => !b.infoSystems || b.infoSystems.length === 0);
  const noSystemsPct = actionBlocks.length > 0 ? noSystems.length / actionBlocks.length : 0;
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки указывают информационные системы",
    passed: noSystemsPct <= 0.3,
    details: actionBlocks.length === 0
      ? "Action-блоков нет."
      : `Без информационных систем: ${noSystems.length} из ${actionBlocks.length} action-блоков (${Math.round(noSystemsPct * 100)}%).${noSystems.length > 0 && noSystems.length <= 5 ? ` Блоки: ${noSystems.map(b => `«${b.name}»`).join(", ")}.` : ""}`,
    howToFix: noSystemsPct > 0.3
      ? "Укажите, в каких системах выполняется каждое действие: CRM, ERP, 1С, Excel, почта, телефон и т.д. Это база для анализа автоматизации и интеграций."
      : undefined,
    severity: "info",
  });

  const noTime = actionBlocks.filter(b => !b.timeEstimate);
  const noTimePct = actionBlocks.length > 0 ? noTime.length / actionBlocks.length : 0;
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки имеют оценку времени",
    passed: noTimePct <= 0.3,
    details: actionBlocks.length === 0
      ? "Action-блоков нет."
      : `Без оценки времени: ${noTime.length} из ${actionBlocks.length} action-блоков (${Math.round(noTimePct * 100)}%).${noTime.length > 0 && noTime.length <= 5 ? ` Блоки: ${noTime.map(b => `«${b.name}»`).join(", ")}.` : ""}`,
    howToFix: noTimePct > 0.3
      ? "Добавьте оценку времени к каждому action-блоку. Используйте формат: «15 мин», «1 ч», «2 дн». Это необходимо для расчёта метрик процесса, SLA и стоимости."
      : undefined,
    severity: "info",
  });

  // ═══════════════════════════════════
  // 6. PROCESS VALUE (BMC alignment)
  // ═══════════════════════════════════

  const productBlocks = data.blocks.filter(b => b.type === "product");
  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Есть промежуточные результаты (product-блоки)",
    passed: productBlocks.length >= 2,
    details: productBlocks.length >= 2
      ? `Product-блоков: ${productBlocks.length} (${productBlocks.map(b => `«${b.name}»`).join(", ")}). Промежуточные результаты хорошо отражены.`
      : `Product-блоков: ${productBlocks.length}. ${productBlocks.length === 1 ? `Найден: «${productBlocks[0].name}».` : "Результаты процесса не зафиксированы."} Без явных результатов сложно оценить ценность каждого этапа.`,
    howToFix: productBlocks.length < 2
      ? "Добавьте product-блоки после ключевых действий. Product — это осязаемый результат: «Коммерческое предложение», «Подписанный договор», «Отгруженный товар», «Закрытая сделка»."
      : undefined,
    severity: "warning",
  });

  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Есть точки принятия решений (decision-блоки)",
    passed: decisionBlocks.length >= 1,
    details: decisionBlocks.length >= 1
      ? `Decision-блоков: ${decisionBlocks.length} (${decisionBlocks.map(b => `«${b.name}»`).join(", ")}). Ветвления в процессе присутствуют.`
      : "Decision-блоков нет. Линейный процесс без ветвлений обычно означает упрощённую или неполную модель.",
    howToFix: decisionBlocks.length === 0
      ? "Добавьте decision-блоки в точках, где исход определяет дальнейший путь. Типичные развилки: квалификация лида, проверка документов, согласование суммы, оценка выполнения работ."
      : undefined,
    severity: "warning",
  });

  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Цель процесса указана",
    passed: Boolean(data.goal && data.goal.length > 3),
    details: data.goal && data.goal.length > 3
      ? `Цель: «${data.goal}».`
      : "Цель процесса не указана. Без цели невозможно оценить эффективность и правильно расставить приоритеты.",
    howToFix: !(data.goal && data.goal.length > 3)
      ? "Заполните поле «Цель процесса» в карточке процесса. Формулируйте через результат для клиента или бизнеса: «Увеличить скорость обработки заявок до 2 часов», «Обеспечить 100% своевременную отгрузку»."
      : undefined,
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
    details: allSystems.size >= 2
      ? `Систем: ${allSystems.size} — ${Array.from(allSystems).join(", ")}.`
      : allSystems.size === 1
        ? `Указана 1 система: ${Array.from(allSystems)[0]}. Рекомендуется описать все системы, задействованные в процессе.`
        : "Информационные системы не указаны. Невозможно оценить потенциал автоматизации и интеграций.",
    howToFix: allSystems.size < 2
      ? "Укажите в каждом action-блоке системы, которые используются. Даже «Excel» или «электронная почта» — это система. Полный перечень систем позволяет выявить узкие места и приоритеты для автоматизации."
      : undefined,
    severity: "info",
  });

  // ═══════════════════════════════════
  // Score Calculation
  // ═══════════════════════════════════

  const errors = items.filter(i => !i.passed && i.severity === "error");
  const warnings = items.filter(i => !i.passed && i.severity === "warning");
  const total = items.length;
  const passed = items.filter(i => i.passed).length;
  const score = Math.round((passed / total) * 100 - errors.length * 5 - warnings.length * 2);

  const summary = errors.length > 0
    ? `Найдено ${errors.length} критических ошибок. Процесс нефункционален — необходима доработка.`
    : warnings.length > 0
      ? `Структура корректна. ${warnings.length} предупреждений — рекомендуется устранить для повышения качества.`
      : "Процесс полностью соответствует стандартам BPMN 2.0.";

  return {
    score: Math.max(0, Math.min(100, score)),
    items,
    summary,
  };
}
