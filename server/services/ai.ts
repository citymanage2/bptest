import Anthropic from "@anthropic-ai/sdk";
import type { ProcessData, ProcessBlock, ProcessRole, ProcessStage } from "../../shared/types";
import { SWIMLANE_COLORS } from "../../shared/types";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || "dummy-key",
});

const PROCESS_GENERATION_PROMPT = `Ты — эксперт по бизнес-процессам и нотации BPMN 2.0 Swimlane.
На основе ответов анкеты сгенерируй ДЕТАЛЬНОЕ описание бизнес-процесса в формате JSON.

ВАЖНО: Ответ — ТОЛЬКО валидный JSON, без markdown-разметки, без пояснений.

Формат ответа:
{
  "name": "Название процесса",
  "goal": "Цель процесса",
  "owner": "Владелец процесса",
  "startEvent": "Что запускает процесс",
  "endEvent": "Чем завершается процесс",
  "roles": [
    { "id": "role_1", "name": "Название роли", "description": "Зона ответственности", "department": "Отдел" }
  ],
  "stages": [
    { "id": "stage_1", "name": "Название этапа", "order": 1 }
  ],
  "blocks": [
    {
      "id": "block_1",
      "name": "Краткое название (глагол)",
      "description": "Детальное описание (1-2 предложения)",
      "type": "start|action|product|decision|split|end",
      "role": "role_1",
      "stage": "stage_1",
      "timeEstimate": "15 мин",
      "inputDocuments": ["Документ 1"],
      "outputDocuments": ["Документ 2"],
      "infoSystems": ["CRM"],
      "connections": ["block_2"],
      "conditionLabel": "",
      "isDefault": false
    }
  ]
}

КРИТИЧЕСКИЕ ПРАВИЛА:
1. Генерируй МНОГО ролей: минимум 5-8 ролей (разных должностей/отделов). Распределяй блоки по разным ролям, чтобы диаграмма использовала все дорожки.
2. Генерируй МНОГО блоков: минимум 20-35 блоков для насыщенной диаграммы.
3. Генерируй 5-8 этапов (стадий).
4. В каждой дорожке (роли) должно быть несколько блоков — не оставляй дорожки пустыми.
5. Блоки должны быть РАСПРЕДЕЛЕНЫ по разным дорожкам — не концентрируй всё в одной роли.
6. Связи (connections) должны идти между блоками в РАЗНЫХ дорожках — процесс должен перетекать между ролями.
7. Используй 2-4 блока decision (ветвления) с двумя+ исходящими ветвями.
8. Используй 2-3 блока product (промежуточные результаты) между основными действиями.
9. Начало: 1 блок start. Конец: 1-2 блока end.
10. Для decision-ветвей: у каждого потомка в поле conditionLabel укажи условие (например "Одобрено", "Отклонено"), одна ветвь isDefault=true.
11. Каждый action-блок ОБЯЗАТЕЛЬНО имеет timeEstimate, inputDocuments и infoSystems.
12. Тип "action" — для действий, тип "product" — для результатов/артефактов.
13. Этапы распределяй равномерно — в каждом этапе 3-6 блоков.
14. Процесс должен переходить между ролями (handoffs) минимум 8-10 раз.`;

export async function generateProcess(
  answers: Record<string, string>,
  companyName: string,
  industry: string
): Promise<ProcessData> {
  const answersText = Object.entries(answers)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: `${PROCESS_GENERATION_PROMPT}

Компания: ${companyName}
Отрасль: ${industry}

Ответы на анкету:
${answersText}

Сгенерируй МАКСИМАЛЬНО ДЕТАЛЬНЫЙ бизнес-процесс с 5-8 ролями, 5-8 этапами и 20-35 блоками. Ответ — ТОЛЬКО JSON.`,
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
    // Return a fallback process if AI fails
    return generateFallbackProcess(answers, companyName);
  }
}

export async function applyChanges(
  currentData: ProcessData,
  changeDescription: string
): Promise<ProcessData> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: `Ты — эксперт по бизнес-процессам. Тебе дан текущий бизнес-процесс в формате JSON и описание требуемых изменений. Верни обновлённый процесс в том же формате JSON.

ВАЖНО: Ответ должен быть ТОЛЬКО валидным JSON без дополнительных пояснений.

Текущий процесс:
${JSON.stringify(currentData, null, 2)}

Требуемые изменения:
${changeDescription}

Верни полный обновлённый JSON процесса с применёнными изменениями.`,
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
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `Проанализируй бизнес-процесс и сгенерируй рекомендации по оптимизации. Верни JSON-массив.

ВАЖНО: Ответ должен быть ТОЛЬКО валидным JSON массивом.

Категории рекомендаций:
- "ai" — автоматизация через ИИ
- "crm" — CRM-интеграция
- "chatbot" — внедрение чат-ботов
- "spreadsheet" — табличная автоматизация
- "1c" — 1С-интеграция

Формат:
[
  {
    "category": "ai",
    "title": "Заголовок рекомендации",
    "description": "Подробное описание",
    "priority": "high|medium|low",
    "relatedSteps": ["block_id_1", "block_id_2"]
  }
]

Бизнес-процесс:
${JSON.stringify(processData, null, 2)}

Сгенерируй 5-10 рекомендаций.`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Не удалось извлечь JSON из ответа");

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error("AI recommendations error:", error);
    return [
      {
        category: "ai",
        title: "Автоматизация рутинных операций",
        description:
          "Рассмотрите возможность автоматизации повторяющихся действий с помощью ИИ для сокращения времени выполнения процесса.",
        priority: "high",
        relatedSteps: [],
      },
      {
        category: "crm",
        title: "Внедрение CRM-системы",
        description:
          "Интеграция CRM позволит автоматизировать отслеживание взаимодействий и повысить прозрачность процесса.",
        priority: "medium",
        relatedSteps: [],
      },
    ];
  }
}

function generateFallbackProcess(
  answers: Record<string, string>,
  companyName: string
): ProcessData {
  const processName = answers.b1 || "Бизнес-процесс";
  const goal = answers.b2 || "Оптимизация деятельности";
  const owner = answers.b3 || "Руководитель";
  const rolesStr = answers.b4 || "Руководитель, Менеджер по продажам, Аналитик, Бухгалтер, Специалист, Юрист";
  const trigger = answers.b5 || "Поступление заявки от клиента";
  const result = answers.b6 || "Выполненная задача";
  const stepsStr = answers.c1 || "Инициация, Квалификация, Подготовка предложения, Согласование, Исполнение, Контроль качества, Закрытие";

  const roleNames = rolesStr.split(/[,;]/).map((r) => r.trim()).filter(Boolean);
  const stageNames = stepsStr.split(/[,;.]/).map((s) => s.trim()).filter(Boolean);

  // Ensure at least 5 roles
  const defaultRoles = ["Руководитель", "Менеджер", "Аналитик", "Специалист", "Бухгалтер", "Юрист"];
  while (roleNames.length < 5) {
    const next = defaultRoles[roleNames.length];
    if (next && !roleNames.includes(next)) roleNames.push(next);
    else break;
  }

  const roles: ProcessRole[] = roleNames.map((name, i) => ({
    id: `role_${i + 1}`,
    name,
    description: `Участник процесса: ${name}`,
    department: "",
    color: SWIMLANE_COLORS[i % SWIMLANE_COLORS.length],
  }));

  // Ensure at least 5 stages
  const defaultStages = ["Инициация", "Анализ", "Подготовка", "Согласование", "Исполнение", "Контроль", "Закрытие"];
  const stages: ProcessStage[] = [];
  const usedNames = stageNames.length >= 5 ? stageNames : defaultStages;
  for (let i = 0; i < usedNames.length; i++) {
    stages.push({ id: `stage_${i + 1}`, name: usedNames[i], order: i + 1 });
  }

  const blocks: ProcessBlock[] = [];
  const r = (i: number) => roles[Math.min(i, roles.length - 1)].id;
  const s = (i: number) => stages[Math.min(i, stages.length - 1)].id;

  // Pre-declare all block IDs for clean cross-references
  const B = {
    start: "b_start",
    recv: "b_recv",
    reg: "b_reg",
    anal: "b_anal",
    check: "b_check",
    qualOk: "b_qual_ok",
    qualFail: "b_qual_fail",
    endReject: "b_end_reject",
    prep: "b_prep",
    calc: "b_calc",
    buhCheck: "b_buh_check",
    offerProd: "b_offer_prod",
    legal: "b_legal",
    approveDec: "b_approve_dec",
    approved: "b_approved",
    rework: "b_rework",
    send: "b_send",
    contract: "b_contract",
    exec: "b_exec",
    qa: "b_qa",
    qaDec: "b_qa_dec",
    qaOk: "b_qa_ok",
    qaFail: "b_qa_fail",
    invoice: "b_invoice",
    close: "b_close",
    end: "b_end",
  };

  // --- Stage 1: Инициация ---
  blocks.push({ id: B.start, name: trigger, description: "Начало процесса", type: "start", role: r(0), stage: s(0), connections: [B.recv] });
  blocks.push({ id: B.recv, name: "Приём заявки", description: "Регистрация входящей заявки в системе", type: "action", role: r(1), stage: s(0), timeEstimate: "10 мин", inputDocuments: ["Заявка клиента"], infoSystems: ["CRM"], connections: [B.reg] });
  blocks.push({ id: B.reg, name: "Зарегистрированная заявка", description: "Заявка внесена в CRM", type: "product", role: r(1), stage: s(0), connections: [B.anal] });

  // --- Stage 2: Анализ ---
  blocks.push({ id: B.anal, name: "Анализ требований", description: "Изучение требований клиента и проверка возможности исполнения", type: "action", role: r(2), stage: s(1), timeEstimate: "1 ч", inputDocuments: ["Заявка"], infoSystems: ["CRM", "BI-система"], connections: [B.check] });
  blocks.push({ id: B.check, name: "Возможно выполнить?", description: "Оценка выполнимости", type: "decision", role: r(2), stage: s(1), connections: [B.qualOk, B.qualFail] });
  blocks.push({ id: B.qualOk, name: "Требования подтверждены", description: "Заявка прошла квалификацию", type: "product", role: r(2), stage: s(1), conditionLabel: "Да", isDefault: true, connections: [B.prep] });
  blocks.push({ id: B.qualFail, name: "Уведомить клиента об отказе", description: "Отправка письма об отклонении", type: "action", role: r(1), stage: s(1), conditionLabel: "Нет", timeEstimate: "15 мин", infoSystems: ["Email"], connections: [B.endReject] });
  blocks.push({ id: B.endReject, name: "Заявка отклонена", description: "Процесс завершён — отказ", type: "end", role: r(1), stage: s(1), connections: [] });

  // --- Stage 3: Подготовка ---
  blocks.push({ id: B.prep, name: "Подготовка коммерческого предложения", description: "Формирование КП на основе требований клиента", type: "action", role: r(1), stage: s(2), timeEstimate: "2 ч", inputDocuments: ["Требования"], outputDocuments: ["КП"], infoSystems: ["CRM"], connections: [B.calc] });
  blocks.push({ id: B.calc, name: "Расчёт стоимости", description: "Детальный расчёт себестоимости и маржи", type: "action", role: r(4), stage: s(2), timeEstimate: "1 ч", inputDocuments: ["КП"], infoSystems: ["1С"], connections: [B.buhCheck] });
  blocks.push({ id: B.buhCheck, name: "Проверка бухгалтерией", description: "Верификация финансовых параметров", type: "action", role: r(3), stage: s(2), timeEstimate: "30 мин", infoSystems: ["1С"], connections: [B.offerProd] });
  blocks.push({ id: B.offerProd, name: "Готовое КП", description: "Коммерческое предложение сформировано", type: "product", role: r(1), stage: s(2), connections: [B.legal] });

  // --- Stage 4: Согласование ---
  blocks.push({ id: B.legal, name: "Юридическая проверка", description: "Проверка правовых аспектов сделки", type: "action", role: r(5), stage: s(3), timeEstimate: "1 ч", inputDocuments: ["КП", "Договор"], infoSystems: ["СЭД"], connections: [B.approveDec] });
  blocks.push({ id: B.approveDec, name: "Согласовано?", description: "Решение руководства", type: "decision", role: r(0), stage: s(3), connections: [B.approved, B.rework] });
  blocks.push({ id: B.approved, name: "КП утверждено", description: "Предложение согласовано руководством", type: "product", role: r(0), stage: s(3), conditionLabel: "Утверждено", isDefault: true, connections: [B.send] });
  blocks.push({ id: B.rework, name: "Доработка КП", description: "Возврат на доработку по замечаниям", type: "action", role: r(1), stage: s(3), conditionLabel: "На доработку", timeEstimate: "1 ч", infoSystems: ["CRM"], connections: [B.calc] });

  // --- Stage 5: Исполнение ---
  blocks.push({ id: B.send, name: "Отправка КП клиенту", description: "Презентация предложения", type: "action", role: r(1), stage: s(4), timeEstimate: "30 мин", infoSystems: ["Email", "CRM"], connections: [B.contract] });
  blocks.push({ id: B.contract, name: "Подписание договора", description: "Оформление и подписание", type: "action", role: r(5), stage: s(4), timeEstimate: "2 ч", inputDocuments: ["Договор"], infoSystems: ["СЭД"], connections: [B.exec] });
  blocks.push({ id: B.exec, name: "Выполнение работ", description: "Реализация обязательств по договору", type: "action", role: r(4), stage: s(4), timeEstimate: "5 дн", infoSystems: ["Jira", "1С"], connections: [B.qa] });

  // --- Stage 6: Контроль ---
  blocks.push({ id: B.qa, name: "Контроль качества", description: "Проверка результатов выполнения", type: "action", role: r(2), stage: s(5), timeEstimate: "2 ч", infoSystems: ["Jira"], connections: [B.qaDec] });
  blocks.push({ id: B.qaDec, name: "Качество ОК?", description: "Оценка соответствия", type: "decision", role: r(0), stage: s(5), connections: [B.qaOk, B.qaFail] });
  blocks.push({ id: B.qaOk, name: "Работа принята", description: "Результат соответствует требованиям", type: "product", role: r(0), stage: s(5), conditionLabel: "Принято", isDefault: true, connections: [B.invoice] });
  blocks.push({ id: B.qaFail, name: "Возврат на исправление", description: "Устранение замечаний", type: "action", role: r(4), stage: s(5), conditionLabel: "Замечания", timeEstimate: "1 дн", infoSystems: ["Jira"], connections: [B.exec] });

  // --- Stage 7: Закрытие ---
  blocks.push({ id: B.invoice, name: "Выставление счёта", description: "Формирование финального счёта", type: "action", role: r(3), stage: s(6), timeEstimate: "30 мин", outputDocuments: ["Счёт", "Акт"], infoSystems: ["1С"], connections: [B.close] });
  blocks.push({ id: B.close, name: "Закрытие сделки в CRM", description: "Обновление статуса в CRM, архивирование", type: "action", role: r(1), stage: s(6), timeEstimate: "15 мин", infoSystems: ["CRM"], connections: [B.end] });
  blocks.push({ id: B.end, name: result, description: "Процесс завершён успешно", type: "end", role: r(0), stage: s(6), connections: [] });

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
