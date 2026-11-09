import { ApiError } from "./api";

export type StageStatus = "locked" | "ready" | "awaiting_lead" | "in_progress" | "in_review" | "changes_requested" | "approved" | "stale" | "imported" | "skipped" | "blocked";
export type ArtifactType = "brief" | "offer" | "content" | "design" | "site";

export type CatalogType = {
  key: "landing" | "company_site"; title: string; description: string; goodFor: string; examples: string[]; resultExplanation: string;
  stages: Array<{ key: string; title: string; outcome: string; importHint: string | null }>;
};

export type JourneyStage = {
  key: string; title: string; purpose: string; outcome: string; aiLevel: string; status: StageStatus; statusLabel: string; statusExplanation: string;
  inputs: Array<{ key: string; title: string; satisfied: boolean }>; currentVersionNumber: number | null; acceptedVersionNumber: number | null;
};

export type Journey = {
  project: { id: string; name: string; status: string; role: string; projectType: string; typeTitle: string; resultExplanation: string; startStageKey: string | null };
  progress: { accepted: number; total: number; percent: number };
  nextAction: { stageKey: string | null; title: string; text: string };
  stages: JourneyStage[];
  ai: { configured: boolean; provider: string | null; remainingToday: number };
};

export type FieldDefinition = {
  key: string; label: string; kind: "text" | "textarea" | "choice" | "list"; required: boolean; maxLength?: number; why: string; example: string;
  options?: Array<{ value: string; label: string; hint: string }>;
  itemFields?: Array<{ key: string; label: string; maxLength: number; required: boolean; placeholder: string }>; maxItems?: number;
};

export type Brief = Record<string, string | null>;
export type Offer = { services: Array<{ name: string; description: string | null; price: string | null }>; hours: string | null };
export type SectionType = "hero" | "about" | "services" | "benefits" | "steps" | "faq" | "contacts" | "cta";
export type Section = { key: string; type: SectionType; title: string; text: string; items: Array<{ title: string; text: string }>; buttonLabel: string | null };
export type Content = { sections: Section[]; seo: { title: string; description: string } };
export type Design = { palette: string; font: string; corners: "rounded" | "sharp"; heroLayout: "centered" | "left" };
export type SiteCheck = { id: string; status: "passed" | "warning" | "failed"; title: string; details: string; required: boolean };

export type Preset = { id: string; label: string; hint: string; background?: string; surface?: string; text?: string; accent?: string; stack?: string };

export type StageDetail = {
  stage: {
    key: string; title: string; purpose: string; outcome: string; artifactType: ArtifactType; status: StageStatus; statusLabel: string; statusExplanation: string;
    acceptance: string[]; acceptExplanation: string; importHint: string | null; fields: FieldDefinition[] | null; lockedKeys: string[]; acceptedVersionId: string | null;
    canEdit: boolean; canAccept: boolean; canReopen: boolean; canImport: boolean; inputsReady: boolean;
  };
  inputs: Array<{ key: string; title: string; satisfied: boolean; versionNumber: number | null; content: unknown }>;
  current: { id: string; versionNumber: number; origin: string; note: string | null; createdAt: string; content: unknown } | null;
  issues: Array<{ key: string; message: string }>;
  versions: Array<{ id: string; versionNumber: number; origin: string; note: string | null; createdAt: string; accepted: boolean;
    provenance: { provider: string; model: string | null; instruction: string | null; targetKey: string | null; rulesApplied: number } | null }>;
  rules: Array<{ id: string; kind: "stage_rule" | "project_rule"; status: "active" | "disabled"; text: string; createdAt: string }>;
  ai: { level: string; whatItDoes: string; instructionExamples: string[]; describeHint: string | null; configured: boolean; remainingToday: number; templateAvailable: boolean };
  options: { palettes: Preset[]; fonts: Preset[]; corners: Preset[]; heroLayouts: Preset[]; sectionTypes: Record<SectionType, string> };
};

const messages: Record<string, string> = {
  AI_NOT_CONFIGURED: "ИИ пока не подключён к платформе. Заполните этап вручную или сделайте черновик по шаблону.",
  AI_DAILY_LIMIT_REACHED: "На сегодня лимит запросов к ИИ для этого проекта исчерпан. Продолжите вручную или вернитесь завтра.",
  AI_OUTPUT_REJECTED: "ИИ вернул ответ, который не прошёл проверку. Ничего не изменилось — попробуйте сформулировать иначе.",
  AI_PROVIDER_FAILED: "Сервис ИИ сейчас не ответил. Ничего не изменилось — попробуйте ещё раз чуть позже.",
  AI_PROVIDER_UNAVAILABLE: "Сервис ИИ сейчас недоступен. Ничего не изменилось — попробуйте позже.",
  AI_INVALID_RESPONSE: "ИИ ответил непонятно. Ничего не изменилось — попробуйте ещё раз.",
  AI_FAILED: "Не получилось получить ответ ИИ. Ничего не изменилось.",
  STAGE_VERSION_CONFLICT: "Пока вы редактировали, появилась новая версия этапа. Обновите страницу, чтобы увидеть её.",
  STAGE_LOCKED: "Этап ещё закрыт: сначала примите этапы, от которых он зависит.",
  STAGE_ACCEPTED_REOPEN_FIRST: "Этап уже принят. Нажмите «Изменить этап», чтобы внести правки.",
  STAGE_INPUTS_NOT_ACCEPTED: "Сначала примите предыдущие этапы — этому этапу нужны их результаты.",
  REQUIRED_CHECKS_FAILED: "Есть непройденные обязательные проверки. Исправьте их на нужном этапе и соберите сайт заново.",
  BUILD_OUTDATED: "После этой сборки изменились тексты или стиль. Соберите сайт заново.",
  STAGE_NOT_ACCEPTABLE: "Этот этап сейчас нельзя принять.",
  PROJECT_NOT_ACTIVE: "Проект завершён. Нажмите «Продолжить проект», чтобы снова вносить изменения.",
  PREVIEW_NOT_READY: "Для предпросмотра нужны паспорт проекта и тексты.",
  DESCRIPTION_REQUIRED: "Опишите бизнес своими словами, чтобы ИИ заполнил поля.",
  IMPORT_EMPTY: "Вставьте текст — поле пустое.",
  SESSION_REQUIRED: "Войдите в аккаунт, чтобы продолжить.",
  PROJECT_NOT_FOUND: "Проект не найден или у вас нет к нему доступа.",
  STAGE_WRITE_FORBIDDEN: "У вас нет права менять этот этап.",
  STAGE_ACCEPT_FORBIDDEN: "Принимать этапы может только владелец или менеджер проекта.",
};

export function explainError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.";
  const code = error.message;
  if (messages[code]) return messages[code];
  if (code.startsWith("STAGE_INCOMPLETE")) return "Этап ещё не заполнен до конца — посмотрите список «Чего не хватает».";
  if (code.startsWith("FIELD_TOO_LONG")) return "Один из текстов слишком длинный. Сократите его.";
  if (code.startsWith("FIELD_REQUIRED")) return "Заполните обязательные поля.";
  if (code.startsWith("FIELD_INVALID")) return "Одно из полей заполнено неверно.";
  return `Что-то пошло не так (${code}). Попробуйте ещё раз.`;
}

export const statusTone: Record<StageStatus, "done" | "active" | "attention" | "closed"> = {
  approved: "done", imported: "done", skipped: "done",
  in_progress: "active", ready: "active", in_review: "active", awaiting_lead: "active",
  stale: "attention", changes_requested: "attention", blocked: "attention",
  locked: "closed",
};

export const originLabels: Record<string, string> = {
  owner_edit: "Изменено вручную", ai_generated: "Сделано ИИ", template: "Черновик по шаблону", imported: "Ваши материалы",
  compiled: "Сборка", restored: "Возврат к прошлой версии",
};

export function download(name: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
