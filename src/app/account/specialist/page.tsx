"use client";

import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError } from "@/lib/journey";
import styles from "../../projects/journey.module.css";
import AppHeader from "../../app-header";

type Mine = {
  profile: { id: string; displayName: string; headline: string; about: string | null; stageKeys: string[]; hourlyRate: number | null; city: string | null; published: boolean } | null;
  suggestedName: string | null;
  stages: Array<{ key: string; title: string }>;
};

/** The specialist's own card in the catalog. */
export default function SpecialistProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<Mine | null>(null);
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [stages, setStages] = useState<string[]>([]);
  const [rate, setRate] = useState("");
  const [city, setCity] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  function fill(next: Mine) {
    setData(next);
    const profile = next.profile;
    setName(profile?.displayName ?? next.suggestedName ?? "");
    setHeadline(profile?.headline ?? "");
    setAbout(profile?.about ?? "");
    setStages(profile?.stageKeys ?? []);
    setRate(profile?.hourlyRate ? String(profile.hourlyRate) : "");
    setCity(profile?.city ?? "");
    setPublished(profile?.published ?? false);
  }

  useEffect(() => {
    api<Mine>("/me/specialist-profile").then(fill).catch((caught) => {
      if (caught instanceof ApiError && caught.status === 401) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      setError(explainError(caught));
    });
  }, [router]);

  async function save(publish: boolean) {
    setBusy(true); setError(""); setSaved("");
    try {
      const next = await api<Mine>("/me/specialist-profile", {
        method: "PUT",
        body: JSON.stringify({ displayName: name, headline, about: about.trim() || null, stageKeys: stages, hourlyRate: rate ? Number(rate) : null, city: city.trim() || null, published: publish }),
      });
      fill(next);
      setSaved(publish ? t("Сохранено. Карточка видна в каталоге.") : t("Сохранено. Карточка скрыта из каталога."));
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const valid = name.trim().length >= 2 && headline.trim().length >= 5;
  return (
    <div className={styles.shell}>
      <AppHeader back={{ href: "/account", label: t("← Аккаунт") }} title={t("Карточка специалиста")} />
      <main className={styles.container}>
        <p className={styles.kicker}>{t("Каталог специалистов")}</p>
        <h1 className={styles.h1}>{t("Ваша карточка")}</h1>
        <p className={styles.muted} style={{ marginTop: 0 }}>{t("По карточке владельцы проектов находят вас и приглашают на этап. Почту в каталоге никто не видит — её узнает только тот, кто вас пригласит.")}</p>
        {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
        {saved && <p className={`${styles.notice} ${styles.success}`} role="status">{saved}{data?.profile && <> <a href={`/specialists/${data.profile.id}`} style={{ color: "inherit", fontWeight: 700 }}>{t("Посмотреть →")}</a></>}</p>}
        {!data && !error && <p className={styles.muted}>{t("Загружаем…")}</p>}
        {data && (
          <form onSubmit={(event) => { event.preventDefault(); void save(true); }}>
            <label className={styles.field}>
              <span className={styles.label}>{t("Имя в каталоге")}</span>
              <input className={styles.input} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t("Чем вы помогаете — одной строкой")}</span>
              <span className={styles.why}>{t("Например: «Тексты для сайтов услуг: коротко, понятно, без канцелярита».")}</span>
              <input className={styles.input} value={headline} maxLength={140} onChange={(event) => setHeadline(event.target.value)} />
            </label>
            <fieldset className={styles.field} style={{ border: 0, padding: 0 }}>
              <legend className={styles.label}>{t("На каких этапах вы работаете")}</legend>
              <div className={styles.chips}>
                {data.stages.map((item) => {
                  const on = stages.includes(item.key);
                  return <button key={item.key} type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={on} onClick={() => setStages(on ? stages.filter((key) => key !== item.key) : [...stages, item.key])}>{t(item.title)}</button>;
                })}
              </div>
            </fieldset>
            <label className={styles.field}>
              <span className={styles.label}>{t("О себе и опыт")}</span>
              <textarea className={styles.textarea} value={about} maxLength={2000} onChange={(event) => setAbout(event.target.value)} />
            </label>
            <div className={styles.row} style={{ alignItems: "flex-start" }}>
              <label className={styles.field} style={{ flex: "1 1 180px" }}>
                <span className={styles.label}>{t("Ставка от, ₸ в час")}</span>
                <span className={styles.why}>{t("Для ориентира. Условия конкретной работы задаются в приглашении.")}</span>
                <input className={styles.input} inputMode="numeric" value={rate} maxLength={7} onChange={(event) => setRate(event.target.value.replace(/\D/g, ""))} />
              </label>
              <label className={styles.field} style={{ flex: "1 1 180px" }}>
                <span className={styles.label}>{t("Город (необязательно)")}</span>
                <input className={styles.input} value={city} maxLength={80} onChange={(event) => setCity(event.target.value)} />
              </label>
            </div>
            <div className={styles.row}>
              <button className={styles.button} disabled={busy || !valid || stages.length === 0}>{busy ? t("Сохраняем…") : published ? t("Сохранить") : t("Опубликовать в каталоге")}</button>
              {published
                ? <button type="button" className={styles.ghost} disabled={busy} onClick={() => void save(false)}>{t("Скрыть из каталога")}</button>
                : <button type="button" className={styles.ghost} disabled={busy || !valid} onClick={() => void save(false)}>{t("Сохранить без публикации")}</button>}
            </div>
            {stages.length === 0 && <p className={styles.why}>{t("Чтобы опубликовать карточку, выберите хотя бы один этап.")}</p>}
          </form>
        )}
      </main>
    </div>
  );
}
