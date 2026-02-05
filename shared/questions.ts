import type { InterviewQuestion } from "./types";

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  // ═══════════════════════════════════════════════════════════
  // Block A: SIPOC — Границы процесса (Шаг 0)
  // ═══════════════════════════════════════════════════════════
  {
    id: "a1",
    block: "A",
    blockName: "Границы процесса (SIPOC)",
    question: "Какой бизнес-процесс вы хотите описать? Дайте ему название.",
    required: true,
    expressMode: true,
    order: 1,
  },
  {
    id: "a2",
    block: "A",
    blockName: "Границы процесса (SIPOC)",
    question: "Кто является клиентом (потребителем результата) этого процесса?",
    hint: "Внешний клиент, внутренний заказчик, отдел, партнёр",
    required: true,
    expressMode: true,
    order: 2,
  },
  {
    id: "a3",
    block: "A",
    blockName: "Границы процесса (SIPOC)",
    question: "Что является входом (триггером) процесса? Что запускает его?",
    hint: "Заявка, заказ, запрос, событие, дата, сигнал из системы",
    required: true,
    expressMode: true,
    order: 3,
  },
  {
    id: "a4",
    block: "A",
    blockName: "Границы процесса (SIPOC)",
    question: "Каков ожидаемый результат (выход) процесса? Что получает клиент?",
    hint: "Продукт, услуга, документ, решение, статус",
    required: true,
    expressMode: true,
    order: 4,
  },
  {
    id: "a5",
    block: "A",
    blockName: "Границы процесса (SIPOC)",
    question: "Кто является владельцем (ответственным) процесса?",
    required: true,
    expressMode: true,
    order: 5,
  },
  {
    id: "a6",
    block: "A",
    blockName: "Границы процесса (SIPOC)",
    question: "Где проходят границы процесса — что НЕ входит в его зону?",
    hint: "Например: послепродажное обслуживание не входит в процесс продаж",
    required: false,
    expressMode: false,
    order: 6,
  },

  // ═══════════════════════════════════════════════════════════
  // Block B: Клиентские сегменты и ценность (BMC: CS + VP)
  // ═══════════════════════════════════════════════════════════
  {
    id: "b1",
    block: "B",
    blockName: "Клиенты и ценность (BMC)",
    question: "Какие сегменты клиентов обслуживает этот процесс?",
    hint: "B2B, B2C, крупный/средний/малый бизнес, госсектор, физлица",
    required: true,
    expressMode: true,
    order: 7,
  },
  {
    id: "b2",
    block: "B",
    blockName: "Клиенты и ценность (BMC)",
    question: "Какую ценность (Value Proposition) создаёт процесс для клиента?",
    hint: "Решение проблемы, экономия времени, снижение рисков, удобство",
    required: true,
    expressMode: true,
    order: 8,
  },
  {
    id: "b3",
    block: "B",
    blockName: "Клиенты и ценность (BMC)",
    question: "Каковы критерии успеха процесса с точки зрения клиента?",
    hint: "Скорость, качество, стоимость, полнота, точность",
    required: true,
    expressMode: false,
    order: 9,
  },
  {
    id: "b4",
    block: "B",
    blockName: "Клиенты и ценность (BMC)",
    question: "Отличается ли процесс для разных сегментов клиентов? Если да, как?",
    hint: "Разные ветки, сроки, условия, уровни обслуживания",
    required: false,
    expressMode: false,
    order: 10,
  },

  // ═══════════════════════════════════════════════════════════
  // Block C: Каналы и коммуникации (BMC: CH + CR)
  // ═══════════════════════════════════════════════════════════
  {
    id: "c1",
    block: "C",
    blockName: "Каналы и взаимодействие (BMC)",
    question: "Через какие каналы клиент инициирует процесс?",
    hint: "Сайт, телефон, email, мессенджер, личный визит, API",
    required: true,
    expressMode: true,
    order: 11,
  },
  {
    id: "c2",
    block: "C",
    blockName: "Каналы и взаимодействие (BMC)",
    question: "Как клиент получает информацию о ходе и результате процесса?",
    hint: "Уведомления, личный кабинет, звонок менеджера, письмо",
    required: false,
    expressMode: false,
    order: 12,
  },
  {
    id: "c3",
    block: "C",
    blockName: "Каналы и взаимодействие (BMC)",
    question: "Какие точки взаимодействия с клиентом существуют в ходе процесса ('моменты истины')?",
    hint: "Первый контакт, презентация, согласование, приёмка, обратная связь",
    required: false,
    expressMode: false,
    order: 13,
  },
  {
    id: "c4",
    block: "C",
    blockName: "Каналы и взаимодействие (BMC)",
    question: "Какие правила согласования/утверждения действуют в процессе?",
    hint: "Кто согласовывает, при какой сумме, сколько уровней",
    required: false,
    expressMode: false,
    order: 14,
  },

  // ═══════════════════════════════════════════════════════════
  // Block D: Основной поток — Key Activities (BMC: KA)
  // ═══════════════════════════════════════════════════════════
  {
    id: "d1",
    block: "D",
    blockName: "Основной поток (Key Activities)",
    question: "Опишите основные этапы (крупные стадии) процесса от начала до конца.",
    hint: "Инициация → Квалификация → Подготовка → Согласование → Исполнение → Контроль → Закрытие",
    required: true,
    expressMode: true,
    order: 15,
  },
  {
    id: "d2",
    block: "D",
    blockName: "Основной поток (Key Activities)",
    question: "Какие конкретные действия выполняются на каждом этапе?",
    hint: "Используйте формат: Глагол + Объект (Проверить заявку, Сформировать КП)",
    required: true,
    expressMode: true,
    order: 16,
  },
  {
    id: "d3",
    block: "D",
    blockName: "Основной поток (Key Activities)",
    question: "Есть ли в процессе точки принятия решений? Опишите условия и варианты.",
    hint: "Одобрено/Отклонено, Соответствует/Не соответствует, Сумма > порога",
    required: true,
    expressMode: false,
    order: 17,
  },
  {
    id: "d4",
    block: "D",
    blockName: "Основной поток (Key Activities)",
    question: "Есть ли действия, которые выполняются параллельно?",
    hint: "Одновременная подготовка документов и согласование с партнёром",
    required: false,
    expressMode: false,
    order: 18,
  },
  {
    id: "d5",
    block: "D",
    blockName: "Основной поток (Key Activities)",
    question: "Что происходит при ошибке или отклонении от нормального хода?",
    hint: "Возврат, эскалация, повторная проверка, отмена",
    required: false,
    expressMode: false,
    order: 19,
  },
  {
    id: "d6",
    block: "D",
    blockName: "Основной поток (Key Activities)",
    question: "Сколько времени занимает каждый этап?",
    required: false,
    expressMode: false,
    order: 20,
  },

  // ═══════════════════════════════════════════════════════════
  // Block E: Участники и ресурсы (BMC: KR + KP)
  // ═══════════════════════════════════════════════════════════
  {
    id: "e1",
    block: "E",
    blockName: "Участники и ресурсы (Key Resources)",
    question: "Какие роли (должности/подразделения) участвуют в процессе?",
    hint: "Менеджер, Аналитик, Руководитель, Бухгалтер, Юрист, Технический специалист",
    required: true,
    expressMode: true,
    order: 21,
  },
  {
    id: "e2",
    block: "E",
    blockName: "Участники и ресурсы (Key Resources)",
    question: "Кто за что отвечает? Опишите зоны ответственности.",
    hint: "Кто выполняет (R), кто утверждает (A), кого информируют (I)",
    required: true,
    expressMode: false,
    order: 22,
  },
  {
    id: "e3",
    block: "E",
    blockName: "Участники и ресурсы (Key Resources)",
    question: "Участвуют ли внешние партнёры или подрядчики? Какова их роль?",
    hint: "Поставщик, банк, курьерская служба, подрядчик, аудитор",
    required: false,
    expressMode: false,
    order: 23,
  },
  {
    id: "e4",
    block: "E",
    blockName: "Участники и ресурсы (Key Resources)",
    question: "Какие информационные системы используются в процессе?",
    hint: "CRM, ERP, 1С, email, мессенджеры, СЭД, BI, Jira",
    required: true,
    expressMode: true,
    order: 24,
  },
  {
    id: "e5",
    block: "E",
    blockName: "Участники и ресурсы (Key Resources)",
    question: "Какие системы интегрированы между собой? Какие данные передаются?",
    required: false,
    expressMode: false,
    order: 25,
  },

  // ═══════════════════════════════════════════════════════════
  // Block F: Документы и данные (BPMN Data Objects)
  // ═══════════════════════════════════════════════════════════
  {
    id: "f1",
    block: "F",
    blockName: "Документы и данные",
    question: "Какие документы создаются или используются в процессе?",
    hint: "Заявка, КП, договор, счёт, акт, отчёт, протокол",
    required: true,
    expressMode: true,
    order: 26,
  },
  {
    id: "f2",
    block: "F",
    blockName: "Документы и данные",
    question: "На каком этапе какой документ создаётся и кто его формирует?",
    required: false,
    expressMode: false,
    order: 27,
  },
  {
    id: "f3",
    block: "F",
    blockName: "Документы и данные",
    question: "Какие промежуточные результаты (артефакты) создаются в ходе процесса?",
    hint: "Расчёт, протокол согласования, чек-лист, акт приёмки",
    required: false,
    expressMode: false,
    order: 28,
  },

  // ═══════════════════════════════════════════════════════════
  // Block G: Доход и финансы (BMC: RS + CS)
  // ═══════════════════════════════════════════════════════════
  {
    id: "g1",
    block: "G",
    blockName: "Доход и контроль затрат (BMC)",
    question: "В какой момент процесса фиксируется выручка? Каковы условия оплаты?",
    hint: "Предоплата, постоплата, этапное финансирование, подписка",
    required: false,
    expressMode: false,
    order: 29,
  },
  {
    id: "g2",
    block: "G",
    blockName: "Доход и контроль затрат (BMC)",
    question: "Какие документы являются основанием для оплаты?",
    hint: "Счёт, акт выполненных работ, накладная, договор",
    required: false,
    expressMode: false,
    order: 30,
  },
  {
    id: "g3",
    block: "G",
    blockName: "Доход и контроль затрат (BMC)",
    question: "Есть ли точки контроля бюджета или лимитов в процессе?",
    hint: "Лимит суммы сделки, бюджет проекта, контроль себестоимости",
    required: false,
    expressMode: false,
    order: 31,
  },

  // ═══════════════════════════════════════════════════════════
  // Block H: Метрики и SLA
  // ═══════════════════════════════════════════════════════════
  {
    id: "h1",
    block: "H",
    blockName: "Метрики и SLA",
    question: "Какие KPI используются для оценки процесса?",
    hint: "Время выполнения, конверсия, количество ошибок, удовлетворённость",
    required: false,
    expressMode: false,
    order: 32,
  },
  {
    id: "h2",
    block: "H",
    blockName: "Метрики и SLA",
    question: "Каковы целевые значения (SLA) для ключевых этапов?",
    hint: "Ответ на заявку — 1 ч, подготовка КП — 1 день, согласование — 3 дня",
    required: false,
    expressMode: false,
    order: 33,
  },
  {
    id: "h3",
    block: "H",
    blockName: "Метрики и SLA",
    question: "Что происходит при нарушении SLA? Есть ли эскалация?",
    required: false,
    expressMode: false,
    order: 34,
  },

  // ═══════════════════════════════════════════════════════════
  // Block I: Проблемы и риски
  // ═══════════════════════════════════════════════════════════
  {
    id: "i1",
    block: "I",
    blockName: "Проблемы и риски",
    question: "Какие основные проблемы и узкие места существуют в процессе?",
    required: false,
    expressMode: false,
    order: 35,
  },
  {
    id: "i2",
    block: "I",
    blockName: "Проблемы и риски",
    question: "На каких этапах чаще всего возникают задержки или ошибки?",
    required: false,
    expressMode: false,
    order: 36,
  },
  {
    id: "i3",
    block: "I",
    blockName: "Проблемы и риски",
    question: "Бывают ли ситуации потери информации при передаче между участниками?",
    required: false,
    expressMode: false,
    order: 37,
  },
  {
    id: "i4",
    block: "I",
    blockName: "Проблемы и риски",
    question: "Какие контрольные точки и проверки качества существуют?",
    hint: "4-eyes принцип, чек-листы, тестирование, приёмка",
    required: false,
    expressMode: false,
    order: 38,
  },

  // ═══════════════════════════════════════════════════════════
  // Block J: Оптимизация и автоматизация
  // ═══════════════════════════════════════════════════════════
  {
    id: "j1",
    block: "J",
    blockName: "Оптимизация и автоматизация",
    question: "Какие этапы вы хотели бы автоматизировать в первую очередь?",
    required: false,
    expressMode: false,
    order: 39,
  },
  {
    id: "j2",
    block: "J",
    blockName: "Оптимизация и автоматизация",
    question: "Рассматриваете ли вы внедрение новых систем или ИИ-инструментов?",
    hint: "Чат-боты, RPA, BI-аналитика, электронный документооборот",
    required: false,
    expressMode: false,
    order: 40,
  },
  {
    id: "j3",
    block: "J",
    blockName: "Оптимизация и автоматизация",
    question: "Какие ограничения нужно учитывать при изменении процесса?",
    hint: "Бюджет, регуляторные требования, зависимость от партнёров",
    required: false,
    expressMode: false,
    order: 41,
  },
];

export function getQuestionsByMode(mode: "full" | "express"): InterviewQuestion[] {
  if (mode === "express") {
    return INTERVIEW_QUESTIONS.filter((q) => q.expressMode);
  }
  return INTERVIEW_QUESTIONS;
}

export function getQuestionsByBlock(block: string): InterviewQuestion[] {
  return INTERVIEW_QUESTIONS.filter((q) => q.block === block);
}
