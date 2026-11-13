"use client";

import { t } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { explainError, portfolioPhotos, shrinkPhoto } from "@/lib/journey";
import WorkPhoto from "../../specialists/work-photo";
import styles from "../../projects/journey.module.css";
import AppHeader from "../../app-header";

type Mine = {
  profile: { id: string; displayName: string; headline: string; about: string | null; stageKeys: string[]; hourlyRate: number | null; city: string | null; published: boolean; portfolio?: Work[] } | null;
  suggestedName: string | null;
  stages: Array<{ key: string; title: string }>;
};

type Work = { title: string; description: string | null; url: string | null; stageKey: string | null; photoId?: string | null };
const MAX_WORKS = 12;

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
  const [works, setWorks] = useState<Work[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoFor = useRef<number | null>(null);

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
    setWorks(profile?.portfolio ?? []);
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
        body: JSON.stringify({ displayName: name, headline, about: about.trim() || null, stageKeys: stages, hourlyRate: rate ? Number(rate) : null, city: city.trim() || null, published: publish,
          portfolio: works.map((work) => ({ title: work.title.trim(), description: work.description?.trim() || null, url: work.url?.trim() || null, stageKey: work.stageKey, photoId: work.photoId ?? null })) }),
      });
      fill(next);
      setSaved(publish ? t("Сохранено. Карточка видна в каталоге.") : t("Сохранено. Карточка скрыта из каталога."));
    } catch (caught) { setError(explainError(caught)); } finally { setBusy(false); }
  }

  const worksValid = works.every((work) => work.title.trim().length >= 3 && (!work.url?.trim() || /^https?:\/\/[^\s/]+\.[^\s]+/i.test(work.url.trim())));
  const valid = name.trim().length >= 2 && headline.trim().length >= 5 && worksValid;
  async function addPhoto(index: number, file: File | undefined) {
    if (!file) return;
    setUploading(index); setError(""); setSaved("");
    try {
      const photo = await portfolioPhotos.upload(await shrinkPhoto(file));
      setWorks((current) => current.map((work, at) => (at === index ? { ...work, photoId: photo.id } : work)));
    } catch (caught) { setError(explainError(caught)); } finally { setUploading(null); }
  }
  const setWork = (index: number, patch: Partial<Work>) => setWorks(works.map((work, at) => (at === index ? { ...work, ...patch } : work)));
  const move = (index: number, by: number) => {
    const next = [...works];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    setWorks(next);
  };
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
        {data?.profile && !saved && <p><a href={`/specialists/${data.profile.id}`}>{t("Моя карточка и отзывы →")}</a></p>}
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
            <fieldset className={styles.field} style={{ border: 0, padding: 0 }}>
              <legend className={styles.label}>{t("Примеры работ")}</legend>
              <span className={styles.why}>{t("Что вы уже сделали: сайт, тексты, оформление. Ссылку владельцы откроют сами — BuildPath её не проверяет, поэтому указывайте только свои работы и с согласия заказчика.")}{" "}{t("К работе можно добавить фото или снимок экрана: мы проверим файл и уберём из него служебные данные (место съёмки, модель телефона). Фото видят только вошедшие пользователи, пока карточка опубликована.")}</span>
              {works.map((work, index) => (
                <div key={index} className={styles.card} style={{ margin: "8px 0", padding: 14 }}>
                  {work.photoId && <div style={{ marginBottom: 8 }}><WorkPhoto photoId={work.photoId} alt={work.title || t("Фото работы")} /></div>}
                  <div className={styles.row} style={{ marginBottom: 8 }}>
                    <button type="button" className={styles.ghost} disabled={uploading !== null} onClick={() => { photoFor.current = index; fileRef.current?.click(); }}>
                      {uploading === index ? t("Загружаем фото…") : work.photoId ? t("Заменить фото") : t("+ Фото работы")}
                    </button>
                    {work.photoId && <button type="button" className={styles.ghost} disabled={uploading !== null} onClick={() => setWork(index, { photoId: null })}>{t("Убрать фото")}</button>}
                  </div>
                  <input className={styles.input} placeholder={t("Название, например «Сайт кондитерской»")} aria-label={t("Название работы")} value={work.title} maxLength={80} onChange={(event) => setWork(index, { title: event.target.value })} />
                  <textarea className={styles.textarea} style={{ minHeight: 60, marginTop: 8 }} placeholder={t("Что вы сделали (необязательно)")} aria-label={t("Что вы сделали")} value={work.description ?? ""} maxLength={500} onChange={(event) => setWork(index, { description: event.target.value })} />
                  <input className={styles.input} style={{ marginTop: 8 }} inputMode="url" placeholder="https://" aria-label={t("Ссылка на работу")} value={work.url ?? ""} maxLength={300} onChange={(event) => setWork(index, { url: event.target.value })} />
                  {work.url?.trim() && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(work.url.trim()) && <span className={styles.why} style={{ color: "#7a1f1f" }}>{t("Ссылка должна начинаться с https:// и вести на сайт.")}</span>}
                  <div className={styles.chips} role="group" aria-label={t("Этап")} style={{ marginTop: 8 }}>
                    {data.stages.map((item) => (
                      <button key={item.key} type="button" className={styles.choice} style={{ width: "auto" }} aria-pressed={work.stageKey === item.key} onClick={() => setWork(index, { stageKey: work.stageKey === item.key ? null : item.key })}>{t(item.title)}</button>
                    ))}
                  </div>
                  <div className={styles.row} style={{ marginTop: 8 }}>
                    <button type="button" className={styles.ghost} disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("Выше")}>↑</button>
                    <button type="button" className={styles.ghost} disabled={index === works.length - 1} onClick={() => move(index, 1)} aria-label={t("Ниже")}>↓</button>
                    <button type="button" className={styles.ghost} onClick={() => setWorks(works.filter((_, at) => at !== index))}>{t("Убрать")}</button>
                  </div>
                </div>
              ))}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" hidden onChange={(event) => { const at = photoFor.current; if (at !== null) void addPhoto(at, event.target.files?.[0]); event.target.value = ""; }} />
              {works.length < MAX_WORKS && <button type="button" className={styles.secondary} onClick={() => setWorks([...works, { title: "", description: null, url: null, stageKey: null }])}>{t("+ Добавить работу")}</button>}
            </fieldset>
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
              <button className={styles.button} disabled={busy || uploading !== null || !valid || stages.length === 0}>{busy ? t("Сохраняем…") : published ? t("Сохранить") : t("Опубликовать в каталоге")}</button>
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
