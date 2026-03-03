import type { ProcessData, QualityCheckItem, QualityCheckResult } from "../../shared/types";

export function validateProcess(data: ProcessData): QualityCheckResult {
  const items: QualityCheckItem[] = [];
  let checkId = 0;
  const id = () => `check_${++checkId}`;

  // Use only active blocks for quality checks
  const activeBlocks = data.blocks.filter(b => b.isActive !== false);
  const inactiveCount = data.blocks.length - activeBlocks.length;

  const blockMap = new Map(activeBlocks.map(b => [b.id, b]));

  const roleName = (roleId: string) =>
    data.roles.find(r => r.id === roleId)?.name || roleId;
  const stageName = (stageId: string) =>
    data.stages.find(s => s.id === stageId)?.name || stageId;

  // ═══════════════════════════════════
  // 1. LOGICAL COMPLETENESS
  // ═══════════════════════════════════

  // Info: inactive blocks
  if (inactiveCount > 0) {
    const inactiveBlocks = data.blocks.filter(b => b.isActive === false);
    items.push({
      id: id(),
      category: "Статус блоков",
      rule: `Выключенные блоки (${inactiveCount})`,
      passed: true,
      details: `${inactiveCount} блоков выключены и исключены из проверки качества.`,
      severity: "info",
      location: inactiveBlocks.map(b => `«${b.name}»`).join(", "),
      blockIds: inactiveBlocks.map(b => b.id),
    });
  }

  // Check: has start block
  const startBlocks = activeBlocks.filter(b => b.type === "start");
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Процесс имеет стартовый блок",
    passed: startBlocks.length > 0,
    details: startBlocks.length > 0
      ? `Найдено стартовых блоков: ${startBlocks.length}. Процесс имеет корректную точку входа.`
      : "В диаграмме отсутствует блок типа «start». Без стартового события невозможно определить начало процесса.",
    severity: "error",
    ...(startBlocks.length === 0
      ? {
          consequence: "Процесс не может быть запущен — нет определённой точки входа. Автоматизация и симуляция невозможны.",
          recommendation: "Добавьте блок типа «start» и свяжите его с первым действием процесса.",
        }
      : {
          location: startBlocks.map(b => `«${b.name}» (${stageName(b.stage)})`).join(", "),
          blockIds: startBlocks.map(b => b.id),
        }),
  });

  // Check: has end block
  const endBlocks = activeBlocks.filter(b => b.type === "end");
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Процесс имеет конечный блок",
    passed: endBlocks.length > 0,
    details: endBlocks.length > 0
      ? `Найдено конечных блоков: ${endBlocks.length}. Все сценарии завершаются корректно.`
      : "Отсутствует блок типа «end». Процесс не имеет определённого завершения.",
    severity: "error",
    ...(endBlocks.length === 0
      ? {
          consequence: "Невозможно определить, когда процесс считается завершённым. Это приведёт к путанице при исполнении и невозможности измерить длительность цикла.",
          recommendation: "Добавьте один или несколько блоков типа «end» после финальных шагов процесса.",
        }
      : {
          location: endBlocks.map(b => `«${b.name}» (${stageName(b.stage)})`).join(", "),
          blockIds: endBlocks.map(b => b.id),
        }),
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

  const unreachable = activeBlocks.filter(b => !reachable.has(b.id));
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Все блоки достижимы от start",
    passed: unreachable.length === 0,
    details: unreachable.length === 0
      ? "Все активные блоки связаны в единый поток от стартового события. Граф процесса целостен."
      : `${unreachable.length} блоков не достижимы от стартового события: ${unreachable.map(b => `«${b.name}»`).join(", ")}.`,
    severity: "error",
    ...(unreachable.length > 0
      ? {
          location: unreachable.map(b => `«${b.name}» — роль ${roleName(b.role)}, этап ${stageName(b.stage)}`).join("; "),
          blockIds: unreachable.map(b => b.id),
          consequence: "Изолированные блоки никогда не будут выполнены. Это может означать потерянную бизнес-логику или забытые шаги процесса.",
          recommendation: "Проверьте связи блоков: добавьте входящие соединения от предшествующих шагов или удалите неиспользуемые блоки.",
        }
      : {}),
  });

  // Check: end blocks have no outgoing connections
  const endWithConnections = endBlocks.filter(b => b.connections.length > 0);
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "End-блоки не имеют исходящих связей",
    passed: endWithConnections.length === 0,
    details: endWithConnections.length === 0
      ? "Все конечные блоки корректно завершают потоки без исходящих соединений."
      : `Конечные блоки с исходящими связями: ${endWithConnections.map(b => `«${b.name}»`).join(", ")}. По стандарту BPMN end-событие не должно иметь выходов.`,
    severity: "error",
    ...(endWithConnections.length > 0
      ? {
          location: endWithConnections.map(b => `«${b.name}» (${stageName(b.stage)})`).join(", "),
          blockIds: endWithConnections.map(b => b.id),
          consequence: "Нарушение стандарта BPMN 2.0. Экспорт в другие системы будет некорректным, автоматизация может зациклиться.",
          recommendation: "Удалите исходящие связи из конечных блоков или смените их тип на action.",
        }
      : {}),
  });

  // Check: non-end blocks have connections (no dead ends)
  const deadEnds = activeBlocks.filter(b => b.type !== "end" && b.connections.length === 0);
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Нет «мёртвых» концов (блоки без исходящих кроме end)",
    passed: deadEnds.length === 0,
    details: deadEnds.length === 0
      ? "Все блоки (кроме конечных) имеют продолжение — поток процесса не обрывается."
      : `${deadEnds.length} блоков без исходящих связей: ${deadEnds.map(b => `«${b.name}»`).join(", ")}. Поток процесса обрывается.`,
    severity: "error",
    ...(deadEnds.length > 0
      ? {
          location: deadEnds.map(b => `«${b.name}» — роль ${roleName(b.role)}, этап ${stageName(b.stage)}`).join("; "),
          blockIds: deadEnds.map(b => b.id),
          consequence: "Исполнитель не знает, что делать дальше. Процесс «зависнет» на этом шаге, работа не будет завершена.",
          recommendation: "Добавьте исходящую связь к следующему шагу или к конечному блоку.",
        }
      : {}),
  });

  // Check: connections reference existing blocks
  const brokenConnections: { source: string; sourceId: string; targetId: string }[] = [];
  for (const block of activeBlocks) {
    for (const targetId of block.connections) {
      if (!blockMap.has(targetId)) {
        brokenConnections.push({ source: block.name, sourceId: block.id, targetId });
      }
    }
  }
  items.push({
    id: id(),
    category: "Логическая завершённость",
    rule: "Все связи ссылаются на существующие блоки",
    passed: brokenConnections.length === 0,
    details: brokenConnections.length === 0
      ? "Все соединения между блоками указывают на существующие элементы диаграммы."
      : `${brokenConnections.length} битых связей: ${brokenConnections.map(c => `«${c.source}» → несуществующий блок`).join("; ")}.`,
    severity: "error",
    ...(brokenConnections.length > 0
      ? {
          blockIds: brokenConnections.map(c => c.sourceId),
          location: brokenConnections.map(c => `«${c.source}» → ${c.targetId}`).join("; "),
          consequence: "Битые ссылки приведут к ошибкам при экспорте BPMN и невозможности автоматической маршрутизации.",
          recommendation: "Откройте указанные блоки и исправьте или удалите некорректные связи.",
        }
      : {}),
  });

  // ═══════════════════════════════════
  // 2. GATEWAYS AND CONDITIONS
  // ═══════════════════════════════════

  const decisionBlocks = activeBlocks.filter(b => b.type === "decision");

  // Check: decisions have 2+ outgoing connections
  const badDecisions = decisionBlocks.filter(b => b.connections.length < 2);
  items.push({
    id: id(),
    category: "Гейтвеи и условия",
    rule: "Decision-блоки имеют 2+ исходящих ветви",
    passed: badDecisions.length === 0,
    details: badDecisions.length === 0
      ? `Все ${decisionBlocks.length} точек принятия решений имеют минимум 2 варианта — логика ветвления корректна.`
      : `${badDecisions.length} decision-блоков имеют менее 2 выходов: ${badDecisions.map(b => `«${b.name}» (${b.connections.length} выход)`).join(", ")}.`,
    severity: "error",
    ...(badDecisions.length > 0
      ? {
          blockIds: badDecisions.map(b => b.id),
          location: badDecisions.map(b => `«${b.name}» — этап ${stageName(b.stage)}`).join("; "),
          consequence: "Точка решения с одним выходом бессмысленна — это не ветвление. Процесс теряет альтернативные сценарии.",
          recommendation: "Добавьте второй выход с альтернативным условием или замените тип блока на action.",
        }
      : {}),
  });

  // Check: decision branches have condition labels
  for (const dec of decisionBlocks) {
    const targets = dec.connections.map(c => blockMap.get(c)).filter(Boolean);
    const unlabeled = targets.filter(t => !t!.conditionLabel && !t!.isDefault);
    items.push({
      id: id(),
      category: "Гейтвеи и условия",
      rule: `Ветви «${dec.name}» подписаны условиями`,
      passed: unlabeled.length === 0,
      details: unlabeled.length === 0
        ? `Все ветви решения «${dec.name}» имеют подписи условий — логика выбора прозрачна для исполнителей.`
        : `${unlabeled.length} ветвей без подписи: ${unlabeled.map(b => `«${b!.name}»`).join(", ")}. Исполнитель не поймёт, при каком условии выбрать эту ветвь.`,
      severity: "warning",
      blockIds: [dec.id, ...unlabeled.map(b => b!.id)],
      location: `Решение «${dec.name}» — этап ${stageName(dec.stage)}, роль ${roleName(dec.role)}`,
      ...(unlabeled.length > 0
        ? {
            consequence: "Без подписей на ветвях исполнитель будет принимать решения интуитивно, что приведёт к ошибкам маршрутизации.",
            recommendation: "Откройте блок решения и укажите условие (conditionLabel) для каждой исходящей ветви.",
          }
        : {}),
    });
  }

  // Check: at least one default branch per decision
  for (const dec of decisionBlocks) {
    const targets = dec.connections.map(c => blockMap.get(c)).filter(Boolean);
    const hasDefault = targets.some(t => t!.isDefault);
    items.push({
      id: id(),
      category: "Гейтвеи и условия",
      rule: `«${dec.name}» имеет ветвь по умолчанию`,
      passed: hasDefault,
      details: hasDefault
        ? `Решение «${dec.name}» имеет ветвь по умолчанию — предусмотрен fallback-сценарий.`
        : `У решения «${dec.name}» нет ветви по умолчанию (isDefault). Если ни одно условие не выполнено, процесс заблокируется.`,
      severity: "warning",
      blockIds: [dec.id],
      location: `Решение «${dec.name}» — этап ${stageName(dec.stage)}, роль ${roleName(dec.role)}`,
      ...(! hasDefault
        ? {
            consequence: "При нестандартной ситуации (ни одно условие не выполнено) процесс не будет знать, куда направить поток.",
            recommendation: "Отметьте одну из ветвей как «по умолчанию» (isDefault) — она сработает, когда другие условия не подходят.",
          }
        : {}),
    });
  }

  // ═══════════════════════════════════
  // 3. ROLES AND HANDOFFS
  // ═══════════════════════════════════

  // Check: no empty lanes
  const rolesWithBlocks = new Set(activeBlocks.map(b => b.role));
  const emptyRoles = data.roles.filter(r => !rolesWithBlocks.has(r.id));
  items.push({
    id: id(),
    category: "Роли и handoffs",
    rule: "Нет пустых дорожек (все роли имеют блоки)",
    passed: emptyRoles.length === 0,
    details: emptyRoles.length === 0
      ? `Все ${data.roles.length} ролей задействованы — каждый участник имеет задачи в процессе.`
      : `${emptyRoles.length} ролей без единого блока: ${emptyRoles.map(r => `«${r.name}»`).join(", ")}. Эти дорожки пустуют.`,
    severity: "warning",
    ...(emptyRoles.length > 0
      ? {
          location: emptyRoles.map(r => `Роль «${r.name}»`).join(", "),
          consequence: "Пустые дорожки загромождают диаграмму и вводят в заблуждение: создаётся впечатление участия роли, хотя задач у неё нет.",
          recommendation: "Добавьте задачи для этих ролей или удалите неиспользуемые роли из процесса.",
        }
      : {}),
  });

  // Check: handoffs between roles (connections crossing lanes)
  let handoffCount = 0;
  for (const block of activeBlocks) {
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
    details: handoffCount >= 5
      ? `Обнаружено ${handoffCount} передач между ролями — процесс демонстрирует реальное межфункциональное взаимодействие.`
      : `Только ${handoffCount} передач между ролями. Для кросс-функционального процесса рекомендуется минимум 5.`,
    severity: handoffCount >= 3 ? "info" : "warning",
    ...(handoffCount < 5
      ? {
          consequence: "Малое количество handoffs может означать, что процесс описан линейно внутри одной роли, не отражая реальное взаимодействие подразделений.",
          recommendation: "Проверьте, участвуют ли в процессе другие подразделения. Добавьте передачи задач между ролями.",
        }
      : {}),
  });

  // Check: minimum roles
  items.push({
    id: id(),
    category: "Роли и handoffs",
    rule: "Минимум 3 роли в процессе",
    passed: data.roles.length >= 3,
    details: data.roles.length >= 3
      ? `В процессе ${data.roles.length} ролей: ${data.roles.map(r => r.name).join(", ")}. Достаточно для кросс-функциональной модели.`
      : `Только ${data.roles.length} роль(ей). Бизнес-процесс обычно затрагивает минимум 3 подразделения/роли.`,
    severity: data.roles.length >= 2 ? "info" : "warning",
    ...(data.roles.length < 3
      ? {
          consequence: "Процесс с 1-2 ролями скорее всего описывает лишь часть реального бизнес-процесса.",
          recommendation: "Проанализируйте, кто ещё участвует: согласование, контроль, внешние партнёры.",
        }
      : {}),
  });

  // ═══════════════════════════════════
  // 4. READABILITY
  // ═══════════════════════════════════

  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Количество блоков ≤ 50 (не перегружено)",
    passed: activeBlocks.length <= 50,
    details: activeBlocks.length <= 50
      ? `${activeBlocks.length} блоков — диаграмма компактна и читаема.`
      : `${activeBlocks.length} блоков — диаграмма перегружена. Сложно воспринимать процесс целиком.`,
    severity: activeBlocks.length <= 50 ? "info" : "warning",
    ...(activeBlocks.length > 50
      ? {
          consequence: "Перегруженная диаграмма сложна для понимания и сопровождения. Увеличивается риск ошибок.",
          recommendation: "Разбейте процесс на подпроцессы. Выделите крупные блоки в отдельные диаграммы.",
        }
      : {}),
  });

  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Минимум 3 этапа для структуры",
    passed: data.stages.length >= 3,
    details: data.stages.length >= 3
      ? `${data.stages.length} этапов: ${data.stages.map(s => s.name).join(", ")}. Процесс хорошо структурирован.`
      : `Только ${data.stages.length} этап(а). Без деления на этапы сложно понять фазы процесса.`,
    severity: "warning",
    ...(data.stages.length < 3
      ? {
          consequence: "Без разбиения на этапы невозможно анализировать длительность фаз и находить узкие места.",
          recommendation: "Разделите процесс минимум на 3 этапа: начало, основная работа, завершение.",
        }
      : {}),
  });

  // Check: blocks have descriptions
  const noDesc = activeBlocks.filter(b => !b.description || b.description.length < 5);
  items.push({
    id: id(),
    category: "Читаемость",
    rule: "Блоки имеют описания",
    passed: noDesc.length === 0,
    details: noDesc.length === 0
      ? "Все блоки имеют описания — участники процесса смогут понять назначение каждого шага."
      : `${noDesc.length} блоков без описания: ${noDesc.slice(0, 5).map(b => `«${b.name}»`).join(", ")}${noDesc.length > 5 ? ` и ещё ${noDesc.length - 5}` : ""}.`,
    severity: "info",
    ...(noDesc.length > 0
      ? {
          blockIds: noDesc.map(b => b.id),
          location: noDesc.slice(0, 3).map(b => `«${b.name}» — роль ${roleName(b.role)}`).join("; "),
          recommendation: "Добавьте описание для каждого блока — что именно нужно сделать и какой результат ожидается.",
        }
      : {}),
  });

  // ═══════════════════════════════════
  // 5. DATA AND DOCUMENTS
  // ═══════════════════════════════════

  const actionBlocks = activeBlocks.filter(b => b.type === "action");

  // Check: actions have documents
  const noInputDocs = actionBlocks.filter(b => !b.inputDocuments || b.inputDocuments.length === 0);
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки имеют входные документы",
    passed: noInputDocs.length <= actionBlocks.length * 0.3,
    details: noInputDocs.length <= actionBlocks.length * 0.3
      ? `${actionBlocks.length - noInputDocs.length} из ${actionBlocks.length} действий имеют входные документы — информационные потоки определены.`
      : `${noInputDocs.length} из ${actionBlocks.length} действий без входных документов: ${noInputDocs.slice(0, 4).map(b => `«${b.name}»`).join(", ")}${noInputDocs.length > 4 ? "..." : ""}.`,
    severity: "info",
    ...(noInputDocs.length > actionBlocks.length * 0.3
      ? {
          blockIds: noInputDocs.map(b => b.id),
          location: noInputDocs.slice(0, 3).map(b => `«${b.name}» — роль ${roleName(b.role)}`).join("; "),
          recommendation: "Укажите, какие документы/данные нужны для выполнения каждого действия.",
        }
      : {}),
  });

  // Check: actions have systems
  const noSystems = actionBlocks.filter(b => !b.infoSystems || b.infoSystems.length === 0);
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки указывают информационные системы",
    passed: noSystems.length <= actionBlocks.length * 0.3,
    details: noSystems.length <= actionBlocks.length * 0.3
      ? `${actionBlocks.length - noSystems.length} из ${actionBlocks.length} действий привязаны к информационным системам.`
      : `${noSystems.length} из ${actionBlocks.length} действий без указания систем: ${noSystems.slice(0, 4).map(b => `«${b.name}»`).join(", ")}${noSystems.length > 4 ? "..." : ""}.`,
    severity: "info",
    ...(noSystems.length > actionBlocks.length * 0.3
      ? {
          blockIds: noSystems.map(b => b.id),
          location: noSystems.slice(0, 3).map(b => `«${b.name}» — роль ${roleName(b.role)}`).join("; "),
          recommendation: "Укажите, в какой системе (CRM, ERP, 1C и т.д.) выполняется каждое действие.",
        }
      : {}),
  });

  // Check: actions have time estimates
  const noTime = actionBlocks.filter(b => !b.timeEstimate);
  items.push({
    id: id(),
    category: "Документы и данные",
    rule: "Action-блоки имеют оценку времени",
    passed: noTime.length <= actionBlocks.length * 0.3,
    details: noTime.length <= actionBlocks.length * 0.3
      ? `${actionBlocks.length - noTime.length} из ${actionBlocks.length} действий имеют оценку времени — можно рассчитать длительность процесса.`
      : `${noTime.length} из ${actionBlocks.length} действий без оценки времени: ${noTime.slice(0, 4).map(b => `«${b.name}»`).join(", ")}${noTime.length > 4 ? "..." : ""}.`,
    severity: "info",
    ...(noTime.length > actionBlocks.length * 0.3
      ? {
          blockIds: noTime.map(b => b.id),
          location: noTime.slice(0, 3).map(b => `«${b.name}» — роль ${roleName(b.role)}`).join("; "),
          recommendation: "Укажите timeEstimate для каждого действия (напр. «15 мин», «1 ч»). Это необходимо для расчёта стоимости и SLA.",
        }
      : {}),
  });

  // ═══════════════════════════════════
  // 6. PROCESS VALUE (BMC alignment)
  // ═══════════════════════════════════

  // Check: has product blocks (intermediate results)
  const productBlocks = activeBlocks.filter(b => b.type === "product");
  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Есть промежуточные результаты (product-блоки)",
    passed: productBlocks.length >= 2,
    details: productBlocks.length >= 2
      ? `${productBlocks.length} промежуточных результатов: ${productBlocks.map(b => `«${b.name}»`).join(", ")}. Процесс создаёт измеримые артефакты.`
      : `Только ${productBlocks.length} product-блоков. Рекомендуется минимум 2 для фиксации промежуточных результатов.`,
    severity: "warning",
    ...(productBlocks.length < 2
      ? {
          consequence: "Без промежуточных результатов сложно контролировать прогресс и качество выполнения процесса.",
          recommendation: "Добавьте product-блоки после ключевых действий (напр. «КП подготовлено», «Договор согласован»).",
        }
      : {
          blockIds: productBlocks.map(b => b.id),
        }),
  });

  // Check: has decision points (process is not just linear)
  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Есть точки принятия решений (decision-блоки)",
    passed: decisionBlocks.length >= 1,
    details: decisionBlocks.length >= 1
      ? `${decisionBlocks.length} точек решений — процесс учитывает альтернативные сценарии.`
      : "Нет ни одной точки принятия решений. Полностью линейный процесс редко отражает реальность.",
    severity: "warning",
    ...(decisionBlocks.length < 1
      ? {
          consequence: "Линейный процесс не учитывает исключения, отклонения и альтернативы — при первой нестандартной ситуации он сломается.",
          recommendation: "Добавьте decision-блоки для ключевых проверок: одобрение, проверка качества, решение о продолжении.",
        }
      : {
          blockIds: decisionBlocks.map(b => b.id),
        }),
  });

  // Check: goal is set
  items.push({
    id: id(),
    category: "Соответствие ценности",
    rule: "Цель процесса указана",
    passed: Boolean(data.goal && data.goal.length > 3),
    details: data.goal && data.goal.length > 3
      ? `Цель процесса: «${data.goal}». Все шаги должны работать на достижение этой цели.`
      : "Цель процесса не указана или слишком короткая.",
    severity: "warning",
    ...(!(data.goal && data.goal.length > 3)
      ? {
          consequence: "Без чёткой цели невозможно оценить, создаёт ли процесс ценность. Оптимизация теряет ориентир.",
          recommendation: "Сформулируйте цель процесса: что должно произойти и для кого создаётся ценность.",
        }
      : {}),
  });

  // ═══════════════════════════════════
  // 7. AUTOMATION POTENTIAL
  // ═══════════════════════════════════

  const allSystems = new Set(activeBlocks.flatMap(b => b.infoSystems || []));
  items.push({
    id: id(),
    category: "Потенциал автоматизации",
    rule: "Информационные системы указаны в процессе",
    passed: allSystems.size >= 2,
    details: allSystems.size >= 2
      ? `Используется ${allSystems.size} систем: ${Array.from(allSystems).join(", ")}. Можно анализировать интеграции и потенциал автоматизации.`
      : `Указано только ${allSystems.size} систем. Для оценки автоматизации нужно указать информационные системы в блоках.`,
    severity: "info",
    ...(allSystems.size < 2
      ? {
          recommendation: "Укажите используемые системы (CRM, ERP, 1C, Excel и др.) в каждом action-блоке для анализа потенциала автоматизации.",
        }
      : {}),
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
