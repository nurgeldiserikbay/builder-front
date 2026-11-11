"use client";

import { t } from "@/lib/i18n";
import styles from "../../../journey.module.css";
import { DataDiagram, SequenceDiagram, type DataEntity, type Sequence } from "./diagrams";

type Item = { title: string; plain: string; technical: string };
type Coverage = { scenario: string; actor: string; action: string; capability: string; status: "built" | "manual" | "not_built"; how: string };
export type TechPlan = {
  planVersion: string; kind?: "booking" | "site"; summary: string; features: Item[]; roles: Item[]; data: Item[];
  components?: Item[]; dataModel?: Array<DataEntity & { fields: Array<{ name: string; type: string }> }>; sequences?: Sequence[]; coverage?: Coverage[] | null;
  pages: Array<{ path: string; title: string; plain: string }>; notifications: string[]; hosting: Array<{ option: string; plain: string }>;
  limits: string[]; api: string; ownerNotes: string | null;
};
export type TechPlanOptions = { preview: TechPlan | null; outdated: boolean };

function Items({ title, items }: { title: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <section className={styles.card} aria-label={title}>
      <p className={styles.cardTitle}>{title}</p>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.title}>
            <strong>{item.title}.</strong> {item.plain}
            <details><summary className={styles.small}>{t("Для разработчика")}</summary><p className={styles.small} style={{ margin: "4px 0 0" }}>{item.technical}</p></details>
          </li>
        ))}
      </ul>
    </section>
  );
}

function download(name: string, text: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name; document.body.appendChild(link); link.click(); link.remove();
}

/**
 * The plan is made by the platform from the accepted stages; the owner reads it, adds notes and approves it as the contract.
 * When the inputs change, «Обновить план» saves a new version computed on the server.
 */
export function TechPlanView({ plan, outdated, notes, onNotes, disabled, onRefresh, busy }: {
  plan: TechPlan | null; outdated: boolean; notes: string; onNotes: (value: string) => void; disabled: boolean; onRefresh: (() => void) | null; busy: boolean;
}) {
  if (!plan) return <div className={`${styles.notice} ${styles.info}`}>{t("Архитектура появится, когда будут приняты этапы, от которых она зависит (список вверху страницы).")}</div>;
  const coverage = plan.coverage ?? null;
  const count = (status: Coverage["status"]) => coverage?.filter((step) => step.status === status).length ?? 0;
  const statusText = { built: t("делает сайт"), manual: t("вручную, вне сайта"), not_built: t("сайт не делает") };
  const statusColor = { built: "var(--brand-ink)", manual: "#6b716d", not_built: "#b3261e" };
  return (
    <>
      {outdated && (
        <div className={`${styles.notice} ${styles.warning}`}>
          {t("Принятые этапы изменились, и архитектуру нужно обновить — иначе её нельзя принять.")}
          {onRefresh && <button className={styles.secondary} style={{ marginTop: 8 }} disabled={busy} onClick={onRefresh}>{busy ? t("Обновляем…") : t("Обновить архитектуру")}</button>}
        </div>
      )}
      <section className={styles.card} aria-label={t("Коротко")}>
        <p className={styles.cardTitle}>{t("Что будет сделано")}</p>
        <p style={{ margin: 0 }}>{plan.summary}</p>
      </section>
      {coverage && coverage.length > 0 && (
        <section className={styles.card} aria-labelledby="coverage-title">
          <p id="coverage-title" className={styles.cardTitle}>{t("Что из вашего процесса делает сайт")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Шаги из этапа «Бизнес-процесс»: {0} делает сайт, {1} — вручную, {2} сайт не делает.", [count("built"), count("manual"), count("not_built")])}</p>
          {count("not_built") > 0 && <p className={`${styles.notice} ${styles.warning}`}>{t("Шаги, которые сайт не делает, можно оставить ручными, записать в заметки для разработчика или выбрать свой стек в решении «Технологии».")}</p>}
          <ul className={styles.list} style={{ listStyle: "none", paddingLeft: 0 }}>
            {coverage.map((step, i) => (
              <li key={i} style={{ borderLeft: `4px solid ${statusColor[step.status]}`, paddingLeft: 8, marginBottom: 8 }}>
                <span className={styles.small}>{step.scenario} · {step.actor} · <strong style={{ color: statusColor[step.status] }}>{statusText[step.status]}</strong></span>
                <div>{step.action}</div>
                <div className={styles.small}>{step.how}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Items title={t("Из чего состоит")} items={plan.components ?? []} />
      {(plan.dataModel?.length ?? 0) > 0 && (
        <section className={styles.card} aria-labelledby="datamodel-title">
          <p id="datamodel-title" className={styles.cardTitle}>{t("Схема данных")}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Что хранит система и как это связано. Связи — стрелки слева и строки «→» в карточке: сплошная линия — «много», пунктир — «один».")}</p>
          <DataDiagram entities={plan.dataModel!} />
          <ul className={styles.list}>{plan.dataModel!.map((entity) => <li key={entity.key}><strong>{entity.name}.</strong> {entity.plain}</li>)}</ul>
        </section>
      )}
      {(plan.sequences ?? []).map((sequence) => (
        <section key={sequence.title} className={styles.card} aria-label={sequence.title}>
          <p className={styles.cardTitle}>{t("Сценарий по шагам: {0}", [sequence.title])}</p>
          <p className={styles.small} style={{ marginTop: 0 }}>{t("Кто кому что передаёт — сверху вниз. Схема широкая — листайте её вбок.")}</p>
          <SequenceDiagram sequence={sequence} />
        </section>
      ))}
      <Items title={t("Что умеет")} items={plan.features} />
      <Items title={t("Кто пользуется")} items={plan.roles} />
      <Items title={t("Какие данные хранятся")} items={plan.data} />
      <section className={styles.card} aria-label={t("Страницы и где работает")}>
        <p className={styles.cardTitle}>{t("Страницы")}</p>
        <ul className={styles.list}>{plan.pages.map((item) => <li key={item.path}><code>{item.path}</code> — <strong>{item.title}</strong>: {item.plain}</li>)}</ul>
        <p className={styles.cardTitle} style={{ marginTop: 12 }}>{t("Уведомления")}</p>
        <ul className={styles.list}>{plan.notifications.map((item) => <li key={item}>{item}</li>)}</ul>
        <p className={styles.cardTitle} style={{ marginTop: 12 }}>{t("Где может работать")}</p>
        <ul className={styles.list}>{plan.hosting.map((item) => <li key={item.option}><strong>{item.option}:</strong> {item.plain}</li>)}</ul>
        <p className={styles.cardTitle} style={{ marginTop: 12 }}>{t("Чего в этой версии нет")}</p>
        <ul className={styles.list}>{plan.limits.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      {plan.api && <section className={styles.card} aria-label={t("Контракт API")}>
        <p className={styles.cardTitle}>{t("Контракт API")}</p>
        <p className={styles.small} style={{ marginTop: 0 }}>{plan.kind === "site" ? t("Точное описание формы заявки в формате OpenAPI — передайте разработчику, если он будет что-то дорабатывать.") : t("Точное описание адресов и форм записи в формате OpenAPI — передайте разработчику, если он будет что-то дорабатывать. Сайт на BuildPath и программа для своего сервера работают по нему одинаково.")}</p>
        <details><summary className={styles.small}>{t("Показать")}</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 14, overflowX: "auto" }}>{plan.api}</pre></details>
        <button className={styles.ghost} style={{ marginTop: 8 }} onClick={() => download(plan.kind === "site" ? "lead-api.yaml" : "booking-api.yaml", plan.api, "text/yaml")}>{plan.kind === "site" ? t("Скачать lead-api.yaml") : t("Скачать booking-api.yaml")}</button>
      </section>}
      <section className={styles.card} aria-label={t("Заметки")}>
        <label className={styles.field} style={{ margin: 0 }}>
          <span className={styles.cardTitle}>{t("Ваши заметки для разработчиков")}</span>
          <span className={styles.why}>{t("Что важно учесть потом: например, «нужна предоплата через Kaspi» или «мастер Тимур работает через неделю». Архитектура от заметок не меняется — это пожелания на будущее.")}</span>
          <textarea className={styles.textarea} value={notes} maxLength={2000} disabled={disabled} onChange={(event) => onNotes(event.target.value)} placeholder={t("Необязательно")} />
        </label>
      </section>
    </>
  );
}
