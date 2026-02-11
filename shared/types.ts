// ============================================
// Business Process Builder - Shared Types
// ============================================

// --- User & Auth ---
export interface User {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  tokenBalance: number;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// --- Company ---
export interface Company {
  id: number;
  userId: number;
  name: string;
  industry: string;
  description: string | null;
  contactInfo: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Interview ---
export type InterviewMode = "full" | "express";

export interface InterviewQuestion {
  id: string;
  block: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J";
  blockName: string;
  question: string;
  hint?: string;
  required: boolean;
  expressMode: boolean;
  order: number;
}

export interface Interview {
  id: number;
  companyId: number;
  mode: InterviewMode;
  status: "draft" | "completed";
  answers: Record<string, string>;
  completionPercent: number;
  createdAt: string;
  updatedAt: string;
}

// --- Process ---
export type BlockType = "start" | "action" | "product" | "decision" | "split" | "end";

export interface ProcessBlock {
  id: string;
  name: string;
  description: string;
  type: BlockType;
  role: string;
  stage: string;
  timeEstimate?: string;
  inputDocuments?: string[];
  outputDocuments?: string[];
  infoSystems?: string[];
  checklist?: string[];
  funnelStage?: string;
  isActive?: boolean; // defaults to true when undefined
  connections: string[]; // IDs of next blocks
  conditionLabel?: string; // For decision branches
  isDefault?: boolean; // Default branch from decision
  position?: { x: number; y: number };
}

export interface ProcessRole {
  id: string;
  name: string;
  description: string;
  department?: string;
  salary?: number; // monthly salary in rubles
  color: string;
}

export interface ProcessStage {
  id: string;
  name: string;
  order: number;
}

export interface ProcessData {
  name: string;
  goal: string;
  owner: string;
  startEvent: string;
  endEvent: string;
  roles: ProcessRole[];
  stages: ProcessStage[];
  blocks: ProcessBlock[];
  crmFunnels?: CrmFunnel[];
}

export interface Process {
  id: number;
  interviewId: number;
  companyId: number;
  status: "draft" | "active" | "archived";
  data: ProcessData;
  createdAt: string;
  updatedAt: string;
}

// --- Process Versions ---
export interface ProcessVersion {
  id: number;
  processId: number;
  data: ProcessData;
  description: string;
  createdAt: string;
}

// --- Change Requests ---
export interface ChangeRequest {
  id: number;
  processId: number;
  description: string;
  status: "pending" | "applied" | "rejected";
  previousData: ProcessData;
  newData: ProcessData;
  createdAt: string;
}

// --- Recommendations ---
export type RecommendationCategory =
  | "summary"      // Краткое резюме
  | "diagnostics"  // Диагностика по карте процесса
  | "lean"         // Потери LEAN
  | "duplicates"   // Дубли и задвоение
  | "automation"   // Автоматизация
  | "quality"      // Управление качеством
  | "data"         // Данные и документы
  | "roles"        // Роли и ответственность
  | "backlog"      // План внедрения
  | "variants";    // Варианты целевого процесса

export interface Recommendation {
  id: number;
  processId: number;
  category: RecommendationCategory;
  title: string;
  description: string; // Supports markdown
  priority: "high" | "medium" | "low";
  relatedSteps: string[];
}

export interface CrmFunnel {
  id: string;
  name: string;
  description: string;
  stages: CrmFunnelStage[];
  statuses: CrmFunnelStatus[];
  qualityNotes: string[];
}

export interface CrmFunnelStage {
  id: string;
  name: string;
  level: 0 | 1 | 2; // L0 = gate stage, L1 = sub-stage, L2 = action/task
  order: number;
  parentId?: string; // L1/L2 reference to parent L0/L1 stage
  exitCriteria: string;
  ownerRole: string;
  slaDays?: number;
  checklist: string[];
  relatedBlockIds: string[];
  automations: string[];
  conversionTarget?: number;
}

export interface CrmFunnelStatus {
  id: string;
  name: string;
  type: "pause" | "lost" | "won";
  description: string;
}

// --- Process Passport ---
export interface ProcessPassport {
  name: string;
  owner: string;
  customer: string;
  goal: string;
  boundaries: { start: string; end: string; scope: string };
  triggers: string[];
  inputs: string[];
  outputs: string[];
  roles: ProcessPassportRole[];
  systems: string[];
  mainFlow: ProcessPassportStep[];
  exceptions: string[];
  documents: ProcessPassportDocument[];
  sla: ProcessPassportSLA[];
  risks: ProcessPassportRisk[];
  integrations: string[];
  version: string;
  lastUpdated: string;
}

export interface ProcessPassportRole {
  name: string;
  raci: "R" | "A" | "C" | "I"; // Responsible, Accountable, Consulted, Informed
  department: string;
}

export interface ProcessPassportStep {
  order: number;
  name: string;
  role: string;
  description: string;
}

export interface ProcessPassportDocument {
  name: string;
  type: "input" | "output" | "intermediate";
  stage: string;
}

export interface ProcessPassportSLA {
  metric: string;
  target: string;
  measurement: string;
}

export interface ProcessPassportRisk {
  description: string;
  impact: "high" | "medium" | "low";
  control: string;
}

// --- Quality Checklist ---
export interface QualityCheckItem {
  id: string;
  category: string;
  rule: string;
  passed: boolean;
  details: string;
  severity: "error" | "warning" | "info";
}

export interface QualityCheckResult {
  score: number; // 0-100
  items: QualityCheckItem[];
  summary: string;
}

// --- BMC/VPC Mapping ---
export interface BmcMapping {
  customerSegments: string[];
  valueProposition: string[];
  channels: string[];
  customerRelationships: string[];
  revenueStreams: string[];
  keyActivities: string[];
  keyResources: string[];
  keyPartners: string[];
  costStructure: string[];
}

// --- Process Metrics ---
export interface ProcessMetrics {
  totalTime: string;
  criticalPath: string;
  handoffs: number;
  decisionPoints: number;
  roles: number;
  steps: number;
}

// --- Documents ---
export interface Document {
  id: number;
  companyId: number;
  name: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

// --- Support ---
export interface SupportMessage {
  id: number;
  chatId: number;
  senderId: number;
  senderRole: "user" | "admin";
  content: string;
  createdAt: string;
}

export interface SupportChat {
  id: number;
  userId: number;
  status: "open" | "closed";
  subject: string;
  createdAt: string;
  updatedAt: string;
}

// --- FAQ ---
export interface FaqArticle {
  id: number;
  title: string;
  content: string;
  keywords: string[];
  category: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Token Operations ---
export interface TokenOperation {
  id: number;
  userId: number;
  amount: number;
  type: "generation" | "regeneration" | "change_request" | "recommendations" | "transcription" | "topup";
  description: string;
  createdAt: string;
}

// Token costs
export const TOKEN_COSTS = {
  generation: 1000,
  regeneration: 1000,
  change_request: 500,
  recommendations: 200,
  transcription_per_minute: 10,
  regulation_document: 100,
  crm_generation: 300,
} as const;

// Block visual config
export const BLOCK_CONFIG: Record<BlockType, { shape: string; borderColor: string; label: string }> = {
  start: { shape: "pill", borderColor: "#22c55e", label: "Начало" },
  action: { shape: "hexagon", borderColor: "#000000", label: "Действие" },
  product: { shape: "rounded-rect", borderColor: "#000000", label: "Результат" },
  decision: { shape: "diamond", borderColor: "#3b82f6", label: "Решение" },
  split: { shape: "triangle", borderColor: "#3b82f6", label: "Разделение" },
  end: { shape: "double-rect", borderColor: "#ef4444", label: "Конец" },
};

// Swimlane colors — 12 distinct pastel tones for many-role diagrams (slightly darker)
export const SWIMLANE_COLORS = [
  "#d8b4f8", // purple
  "#a5c8f0", // blue
  "#98e8b8", // green
  "#f0e070", // yellow
  "#f0c090", // orange
  "#f0b0b8", // pink
  "#a8b8f0", // indigo
  "#80e0f0", // cyan
  "#c0e880", // lime
  "#f0c0a0", // peach
  "#c8d0e0", // slate
  "#c8b8f0", // violet
];
