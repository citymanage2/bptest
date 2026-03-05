import Anthropic from "@anthropic-ai/sdk";
import type { ProcessData, ProcessBlock, ProcessRole, ProcessStage, ProcessPassport, CrmFunnel } from "../../shared/types";
import { SWIMLANE_COLORS } from "../../shared/types";
import { logger } from "./logger";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || "dummy-key",
});

// ═══════════════════════════════════════════════════════════════════
// BMC/VPC → BPMN MAPPING TABLE (embedded in prompt)
// ═══════════════════════════════════════════════════════════════════
// | BMC Element          | BPMN Artifact                                    |
// |----------------------|--------------------------------------------------|
// | Customer Segments    | Start Events (triggers), Exclusive Gateway       |
// |                      | branches by segment, Pool labels                 |
// | Value Proposition    | Process goal annotation, End Event names,        |
// |                      | SLA annotations, Success criteria                |
// | Channels             | Start Events (entry points), Message Flows,      |
// |                      | Intermediate Message Events, Send/Receive Tasks  |
// | Customer Relations   | User Tasks (interaction points), Notifications,  |
// |                      | Approval patterns, "Moment of Truth" annotations |
// | Revenue Streams      | Service/User Tasks for invoicing, Intermediate   |
// |                      | Events for payment, Data Objects (documents)     |
// | Key Activities       | Core Sequence Flow (happy path), User/Service    |
// |                      | Tasks, Sub-processes                             |
// | Key Resources        | Lanes (roles), Systems annotations, Data         |
// |                      | Stores, Resource annotations                     |
// | Key Partners         | Separate Pools/Lanes for external partners,      |
// |                      | Message Flows for inter-org communication        |
// | Cost Structure       | Timer Events (SLA), Annotations for budget       |
// |                      | limits, Control gateway for cost approval        |
// ═══════════════════════════════════════════════════════════════════

const PROCESS_GENERATION_PROMPT = `Ты — эксперт-аналитик по бизнес-процессам, нотации BPMN 2.0 Swimlane и методологии Business Model Canvas (BMC).

ЗАДАЧА: На основе ответов анкеты (структурированных по BMC/VPC) построить ДЕТАЛЬНЫЙ бизнес-процесс в формате Swimlane BPMN.

═══════════════════════════════════
ТЕХНОЛОГИЯ ПОСТРОЕНИЯ (10 ШАГОВ)
═══════════════════════════════════

Шаг 0 — SIPOC / Границы процесса:
  Определи Supplier → Input → Process → Output → Customer.
  Зафиксируй, что ВХОДИТ в процесс и что НЕ ВХОДИТ.

Шаг 1 — Цель / Ценность (из Value Proposition):
  Процесс должен создавать конкретную ценность. Зафиксируй цель и критерии "готово".

Шаг 2 — События-триггеры (Start Events):
  Определи ВСЕ варианты запуска: заявка клиента, таймер, сигнал из системы.
  Если разные сегменты клиентов → разные стартовые ветки.

Шаг 3 — Участники и дорожки (Lanes):
  Роли из Key Resources + Key Partners → Lanes.
  Критерии разбиения: по должности/отделу (внутренние), по организации (внешние).
  Внешние партнёры = отдельные дорожки с пометкой (внешний).

Шаг 4 — Happy Path (основной поток):
  Построй ОСНОВНОЙ сценарий сверху вниз (по этапам/стадиям).
  Каждое действие = "Глагол + Объект" (Проверить заявку, Сформировать КП).
  Процесс ПЕРЕТЕКАЕТ между ролями (handoffs).

Шаг 5 — Исключения, возвраты, альтернативы (Gateways):
  Exclusive Gateway → одна ветвь из нескольких (условие на каждом выходе).
  Parallel Gateway → все ветви одновременно.
  Каждый gateway: ПОДПИСАН вопросом ("Одобрено?"), каждая ветвь — условием.

Шаг 6 — Данные и документы:
  Каждый action-блок: inputDocuments, outputDocuments, infoSystems.
  Типы product-блоков: промежуточные результаты (КП, протокол, расчёт).

Шаг 7 — Интеграции и сообщения:
  Message Flow между разными пулами/партнёрами.
  Intermediate Events для ожидания ответа.

Шаг 8 — Контроль, риск и SLA:
  Контрольные точки (4-eyes), таймеры SLA, точки эскалации.
  Бюджетные лимиты → decision gateway.

Шаг 9 — Декомпозиция:
  Подпроцессы для сложных блоков (если > 5 действий внутри).

Шаг 10 — Верификация:
  Проверь: нет висячих потоков, все gateways закрыты, все блоки связаны.

═══════════════════════════════
ПРАВИЛА SWIMLANE BPMN
═══════════════════════════════

1. ДОРОЖКИ: роль/подразделение/система. Внешние партнёры — отдельная дорожка.
2. ЗАДАЧИ: "Глагол + Объект" (Проверить заявку, Согласовать КП, Выставить счёт).
3. НАПРАВЛЕНИЕ: сверху вниз по стадиям, процесс перетекает между дорожками.
4. ГЕЙТВЕИ: Exclusive — подписан вопросом, ветви — условиями. Одна ветвь isDefault=true.
5. HANDOFF: при переходе между ролями — обязательно product или явная передача.
6. СОГЛАСОВАНИЕ: паттерн "Подготовить → Проверить → Решение (gateway) → Утвердить/Вернуть".
7. ДОКУМЕНТЫ: каждый action имеет inputDocuments и outputDocuments.
8. СИСТЕМЫ: каждый action указывает infoSystems.
9. ВРЕМЯ: каждый action имеет timeEstimate.
10. НАЧАЛО: 1 блок start. КОНЕЦ: 1-2 блока end (успех + отказ если есть).

═══════════════════════════════
ПАТТЕРНЫ B2B ПРОЦЕССОВ
═══════════════════════════════

Используй подходящие паттерны:
- "Заявка → квалификация → предложение → договор" (sales)
- "Согласование с 4-eyes" (подготовить → проверить → утвердить/вернуть)
- "Переторжка" (расчёт → КП → торг → пересчёт если нужно)
- "Параллельные работы" (split → параллельные задачи → join)
- "Подрядчик как внешний участник" (отдельная дорожка)
- "Ожидание по таймеру" (ожидание оплаты/документов)
- "Эскалация при просрочке SLA" (таймер → эскалация руководителю)
- "Инцидент → устранение → закрытие"

═══════════════════════════════
ФОРМАТ ОТВЕТА (ТОЛЬКО JSON!)
═══════════════════════════════

{
  "name": "Название процесса",
  "goal": "Цель процесса (из Value Proposition)",
  "owner": "Владелец процесса",
  "startEvent": "Триггер запуска",
  "endEvent": "Результат/выход",
  "roles": [
    { "id": "role_1", "name": "Роль", "description": "Зона ответственности", "department": "Отдел" }
  ],
  "stages": [
    { "id": "stage_1", "name": "Название этапа", "order": 1 }
  ],
  "blocks": [
    {
      "id": "block_1",
      "name": "Глагол + Объект",
      "description": "Детальное описание (1-2 предложения)",
      "type": "start|action|product|decision|split|end",
      "role": "role_1",
      "stage": "stage_1",
      "timeEstimate": "15 мин",
      "inputDocuments": ["Заявка"],
      "outputDocuments": ["Зарегистрированная заявка"],
      "infoSystems": ["CRM"],
      "checklist": ["Шаг 1 выполнения", "Шаг 2 выполнения", "Критерий завершения"],
      "connections": ["block_2"],
      "conditionLabel": "",
      "isDefault": false
    }
  ]
}

КРИТИЧЕСКИЕ ТРЕБОВАНИЯ:
1. Минимум 5-8 ролей (включая внешних партнёров если есть)
2. Минимум 20-35 блоков для насыщенной диаграммы
3. 5-8 этапов (стадий)
4. В каждой дорожке — несколько блоков (нет пустых дорожек!)
5. 3-5 decision gateways с подписанными условиями
6. 3-5 product-блоков (промежуточные результаты)
7. Минимум 8-10 handoffs между ролями
8. Паттерн согласования: Подготовить → Проверить → Gateway → Утвердить/Вернуть
9. Каждый action: timeEstimate + inputDocuments + infoSystems + checklist (3-5 конкретных шагов выполнения)
10. Ответ — ТОЛЬКО валидный JSON, без markdown, без пояснений`;

export async function generateProcess(
  answers: Record<string, string>,
  companyName: string,
  industry: string
): Promise<ProcessData> {
  // Separate attached files metadata from questionnaire answers
  const attachedFiles = (() => {
    try {
      const raw = answers["__files"];
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Array<{ name: string }>;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  const answersText = Object.entries(answers)
    .filter(([k, v]) => k !== "__files" && v && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const filesSection = attachedFiles.length > 0
    ? `\nПрикреплённые документы компании: ${attachedFiles.map((f) => f.name).join(", ")}`
    : "";

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: `${PROCESS_GENERATION_PROMPT}

Компания: ${companyName}
Отрасль: ${industry}${filesSection}

Ответы на анкету (структурированы по BMC/VPC):
${answersText}

Построй бизнес-процесс по 10-шаговой методологии. Ответ — ТОЛЬКО JSON.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Не удалось извлечь JSON из ответа");

    const data = JSON.parse(jsonMatch[0]) as ProcessData;

    // Assign colors to roles
    data.roles = data.roles.map((role, i) => ({
      ...role,
      color: SWIMLANE_COLORS[i % SWIMLANE_COLORS.length],
    }));

    return data;
  } catch (error) {
    console.error("AI generation error:", error);
    return generateFallbackProcess(answers, companyName);
  }
}

export async function applyChanges(
  currentData: ProcessData,
  changeDescription: string
): Promise<ProcessData> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: `Ты — эксперт по бизнес-процессам и BPMN 2.0 Swimlane.

Тебе дан текущий бизнес-процесс в формате JSON и описание требуемых изменений.
Верни обновлённый процесс в том же формате JSON.

ПРАВИЛА:
- Сохрани структуру: roles, stages, blocks с connections
- Сохрани все BPMN-правила: handoffs между ролями, подписанные gateways, documents
- При добавлении блоков — убедись в корректности connections
- При удалении — перестрой connections чтобы не было висячих потоков
- Ответ — ТОЛЬКО валидный JSON

Текущий процесс:
${JSON.stringify(currentData, null, 2)}

Требуемые изменения:
${changeDescription}

Верни полный обновлённый JSON процесса.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Не удалось извлечь JSON из ответа");

    return JSON.parse(jsonMatch[0]) as ProcessData;
  } catch (error) {
    console.error("AI change error:", error);
    throw new Error("Не удалось применить изменения через ИИ");
  }
}

export async function generateRecommendations(
  processData: ProcessData
): Promise<
  Array<{
    category: string;
    title: string;
    description: string;
    priority: string;
    relatedSteps: string[];
  }>
> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: `Ты — консультант по операционной эффективности (Lean / BPM / BPMN 2.0) и автоматизации (CRM, ERP, RPA). Твоя задача: на основе бизнес-процесса выявить слабые зоны и дать рекомендации по улучшению.

ВХОДНЫЕ ДАННЫЕ:
${JSON.stringify(processData, null, 2)}

ТРЕБОВАНИЯ:
- Пиши на русском, максимально прикладно
- Каждое замечание должно ссылаться на конкретный фрагмент процесса (задача/роль/документ)
- Для каждой рекомендации: "что меняем → зачем → эффект → как внедрить"

ВЫХОДНОЙ ФОРМАТ — JSON-массив с разделами:

[
  {
    "category": "summary",
    "title": "Краткое резюме анализа",
    "description": "## 5 главных проблем\\n1. ...\\n2. ...\\n\\n## 5 главных улучшений\\n1. ...\\n2. ...\\n\\n## Потенциал оптимизации\\n- Время цикла: ...\\n- Трудозатраты: ...\\n- Согласования: ...",
    "priority": "high",
    "relatedSteps": []
  },
  {
    "category": "diagnostics",
    "title": "Диагностика по карте процесса",
    "description": "## Узкие места (bottlenecks)\\n- ...\\n\\n## Ожидания и очереди\\n- ...\\n\\n## Возвраты (rework loops)\\n- ...\\n\\n## Передачи между ролями (handoffs)\\n- ...\\n\\n## Точки ошибок\\n- ...\\n\\n## Слепые зоны в данных\\n- ...",
    "priority": "high",
    "relatedSteps": ["block_id_1", "block_id_2"]
  },
  {
    "category": "lean",
    "title": "Потери LEAN (8 видов)",
    "description": "## Ожидание\\n- Где: ...\\n- Решение: ...\\n\\n## Лишние перемещения информации\\n- ...\\n\\n## Лишняя обработка\\n- ...\\n\\n## Перепроизводство\\n- ...\\n\\n## Запасы (очереди)\\n- ...\\n\\n## Дефекты\\n- ...\\n\\n## Лишние движения\\n- ...\\n\\n## Недоиспользование компетенций\\n- ...",
    "priority": "high",
    "relatedSteps": []
  },
  {
    "category": "duplicates",
    "title": "Дубли и задвоение функций",
    "description": "## Одинаковые проверки в разных ролях\\n- ...\\n\\n## Дублирование ввода данных\\n- ...\\n\\n## Параллельные согласования без ценности\\n- ...\\n\\n## Решения\\n- Один владелец: ...\\n- Один источник данных: ...\\n- Объединение задач: ...",
    "priority": "medium",
    "relatedSteps": []
  },
  {
    "category": "automation",
    "title": "Рекомендации по автоматизации",
    "description": "## Quick Wins (микро-автоматизация)\\n| Что | Событие запуска | Эффект |\\n|-----|-----------------|--------|\\n| Автопостановка задач | ... | ... |\\n| Шаблоны документов | ... | ... |\\n| Уведомления по SLA | ... | ... |\\n\\n## Интеграции (CRM/ERP/1C)\\n- ...\\n\\n## RPA/скрипты\\n- ...",
    "priority": "high",
    "relatedSteps": []
  },
  {
    "category": "quality",
    "title": "Управление качеством и рисками",
    "description": "## Критические контрольные точки (quality gates)\\n- ...\\n\\n## Где нужен принцип 4-eyes\\n- ...\\n\\n## Где достаточно чек-листа вместо согласования\\n- ...\\n\\n## Риски и как закрывать\\n| Риск | Вероятность | Влияние | Контроль |\\n|------|-------------|---------|----------|\\n| ... | ... | ... | ... |",
    "priority": "medium",
    "relatedSteps": []
  },
  {
    "category": "data",
    "title": "Данные и документы",
    "description": "## Ручной ввод → единый источник\\n- ...\\n\\n## Документы: слишком рано/поздно создаются\\n- ...\\n\\n## Нет версионности\\n- ...\\n\\n## Рекомендации\\n- Минимальный набор полей: ...\\n- Справочники: ...\\n- Точки фиксации: ...",
    "priority": "medium",
    "relatedSteps": []
  },
  {
    "category": "roles",
    "title": "Роли и ответственность",
    "description": "## Перегруженные роли\\n- ...\\n\\n## Роли-посредники без ценности\\n- ...\\n\\n## Конфликт полномочий\\n- ...\\n\\n## Рекомендации\\n- Переразбиение дорожек: ...\\n- Изменение RACI: ...\\n- Самообслуживание: ...",
    "priority": "medium",
    "relatedSteps": []
  },
  {
    "category": "backlog",
    "title": "План внедрения улучшений",
    "description": "| # | Проблема | Решение | Тип | Эффект | Сложность | Приоритет |\\n|---|----------|---------|-----|--------|-----------|-----------|\\n| 1 | ... | ... | убрать | время -20% | S | P1 |\\n| 2 | ... | ... | автоматизировать | качество +30% | M | P1 |\\n| 3 | ... | ... | объединить | трудозатраты -15% | S | P2 |\\n...минимум 10-12 пунктов...",
    "priority": "high",
    "relatedSteps": []
  },
  {
    "category": "variants",
    "title": "Варианты целевого процесса",
    "description": "## Консервативный вариант\\nЧто меняется: ...\\nЭффект: ...\\nСроки: 1-2 недели\\n\\n## Сбалансированный вариант\\nЧто меняется: ...\\nЭффект: ...\\nСроки: 1-2 месяца\\n\\n## Радикальный вариант\\nЧто меняется: ...\\nЭффект: ...\\nСроки: 3-6 месяцев",
    "priority": "medium",
    "relatedSteps": []
  }
]

ВАЖНО:
- Ответ должен быть ТОЛЬКО валидным JSON массивом
- Используй markdown-форматирование в description (##, -, |таблицы|, **жирный**)
- В тексте description ВСЕГДА используй НАЗВАНИЯ блоков (поле "name"), а НЕ их id. Например: "Проверить заявку → Согласовать КП", а НЕ "action_1 → action_5"
- В relatedSteps указывай id блоков для технической связи
- Для ролей используй их названия (поле "name"), а не id
- Если метрик нет — делай выводы по структуре и указывай предположения
- Backlog должен содержать минимум 10-12 конкретных пунктов`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    logger.info("AI", "Recommendations response received", { length: text.length });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error("AI", "Failed to extract JSON from recommendations response", { textPreview: text.slice(0, 500) });
      throw new Error("Не удалось извлечь JSON из ответа");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    logger.info("AI", "Recommendations parsed successfully", { count: parsed.length });
    return parsed;
  } catch (error) {
    logger.error("AI", "Recommendations generation failed", error);
    return [
      {
        category: "summary",
        title: "Краткое резюме анализа",
        description: `Не удалось сгенерировать полный анализ. Ошибка: ${error instanceof Error ? error.message : String(error)}. Попробуйте ещё раз.`,
        priority: "high",
        relatedSteps: [],
      },
    ];
  }
}

// ═══════════════════════════════════════════════════════════════════
// CRM Funnel Variants Generation (2-3 variants for user to choose)
// ═══════════════════════════════════════════════════════════════════

export async function generateCrmFunnelVariants(
  data: ProcessData,
  description: string
): Promise<CrmFunnel[]> {
  const blockList = data.blocks
    .map((b) => `${b.id}: ${b.name} (${b.type}, role: ${b.role})`)
    .join("\n");

  const prompt = `Ты — эксперт по CRM и воронкам продаж. На основе бизнес-процесса сгенерируй ровно 3 ВАРИАНТА CRM-воронки.
Каждый вариант — отдельный подход к организации воронки: консервативный, сбалансированный, инновационный.

ПРОЦЕСС: ${data.name}
ЦЕЛЬ: ${data.goal}
БЛОКИ:
${blockList}

ЗАПРОС ПОЛЬЗОВАТЕЛЯ: ${description}

Верни JSON-массив из РОВНО 3 объектов CrmFunnel (без лишнего текста):
[
  {
    "id": "variant-1",
    "name": "Вариант 1: Консервативный",
    "description": "Описание подхода...",
    "stages": [
      {
        "id": "stage-1-1",
        "name": "Название этапа",
        "level": 0,
        "order": 1,
        "exitCriteria": "Критерий выхода",
        "ownerRole": "Роль",
        "slaDays": 3,
        "checklist": ["Шаг 1", "Шаг 2"],
        "relatedBlockIds": ["blockId1"],
        "automations": ["CRM уведомление"],
        "conversionTarget": 80
      }
    ],
    "statuses": [
      {"id": "s1", "name": "В работе", "type": "pause", "description": "..."},
      {"id": "s2", "name": "Отказ", "type": "lost", "description": "..."},
      {"id": "s3", "name": "Сделка закрыта", "type": "won", "description": "..."}
    ],
    "qualityNotes": ["Примечание к качеству"]
  },
  { "id": "variant-2", "name": "Вариант 2: Сбалансированный", ... },
  { "id": "variant-3", "name": "Вариант 3: Инновационный", ... }
]

Используй реальные blockId из процесса в relatedBlockIds. Только JSON, без пояснений.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Не удалось извлечь JSON из ответа");
    const variants = JSON.parse(jsonMatch[0]) as CrmFunnel[];
    return variants.slice(0, 3);
  } catch (error) {
    logger.error("AI", "CRM variants generation failed", error);
    throw new Error("Не удалось сгенерировать варианты CRM-воронки");
  }
}

// ═══════════════════════════════════════════════════════════════════
// Recommendations Change Request
// ═══════════════════════════════════════════════════════════════════

export async function applyRecommendationChanges(
  currentRecs: Array<{ category: string; title: string; description: string; priority: string; relatedSteps: string[] }>,
  processData: ProcessData,
  changeDescription: string
): Promise<Array<{ category: string; title: string; description: string; priority: string; relatedSteps: string[] }>> {
  const prompt = `Ты — консультант по оптимизации бизнес-процессов. Тебе даны текущие рекомендации по процессу и запрос на их изменение.
Верни ОБНОВЛЁННЫЙ список рекомендаций в том же JSON-формате, применив изменения согласно запросу.

ПРОЦЕСС: ${processData.name}

ТЕКУЩИЕ РЕКОМЕНДАЦИИ:
${JSON.stringify(currentRecs, null, 2)}

ЗАПРОС НА ИЗМЕНЕНИЕ:
${changeDescription}

Верни JSON-массив рекомендаций (только JSON, без пояснений):
[{"category":"...","title":"...","description":"...","priority":"high|medium|low","relatedSteps":["blockId"]}]`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 10000,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Не удалось извлечь JSON из ответа");
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.error("AI", "Recommendation change failed", error);
    throw new Error("Не удалось применить изменения к рекомендациям");
  }
}

// ═══════════════════════════════════════════════════════════════════
// Process Passport Generation
// ═══════════════════════════════════════════════════════════════════

export function generatePassport(data: ProcessData): ProcessPassport {
  // Extract unique documents
  const inputDocs = new Set<string>();
  const outputDocs = new Set<string>();
  const allSystems = new Set<string>();
  const triggers: string[] = [data.startEvent];

  const actionBlocks = data.blocks.filter(b => b.type === "action");
  const productBlocks = data.blocks.filter(b => b.type === "product");

  for (const block of data.blocks) {
    block.inputDocuments?.forEach(d => inputDocs.add(d));
    block.outputDocuments?.forEach(d => outputDocs.add(d));
    block.infoSystems?.forEach(s => allSystems.add(s));
  }

  // Build main flow from connected action blocks (happy path approximation)
  const mainFlow = actionBlocks.map((block, i) => {
    const role = data.roles.find(r => r.id === block.role);
    return {
      order: i + 1,
      name: block.name,
      role: role?.name || block.role,
      description: block.description,
    };
  });

  // Extract exceptions from decision branches
  const exceptions: string[] = [];
  for (const block of data.blocks) {
    if (block.type === "decision") {
      const nonDefaultBranches = data.blocks.filter(
        b => block.connections.includes(b.id) && !b.isDefault && b.conditionLabel
      );
      for (const branch of nonDefaultBranches) {
        exceptions.push(`${block.name}: ${branch.conditionLabel} → ${branch.name}`);
      }
    }
  }

  // Build documents list
  const documents: ProcessPassport["documents"] = [];
  for (const doc of inputDocs) {
    documents.push({ name: doc, type: "input", stage: "Вход" });
  }
  for (const block of productBlocks) {
    documents.push({ name: block.name, type: "intermediate", stage: block.stage });
  }
  for (const doc of outputDocs) {
    documents.push({ name: doc, type: "output", stage: "Выход" });
  }

  // Build roles with RACI approximation
  const passportRoles = data.roles.map((role, i) => ({
    name: role.name,
    raci: (i === 0 ? "A" : "R") as "R" | "A" | "C" | "I",
    department: role.department || "",
  }));

  // SLA from time estimates
  const sla: ProcessPassport["sla"] = [];
  for (const block of actionBlocks) {
    if (block.timeEstimate) {
      sla.push({
        metric: `Время: ${block.name}`,
        target: block.timeEstimate,
        measurement: "Автоматический таймер",
      });
    }
  }

  // Risks from decision points and exceptions
  const risks: ProcessPassport["risks"] = [];
  const decisionBlocks = data.blocks.filter(b => b.type === "decision");
  for (const d of decisionBlocks) {
    risks.push({
      description: `Точка принятия решения: ${d.name}`,
      impact: "medium",
      control: `Gateway с условиями: ${d.connections.length} ветвей`,
    });
  }

  return {
    name: data.name,
    owner: data.owner,
    customer: "Клиент процесса",
    goal: data.goal,
    boundaries: {
      start: data.startEvent,
      end: data.endEvent,
      scope: `${data.blocks.length} блоков, ${data.roles.length} ролей, ${data.stages.length} этапов`,
    },
    triggers,
    inputs: Array.from(inputDocs),
    outputs: Array.from(outputDocs),
    roles: passportRoles,
    systems: Array.from(allSystems),
    mainFlow,
    exceptions,
    documents,
    sla,
    risks,
    integrations: Array.from(allSystems).map(s => `Интеграция с ${s}`),
    version: "1.0",
    lastUpdated: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Fallback Process Generator (BMC/VPC-aligned)
// ═══════════════════════════════════════════════════════════════════

function generateFallbackProcess(
  answers: Record<string, string>,
  companyName: string
): ProcessData {
  const processName = answers.a1 || answers.b1 || "Бизнес-процесс";
  const goal = answers.b2 || answers.a4 || "Создание ценности для клиента";
  const owner = answers.a5 || "Руководитель";
  const trigger = answers.a3 || "Поступление заявки от клиента";
  const result = answers.a4 || "Выполненная задача";
  const rolesStr = answers.e1 || "Руководитель, Менеджер по продажам, Аналитик, Бухгалтер, Специалист, Юрист";
  const stepsStr = answers.d1 || "Инициация, Квалификация, Подготовка предложения, Согласование, Исполнение, Контроль качества, Закрытие";
  const channels = answers.c1 || "Сайт, Телефон, Email";
  const partners = answers.e3 || "";

  const roleNames = rolesStr.split(/[,;]/).map((r) => r.trim()).filter(Boolean);
  const stageNames = stepsStr.split(/[,;.]/).map((s) => s.trim()).filter(Boolean);

  // Ensure at least 6 roles
  const defaultRoles = ["Руководитель", "Менеджер", "Аналитик", "Специалист", "Бухгалтер", "Юрист"];
  while (roleNames.length < 6) {
    const next = defaultRoles[roleNames.length];
    if (next && !roleNames.includes(next)) roleNames.push(next);
    else break;
  }

  // Add external partner if mentioned
  if (partners && partners.trim()) {
    const partnerName = partners.split(/[,;]/)[0].trim();
    if (partnerName && !roleNames.includes(partnerName)) {
      roleNames.push(partnerName + " (внешний)");
    }
  }

  const roles: ProcessRole[] = roleNames.map((name, i) => ({
    id: `role_${i + 1}`,
    name,
    description: `Участник процесса: ${name}`,
    department: "",
    color: SWIMLANE_COLORS[i % SWIMLANE_COLORS.length],
  }));

  // Ensure at least 7 stages
  const defaultStages = ["Инициация", "Квалификация", "Подготовка", "Согласование", "Исполнение", "Контроль", "Закрытие"];
  const stages: ProcessStage[] = [];
  const usedStageNames = stageNames.length >= 5 ? stageNames : defaultStages;
  for (let i = 0; i < usedStageNames.length; i++) {
    stages.push({ id: `stage_${i + 1}`, name: usedStageNames[i], order: i + 1 });
  }

  const blocks: ProcessBlock[] = [];
  const r = (i: number) => roles[Math.min(i, roles.length - 1)].id;
  const s = (i: number) => stages[Math.min(i, stages.length - 1)].id;

  // Pre-declare all block IDs for clean cross-references
  const B = {
    start: "b_start",
    recv: "b_recv",
    regProduct: "b_reg_product",
    // Квалификация
    anal: "b_anal",
    checkFeasible: "b_check_feasible",
    qualOk: "b_qual_ok",
    qualFail: "b_qual_fail",
    endReject: "b_end_reject",
    // Подготовка (паттерн: переторжка)
    prepKP: "b_prep_kp",
    calcCost: "b_calc_cost",
    buhCheck: "b_buh_check",
    kpProduct: "b_kp_product",
    // Согласование (паттерн: 4-eyes)
    legalCheck: "b_legal_check",
    approveDec: "b_approve_dec",
    approvedProduct: "b_approved_product",
    rework: "b_rework",
    // Исполнение
    sendClient: "b_send_client",
    clientDec: "b_client_dec",
    signContract: "b_sign_contract",
    execWork: "b_exec_work",
    returnCalc: "b_return_calc",
    // Контроль (паттерн: приёмка)
    qaCheck: "b_qa_check",
    qaDec: "b_qa_dec",
    qaOkProduct: "b_qa_ok_product",
    qaFail: "b_qa_fail",
    // Закрытие
    invoice: "b_invoice",
    closeCRM: "b_close_crm",
    endSuccess: "b_end_success",
  };

  // ═══ Stage 1: Инициация (Customer Segments → triggers) ═══
  blocks.push({ id: B.start, name: trigger, description: `Триггер процесса: ${trigger}. Канал: ${channels}`, type: "start", role: r(0), stage: s(0), connections: [B.recv] });
  blocks.push({ id: B.recv, name: "Принять заявку", description: "Регистрация входящей заявки в системе и назначение ответственного", type: "action", role: r(1), stage: s(0), timeEstimate: "10 мин", inputDocuments: ["Заявка клиента"], outputDocuments: ["Зарегистрированная заявка"], infoSystems: ["CRM"], connections: [B.regProduct] });
  blocks.push({ id: B.regProduct, name: "Зарегистрированная заявка", description: "Заявка зафиксирована в CRM с присвоенным номером", type: "product", role: r(1), stage: s(0), connections: [B.anal] });

  // ═══ Stage 2: Квалификация (Key Activities → анализ) ═══
  blocks.push({ id: B.anal, name: "Проанализировать требования", description: "Изучение требований клиента, проверка выполнимости и приоритизация", type: "action", role: r(2), stage: s(1), timeEstimate: "1 ч", inputDocuments: ["Заявка", "Каталог услуг"], infoSystems: ["CRM", "BI-система"], connections: [B.checkFeasible] });
  blocks.push({ id: B.checkFeasible, name: "Выполнимо?", description: "Оценка технической и коммерческой выполнимости", type: "decision", role: r(2), stage: s(1), connections: [B.qualOk, B.qualFail] });
  blocks.push({ id: B.qualOk, name: "Требования подтверждены", description: "Заявка прошла квалификацию и готова к проработке", type: "product", role: r(2), stage: s(1), conditionLabel: "Да", isDefault: true, connections: [B.prepKP] });
  blocks.push({ id: B.qualFail, name: "Уведомить клиента об отказе", description: "Отправка обоснованного отказа с рекомендациями", type: "action", role: r(1), stage: s(1), conditionLabel: "Нет", timeEstimate: "15 мин", inputDocuments: ["Результат анализа"], infoSystems: ["Email", "CRM"], connections: [B.endReject] });
  blocks.push({ id: B.endReject, name: "Заявка отклонена", description: "Процесс завершён — отказ. Причина зафиксирована в CRM", type: "end", role: r(1), stage: s(1), connections: [] });

  // ═══ Stage 3: Подготовка (паттерн: переторжка с пересчётом) ═══
  blocks.push({ id: B.prepKP, name: "Подготовить коммерческое предложение", description: "Формирование КП на основе квалифицированных требований", type: "action", role: r(1), stage: s(2), timeEstimate: "2 ч", inputDocuments: ["Квалифицированные требования"], outputDocuments: ["Черновик КП"], infoSystems: ["CRM", "Шаблоны"], connections: [B.calcCost] });
  blocks.push({ id: B.calcCost, name: "Рассчитать стоимость", description: "Детальный расчёт себестоимости, маржи и итоговой цены", type: "action", role: r(4), stage: s(2), timeEstimate: "1 ч", inputDocuments: ["Черновик КП", "Прайс-лист"], outputDocuments: ["Калькуляция"], infoSystems: ["1С"], connections: [B.buhCheck] });
  blocks.push({ id: B.buhCheck, name: "Проверить финансовые параметры", description: "Верификация калькуляции, проверка лимитов и маржинальности", type: "action", role: r(3), stage: s(2), timeEstimate: "30 мин", inputDocuments: ["Калькуляция"], infoSystems: ["1С"], connections: [B.kpProduct] });
  blocks.push({ id: B.kpProduct, name: "Готовое КП", description: "КП сформировано, рассчитано и проверено бухгалтерией", type: "product", role: r(1), stage: s(2), connections: [B.legalCheck] });

  // ═══ Stage 4: Согласование (паттерн: 4-eyes approval) ═══
  blocks.push({ id: B.legalCheck, name: "Проверить юридические аспекты", description: "Юридическая экспертиза условий сделки и договора", type: "action", role: r(5), stage: s(3), timeEstimate: "1 ч", inputDocuments: ["КП", "Шаблон договора"], outputDocuments: ["Юридическое заключение"], infoSystems: ["СЭД"], connections: [B.approveDec] });
  blocks.push({ id: B.approveDec, name: "Согласовано руководством?", description: "Решение руководителя по итогам юридической проверки", type: "decision", role: r(0), stage: s(3), connections: [B.approvedProduct, B.rework] });
  blocks.push({ id: B.approvedProduct, name: "КП утверждено", description: "Предложение согласовано всеми сторонами и готово к отправке", type: "product", role: r(0), stage: s(3), conditionLabel: "Утверждено", isDefault: true, connections: [B.sendClient] });
  blocks.push({ id: B.rework, name: "Доработать КП", description: "Возврат на доработку по замечаниям руководства или юриста", type: "action", role: r(1), stage: s(3), conditionLabel: "На доработку", timeEstimate: "1 ч", inputDocuments: ["Замечания"], infoSystems: ["CRM"], connections: [B.calcCost] });

  // ═══ Stage 5: Исполнение (Revenue Streams → фиксация сделки) ═══
  blocks.push({ id: B.sendClient, name: "Отправить КП клиенту", description: "Презентация и отправка коммерческого предложения", type: "action", role: r(1), stage: s(4), timeEstimate: "30 мин", inputDocuments: ["Утверждённое КП"], infoSystems: ["Email", "CRM"], connections: [B.clientDec] });
  blocks.push({ id: B.clientDec, name: "Клиент принял КП?", description: "Ожидание решения клиента по коммерческому предложению", type: "decision", role: r(1), stage: s(4), connections: [B.signContract, B.returnCalc] });
  blocks.push({ id: B.signContract, name: "Подписать договор", description: "Оформление и подписание договора обеими сторонами", type: "action", role: r(5), stage: s(4), conditionLabel: "Принято", isDefault: true, timeEstimate: "2 ч", inputDocuments: ["КП", "Договор"], outputDocuments: ["Подписанный договор"], infoSystems: ["СЭД"], connections: [B.execWork] });
  blocks.push({ id: B.returnCalc, name: "Скорректировать условия", description: "Переторжка: пересчёт условий по запросу клиента", type: "action", role: r(1), stage: s(4), conditionLabel: "Нужна корректировка", timeEstimate: "1 ч", infoSystems: ["CRM"], connections: [B.calcCost] });
  blocks.push({ id: B.execWork, name: "Выполнить работы", description: "Реализация обязательств по подписанному договору", type: "action", role: r(3), stage: s(4), timeEstimate: "5 дн", inputDocuments: ["Договор", "ТЗ"], outputDocuments: ["Результат работ"], infoSystems: ["Jira", "1С"], connections: [B.qaCheck] });

  // ═══ Stage 6: Контроль (Quality + SLA) ═══
  blocks.push({ id: B.qaCheck, name: "Проверить качество", description: "Контроль качества результатов выполнения по чек-листу", type: "action", role: r(2), stage: s(5), timeEstimate: "2 ч", inputDocuments: ["Результат работ", "Чек-лист качества"], infoSystems: ["Jira"], connections: [B.qaDec] });
  blocks.push({ id: B.qaDec, name: "Качество соответствует?", description: "Оценка соответствия результата требованиям и SLA", type: "decision", role: r(0), stage: s(5), connections: [B.qaOkProduct, B.qaFail] });
  blocks.push({ id: B.qaOkProduct, name: "Работа принята", description: "Результат соответствует требованиям и готов к передаче", type: "product", role: r(0), stage: s(5), conditionLabel: "Принято", isDefault: true, connections: [B.invoice] });
  blocks.push({ id: B.qaFail, name: "Вернуть на исправление", description: "Устранение выявленных замечаний и дефектов", type: "action", role: r(3), stage: s(5), conditionLabel: "Замечания", timeEstimate: "1 дн", inputDocuments: ["Список замечаний"], infoSystems: ["Jira"], connections: [B.execWork] });

  // ═══ Stage 7: Закрытие (Revenue Streams → фиксация выручки) ═══
  blocks.push({ id: B.invoice, name: "Выставить счёт", description: "Формирование финального счёта и закрывающих документов", type: "action", role: r(4), stage: s(6), timeEstimate: "30 мин", inputDocuments: ["Договор", "Акт приёмки"], outputDocuments: ["Счёт", "Акт выполненных работ"], infoSystems: ["1С"], connections: [B.closeCRM] });
  blocks.push({ id: B.closeCRM, name: "Закрыть сделку в CRM", description: "Обновление статуса сделки, архивирование и фиксация результата", type: "action", role: r(1), stage: s(6), timeEstimate: "15 мин", infoSystems: ["CRM"], connections: [B.endSuccess] });
  blocks.push({ id: B.endSuccess, name: result, description: "Процесс завершён успешно. Ценность доставлена клиенту", type: "end", role: r(0), stage: s(6), connections: [] });

  return {
    name: processName,
    goal,
    owner,
    startEvent: trigger,
    endEvent: result,
    roles,
    stages,
    blocks,
  };
}

export async function generateRegulationDocument(
  roleName: string,
  docType: "regulation" | "job_instruction",
  companyName: string,
  processData?: ProcessData
): Promise<string> {
  // Build rich context from process data for this role
  let processContext = "";
  if (processData) {
    const role = processData.roles.find(r => r.name === roleName);
    const roleBlocks = processData.blocks.filter(b => b.role === roleName || b.role === role?.id);

    // Group blocks by stage
    const stageMap = new Map(processData.stages.map(s => [s.id, s.name]));
    const blocksByStage = new Map<string, typeof roleBlocks>();
    for (const block of roleBlocks) {
      const stageName = stageMap.get(block.stage) ?? "Общее";
      if (!blocksByStage.has(stageName)) blocksByStage.set(stageName, []);
      blocksByStage.get(stageName)!.push(block);
    }

    // Collect unique docs and systems for this role
    const inputDocs = [...new Set(roleBlocks.flatMap(b => b.inputDocuments ?? []))].filter(Boolean);
    const outputDocs = [...new Set(roleBlocks.flatMap(b => b.outputDocuments ?? []))].filter(Boolean);
    const systems = [...new Set(roleBlocks.flatMap(b => b.infoSystems ?? []))].filter(Boolean);
    const decisionBlocks = roleBlocks.filter(b => b.type === "decision");

    // Find handoffs: blocks where this role passes to another role
    const blockMap = new Map(processData.blocks.map(b => [b.id, b]));
    const handoffsOut: string[] = [];
    const handoffsIn: string[] = [];
    for (const block of roleBlocks) {
      for (const targetId of block.connections) {
        const target = blockMap.get(targetId);
        if (target && target.role !== block.role && target.role !== role?.id) {
          const targetRole = processData.roles.find(r => r.id === target.role || r.name === target.role);
          handoffsOut.push(`«${block.name}» → ${targetRole?.name ?? target.role} («${target.name}»)`);
        }
      }
    }
    for (const block of processData.blocks) {
      if (block.role === roleName || block.role === role?.id) continue;
      for (const targetId of block.connections) {
        const target = blockMap.get(targetId);
        if (target && (target.role === roleName || target.role === role?.id)) {
          const srcRole = processData.roles.find(r => r.id === block.role || r.name === block.role);
          handoffsIn.push(`${srcRole?.name ?? block.role} («${block.name}») → «${target.name}»`);
        }
      }
    }

    const lines: string[] = [
      `Название компании: ${companyName}`,
      `Название процесса: ${processData.name ?? ""}`,
      `Цель процесса: ${processData.goal ?? "не указана"}`,
      `Должность: ${roleName}`,
      `Департамент: ${role?.department ?? "не указан"}`,
      `Описание роли: ${role?.description ?? "не указано"}`,
      ``,
      `=== ЭТАПЫ И ШАГИ ДОЛЖНОСТИ (${roleBlocks.length} шагов) ===`,
    ];

    // Sort stages by order
    const sortedStages = [...processData.stages].sort((a, b) => a.order - b.order);
    const sortedBlocksByStage = new Map<string, typeof roleBlocks>();
    for (const stage of sortedStages) {
      const stageBlocks = blocksByStage.get(stage.name);
      if (stageBlocks?.length) sortedBlocksByStage.set(stage.name, stageBlocks);
    }
    // Also include any blocks that map to unknown stages
    for (const [k, v] of blocksByStage) {
      if (!sortedBlocksByStage.has(k)) sortedBlocksByStage.set(k, v);
    }

    for (const [stageName, blocks] of sortedBlocksByStage) {
      lines.push(`\n--- ЭТАП: «${stageName}» ---`);
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const typeLabel: Record<string, string> = {
          action: "Действие", decision: "Решение", product: "Результат",
          start: "Начало", end: "Конец", split: "Разветвление",
        };
        lines.push(`\nШаг ${i + 1}: ${b.name}`);
        lines.push(`  Тип: ${typeLabel[b.type] ?? b.type}`);
        if (b.description) lines.push(`  Описание: ${b.description}`);
        if (b.timeEstimate) lines.push(`  Срок/время: ${b.timeEstimate}`);
        if (b.conditionLabel) lines.push(`  Условие/критерий: ${b.conditionLabel}`);
        if (b.inputDocuments?.length) lines.push(`  Входящие документы: ${b.inputDocuments.join(", ")}`);
        if (b.outputDocuments?.length) lines.push(`  Результирующие документы: ${b.outputDocuments.join(", ")}`);
        if (b.infoSystems?.length) lines.push(`  Используемые системы: ${b.infoSystems.join(", ")}`);
        if (b.checklist?.length) {
          lines.push(`  Чек-лист выполнения:`);
          for (const item of b.checklist) lines.push(`    ✓ ${item}`);
        }
        // Next steps
        const nextBlocks = b.connections
          .map(id => blockMap.get(id))
          .filter(Boolean)
          .map(nb => {
            const nbRole = processData.roles.find(r => r.id === nb!.role || r.name === nb!.role);
            const sameRole = nb!.role === roleName || nb!.role === role?.id;
            return sameRole ? `→ «${nb!.name}»` : `→ «${nb!.name}» (${nbRole?.name ?? nb!.role})`;
          });
        if (nextBlocks.length) lines.push(`  Далее: ${nextBlocks.join(", ")}`);
      }
    }

    if (decisionBlocks.length) {
      lines.push(`\n=== ТОЧКИ ПРИНЯТИЯ РЕШЕНИЙ ===`);
      for (const d of decisionBlocks) {
        lines.push(`  - «${d.name}»${d.conditionLabel ? `: ${d.conditionLabel}` : ""}`);
        const branches = d.connections.map(id => blockMap.get(id)).filter(Boolean);
        if (branches.length) lines.push(`    Варианты: ${branches.map(b => `«${b!.name}»${b!.isDefault ? " (по умолчанию)" : ""}`).join(", ")}`);
      }
    }

    if (inputDocs.length) lines.push(`\nВсе входящие документы: ${inputDocs.join(", ")}`);
    if (outputDocs.length) lines.push(`\nВсе исходящие документы: ${outputDocs.join(", ")}`);
    if (systems.length) lines.push(`\nВсе информационные системы: ${systems.join(", ")}`);
    if (handoffsIn.length) lines.push(`\nПолучает задачи от: ${handoffsIn.slice(0, 8).join("; ")}`);
    if (handoffsOut.length) lines.push(`\nПередаёт задачи: ${handoffsOut.slice(0, 8).join("; ")}`);

    processContext = lines.join("\n");
  }

  const isRegulation = docType === "regulation";

  const systemPrompt = isRegulation
    ? `Ты опытный бизнес-аналитик. Составляй регламенты строго структурированно, на официальном деловом русском языке. Используй markdown: ## для разделов, ### для подразделов, #### для шагов, - для списков, - [ ] для чек-листов, **жирный** для важного. Регламент должен быть максимально конкретным и применимым на практике. Для каждого этапа и шага пиши полное текстовое описание — что именно нужно сделать, как, в каком порядке.`
    : `Ты специалист по HR и корпоративному праву. Составляй должностные инструкции в строгом соответствии с российским трудовым законодательством, на официальном деловом языке. Используй markdown: ## для разделов, ### для подразделов, - для списков, - [ ] для чек-листов. Инструкция должна быть юридически грамотной и практически применимой.`;

  const userPrompt = isRegulation
    ? `Составь подробный рабочий регламент для должности «${roleName}» компании «${companyName}».

${processContext ? `Данные о процессе и задачах:\n${processContext}\n` : ""}

Структура регламента (строго соблюдай):

## 1. Общие положения
Напиши: назначение регламента, область применения, кто ответственен за актуализацию.

## 2. Термины и сокращения
Расшифруй все специфические термины и аббревиатуры, встречающиеся в регламенте.

## 3. Цели и задачи
Опиши цель работы сотрудника, ключевые показатели результата.

## 4. Порядок выполнения работ
ВАЖНО: Для КАЖДОГО этапа процесса создай подраздел ### с полным описанием. Внутри каждого этапа для КАЖДОГО шага создай подраздел #### с:
- Полным текстовым описанием что именно нужно сделать (2-5 предложений)
- Входящими данными/документами
- Ожидаемым результатом
- Сроком выполнения (если указан)
- Чек-листом выполнения в формате:
  - [ ] пункт 1
  - [ ] пункт 2
  - [ ] пункт 3
Для точек принятия решений опиши критерии каждого варианта выбора.

## 5. Взаимодействие с другими подразделениями
Опиши: от кого получает задачи, кому передаёт, в каком формате и с каким сроком.

## 6. Используемые документы и системы
Перечисли все документы и ИТ-системы с описанием для чего каждый используется.

## 7. Контроль и ответственность
Опиши: кто контролирует, критерии качества, меры при отклонениях.

## 8. Сводный чек-лист должности
Составь итоговый чек-лист — все ключевые контрольные точки в формате - [ ] для самопроверки сотрудника.

Требования: конкретные действия (глаголы), измеримые сроки, понятный язык. Не сокращай разделы 4 и 8 — они должны быть максимально подробными.`
    : `Составь должностную инструкцию для должности «${roleName}» компании «${companyName}».

${processContext ? `Данные о процессе и задачах:\n${processContext}\n` : ""}

Структура должностной инструкции:

## 1. Общие положения
Полное наименование должности, категория, кому подчиняется, кем назначается и освобождается, требования к замещению.

## 2. Квалификационные требования
Опиши: образование, опыт работы, необходимые знания и навыки, профессиональные компетенции — конкретно, исходя из задач должности.

## 3. Должностные обязанности
ВАЖНО: Сгруппируй обязанности по этапам/направлениям работы. Для каждого направления создай подраздел ### и перечисли конкретные обязанности. По каждой ключевой обязанности добавь чек-лист выполнения в формате:
  - [ ] проверить ...
  - [ ] оформить ...
  - [ ] передать ...
Используй все этапы и шаги из данных процесса — они должны найти отражение в обязанностях.

## 4. Права
Опиши права сотрудника: запрос информации, участие в совещаниях, внесение предложений, доступ к системам.

## 5. Ответственность
Опиши ответственность за: результаты, сроки, качество, документы, конфиденциальность — конкретно по задачам должности.

## 6. Взаимодействие
С кем взаимодействует, в какой форме, с какой периодичностью — отдельно по каждой роли/подразделению.

## 7. Условия работы
Режим работы, рабочее место, используемое оборудование и ИТ-системы.

Требования: строгий деловой язык, конкретные формулировки. Раздел 3 должен быть максимально подробным с чек-листами по каждому направлению.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return response.content[0].type === "text" ? response.content[0].text : "";
  } catch (error) {
    logger.error("AI", "Document generation failed", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Legal Document Generation
// ═══════════════════════════════════════════════════════════════════

const LEGAL_SYSTEM_PROMPT = `Ты — юридический ассистент компании. Ты готовишь юридически грамотные деловые документы: письма, уведомления, претензии, ответы на претензии, протоколы разногласий, анализы договоров и редактуру договоров.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
СТИЛЬ И ФОРМАТ ДОКУМЕНТОВ:

1. Язык: официально-деловой, юридически точный, без разговорных оборотов.
2. Тон: уважительный, но твёрдый; не агрессивный, но защищающий интересы компании.
3. Структура исходящего письма:
   — Исходящий номер и дата
   — Должность, ФИО и организация адресата
   — Обращение «Уважаем[ый/ая] [Имя Отчество]!»
   — Вводная часть: ссылка на договор / основание обращения
   — Основная часть: суть, факты, ссылки на нормы права
   — Требование или предложение с конкретным сроком
   — Перечень приложений (если есть)
   — Подпись
4. Ссылки на право: приводи точно (статья, часть, пункт). Если норма под вопросом — пиши [уточнить норму].
5. Суммы: цифрами и прописью в скобках. Пример: 125 000 (сто двадцать пять тысяч) рублей 00 копеек.
6. Неизвестные данные (даты, номера, имена): заменяй на [указать].
7. Перед составлением сложного документа задай 2–3 уточняющих вопроса, если предоставленных данных недостаточно.
8. Всегда уточняй роль компании в конкретной ситуации: Заказчик / Подрядчик / Исполнитель / Поставщик / Заявитель.

ПРИОРИТЕТ: документ всегда должен защищать интересы нашей компании. Не выдумывай факты, суммы и даты — только то, что предоставлено.

Верни ТОЛЬКО текст документа, без вступительных фраз, пояснений и обёрток. Первой строкой выведи заголовок документа (без слова «Заголовок:»).`;

function buildRequisitesBlock(req: Record<string, string | null>): string {
  const lines: string[] = ["РЕКВИЗИТЫ НАШЕЙ КОМПАНИИ:"];
  if (req.fullName) lines.push(`Наименование:      ${req.fullName}`);
  if (req.legalAddress) lines.push(`Юридический адрес: ${req.legalAddress}`);
  if (req.inn) lines.push(`ИНН:               ${req.inn}`);
  if (req.kpp) lines.push(`КПП:               ${req.kpp}`);
  if (req.ogrn) lines.push(`ОГРН:              ${req.ogrn}`);
  if (req.bankAccount) lines.push(`Р/с:               ${req.bankAccount}`);
  if (req.bik) lines.push(`БИК:               ${req.bik}`);
  if (req.corrAccount) lines.push(`Кор/с:             ${req.corrAccount}`);
  if (req.bankName) lines.push(`Банк:              ${req.bankName}`);
  if (req.signatoryTitle && req.signatoryName) {
    lines.push(`Подпись:           ${req.signatoryTitle}, ${req.signatoryName}`);
  }
  if (req.phone) lines.push(`Телефон:           ${req.phone}`);
  if (req.email) lines.push(`Email:             ${req.email}`);
  return lines.join("\n");
}

export async function generateLegalDocument(
  requisites: Record<string, string | null>,
  userPrompt: string
): Promise<{ title: string; content: string }> {
  const reqBlock = buildRequisitesBlock(requisites);
  const fullPrompt = `${reqBlock}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${userPrompt}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: LEGAL_SYSTEM_PROMPT,
    messages: [{ role: "user", content: fullPrompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  // First line = title, rest = content
  const lines = raw.split("\n");
  const title = lines[0].replace(/^#+\s*/, "").trim() || "Документ";
  const content = lines.slice(1).join("\n").trim();
  return { title, content: raw }; // return full text as content
}
