import type { ScheduleOptions } from "@/app/projects/[projectId]/stages/[stageKey]/schedule-editor";
import type { TechPlanOptions } from "@/app/projects/[projectId]/stages/[stageKey]/techplan-view";
import { API_BASE_URL, ApiError, api } from "./api";

export type StageStatus = "locked" | "ready" | "awaiting_lead" | "in_progress" | "in_review" | "changes_requested" | "approved" | "stale" | "imported" | "skipped" | "blocked";
export type ArtifactType = "brief" | "offer" | "content" | "design" | "site" | "schedule" | "techplan";

export type CatalogType = {
  key: "landing" | "company_site"; title: string; description: string; goodFor: string; examples: string[]; resultExplanation: string;
  stages: Array<{ key: string; title: string; outcome: string; importHint: string | null }>;
};

export type JourneyStage = {
  key: string; title: string; purpose: string; outcome: string; aiLevel: string; contract?: boolean; status: StageStatus; statusLabel: string; statusExplanation: string;
  inputs: Array<{ key: string; title: string; satisfied: boolean }>; currentVersionNumber: number | null; acceptedVersionNumber: number | null;
  people?: { lead: { kind: "owner" | "specialist" | "invited" | "you"; name: string | null }; consultants: number };
  needsYou?: string | null;
  changes?: { incoming: Array<{ id: string; sourceKey: string; status: "open" | "discussing" }>; outgoing: Array<{ id: string; targetKey: string; status: "open" | "discussing" }> };
};

export type ViewerInfo = {
  kind: "member" | "specialist"; role: string;
  assignments: Array<{ stageKey: string; role: "lead" | "consultant"; status: string; aiBudget: number | null; aiUsed: number; readUntil: string | null }>;
};

export type Journey = {
  viewer: ViewerInfo;
  project: { id: string; name: string; status: string; role: string; projectType: string; typeTitle: string; resultExplanation: string; startStageKey: string | null; changeResponseDays?: number; technology?: string | null };
  progress: { accepted: number; total: number; percent: number };
  nextAction: { stageKey: string | null; title: string; text: string };
  stages: JourneyStage[];
  ai: { configured: boolean; provider: string | null; remainingToday: number; month: { left: number; limit: number; planTitle: string } | null };
};

export type FieldDefinition = {
  key: string; label: string; kind: "text" | "textarea" | "choice" | "list"; required: boolean; maxLength?: number; why: string; example: string;
  options?: Array<{ value: string; label: string; hint: string }>;
  itemFields?: Array<{ key: string; label: string; maxLength: number; required: boolean; placeholder: string }>; maxItems?: number;
};

export type Brief = Record<string, string | null>;
export type Offer = { services: Array<{ name: string; description: string | null; price: string | null }>; hours: string | null };
export type SectionType = "hero" | "about" | "services" | "benefits" | "steps" | "faq" | "contacts" | "cta";
export type Section = { key: string; type: SectionType; title: string; text: string; items: Array<{ title: string; text: string }>; buttonLabel: string | null; imageId?: string | null };
export type ProjectImage = { id: string; width: number; height: number; sizeBytes: number; alt: string; createdAt: string; inUse: boolean };
export type Content = { sections: Section[]; seo: { title: string; description: string } };
export type Design = { palette: string; font: string; corners: "rounded" | "sharp"; heroLayout: "centered" | "left" };
export type SiteCheck = { id: string; status: "passed" | "warning" | "failed"; title: string; details: string; required: boolean };

export type Preset = { id: string; label: string; hint: string; background?: string; surface?: string; text?: string; accent?: string; stack?: string };

export type Suggestion = { id: string; text: string; targetKey: string | null; status: "proposed" | "applied" | "dismissed"; createdAt: string; author: string | null };

export type StageDetail = {
  viewer: ViewerInfo;
  suggestions: Suggestion[];
  stage: {
    canSubmit: boolean; canRequestChanges: boolean; canInvite: boolean; canSuggest: boolean; reviewNote: string | null;
    key: string; title: string; purpose: string; outcome: string; artifactType: ArtifactType; status: StageStatus; statusLabel: string; statusExplanation: string;
    acceptance: string[]; acceptExplanation: string; importHint: string | null; fields: FieldDefinition[] | null; lockedKeys: string[]; acceptedVersionId: string | null;
    canEdit: boolean; canAccept: boolean; canReopen: boolean; canImport: boolean; inputsReady: boolean; changesPending?: boolean;
    contract?: { explanation: string } | null;
    waitingBranches?: Array<{ stageKey: string; title: string; sourceKey: string; sourceTitle: string }>;
    impact?: { opens: Array<{ key: string; title: string }>; willNotify: Array<{ key: string; title: string; status: string }> };
  };
  inputs: Array<{ key: string; title: string; satisfied: boolean; versionNumber: number | null; content: unknown }>;
  current: { id: string; versionNumber: number; origin: string; note: string | null; createdAt: string; content: unknown } | null;
  issues: Array<{ key: string; message: string }>;
  versions: Array<{ id: string; versionNumber: number; origin: string; note: string | null; createdAt: string; accepted: boolean;
    provenance: { provider: string; model: string | null; instruction: string | null; targetKey: string | null; rulesApplied: number } | null }>;
  rules: Array<{ id: string; kind: "stage_rule" | "project_rule"; status: "active" | "disabled"; text: string; createdAt: string }>;
  ai: { level: string; whatItDoes: string; instructionExamples: string[]; describeHint: string | null; configured: boolean; remainingToday: number; templateAvailable: boolean; budget: { limit: number | null; used: number } | null; month: { left: number; limit: number; planTitle: string } | null };
  options: { palettes: Preset[]; fonts: Preset[]; corners: Preset[]; heroLayouts: Preset[]; sectionTypes: Record<SectionType, string>; schedule?: ScheduleOptions; techplan?: TechPlanOptions; technology?: string | null };
};

const messages: Record<string, string> = {
  BRANCHES_NOT_ALIGNED: "Не все этапы, на которых построен этот, решили по последнему изменению. Дождитесь их решения — иначе части сайта будут сделаны по разным версиям.",
  CHANGE_NOTICE_OPEN: "Предыдущий этап изменился. Сначала решите по изменению вверху страницы: принять, оставить как есть или задать вопрос.",
  CHANGE_DECISION_FORBIDDEN: "Решение по изменению принимает ведущий этого этапа или владелец.",
  CHANGE_REPLY_FORBIDDEN: "Ответить может ведущий изменённого этапа или владелец.",
  CHANGE_NOTICE_CLOSED: "По этому изменению уже приняли решение. Обновите страницу.",
  CONSENT_REQUIRED: "Мы обновили оферту и политику конфиденциальности. Примите новую редакцию, чтобы продолжить.",
  LEGAL_VERSION_OUTDATED: "Документы успели обновиться. Обновите страницу и прочитайте новую редакцию.",
  INVALID_PASSWORD: "Пароль не подошёл. Введите пароль от аккаунта.",
  CONFIRMATION_REQUIRED: "Отметьте, что понимаете последствия удаления.",
  ACCOUNT_DELETED: "Аккаунт удалён.",
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
  PUBLISH_CONFIRMATION_REQUIRED: "Подтвердите, что сайт можно показать всем в интернете.",
  BUILD_NOT_ACCEPTED: "Сначала примите этап «Сборка и проверка» — опубликовать можно только принятую сборку.",
  SLUG_TAKEN: "Этот адрес уже занят другим сайтом. Выберите другой.",
  INVALID_SLUG: "Адрес можно составить из латинских букв, цифр и дефиса, от 3 до 40 символов.",
  SITE_NOT_PUBLISHED: "Сайт сейчас не опубликован.",
  PUBLICATION_FORBIDDEN: "Публиковать сайт может только владелец или менеджер проекта.",
  TELEGRAM_NOT_CONFIGURED: "Telegram-бот пока не настроен на платформе.",
  TELEGRAM_NOT_LINKED: "Telegram не подключён.",
  LEAD_NOT_FOUND: "Заявка уже удалена.",
  AI_BUDGET_EXHAUSTED: "Лимит запросов к ИИ, который выделил владелец проекта, закончился. Попросите владельца увеличить его или продолжайте вручную.",
  STAGE_IN_REVIEW: "Этап на приёмке у владельца. Пока он проверяет, менять его нельзя.",
  STAGE_NOT_SUBMITTABLE: "Этот этап сейчас нельзя отправить на приёмку.",
  OWNER_ACCEPTS_DIRECTLY: "Вы владелец — просто примите этап.",
  STAGE_NOT_IN_REVIEW: "Этап уже не на приёмке.",
  PROJECT_RULE_FORBIDDEN: "Правила для всего проекта задаёт владелец. Сохраните правило для этого этапа.",
  SUGGEST_FORBIDDEN: "Предлагать правки может консультант этапа.",
  SUGGESTION_NOT_FOUND: "Предложение уже обработано.",
  LEAD_ALREADY_ASSIGNED: "На этом этапе уже есть ведущий. Отзовите его приглашение, чтобы пригласить другого.",
  ALREADY_INVITED: "Этот человек уже приглашён на этап.",
  ALREADY_PROJECT_MEMBER: "Этот человек уже участник проекта.",
  CANNOT_INVITE_OWNER: "Нельзя пригласить самого себя.",
  INVALID_EMAIL: "Проверьте адрес электронной почты.",
  SPECIALISTS_FORBIDDEN: "Приглашать специалистов может владелец или менеджер проекта.",
  INVITE_NOT_FOUND: "Приглашение не найдено. Проверьте ссылку.",
  INVITE_EXPIRED: "Срок приглашения истёк. Попросите владельца проекта прислать новое.",
  INVITE_NOT_AVAILABLE: "Приглашение уже использовано или отозвано.",
  INVITE_EMAIL_MISMATCH: "Приглашение отправлено на другой адрес. Войдите в аккаунт с той почтой, на которую пришло приглашение.",
  ASSIGNMENT_NOT_FOUND: "Приглашение уже отозвано.",
  PREVIEW_NOT_AVAILABLE: "Предпросмотр недоступен для этого этапа.",
  UNPUBLISH_BEFORE_ARCHIVE: "Сначала снимите сайт с публикации — опубликованный проект нельзя отправить в архив.",
  PROJECT_STATUS_FORBIDDEN: "Это может сделать только владелец проекта.",
  PLAN_LIMIT_PROJECTS: "По вашему тарифу больше нельзя создать проектов. Отправьте ненужные в архив или расширьте тариф.",
  DOMAIN_INVALID: "Не похоже на домен. Впишите его так: barber-usy.com или www.barber-usy.com.",
  DOMAIN_IS_PLATFORM: "Это адрес BuildPath — его выбирают в блоке «Публикация». Здесь подключается домен, который вы купили сами.",
  DOMAIN_KZ_NEEDS_KZ_HOSTING: "Домены .kz и .қаз по правилам Казахстана должны работать на серверах в Казахстане, а BuildPath сейчас размещает сайты за его пределами. Выберите домен в другой зоне (например, .com) или разместите сайт на своём сервере в Казахстане.",
  DOMAIN_APEX_UNSUPPORTED: "Адрес без www пока не подключается. Подключите www.ваш-домен, а у регистратора включите переадресацию с адреса без www.",
  DOMAIN_TAKEN: "Этот домен уже подключён к другому сайту на BuildPath.",
  DOMAIN_NOT_SET: "Домен ещё не указан.",
  DOMAIN_CHECK_TOO_SOON: "Проверяли только что. Подождите 10 секунд и попробуйте снова.",
  DOMAINS_NOT_CONFIGURED: "Свои домены пока не подключаются на этом сервере BuildPath.",
  BOOKING_NOT_STARTED: "Отметить визит можно после начала записи.",
  BOOKING_NOT_FOUND: "Запись не найдена или больше вам не доступна.",
  MASTER_NOT_FOUND: "Такого мастера нет в опубликованном расписании. Если вы добавили мастера, примите расписание и обновите сайт.",
  MASTER_ALREADY_CONNECTED: "Этот мастер уже подключён. Чтобы сменить почту, сначала закройте доступ.",
  MASTERS_FORBIDDEN: "Приглашать мастеров может владелец или менеджер проекта.",
  EMAIL_INVALID: "Проверьте почту — например, name@mail.kz.",
  REFUND_MORE_THAN_LEFT: "Столько вернуть нельзя: вернуть можно только то, что осталось от этого пополнения и ещё не потрачено на ИИ.",
  REFUND_ALREADY_REQUESTED: "По этому пополнению уже есть заявка на возврат.",
  REFUND_AMOUNT_INVALID: "Укажите сумму возврата — от 1 ₸.",
  REFUND_NOT_REQUESTED: "Заявки на возврат уже нет — возможно, её уже рассмотрели.",
  RECEIPT_NOT_FOUND: "Квитанция не найдена: она есть только у оплаченных платежей.",
  PROJECT_BALANCE_LOW: "На балансе проекта не хватает денег на запрос к ИИ. Владелец может пополнить баланс на странице проекта — работать вручную можно и без этого.",
  TOP_UP_AMOUNT_INVALID: "Сумма пополнения вне допустимых границ.",
  PAYMENTS_NOT_CONFIGURED: "Оплата пока не подключена на этом сервере BuildPath.",
  PAYMENT_PROVIDER_UNAVAILABLE: "Платёжный сервис не ответил. Попробуйте ещё раз через минуту — деньги не списаны.",
  PAYMENT_PROVIDER_FAILED: "Платёжный сервис отказал в создании платежа. Попробуйте позже — деньги не списаны.",
  PAYMENT_PROVIDER_SIGNATURE: "Не удалось проверить ответ платёжного сервиса, поэтому мы не открыли оплату. Деньги не списаны.",
  TOP_UP_TOO_MANY: "Слишком много попыток пополнения за час. Попробуйте позже.",
  PLAN_LIMIT_AI: "В этом месяце закончились запросы к ИИ по тарифу владельца проекта. Продолжайте вручную или расширьте тариф.",
  PLAN_LIMIT_SITES: "По вашему тарифу больше нельзя опубликовать сайтов. Снимите с публикации ненужный сайт или расширьте тариф.",
  IMAGE_FILE_REQUIRED: "Выберите фото.",
  IMAGE_TOO_LARGE: "Фото слишком большое. Выберите файл до 12 МБ.",
  "File too large": "Фото слишком большое. Выберите файл до 12 МБ.",
  IMAGE_TYPE_NOT_SUPPORTED: "Подходят фото в формате JPEG, PNG или WebP. Если фото с iPhone, сделайте снимок экрана или выберите «Наиболее совместимый» формат камеры.",
  IMAGE_UNREADABLE: "Не удалось прочитать фото. Попробуйте другой файл.",
  IMAGE_TOO_MANY_PIXELS: "Фото слишком большое по размеру. Выберите снимок поменьше.",
  IMAGE_REJECTED_BY_SCAN: "Файл не прошёл проверку безопасности и не сохранён.",
  IMAGE_SCAN_UNAVAILABLE: "Проверка файлов сейчас недоступна. Попробуйте загрузить фото позже.",
  IMAGE_LIMIT_REACHED: "В проекте уже 30 фото. Удалите ненужные, чтобы добавить новые.",
  IMAGE_IN_USE: "Это фото стоит на сайте. Сначала уберите его из блока.",
  IMAGE_NOT_FOUND: "Фото не найдено — возможно, его уже удалили.",
  IMAGE_ALT_TOO_LONG: "Описание фото слишком длинное — до 200 символов.",
  PLAN_NO_SPECIALISTS: "Приглашать специалистов можно на тарифах «Старт» и «Бизнес». Посмотрите тарифы.",
};

/** True when an error message is about plan limits; pages then show a link to the plan page. */
export function isPlanMessage(text: string): boolean {
  return /тариф/i.test(text);
}

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

export type Publication = {
  publication: { slug: string; url: string; status: "live" | "unpublished"; publishedAt: string; unpublishedAt: string | null; publishedVersionNumber: number | null; notifyTelegram: boolean; notifyEmail: boolean; domain: SiteDomain | null } | null;
  domainsAvailable: boolean;
  domainCheck?: { ok: boolean; found: string[] };
  acceptedBuild: { versionId: string; versionNumber: number; hasForm: boolean } | null;
  outdated: boolean; canManage: boolean; suggestedSlug: string; baseDomain: string; urlTemplate: string;
  channels: { telegram: { configured: boolean; linked: boolean; username: string | null; botUsername: string | null }; email: { configured: boolean; address: string } };
  leadsCount: number;
};

export type SiteDomain = {
  name: string; display: string; status: "pending" | "active" | "failed"; checkedAt: string | null; error: "DNS_RECORD_NOT_FOUND" | "DNS_POINTS_ELSEWHERE" | null;
  apex: boolean; url: string | null; records: Array<{ type: "CNAME" | "A"; name: string; value: string }>;
};

export type Lead = { id: string; name: string; contact: string; message: string | null; createdAt: string; telegramStatus: string; emailStatus: string };

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

/** Photos of a project. The API serves them only with the session cookie, so they are fetched as blobs. */
export const images = {
  list: (projectId: string) => api<{ items: ProjectImage[]; limit: number }>(`/projects/${projectId}/images`),
  upload: (projectId: string, file: Blob, alt: string) => {
    const form = new FormData();
    form.append("file", file, "photo.jpg");
    form.append("alt", alt);
    return api<ProjectImage>(`/projects/${projectId}/images`, { method: "POST", body: form });
  },
  setAlt: (projectId: string, imageId: string, alt: string) =>
    api<{ items: ProjectImage[]; limit: number }>(`/projects/${projectId}/images/${imageId}/alt`, { method: "POST", body: JSON.stringify({ alt }) }),
  remove: (projectId: string, imageId: string) => api<{ items: ProjectImage[]; limit: number }>(`/projects/${projectId}/images/${imageId}`, { method: "DELETE" }),
  async objectUrl(projectId: string, imageId: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/images/${imageId}`, { credentials: "include" });
    if (!response.ok) throw new ApiError(response.status, "IMAGE_NOT_FOUND");
    return URL.createObjectURL(await response.blob());
  },
};

/**
 * Shrinks a phone photo before upload (faster on mobile data). The server re-encodes anyway, so when the browser
 * cannot decode the file (for example HEIC outside Safari) the original is sent and the server explains the format.
 */
export async function shrinkPhoto(file: File, maxEdge = 2000): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}
