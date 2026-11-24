// «Входящие» and the project log («Журнал»): how items and events read on screen.
import { t } from "@/lib/i18n";

export type InboxKind = "stage_review" | "stage_changes" | "change_notice" | "change_proposal" | "time_entries" | "dispute" | "mention";
export type InboxItem = {
  id: string; kind: InboxKind; projectId: string; projectName: string; projectType: string | null; stageKey: string | null;
  since: string; dueAt: string | null; count: number; who: string | null; text: string | null;
};
export type ActivityKind = "stage" | "ai" | "changes" | "team" | "money" | "site" | "other";
export type ActivityEvent = {
  id: string; type: string; kind: ActivityKind; stageKey: string | null; createdAt: string;
  details: Record<string, string | number | boolean | string[]>; actor: { id: string; name: string | null; isMe: boolean } | null;
};
export type UpdateEvent = ActivityEvent & { projectId: string; projectName: string; projectType: string | null; unread: boolean };
export type Inbox = { waiting: InboxItem[]; updates: UpdateEvent[]; unreadUpdates: number; seenAt: string | null };

type StageTitle = (projectType: string | null, stageKey: string | null) => string;

/** One line saying what is waiting, and where it opens. */
export function inboxLine(item: InboxItem, stageTitle: StageTitle): { title: string; action: string; href: string } {
  const stage = item.stageKey ? stageTitle(item.projectType, item.stageKey) : "";
  const stageHref = `/projects/${item.projectId}/stages/${item.stageKey}`;
  switch (item.kind) {
    case "stage_review": return { title: t("Этап «{0}» ждёт вашей приёмки", [stage]), action: t("Проверить"), href: stageHref };
    case "stage_changes": return { title: t("Этап «{0}» вернули на доработку", [stage]), action: t("Доработать"), href: stageHref };
    case "change_notice": return { title: t("Изменился этап «{0}» — решите, обновлять ли «{1}»", [stageTitle(item.projectType, item.text), stage]), action: t("Решить"), href: stageHref };
    case "change_proposal": return { title: t("Предложено изменить этап «{0}»", [stage]), action: t("Рассмотреть"), href: `/projects/${item.projectId}` };
    case "time_entries": return { title: t("Часы специалиста на этапе «{0}» ждут подтверждения: {1}", [stage, item.count]), action: t("Подтвердить"), href: stageHref };
    case "dispute": return { title: t("Открыт спор по этапу «{0}»", [stage]), action: t("Ответить"), href: stageHref };
    case "mention": return { title: t("Вас упомянули в замечании к этапу «{0}»", [stage]), action: t("Ответить"), href: `${stageHref}#comments-title` };
  }
}

/** The quote under the line: the proposal, the dispute claim, the comment or the reason a stage was returned. */
export function inboxQuote(item: InboxItem): string | null {
  return item.kind === "change_notice" ? null : item.text;
}

export const activityKindLabel = (kind: ActivityKind | "all"): string => ({
  all: t("Все"), stage: t("Этапы"), ai: t("ИИ"), changes: t("Изменения"), team: t("Команда"), money: t("Деньги"), site: t("Сайт и код"), other: t("Другое"),
})[kind];

/** What happened, in neutral words (no gendered verbs): the person is shown separately. */
export function activityLine(event: ActivityEvent, stageTitle: (key: string | null) => string): string {
  const s = stageTitle(event.stageKey);
  const v = typeof event.details.versionNumber === "number" ? t(" — версия {0}", [event.details.versionNumber]) : "";
  switch (event.type) {
    case "route_created": return t("Создан маршрут проекта");
    case "stage_generated": return t("ИИ подготовил черновик этапа «{0}»", [s]);
    case "stage_draft_saved": return t("Сохранён черновик этапа «{0}»", [s]);
    case "stage_submitted": return t("Этап «{0}» отправлен на приёмку", [s]) + v;
    case "stage_approval_given": return t("Этап «{0}» одобрен проверяющим", [s]) + v;
    case "stage_accepted": return t("Этап «{0}» принят", [s]) + v;
    case "stage_changes_requested": return t("Этап «{0}» возвращён на доработку", [s]);
    case "stage_reopened": return t("Этап «{0}» снова открыт для изменений", [s]);
    case "stage_version_restored": return t("У этапа «{0}» восстановлена прежняя версия", [s]) + v;
    case "stage_imported": return t("В этап «{0}» загружены свои материалы", [s]);
    case "stage_ai_reviewed": return t("ИИ проверил этап «{0}»", [s]);
    case "stage_file_deleted": return t("Удалён файл этапа «{0}»", [s]);
    case "interview_applied": return t("Ответы из разговора перенесены в этап «{0}»", [s]);
    case "suggestion_added": return t("Добавлено предложение к этапу «{0}»", [s]);
    case "suggestion_applied": return t("Предложение принято на этапе «{0}»", [s]);
    case "suggestion_dismissed": return t("Предложение отклонено на этапе «{0}»", [s]);
    case "rule_added": return t("Добавлено правило ИИ для этапа «{0}»", [s]);
    case "rule_status_changed": return t("Изменено правило ИИ для этапа «{0}»", [s]);
    case "approval_policy_changed": return t("Изменены проверяющие этапа «{0}»", [s]);
    case "review_override": return t("Этап «{0}» пропущен с замечанием проверки", [s]);
    case "playbook_attached": return t("К этапу «{0}» подключены инструкции специалиста", [s]);
    case "playbook_detached": return t("От этапа «{0}» отключены инструкции специалиста", [s]);
    case "handoff_built": return t("Собран пакет для разработки");
    case "app_code_generated": return t("ИИ написал код приложения");
    case "agent_task_started": return t("ИИ-агент начал работу над кодом");
    case "agent_task_finished": return event.details.status === "succeeded" ? t("ИИ-агент закончил работу, проверки прошли") : t("ИИ-агент закончил работу с ошибками");
    case "starter_check_requested": return t("Запущена проверка стартового кода");
    case "analysis_run_requested": return t("Запущен разбор кода и ТЗ");
    case "voice_transcribed": return t("Голосовое сообщение переведено в текст");
    case "change_notice_created": return t("Этап «{0}» получил уведомление об изменении", [s]);
    case "change_accepted": return t("Этап «{0}» принял изменение и будет обновлён", [s]);
    case "change_accepted_no_change": return t("Этап «{0}» оставлен без изменений после уведомления", [s]);
    case "change_discussed": return t("Изменение обсуждается на этапе «{0}»", [s]);
    case "change_replied": return t("Ответ по изменению этапа «{0}»", [s]);
    case "change_proposed": return t("Предложено изменить этап «{0}»", [s]);
    case "change_notice_escalated": return t("Решение по изменению этапа «{0}» передано владельцу", [s]);
    case "specialist_invited": return t("Специалист приглашён на этап «{0}»", [s]);
    case "specialist_joined": return t("Специалист присоединился к этапу «{0}»", [s]);
    case "specialist_revoked": return t("Доступ специалиста к этапу «{0}» закрыт", [s]);
    case "specialist_access_changed": return t("Изменён доступ специалиста к этапу «{0}»", [s]);
    case "assignments_completed": return t("Работа специалистов на этапе «{0}» завершена", [s]);
    case "specialist_reviewed": return t("Оставлен отзыв о специалисте");
    case "team_invited": return t("В команду проекта отправлено приглашение");
    case "team_joined": return t("Новый участник в команде проекта");
    case "team_role_changed": return t("Изменена роль участника команды");
    case "team_stages_changed": return t("Изменены этапы участника команды");
    case "team_member_removed": return t("Участник удалён из команды");
    case "team_invitation_revoked": return t("Приглашение в команду отозвано");
    case "ownership_offered": case "ownership_invited": return t("Предложена передача проекта");
    case "ownership_transferred": return t("Проект передан новому владельцу");
    case "ownership_declined": return t("Передача проекта отклонена");
    case "ownership_cancelled": return t("Передача проекта отменена");
    case "time_approved": return t("Часы специалиста на этапе «{0}» подтверждены", [s]);
    case "time_disputed": return t("Часы специалиста на этапе «{0}» оспорены", [s]);
    case "specialist_payment_started": return t("Начата оплата работы на этапе «{0}»", [s]);
    case "specialist_payment_held": return t("Оплата работы на этапе «{0}» удержана до приёмки", [s]);
    case "specialist_payment_refunded": return t("Оплата работы на этапе «{0}» возвращена", [s]);
    case "specialist_paid_out": case "specialist_paid_direct": return t("Специалисту выплачено за этап «{0}»", [s]);
    case "top_up_started": return t("Начато пополнение кошелька проекта");
    case "top_up_paid": return t("Кошелёк проекта пополнен") + (event.details.amount ? ` — ${event.details.amount}` : "");
    case "refund_requested": return t("Запрошен возврат денег");
    case "refund_made": return t("Деньги возвращены");
    case "refund_rejected": return t("В возврате отказано");
    case "refund_cancelled": return t("Запрос возврата отменён");
    case "ai_spend_limit_changed": return t("Изменён лимит расходов на ИИ");
    case "dispute_opened": return t("Открыт спор по этапу «{0}»", [s]);
    case "dispute_resolved": return t("Спор по этапу «{0}» решён", [s]);
    case "dispute_withdrawn": return t("Спор по этапу «{0}» отозван", [s]);
    case "site_built": return t("Сайт собран");
    case "site_published": return t("Сайт опубликован");
    case "site_unpublished": return t("Сайт снят с публикации");
    case "site_rolled_back": return t("Сайт возвращён к прежней версии");
    case "quick_edit_published": return t("Быстрая правка опубликована");
    case "quick_edit_drafted": return t("Подготовлена быстрая правка");
    case "domain_set": return t("Подключён свой домен");
    case "domain_removed": return t("Свой домен отключён");
    case "hosting_connected": return t("Подключён хостинг");
    case "hosting_deployed": return t("Приложение выложено на хостинг");
    case "repository_connected": case "repository_created": return t("Подключён репозиторий с кодом");
    case "repository_pushed": case "repository_branch_pushed": return t("Код отправлен в репозиторий");
    case "choice_made": return t("Сделан выбор: хостинг, код или технологии");
    default: return t("Действие в проекте");
  }
}

/** «Сегодня», «Вчера» or the date: the day headings of a log. */
export function dayHeading(iso: string, locale: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return t("Сегодня");
  if (same(date, yesterday)) return t("Вчера");
  return date.toLocaleDateString(locale, { day: "numeric", month: "long", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

/** «через 2 дн.», «осталось 5 ч», «просрочено». */
export function dueText(iso: string): { text: string; overdue: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return { text: t("просрочено"), overdue: true };
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return { text: t("осталось {0} ч", [Math.max(1, hours)]), overdue: false };
  return { text: t("осталось {0} дн.", [Math.round(hours / 24)]), overdue: false };
}
