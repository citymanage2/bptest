import Anthropic from "@anthropic-ai/sdk";
import type { ProcessData, ProcessBlock, ProcessRole, ProcessStage } from "../../shared/types";
import { SWIMLANE_COLORS } from "../../shared/types";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || "dummy-key",
});

const PROCESS_GENERATION_PROMPT = `Ты — эксперт по бизнес-процессам и нотации BPMN 2.0. На основе ответов на анкету ты должен сгенерировать структурированное описание бизнес-процесса в формате JSON.

ВАЖНО: Ответ должен быть ТОЛЬКО валидным JSON без каких-либо дополнительных пояснений.

Формат ответа:
{
  "name": "Название процесса",
  "goal": "Цель процесса",
  "owner": "Владелец процесса",
  "startEvent": "Что запускает процесс",
  "endEvent": "Чем завершается процесс",
  "roles": [
    {
      "id": "role_1",
      "name": "Название роли",
      "description": "Описание зоны ответственности",
      "department": "Отдел"
    }
  ],
  "stages": [
    {
      "id": "stage_1",
      "name": "Название этапа",
      "order": 1
    }
  ],
  "blocks": [
    {
      "id": "block_1",
      "name": "Название действия",
      "description": "Описание действия",
      "type": "start|action|product|decision|split|end",
      "role": "role_1",
      "stage": "stage_1",
      "timeEstimate": "15 мин",
      "inputDocuments": ["Документ 1"],
      "outputDocuments": ["Документ 2"],
      "infoSystems": ["CRM"],
      "connections": ["block_2"],
      "conditionLabel": "Для ветвей из decision: [Условие]",
      "isDefault": false
    }
  ]
}

Правила генерации:
1. Процесс должен начинаться с блока типа "start" и заканчиваться одним или несколькими блоками типа "end"
2. Тип "action" — для действий/операций (шестиугольник)
3. Тип "product" — для результатов/продуктов (скруглённый прямоугольник)
4. Тип "decision" — для точек ветвления (ромб с "?"), обязательно 2+ исходящих ветви
5. Тип "split" — для параллельного разделения (перевёрнутый треугольник)
6. Каждый блок кроме end должен иметь connections (куда ведёт)
7. Для decision: каждый потомок должен иметь conditionLabel вида "[Условие]", одна ветвь isDefault=true
8. Генерируй 10-25 блоков для полноты процесса
9. Роли должны соответствовать указанным в ответах участникам
10. Этапы должны отражать крупные стадии процесса`;

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
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: `${PROCESS_GENERATION_PROMPT}

Компания: ${companyName}
Отрасль: ${industry}

Ответы на анкету:
${answersText}

Сгенерируй подробный бизнес-процесс в формате JSON.`,
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
  const rolesStr = answers.b4 || "Менеджер, Специалист";
  const trigger = answers.b5 || "Поступление заявки";
  const result = answers.b6 || "Выполненная задача";
  const stepsStr = answers.c1 || "Приём заявки, Обработка, Выполнение, Контроль";
  const actionsStr = answers.c2 || "";

  const roleNames = rolesStr.split(/[,;]/).map((r) => r.trim()).filter(Boolean);
  const stageNames = stepsStr.split(/[,;.]/).map((s) => s.trim()).filter(Boolean);

  const roles: ProcessRole[] = roleNames.map((name, i) => ({
    id: `role_${i + 1}`,
    name,
    description: `Участник процесса: ${name}`,
    department: "",
    color: SWIMLANE_COLORS[i % SWIMLANE_COLORS.length],
  }));

  if (roles.length === 0) {
    roles.push({
      id: "role_1",
      name: "Исполнитель",
      description: "Основной участник процесса",
      color: SWIMLANE_COLORS[0],
    });
  }

  const stages: ProcessStage[] = stageNames.length > 0
    ? stageNames.map((name, i) => ({ id: `stage_${i + 1}`, name, order: i + 1 }))
    : [
        { id: "stage_1", name: "Инициация", order: 1 },
        { id: "stage_2", name: "Выполнение", order: 2 },
        { id: "stage_3", name: "Завершение", order: 3 },
      ];

  const blocks: ProcessBlock[] = [];

  // Start block
  blocks.push({
    id: "block_start",
    name: trigger,
    description: `Начало процесса: ${trigger}`,
    type: "start",
    role: roles[0].id,
    stage: stages[0].id,
    connections: ["block_1"],
  });

  // Generate action blocks for each stage
  let blockIndex = 1;
  for (let si = 0; si < stages.length; si++) {
    const stage = stages[si];
    const roleForStage = roles[si % roles.length];

    const actionBlock: ProcessBlock = {
      id: `block_${blockIndex}`,
      name: stage.name,
      description: `Выполнение этапа: ${stage.name}`,
      type: "action",
      role: roleForStage.id,
      stage: stage.id,
      timeEstimate: "30 мин",
      connections: [],
    };

    // Add decision after second stage if we have enough stages
    if (si === 1 && stages.length > 3) {
      actionBlock.connections = [`block_decision_${blockIndex}`];
      blocks.push(actionBlock);
      blockIndex++;

      const decisionBlock: ProcessBlock = {
        id: `block_decision_${blockIndex - 1}`,
        name: "Проверка результата",
        description: "Принятие решения о продолжении",
        type: "decision",
        role: roleForStage.id,
        stage: stage.id,
        connections: [`block_${blockIndex}`, `block_${blockIndex + 1}`],
      };
      blocks.push(decisionBlock);

      // Yes branch
      const yesBlock: ProcessBlock = {
        id: `block_${blockIndex}`,
        name: "Результат одобрен",
        description: "Переход к следующему этапу",
        type: "product",
        role: roleForStage.id,
        stage: stage.id,
        conditionLabel: "[Одобрено]",
        isDefault: true,
        connections: si + 1 < stages.length ? [`block_${blockIndex + 2}`] : ["block_end"],
      };
      blocks.push(yesBlock);
      blockIndex++;

      // No branch - loop back
      const noBlock: ProcessBlock = {
        id: `block_${blockIndex}`,
        name: "Требуется доработка",
        description: "Возврат на доработку",
        type: "action",
        role: roleForStage.id,
        stage: stage.id,
        conditionLabel: "[Отклонено]",
        connections: [`block_${blockIndex - 3}`],
      };
      blocks.push(noBlock);
      blockIndex++;
    } else {
      actionBlock.connections = si + 1 < stages.length ? [`block_${blockIndex + 1}`] : ["block_end"];
      blocks.push(actionBlock);
      blockIndex++;
    }
  }

  // End block
  blocks.push({
    id: "block_end",
    name: result,
    description: `Завершение процесса: ${result}`,
    type: "end",
    role: roles[roles.length - 1].id,
    stage: stages[stages.length - 1].id,
    connections: [],
  });

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
