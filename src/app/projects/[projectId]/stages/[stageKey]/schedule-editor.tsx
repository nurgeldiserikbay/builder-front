"use client";

import styles from "../../../journey.module.css";

export type WorkHours = { from: string; to: string };
export type Schedule = {
  timezone: string;
  services: Array<{ name: string; minutes: number }>;
  masters: Array<{ key: string; name: string; services: string[]; week: Array<WorkHours | null> }>;
  rules: { slotStep: number; minNoticeHours: number; horizonDays: number; cancelHours: number };
};
export type ScheduleOptions = { template: Schedule | null; timezones: Array<{ id: string; label: string }>; weekdays: string[]; slotSteps: number[] };

const durations = [15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240];
const number = (value: string, fallback: number) => (/^\d+$/.test(value) ? Number(value) : fallback);

function nextKey(masters: Schedule["masters"]): string {
  for (let index = 1; ; index += 1) if (!masters.some((master) => master.key === `m${index}`)) return `m${index}`;
}

/**
 * Durations, masters with their week and booking rules. Everything is the owner's facts, so there is no AI here;
 * the server validates the same limits and explains what blocks booking.
 */
export function ScheduleEditor({ value, onChange, options, offerServices, disabled, issues }: {
  value: Schedule; onChange: (next: Schedule) => void; options: ScheduleOptions; offerServices: string[]; disabled: boolean; issues: string[];
}) {
  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch });
  const setMaster = (index: number, patch: Partial<Schedule["masters"][number]>) => set({ masters: value.masters.map((master, i) => (i === index ? { ...master, ...patch } : master)) });
  const missing = offerServices.filter((name) => !value.services.some((service) => service.name === name));

  return (
    <>
      <section className={styles.card} aria-label="Услуги для записи">
        <p className={styles.cardTitle}>Сколько длится каждая услуга</p>
        <p className={styles.small} style={{ marginTop: 0 }}>Клиенту покажем только то время, в которое услуга целиком помещается в рабочий день мастера.</p>
        <ul className={styles.versions}>
          {value.services.map((service, index) => (
            <li key={service.name}>
              <div className={styles.row}>
                <strong style={{ flex: 1 }}>{service.name}</strong>
                <select className={styles.input} style={{ width: "auto" }} aria-label={`Длительность: ${service.name}`} value={service.minutes} disabled={disabled}
                  onChange={(event) => set({ services: value.services.map((item, i) => (i === index ? { ...item, minutes: Number(event.target.value) } : item)) })}>
                  {[...new Set([...durations, service.minutes])].sort((a, b) => a - b).map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ""}`}</option>)}
                </select>
              </div>
              {!disabled && (
                <button className={styles.ghost} style={{ minHeight: 36, marginTop: 4 }} onClick={() => set({ services: value.services.filter((_, i) => i !== index), masters: value.masters.map((master) => ({ ...master, services: master.services.filter((name) => name !== service.name) })) })}>
                  Без онлайн-записи</button>
              )}
            </li>
          ))}
        </ul>
        {!disabled && missing.length > 0 && (
          <div className={`${styles.notice} ${styles.info}`}>
            Без онлайн-записи: {missing.map((name) => `«${name}»`).join(", ")}. На сайте они останутся в списке услуг.
            <div className={styles.chips} style={{ marginTop: 8 }}>
              {missing.map((name) => <button key={name} type="button" className={styles.chip} onClick={() => set({ services: [...value.services, { name, minutes: 60 }] })}>+ {name}</button>)}
            </div>
          </div>
        )}
      </section>

      <section className={styles.card} aria-label="Мастера">
        <p className={styles.cardTitle}>Мастера и рабочие часы</p>
        <p className={styles.small} style={{ marginTop: 0 }}>Если у вас один мастер — это вы. Клиент сможет выбрать мастера или «любого свободного».</p>
        {value.masters.map((master, index) => (
          <div key={master.key} className={styles.item} style={{ marginBottom: 12 }}>
            <label className={styles.field}>
              <span className={styles.label}>Имя мастера</span>
              <input className={styles.input} value={master.name} maxLength={60} disabled={disabled} onChange={(event) => setMaster(index, { name: event.target.value })} />
            </label>
            <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={styles.label}>Какие услуги делает</legend>
              <div className={styles.chips}>
                <button type="button" className={styles.chip} aria-pressed={master.services.length === 0} disabled={disabled} onClick={() => setMaster(index, { services: [] })}>Все</button>
                {value.services.map((service) => {
                  const on = master.services.includes(service.name);
                  return (
                    <button key={service.name} type="button" className={styles.chip} aria-pressed={on} disabled={disabled}
                      onClick={() => setMaster(index, { services: on ? master.services.filter((name) => name !== service.name) : [...master.services, service.name] })}>{service.name}</button>
                  );
                })}
              </div>
            </fieldset>
            <p className={styles.label} style={{ margin: "10px 0 4px" }}>Рабочие дни</p>
            {master.week.map((day, dayIndex) => (
              <div key={dayIndex} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto 1fr", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={Boolean(day)} disabled={disabled} style={{ width: 22, height: 22 }}
                    onChange={(event) => setMaster(index, { week: master.week.map((item, i) => (i === dayIndex ? (event.target.checked ? master.week.find(Boolean) ?? { from: "10:00", to: "19:00" } : null) : item)) })} />
                  <strong>{options.weekdays[dayIndex]}</strong>
                </label>
                {day ? (
                  <>
                    <input className={styles.input} style={{ minWidth: 0, padding: "10px 6px" }} type="time" step={900} aria-label={`${options.weekdays[dayIndex]}: начало`} value={day.from} disabled={disabled}
                      onChange={(event) => setMaster(index, { week: master.week.map((item, i) => (i === dayIndex ? { ...day, from: event.target.value } : item)) })} />
                    <span>–</span>
                    <input className={styles.input} style={{ minWidth: 0, padding: "10px 6px" }} type="time" step={900} aria-label={`${options.weekdays[dayIndex]}: конец`} value={day.to} disabled={disabled}
                      onChange={(event) => setMaster(index, { week: master.week.map((item, i) => (i === dayIndex ? { ...day, to: event.target.value } : item)) })} />
                  </>
                ) : <span className={styles.small} style={{ gridColumn: "2 / 5" }}>выходной</span>}
              </div>
            ))}
            {!disabled && value.masters.length > 1 && (
              <button className={styles.danger} style={{ minHeight: 40, marginTop: 6 }} onClick={() => set({ masters: value.masters.filter((_, i) => i !== index) })}>Убрать мастера</button>
            )}
          </div>
        ))}
        {!disabled && value.masters.length < 10 && (
          <button className={styles.secondary} onClick={() => set({ masters: [...value.masters, { key: nextKey(value.masters), name: "", services: [], week: value.masters[0]?.week.map((day) => (day ? { ...day } : null)) ?? Array(7).fill(null) }] })}>+ Добавить мастера</button>
        )}
      </section>

      <section className={styles.card} aria-label="Правила записи">
        <p className={styles.cardTitle}>Правила записи</p>
        <label className={styles.field}>
          <span className={styles.label}>Шаг времени</span>
          <span className={styles.why}>Через сколько минут показывать варианты начала: 10:00, 10:30…</span>
          <select className={styles.input} value={value.rules.slotStep} disabled={disabled} onChange={(event) => set({ rules: { ...value.rules, slotStep: Number(event.target.value) } })}>
            {options.slotSteps.map((step) => <option key={step} value={step}>{step} мин</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Записываться не позже чем за, часов</span>
          <span className={styles.why}>Чтобы запись «через 5 минут» не застала вас врасплох.</span>
          <input className={styles.input} inputMode="numeric" value={value.rules.minNoticeHours} disabled={disabled} onChange={(event) => set({ rules: { ...value.rules, minNoticeHours: Math.min(72, number(event.target.value, 0)) } })} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>На сколько дней вперёд</span>
          <input className={styles.input} inputMode="numeric" value={value.rules.horizonDays} disabled={disabled} onChange={(event) => set({ rules: { ...value.rules, horizonDays: Math.min(60, Math.max(1, number(event.target.value, 1))) } })} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Клиент может отменить не позже чем за, часов</span>
          <span className={styles.why}>Позже отменить можно только позвонив вам.</span>
          <input className={styles.input} inputMode="numeric" value={value.rules.cancelHours} disabled={disabled} onChange={(event) => set({ rules: { ...value.rules, cancelHours: Math.min(72, number(event.target.value, 0)) } })} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Часовой пояс</span>
          <select className={styles.input} value={value.timezone} disabled={disabled} onChange={(event) => set({ timezone: event.target.value })}>
            {options.timezones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
          </select>
        </label>
      </section>
      {issues.length > 0 && <div className={`${styles.notice} ${styles.warning}`}><strong>Чтобы принять этап:</strong><ul className={styles.list}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    </>
  );
}
