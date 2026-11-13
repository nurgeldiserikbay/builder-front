import { t } from "@/lib/i18n";
import type { ScheduleOptions } from "@/app/projects/[projectId]/stages/[stageKey]/schedule-editor";
import type { TechPlanOptions } from "@/app/projects/[projectId]/stages/[stageKey]/techplan-view";
import type { ProcessOptions } from "@/app/projects/[projectId]/stages/[stageKey]/process-editor";
import { API_BASE_URL, ApiError, api } from "./api";

export type StageStatus = "locked" | "ready" | "awaiting_lead" | "in_progress" | "in_review" | "changes_requested" | "approved" | "stale" | "imported" | "skipped" | "blocked";
export type ArtifactType = "brief" | "process" | "offer" | "content" | "design" | "site" | "schedule" | "techplan" | "sitemap" | "catalog" | "features" | "screens" | "handoff";

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
/** page: key of the «Карта сайта» page on a multi-page site. */
export type Section = { key: string; type: SectionType; title: string; text: string; items: Array<{ title: string; text: string }>; buttonLabel: string | null; imageId?: string | null; gallery?: string[]; page?: string };
export type ProjectImage = { id: string; width: number; height: number; sizeBytes: number; alt: string; createdAt: string; inUse: boolean };
export type PageSeo = { page: string; title: string; description: string };
/** seo is the home page; pageSeo the other pages of a multi-page site. */
export type Content = { sections: Section[]; seo: { title: string; description: string }; pageSeo?: PageSeo[] };
export type SitemapPage = { key: string; path: string; title: string; purpose: string; sections: SectionType[] };
export type Sitemap = { pages: SitemapPage[] };
export type Product = { key: string; name: string; description: string; price: number; unit: string | null; available: boolean; imageId: string | null };
export type DeliveryOption = { key: string; title: string; price: number; needsAddress: boolean; note: string };
export type Catalog = { products: Product[]; delivery: DeliveryOption[]; payment: { onDelivery: boolean; transfer: boolean; transferNote: string }; minOrder: number | null };
export type CatalogOptions = { limits: { products: number; delivery: number; maxPrice: number }; template: Catalog };
export type SitemapOptions = { limits: { pages: number; minPages: number; sections: number }; reservedPaths: string[]; template: Sitemap };
export type Design = { palette: string; font: string; corners: "rounded" | "sharp"; heroLayout: "centered" | "left" };
export type SiteCheck = { id: string; status: "passed" | "warning" | "failed"; title: string; details: string; required: boolean };

export type Preset = { id: string; label: string; hint: string; background?: string; surface?: string; text?: string; accent?: string; stack?: string };

export type Suggestion = { id: string; text: string; targetKey: string | null; status: "proposed" | "applied" | "dismissed"; createdAt: string; author: string | null };

export type Approval = {
  policy: { mode: "one" | "all" | "quorum"; reviewers: string[]; quorum: number | null; authorMayApprove: boolean; order: "parallel" | "sequential" } | null;
  policyText: string | null; candidates: Array<{ userId: string; name: string; role: string }>; canEditPolicy: boolean;
  reviewers?: Array<{ userId: string; name: string; approved: boolean; active: boolean; author: boolean }>;
  approvals?: Array<{ name: string; comment: string | null; createdAt: string }>;
  approved?: number; required?: number; broken?: boolean; next?: string | null; canApprove?: boolean; approveBlocker?: string | null; isReviewer?: boolean;
};

export type QualityReport = {
  auditVersion: string; profile: { key: string; version: number } | null; status: "passed" | "failed"; summary: string;
  categories: Array<{ id: string; title: string; enabled: boolean; required: boolean; counts: { critical: number; high: number; medium: number; low: number }; status: "passed" | "failed" | "warning" | "off" }>;
  findings: Array<{ id: string; category: string; severity: "critical" | "high" | "medium" | "low"; title: string; details: string; pages: string[]; blocking: boolean }>;
  unmeasured: Array<{ id: string; category: string; title: string; why: string }>;
  pages: Array<{ path: string; htmlKb: number; imagesKb: number }>;
};

export type StageDetail = {
  viewer: ViewerInfo;
  suggestions: Suggestion[];
  stage: {
    canSubmit: boolean; canRequestChanges: boolean; canInvite: boolean; canSuggest: boolean; reviewNote: string | null; approval: Approval; blockingComments?: number;
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
  options: { palettes: Preset[]; fonts: Preset[]; corners: Preset[]; heroLayouts: Preset[]; sectionTypes: Record<SectionType, string>; schedule?: ScheduleOptions; techplan?: TechPlanOptions; process?: ProcessOptions; sitemap?: SitemapOptions; catalog?: CatalogOptions; pages?: SitemapPage[] | null; technology?: string | null };
};

const messages: Record<string, string> = {
  AI_ALREADY_RUNNING: t("ИИ уже выполняет запрос в этом проекте. Дождитесь ответа — повторный запрос оплачивается отдельно."),
  TIME_ENTRY_OVERLAPS: t("На это время уже есть запись. Одно и то же время нельзя учесть дважды."),
  TIME_ENTRY_DATE_INVALID: t("Время можно добавить только за последние 14 дней и не в будущем."),
  TECHPLAN_OUTDATED: t("Технический план устарел: предыдущие этапы изменились. Обновите план и проверьте его."),
  CHANGE_ALREADY_DECIDED: t("По этому изменению уже приняли решение. Обновите страницу."),
  PROJECT_STATUS_CONFLICT: t("Статус проекта уже изменился. Обновите страницу."),
  PAYMENT_NOT_DUE: t("Эта оплата уже проведена или отменена. Обновите страницу."),
  PAYOUTS_NOT_CONFIGURED: t("Выплаты пока не настроены. Напишите в поддержку."),
  HOLDER_NAME_INVALID: t("Укажите имя владельца счёта так, как в банке (от 3 до 120 символов)."),
  CONTENT_TOO_LARGE: t("Слишком много текста за раз. Сократите или разделите на части."),
  EXPORT_NOT_BUILT: t("Сначала соберите сайт на этапе «Сборка сайта»."),
  STAGE_NOT_EDITABLE: t("Этот этап не редактируется вручную."),
  AI_NOT_USED_FOR_STAGE: t("На этом этапе ИИ не используется — заполните его сами."),
  VERSION_NOT_FOUND: t("Этой версии больше нет. Обновите страницу."),
  EMAIL_DELIVERY_UNAVAILABLE: t("Не удалось отправить письмо. Попробуйте через несколько минут."),
  BRANCHES_NOT_ALIGNED: t("Не все этапы, на которых построен этот, решили по последнему изменению. Дождитесь их решения — иначе части сайта будут сделаны по разным версиям."),
  CHANGE_NOTICE_OPEN: t("Предыдущий этап изменился. Сначала решите по изменению вверху страницы: принять, оставить как есть или задать вопрос."),
  CHANGE_DECISION_FORBIDDEN: t("Решение по изменению принимает ведущий этого этапа или владелец."),
  CHANGE_REPLY_FORBIDDEN: t("Ответить может ведущий изменённого этапа или владелец."),
  CHANGE_NOTICE_CLOSED: t("По этому изменению уже приняли решение. Обновите страницу."),
  CONSENT_REQUIRED: t("Мы обновили оферту и политику конфиденциальности. Примите новую редакцию, чтобы продолжить."),
  LEGAL_VERSION_OUTDATED: t("Документы успели обновиться. Обновите страницу и прочитайте новую редакцию."),
  INVALID_PASSWORD: t("Пароль не подошёл. Введите пароль от аккаунта."),
  CONFIRMATION_REQUIRED: t("Отметьте, что понимаете последствия удаления."),
  ACCOUNT_DELETED: t("Аккаунт удалён."),
  AI_NOT_CONFIGURED: t("ИИ пока не подключён к платформе. Заполните этап вручную или сделайте черновик по шаблону."),
  AI_DAILY_LIMIT_REACHED: t("На сегодня лимит запросов к ИИ для этого проекта исчерпан. Продолжите вручную или вернитесь завтра."),
  AI_OUTPUT_REJECTED: t("ИИ вернул ответ, который не прошёл проверку. Ничего не изменилось — попробуйте сформулировать иначе."),
  AI_PROVIDER_FAILED: t("Сервис ИИ сейчас не ответил. Ничего не изменилось — попробуйте ещё раз чуть позже."),
  AI_PROVIDER_UNAVAILABLE: t("Сервис ИИ сейчас недоступен. Ничего не изменилось — попробуйте позже."),
  AI_INVALID_RESPONSE: t("ИИ ответил непонятно. Ничего не изменилось — попробуйте ещё раз."),
  AI_FAILED: t("Не получилось получить ответ ИИ. Ничего не изменилось."),
  STAGE_VERSION_CONFLICT: t("Пока вы редактировали, появилась новая версия этапа. Обновите страницу, чтобы увидеть её."),
  STAGE_LOCKED: t("Этап ещё закрыт: сначала примите этапы, от которых он зависит."),
  STAGE_ACCEPTED_REOPEN_FIRST: t("Этап уже принят. Нажмите «Изменить этап», чтобы внести правки."),
  STAGE_INPUTS_NOT_ACCEPTED: t("Сначала примите предыдущие этапы — этому этапу нужны их результаты."),
  REQUIRED_CHECKS_FAILED: t("Есть непройденные обязательные проверки. Исправьте их на нужном этапе и соберите сайт заново."),
  BUILD_OUTDATED: t("После этой сборки изменились тексты или стиль. Соберите сайт заново."),
  STAGE_NOT_ACCEPTABLE: t("Этот этап сейчас нельзя принять."),
  PROJECT_NOT_ACTIVE: t("Проект завершён. Нажмите «Продолжить проект», чтобы снова вносить изменения."),
  PREVIEW_NOT_READY: t("Для предпросмотра нужны паспорт проекта и тексты."),
  DESCRIPTION_REQUIRED: t("Опишите бизнес своими словами, чтобы ИИ заполнил поля."),
  IMPORT_EMPTY: t("Вставьте текст — поле пустое."),
  SESSION_REQUIRED: t("Войдите в аккаунт, чтобы продолжить."),
  PROJECT_NOT_FOUND: t("Проект не найден или у вас нет к нему доступа."),
  STAGE_WRITE_FORBIDDEN: t("У вас нет права менять этот этап."),
  STAGE_ACCEPT_FORBIDDEN: t("Принимать этапы может только владелец или менеджер проекта."),
  PUBLISH_CONFIRMATION_REQUIRED: t("Подтвердите, что сайт можно показать всем в интернете."),
  BUILD_NOT_ACCEPTED: t("Сначала примите этап «Сборка и проверка» — опубликовать можно только принятую сборку."),
  SLUG_TAKEN: t("Этот адрес уже занят другим сайтом. Выберите другой."),
  INVALID_SLUG: t("Адрес можно составить из латинских букв, цифр и дефиса, от 3 до 40 символов."),
  SITE_NOT_PUBLISHED: t("Сайт сейчас не опубликован."),
  PUBLICATION_FORBIDDEN: t("Публиковать сайт может только владелец или менеджер проекта."),
  TELEGRAM_NOT_CONFIGURED: t("Telegram-бот пока не настроен на платформе."),
  TELEGRAM_NOT_LINKED: t("Telegram не подключён."),
  LEAD_NOT_FOUND: t("Заявка уже удалена."),
  AI_BUDGET_EXHAUSTED: t("Лимит запросов к ИИ, который выделил владелец проекта, закончился. Попросите владельца увеличить его или продолжайте вручную."),
  STAGE_IN_REVIEW: t("Этап на приёмке у владельца. Пока он проверяет, менять его нельзя."),
  STAGE_NOT_SUBMITTABLE: t("Этот этап сейчас нельзя отправить на приёмку."),
  OWNER_ACCEPTS_DIRECTLY: t("Вы владелец — просто примите этап."),
  STAGE_NOT_IN_REVIEW: t("Этап уже не на приёмке."),
  PROJECT_RULE_FORBIDDEN: t("Правила для всего проекта задаёт владелец. Сохраните правило для этого этапа."),
  SUGGEST_FORBIDDEN: t("Предлагать правки может консультант этапа."),
  SUGGESTION_NOT_FOUND: t("Предложение уже обработано."),
  LEAD_ALREADY_ASSIGNED: t("На этом этапе уже есть ведущий. Отзовите его приглашение, чтобы пригласить другого."),
  ALREADY_INVITED: t("Этот человек уже приглашён на этап."),
  ALREADY_PROJECT_MEMBER: t("Этот человек уже участник проекта."),
  CANNOT_INVITE_OWNER: t("Нельзя пригласить самого себя."),
  INVALID_EMAIL: t("Проверьте адрес электронной почты."),
  SPECIALISTS_FORBIDDEN: t("Приглашать специалистов может владелец или менеджер проекта."),
  INVITE_NOT_FOUND: t("Приглашение не найдено. Проверьте ссылку."),
  INVITE_EXPIRED: t("Срок приглашения истёк. Попросите владельца проекта прислать новое."),
  INVITE_NOT_AVAILABLE: t("Приглашение уже использовано или отозвано."),
  INVITE_EMAIL_MISMATCH: t("Приглашение отправлено на другой адрес. Войдите в аккаунт с той почтой, на которую пришло приглашение."),
  ASSIGNMENT_NOT_FOUND: t("Приглашение уже отозвано."),
  PREVIEW_NOT_AVAILABLE: t("Предпросмотр недоступен для этого этапа."),
  UNPUBLISH_BEFORE_ARCHIVE: t("Сначала снимите сайт с публикации — опубликованный проект нельзя отправить в архив."),
  PROJECT_STATUS_FORBIDDEN: t("Это может сделать только владелец проекта."),
  PLAN_LIMIT_PROJECTS: t("По вашему тарифу больше нельзя создать проектов. Отправьте ненужные в архив или расширьте тариф."),
  DOMAIN_INVALID: t("Не похоже на домен. Впишите его так: barber-usy.com или www.barber-usy.com."),
  DOMAIN_IS_PLATFORM: t("Это адрес BuildPath — его выбирают в блоке «Публикация». Здесь подключается домен, который вы купили сами."),
  DOMAIN_KZ_NEEDS_KZ_HOSTING: t("Домены .kz и .қаз по правилам Казахстана должны работать на серверах в Казахстане, а BuildPath сейчас размещает сайты за его пределами. Выберите домен в другой зоне (например, .com) или разместите сайт на своём сервере в Казахстане."),
  DOMAIN_APEX_UNSUPPORTED: t("Адрес без www пока не подключается. Подключите www.ваш-домен, а у регистратора включите переадресацию с адреса без www."),
  DOMAIN_TAKEN: t("Этот домен уже подключён к другому сайту на BuildPath."),
  DOMAIN_NOT_SET: t("Домен ещё не указан."),
  DOMAIN_CHECK_TOO_SOON: t("Проверяли только что. Подождите 10 секунд и попробуйте снова."),
  DOMAINS_NOT_CONFIGURED: t("Свои домены пока не подключаются на этом сервере BuildPath."),
  BOOKING_NOT_STARTED: t("Отметить визит можно после начала записи."),
  BOOKING_NOT_FOUND: t("Запись не найдена или больше вам не доступна."),
  ORDER_NOT_FOUND: t("Заказ не найден."),
  ORDER_STATUS_NOT_ALLOWED: t("Этот заказ уже изменили — например, клиент отменил его. Список обновлён."),
  STORE_NEEDS_BUILDPATH: t("Магазин принимает заказы только на BuildPath: на своём сервере корзина и заказы пока не работают."),
  MASTER_NOT_FOUND: t("Такого мастера нет в опубликованном расписании. Если вы добавили мастера, примите расписание и обновите сайт."),
  MASTER_ALREADY_CONNECTED: t("Этот мастер уже подключён. Чтобы сменить почту, сначала закройте доступ."),
  MASTERS_FORBIDDEN: t("Приглашать мастеров может владелец или менеджер проекта."),
  EMAIL_INVALID: t("Проверьте почту — например, name@mail.kz."),
  REFUND_MORE_THAN_LEFT: t("Столько вернуть нельзя: вернуть можно только то, что осталось от этого пополнения и ещё не потрачено на ИИ."),
  REFUND_ALREADY_REQUESTED: t("По этому пополнению уже есть заявка на возврат."),
  REFUND_AMOUNT_INVALID: t("Укажите сумму возврата — от 1 ₸."),
  REFUND_NOT_REQUESTED: t("Заявки на возврат уже нет — возможно, её уже рассмотрели."),
  RECEIPT_NOT_FOUND: t("Квитанция не найдена: она есть только у оплаченных платежей."),
  PROFILE_NOT_FOUND: t("Карточка специалиста не найдена или скрыта из каталога."),
  PROFILE_NAME_INVALID: t("Укажите имя — от 2 до 80 символов."),
  PROFILE_HEADLINE_INVALID: t("Опишите одной строкой, чем вы помогаете — от 5 до 140 символов."),
  PROFILE_ABOUT_TOO_LONG: t("Рассказ о себе — не больше 2000 символов."),
  PROFILE_STAGE_INVALID: t("Выберите этапы из списка."),
  PROFILE_STAGES_REQUIRED: t("Чтобы опубликовать карточку, выберите хотя бы один этап."),
  PROFILE_RATE_INVALID: t("Ставка — целое число от 1 до 1 000 000 ₸."),
  PROFILE_CITY_INVALID: t("Название города слишком длинное."),
  INVITE_EMAIL_OR_PROFILE: t("Укажите почту специалиста или выберите его в каталоге."),
  REVIEW_NOT_AVAILABLE: t("Отзыв можно оставить, когда вы примете этап, над которым работал специалист."),
  REVIEW_ALREADY_EXISTS: t("Отзыв об этой работе уже оставил другой участник проекта."),
  REVIEW_EDIT_EXPIRED: t("Отзыв можно менять 14 дней — этот срок прошёл."),
  REVIEW_FORBIDDEN: t("Оставить отзыв может владелец или менеджер проекта."),
  REVIEW_RATING_INVALID: t("Поставьте оценку от 1 до 5."),
  REVIEW_TEXT_INVALID: t("Отзыв — не больше 1000 символов."),
  REVIEW_TEXT_REQUIRED: t("При оценке 1–2 напишите, что пошло не так: это поможет и специалисту, и другим владельцам."),
  REVIEW_NOT_FOUND: t("Отзыв не найден."),
  REVIEW_REPLY_INVALID: t("Ответ — от 2 до 1000 символов."),
  REVIEW_REPORT_INVALID: t("Опишите, что не так с отзывом — от 10 до 1000 символов."),
  REVIEW_ALREADY_REPORTED: t("Вы уже пожаловались на этот отзыв."),
  REVIEW_HIDDEN: t("Поддержка скрыла этот отзыв, изменить его нельзя."),
  REVIEW_ALREADY_REPLIED: t("На этот отзыв вы уже ответили."),
  DISPUTE_ALREADY_OPEN: t("По этой работе уже идёт спор — добавьте объяснение в нём."),
  DISPUTE_NOT_AVAILABLE: t("Спор можно открыть после того, как специалист принял приглашение."),
  DISPUTE_WINDOW_CLOSED: t("Прошло больше 30 дней после закрытия доступа — открыть спор уже нельзя. Напишите в поддержку."),
  DISPUTE_KIND_INVALID: t("Выберите, что случилось."),
  DISPUTE_CLAIM_INVALID: t("Опишите, что произошло — от 20 до 2000 символов."),
  DISPUTE_AMOUNT_INVALID: t("Сумма — целое число от 1 ₸."),
  DISPUTE_AMOUNT_REQUIRED: t("Укажите сумму, о которой спор."),
  DISPUTE_MESSAGE_INVALID: t("Сообщение — от 2 до 2000 символов."),
  DISPUTE_TOO_MANY_MESSAGES: t("В споре слишком много сообщений. Дождитесь решения поддержки."),
  DISPUTE_CLOSED: t("Спор уже закрыт. Обновите страницу."),
  DISPUTE_NOT_FOUND: t("Спор не найден."),
  DISPUTE_WITHDRAW_FORBIDDEN: t("Отозвать спор может только тот, кто его открыл."),
  PROJECT_SPEND_LIMIT: t("Лимит расходов на ИИ по проекту исчерпан: следующий запрос мог бы выйти за него. Владелец может увеличить лимит на странице проекта — работать вручную можно и без этого."),
  SPEND_LIMIT_INVALID: t("Укажите лимит целым числом от 1 до 10 000 000 ₸."),
  SPEND_LIMIT_FORBIDDEN: t("Менять лимит может владелец или менеджер проекта."),
  QUICK_EDIT_REQUEST_INVALID: t("Опишите правку — от 5 до 1000 символов."),
  QUICK_EDIT_PENDING: t("Предыдущая правка ещё ждёт подтверждения: обновите сайт или отмените её."),
  QUICK_EDIT_STAGE_IN_WORK: t("Этот этап сейчас в работе. Закончите изменения на самом этапе, потом возвращайтесь сюда."),
  QUICK_EDIT_STAGE_HAS_LEAD: t("На этом этапе работает специалист. Попросите его внести правку или отзовите приглашение."),
  QUICK_EDIT_TARGET_INVALID: t("Так поменять нельзя. Услуги, товары и расписание меняются на своих этапах."),
  QUICK_EDIT_NOTHING_PENDING: t("Правка уже подтверждена или отменена. Обновите страницу."),
  QUICK_EDIT_NO_CHANGES: t("Ничего не поменялось."),
  QUICK_EDIT_CHECKS_FAILED: t("Изменения приняты, но новая сборка не прошла обязательные проверки, поэтому на сайте пока прежняя версия. Откройте этап «Сборка», чтобы увидеть, что исправить."),
  QUICK_EDIT_CONTACT_INVALID: t("Проверьте контакт: телефон — только цифры, пробелы, скобки, + и -; почта — вида name@mail.kz."),
  ROLLBACK_VERSION_NOT_FOUND: t("Эту версию нельзя вернуть: вернуть можно только сборку, которая уже была на сайте."),
  ROLLBACK_ALREADY_LIVE: t("Эта версия уже на сайте."),
  PUBLICATION_CHANGED: t("Пока вы смотрели, сайт уже обновили. Обновите страницу."),
  PORTFOLIO_TOO_MANY: t("В портфолио — не больше 12 работ."),
  PROJECT_BALANCE_LOW: t("На балансе проекта не хватает денег на запрос к ИИ. Владелец может пополнить баланс на странице проекта — работать вручную можно и без этого."),
  TOP_UP_AMOUNT_INVALID: t("Сумма пополнения вне допустимых границ."),
  PAYMENTS_NOT_CONFIGURED: t("Оплата пока не подключена на этом сервере BuildPath."),
  PAYMENT_PROVIDER_UNAVAILABLE: t("Платёжный сервис не ответил. Попробуйте ещё раз через минуту — деньги не списаны."),
  PAYMENT_PROVIDER_FAILED: t("Платёжный сервис отказал в создании платежа. Попробуйте позже — деньги не списаны."),
  PAYMENT_PROVIDER_SIGNATURE: t("Не удалось проверить ответ платёжного сервиса, поэтому мы не открыли оплату. Деньги не списаны."),
  TOP_UP_TOO_MANY: t("Слишком много попыток пополнения за час. Попробуйте позже."),
  PLAN_LIMIT_AI: t("В этом месяце закончились запросы к ИИ по тарифу владельца проекта. Продолжайте вручную или расширьте тариф."),
  PLAN_LIMIT_SITES: t("По вашему тарифу больше нельзя опубликовать сайтов. Снимите с публикации ненужный сайт или расширьте тариф."),
  IMAGE_FILE_REQUIRED: t("Выберите фото."),
  IMAGE_TOO_LARGE: t("Фото слишком большое. Выберите файл до 12 МБ."),
  "File too large": t("Фото слишком большое. Выберите файл до 12 МБ."),
  IMAGE_TYPE_NOT_SUPPORTED: t("Подходят фото в формате JPEG, PNG или WebP. Если фото с iPhone, сделайте снимок экрана или выберите «Наиболее совместимый» формат камеры."),
  IMAGE_UNREADABLE: t("Не удалось прочитать фото. Попробуйте другой файл."),
  IMAGE_TOO_MANY_PIXELS: t("Фото слишком большое по размеру. Выберите снимок поменьше."),
  IMAGE_REJECTED_BY_SCAN: t("Файл не прошёл проверку безопасности и не сохранён."),
  IMAGE_SCAN_UNAVAILABLE: t("Проверка файлов сейчас недоступна. Попробуйте загрузить фото позже."),
  IMAGE_LIMIT_REACHED: t("В проекте уже 30 фото. Удалите ненужные, чтобы добавить новые."),
  IMAGE_IN_USE: t("Это фото стоит на сайте. Сначала уберите его из блока."),
  IMAGE_NOT_FOUND: t("Фото не найдено — возможно, его уже удалили."),
  IMAGE_ALT_TOO_LONG: t("Описание фото слишком длинное — до 200 символов."),
  BLOCKING_COMMENTS_OPEN: t("Есть открытые блокирующие замечания — их нужно закрыть до приёмки."),
  NOT_YOUR_TURN: t("Сейчас очередь другого проверяющего."),
  STAGE_KEYS_INVALID: t("Выберите этапы этого проекта."),
  STAGE_KEYS_ONLY_FOR_CONTRIBUTORS: t("Этапы назначаются только исполнителям."),
  FILE_REQUIRED: t("Выберите файл."),
  FILE_TOO_LARGE: t("Файл больше 15 МБ. Сожмите его или разделите на части."),
  FILE_TYPE_NOT_SUPPORTED: t("Такой файл не принимаем. Подойдут PDF, фото (JPG, PNG, WebP), TXT, MD, CSV, JSON, Word, Excel, PowerPoint и ZIP. Расширение должно совпадать с содержимым."),
  FILE_NAME_INVALID: t("У файла неподходящее имя. Переименуйте его и попробуйте ещё раз."),
  FILE_NOTE_TOO_LONG: t("Пояснение к файлу — не больше 500 символов."),
  FILE_LIMIT_REACHED: t("На этапе уже 20 файлов. Удалите ненужные, чтобы добавить новые."),
  FILE_STORAGE_FULL: t("Место для файлов проекта (150 МБ) закончилось. Удалите ненужные файлы."),
  FILE_REJECTED_BY_SCAN: t("Файл не прошёл проверку безопасности и не сохранён."),
  FILE_SCAN_UNAVAILABLE: t("Проверка файлов сейчас недоступна. Попробуйте загрузить файл позже."),
  FILE_UPLOADS_TOO_FREQUENT: t("Слишком много загрузок за час. Попробуйте позже."),
  FILE_NOT_FOUND: t("Файл не найден — возможно, его уже удалили."),
  FILE_DELETE_FORBIDDEN: t("Удалить файл может тот, кто его загрузил, владелец или администратор."),
  ANALYSIS_NEEDS_ZIP: t("Разобрать можно только ZIP-архив."),
  ANALYSIS_SOURCE_INVALID: t("Выберите, что разобрать."),
  ANALYSIS_REPOSITORY_FORBIDDEN: t("Подключённый репозиторий разбирает владелец или администратор проекта."),
  ANALYSIS_ALREADY_RUNNING: t("Уже идут два разбора. Дождитесь, пока они закончатся."),
  ANALYSIS_DAILY_LIMIT: t("За сутки можно сделать 20 разборов. Попробуйте завтра."),
  ANALYSIS_NOT_FOUND: t("Разбор не найден."),
  ANALYSIS_NOT_READY: t("Отчёт ещё готовится."),
  REPO_URL_NOT_GITHUB: t("Нужна ссылка на репозиторий GitHub: https://github.com/владелец/репозиторий."),
  REPO_REF_INVALID: t("Неверное имя ветки."),
  BROWSER_CHECK_RUNNING: t("Проверка в браузере уже идёт."),
  BROWSER_CHECK_LIMIT: t("Эту сборку уже проверяли 5 раз. Соберите сайт заново, чтобы проверить снова."),
  OWNERSHIP_OWNER_ONLY: t("Передать проект может только его владелец."),
  OWNERSHIP_CONFIRM_NAME: t("Название проекта введено неточно."),
  OWNERSHIP_TARGET_VIEWER: t("Наблюдателю проект передать нельзя — сначала измените его роль."),
  OWNERSHIP_BLOCKED: t("Сейчас передать проект нельзя — посмотрите, что нужно завершить."),
  OWNERSHIP_OFFER_OPEN: t("Предложение о передаче уже отправлено."),
  OWNERSHIP_OFFER_NOT_FOUND: t("Предложения о передаче больше нет — его отменили, отклонили или срок истёк."),
  COMMENT_FILES_INVALID: t("К замечанию можно прикрепить до 5 файлов этого этапа."),
  COMMENT_MENTIONS_INVALID: t("Упомянуть можно до 10 участников проекта или специалистов этого этапа."),
  COMMENT_FORBIDDEN: t("Наблюдатель не пишет замечания."),
  COMMENT_BLOCKING_FORBIDDEN: t("Блокирующее замечание может оставить владелец, администратор или проверяющий этапа."),
  COMMENT_RESOLVE_FORBIDDEN: t("Закрыть замечание может его автор, владелец или администратор."),
  COMMENT_LIMIT_REACHED: t("На этапе слишком много замечаний."),
  PLAN_NO_TEAM: t("Команда проекта доступна на тарифах «Старт» и «Бизнес». Посмотрите тарифы."),
  TEAM_LIMIT_REACHED: t("В команде уже 20 человек вместе с приглашениями. Отмените лишние приглашения или уберите участника."),
  TEAM_MANAGE_FORBIDDEN: t("Управлять командой может владелец или администратор проекта."),
  ROLE_NOT_ALLOWED: t("Эту роль может назначить или изменить только владелец проекта."),
  CANNOT_CHANGE_SELF: t("Свою роль изменить нельзя."),
  APPROVAL_POLICY_ACTIVE: t("Этот этап принимают проверяющие: отправьте его на проверку."),
  AUTHOR_CANNOT_APPROVE: t("Автор версии не одобряет свою версию — это сделают другие проверяющие."),
  NOT_A_REVIEWER: t("Вы не назначены проверяющим этого этапа."),
  ALREADY_APPROVED: t("Вы уже одобрили эту версию."),
  APPROVAL_POLICY_BROKEN: t("Правило согласования больше нельзя выполнить: кого-то из проверяющих нет в команде. Измените правило."),
  POLICY_REVIEWER_NOT_MEMBER: t("Проверяющим может быть только участник команды (не наблюдатель)."),
  POLICY_REVIEWERS_COUNT: t("Выберите от 1 до 10 проверяющих."),
  POLICY_QUORUM_INVALID: t("Число одобрений должно быть от 1 до числа проверяющих."),
  QUALITY_GATE_FAILED: t("Сайт не прошёл проверку перед публикацией. Посмотрите замечания на этапе «Сборка», исправьте и соберите заново."),
  BUILD_NOT_QUALITY_CHECKED: t("Эта сборка сделана до проверки качества. Соберите сайт заново на этапе «Сборка»."),
  CROP_TOO_SMALL: t("Слишком маленький кусок фото — увеличьте рамку."),
  CROP_INVALID: t("Не получилось обрезать фото. Попробуйте ещё раз."),
  PLAN_NO_SPECIALISTS: t("Приглашать специалистов можно на тарифах «Старт» и «Бизнес». Посмотрите тарифы."),
};

/** True when an error message is about plan limits; pages then show a link to the plan page. */
export function isPlanMessage(text: string): boolean {
  return /тариф/i.test(text);
}

export function explainError(error: unknown): string {
  if (!(error instanceof ApiError)) return t("Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.");
  const code = error.message;
  if (messages[code]) return messages[code];
  if (code.startsWith("QUICK_EDIT_CONTACT_INVALID")) return messages.QUICK_EDIT_CONTACT_INVALID!;
  if (code.startsWith("PORTFOLIO_URL_INVALID")) return t("Ссылка на работу должна начинаться с https:// и вести на сайт (не на IP-адрес и не на localhost).");
  if (code.startsWith("PORTFOLIO_URL_DUPLICATE")) return t("Эта ссылка уже есть в портфолио.");
  if (code.startsWith("PORTFOLIO_TITLE_INVALID")) return t("У каждой работы должно быть название — от 3 до 80 символов.");
  if (code.startsWith("PORTFOLIO_DESCRIPTION_TOO_LONG")) return t("Описание работы — не больше 500 символов.");
  if (code.startsWith("STAGE_INCOMPLETE")) return t("Этап ещё не заполнен до конца — посмотрите список «Чего не хватает».");
  if (code.startsWith("FIELD_TOO_LONG")) return t("Один из текстов слишком длинный. Сократите его.");
  if (code.startsWith("FIELD_REQUIRED")) return t("Заполните обязательные поля.");
  if (code.startsWith("FIELD_INVALID")) return t("Одно из полей заполнено неверно.");
  // Codes without their own text: say what kind of problem it is and what to do, keep the code for support.
  if (error.status === 401 || code === "SESSION_INVALID") return t("Сессия закончилась. Войдите снова.");
  if (error.status === 429) return t("Слишком много запросов подряд. Подождите немного и попробуйте снова.");
  if (error.status === 403 || code.endsWith("_FORBIDDEN")) return t("У вас нет прав на это действие. Его может сделать владелец проекта или ведущий этапа.");
  if (error.status === 404 || code.endsWith("_NOT_FOUND")) return t("Не нашли то, что вы открыли: возможно, это удалили или ссылка устарела. Обновите страницу.");
  if (error.status === 409) return t("Данные уже изменились — например, в другой вкладке. Обновите страницу и повторите.");
  if (error.status === 400 || error.status === 422 || code.startsWith("INVALID_")) return t("Проверьте введённые данные: что-то заполнено не так ({0}).", [code]);
  if (error.status >= 500) return t("Сервер не смог выполнить действие. Попробуйте через минуту; если повторяется — напишите в поддержку ({0}).", [code]);
  return t("Что-то пошло не так ({0}). Попробуйте ещё раз.", [code]);
}

export type Publication = {
  publication: { slug: string; url: string; status: "live" | "unpublished"; publishedAt: string; unpublishedAt: string | null; publishedVersionNumber: number | null; notifyTelegram: boolean; notifyEmail: boolean; formQuestion: boolean; domain: SiteDomain | null } | null;
  domainsAvailable: boolean;
  domainCheck?: { ok: boolean; found: string[] };
  acceptedBuild: { versionId: string; versionNumber: number; hasForm: boolean; quality: Pick<QualityReport, "status" | "summary" | "categories" | "profile"> | null } | null;
  outdated: boolean; rolledBack?: boolean; canManage: boolean; suggestedSlug: string; baseDomain: string; urlTemplate: string;
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
  owner_edit: t("Изменено вручную"), ai_generated: t("Сделано ИИ"), template: t("Черновик по шаблону"), imported: t("Ваши материалы"),
  compiled: t("Сборка"), restored: t("Возврат к прошлой версии"),
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

export type StageFile = { id: string; name: string; kind: string; mime: string; sizeBytes: number; sha256: string; note: string; createdAt: string; author: string; mine: boolean; canDelete: boolean; canAnalyze: boolean };
export type StageFiles = { files: StageFile[]; canUpload: boolean; limits: { fileBytes: number; perStage: number; note: number }; accepted: string[]; createdId?: string };

/** Saves a file the API serves only with the session cookie (stage files, analysis reports). */
export async function saveFromApi(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(response.status, payload?.message ?? "DOWNLOAD_FAILED");
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Files attached to a stage for people to read. */
export const stageFiles = {
  list: (projectId: string, stageKey: string) => api<StageFiles>(`/projects/${projectId}/stages/${stageKey}/files`),
  upload: (projectId: string, stageKey: string, file: File, note: string) => {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("note", note);
    return api<StageFiles>(`/projects/${projectId}/stages/${stageKey}/files`, { method: "POST", body: form });
  },
  remove: (projectId: string, stageKey: string, fileId: string) => api<StageFiles>(`/projects/${projectId}/stages/${stageKey}/files/${fileId}`, { method: "DELETE" }),
  download: (projectId: string, stageKey: string, file: StageFile) => saveFromApi(`/projects/${projectId}/stages/${stageKey}/files/${file.id}`, file.name),
};

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
  /** A cropped copy; the rectangle is in fractions of the photo (0–1). */
  crop: (projectId: string, imageId: string, rect: { x: number; y: number; width: number; height: number }) =>
    api<ProjectImage>(`/projects/${projectId}/images/${imageId}/crop`, { method: "POST", body: JSON.stringify(rect) }),
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
