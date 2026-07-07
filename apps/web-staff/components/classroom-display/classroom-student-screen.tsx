"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import type { ClassroomDisplayView } from "@takween/domain";
import {
  Crown,
  Heart,
  Medal,
  PartyPopper,
  Rocket,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from "lucide-react";

import {
  playClassroomDisplayCelebrationSound,
  resolveCelebrationSoundKind,
  unlockClassroomDisplaySound,
} from "@/components/classroom-display/classroom-display-sounds";

type ClassroomDisplayThemeKey =
  | "STARS"
  | "SPACE"
  | "OCEAN"
  | "FOREST"
  | "STADIUM"
  | "CANDY";

type ClassroomStudentScreenProps = {
  view: ClassroomDisplayView;
  isLive?: boolean;
  lastUpdatedAt?: number | null;
  themeKey?: string;
};

type LooseRecord = Record<string, unknown>;

type LeaderboardRow = LooseRecord & {
  studentId?: string;
  displayName?: string;
  name?: string;
  studentDisplayName?: string;
  points?: number;
  totalPoints?: number;
  score?: number;
};

type FeedRow = LooseRecord & {
  id?: string;
  title?: string;
  description?: string;
  displayName?: string;
  studentDisplayName?: string;
  studentName?: string;
  badgeTitle?: string;
  value?: number;
  points?: number;
  pointsDelta?: number;
  deltaPoints?: number;
  awardedPoints?: number;
  scoreDelta?: number;
  occurredAt?: number;
};

function asRecord(value: unknown): LooseRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as LooseRecord;
  }

  return {};
}

function readString(source: LooseRecord, key: string, fallback = ""): string {
  const value = source[key];

  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  return fallback;
}

function readNumber(source: LooseRecord, key: string, fallback = 0): number {
  const value = source[key];

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[^\d.-]/g, "");

    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function readBoolean(
  source: LooseRecord,
  key: string,
  fallback = true,
): boolean {
  const value = source[key];

  if (typeof value === "boolean") return value;

  return fallback;
}

function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-SA").format(value);
}

function formatLastUpdatedAt(value: number | null) {
  if (!value) return "لم يحدث بعد";

  return new Intl.DateTimeFormat("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function getLeaderboardName(row: LeaderboardRow, index: number) {
  return (
    readString(row, "displayName") ||
    readString(row, "studentDisplayName") ||
    readString(row, "name") ||
    `بطل ${formatNumber(index + 1)}`
  );
}

function getLeaderboardPoints(row: LeaderboardRow) {
  return (
    readNumber(row, "points") ||
    readNumber(row, "totalPoints") ||
    readNumber(row, "score")
  );
}

function getFeedStudentName(row: FeedRow) {
  return (
    readString(row, "displayName") ||
    readString(row, "studentDisplayName") ||
    readString(row, "studentName") ||
    "بطل الفصل"
  );
}

function getFeedPoints(row: FeedRow) {
  return (
    readNumber(row, "points") ||
    readNumber(row, "pointsDelta") ||
    readNumber(row, "deltaPoints") ||
    readNumber(row, "awardedPoints") ||
    readNumber(row, "scoreDelta") ||
    readNumber(row, "value")
  );
}

function getRankIcon(index: number) {
  if (index === 0) return <Crown className="size-10 text-yellow-300" />;
  if (index === 1) return <Medal className="size-9 text-slate-200" />;
  if (index === 2) return <Medal className="size-9 text-orange-300" />;

  return <Star className="size-8 text-cyan-200" />;
}

function getRankLabel(index: number) {
  if (index === 0) return "القائد";
  if (index === 1) return "نجم قوي";
  if (index === 2) return "بطل رائع";

  return "نجم الفصل";
}

type ClassroomDisplayTheme = {
  key: ClassroomDisplayThemeKey;
  title: string;
  backgroundClassName: string;
  glowClassName: string;
  heroIcon: string;
  shapes: string[];
  primaryTextClassName: string;
  accentTextClassName: string;
  badgeClassName: string;
};

const classroomDisplayThemes: Record<
  ClassroomDisplayThemeKey,
  ClassroomDisplayTheme
> = {
  STARS: {
    key: "STARS",
    title: "نجوم",
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.45),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(168,85,247,0.45),_transparent_35%),linear-gradient(135deg,_#0f172a_0%,_#312e81_45%,_#0f766e_100%)]",
    glowClassName: "bg-yellow-300",
    heroIcon: "🏆",
    shapes: ["⭐", "🚀", "🎈", "🏆", "✨"],
    primaryTextClassName: "text-yellow-200",
    accentTextClassName: "text-cyan-100",
    badgeClassName: "bg-yellow-300 text-slate-950",
  },
  SPACE: {
    key: "SPACE",
    title: "فضاء",
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.45),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(34,211,238,0.35),_transparent_30%),linear-gradient(135deg,_#020617_0%,_#312e81_50%,_#581c87_100%)]",
    glowClassName: "bg-indigo-300",
    heroIcon: "🚀",
    shapes: ["🪐", "🚀", "⭐", "🌙", "✨"],
    primaryTextClassName: "text-indigo-100",
    accentTextClassName: "text-cyan-100",
    badgeClassName: "bg-indigo-200 text-slate-950",
  },
  OCEAN: {
    key: "OCEAN",
    title: "بحر",
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top_right,_rgba(125,211,252,0.45),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(45,212,191,0.45),_transparent_35%),linear-gradient(135deg,_#082f49_0%,_#0f766e_50%,_#164e63_100%)]",
    glowClassName: "bg-cyan-300",
    heroIcon: "🐬",
    shapes: ["🐬", "🐠", "🌊", "⭐", "🫧"],
    primaryTextClassName: "text-cyan-100",
    accentTextClassName: "text-teal-100",
    badgeClassName: "bg-cyan-300 text-slate-950",
  },
  FOREST: {
    key: "FOREST",
    title: "غابة",
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top_right,_rgba(187,247,208,0.35),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(250,204,21,0.28),_transparent_30%),linear-gradient(135deg,_#052e16_0%,_#166534_50%,_#365314_100%)]",
    glowClassName: "bg-lime-300",
    heroIcon: "🦁",
    shapes: ["🌳", "🦁", "🦋", "🍃", "⭐"],
    primaryTextClassName: "text-lime-100",
    accentTextClassName: "text-yellow-100",
    badgeClassName: "bg-lime-300 text-slate-950",
  },
  STADIUM: {
    key: "STADIUM",
    title: "ملعب",
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.35),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(34,197,94,0.4),_transparent_35%),linear-gradient(135deg,_#052e16_0%,_#14532d_45%,_#0f172a_100%)]",
    glowClassName: "bg-green-300",
    heroIcon: "⚽",
    shapes: ["⚽", "🏅", "📣", "🏆", "⭐"],
    primaryTextClassName: "text-yellow-100",
    accentTextClassName: "text-green-100",
    badgeClassName: "bg-green-300 text-slate-950",
  },
  CANDY: {
    key: "CANDY",
    title: "ألوان",
    backgroundClassName:
      "bg-[radial-gradient(circle_at_top_right,_rgba(251,113,133,0.45),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(250,204,21,0.45),_transparent_35%),linear-gradient(135deg,_#7c2d12_0%,_#be185d_45%,_#7e22ce_100%)]",
    glowClassName: "bg-pink-300",
    heroIcon: "🍭",
    shapes: ["🍭", "🎈", "🧁", "⭐", "✨"],
    primaryTextClassName: "text-pink-100",
    accentTextClassName: "text-yellow-100",
    badgeClassName: "bg-pink-200 text-slate-950",
  },
};

function resolveClassroomDisplayTheme(
  value: string | undefined,
): ClassroomDisplayTheme {
  const normalized = String(value ?? "STARS").toUpperCase();

  if (normalized in classroomDisplayThemes) {
    return classroomDisplayThemes[normalized as ClassroomDisplayThemeKey];
  }

  return classroomDisplayThemes.STARS;
}

function FloatingShape({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`pointer-events-none absolute select-none opacity-70 ${className}`}
    >
      {children}
    </div>
  );
}

function fireStudentCelebration() {
  const defaults = {
    spread: 75,
    ticks: 90,
    gravity: 0.85,
    decay: 0.92,
    startVelocity: 35,
    scalar: 1.15,
  };

  confetti({
    ...defaults,
    particleCount: 90,
    origin: { x: 0.18, y: 0.65 },
    colors: ["#fde047", "#22d3ee", "#fb7185", "#a78bfa", "#34d399"],
  });

  confetti({
    ...defaults,
    particleCount: 90,
    origin: { x: 0.82, y: 0.65 },
    colors: ["#fde047", "#22d3ee", "#fb7185", "#a78bfa", "#34d399"],
  });

  window.setTimeout(() => {
    confetti({
      spread: 120,
      particleCount: 140,
      origin: { x: 0.5, y: 0.52 },
      colors: ["#facc15", "#38bdf8", "#f472b6", "#c084fc", "#4ade80"],
    });
  }, 250);
}

const softSpring = {
  type: "spring" as const,
  stiffness: 170,
  damping: 18,
};

const popSpring = {
  type: "spring" as const,
  stiffness: 220,
  damping: 14,
};

export function ClassroomStudentScreen({
  view,
  isLive = false,
  lastUpdatedAt = null,
  themeKey = "STARS",
}: ClassroomStudentScreenProps) {
  const model = view as unknown as LooseRecord;
  const theme = resolveClassroomDisplayTheme(themeKey);
  const header = asRecord(model.header);
  const settings = asRecord(model.settings);
  const previousLatestFeedIdRef = useRef<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  const [soundNeedsActivation, setSoundNeedsActivation] = useState(false);
  const [soundUnlocked, setSoundUnlocked] = useState(false);

  const schoolName = readString(header, "schoolName", "مدرستنا الجميلة");
  const classTitle = readString(header, "classTitle", "فصل الأبطال");
  const subjectTitle =
    readString(header, "subjectTitle") ||
    readString(model, "subjectKey", "المادة");

  const status = readString(model, "status", "ACTIVE");

  const lessonGoal = readString(header, "lessonGoal");
  const encouragementMessage =
    readString(header, "encouragementMessage") ||
    "كل نجمة تقرّبك من إنجاز جديد ✨";

  const showLeaderboard = readBoolean(settings, "showLeaderboard", true);
  const showGamificationFeed = readBoolean(
    settings,
    "showGamificationFeed",
    true,
  );

  const isPaused = status === "PAUSED";
  const isEnded =
    status === "ENDED" || status === "CANCELLED" || status === "EXPIRED";

  const leaderboard = readArray<LeaderboardRow>(model.leaderboard).slice(0, 5);
  const feedItems = readArray<FeedRow>(model.feedItems).slice(0, 8);
  const latestFeedItem = feedItems[0];
  const latestFeedKey = latestFeedItem
    ? readString(latestFeedItem, "id") ||
      `${getFeedStudentName(latestFeedItem)}-${readString(
        latestFeedItem,
        "title",
      )}-${readNumber(latestFeedItem, "occurredAt")}`
    : "";
  const heroName = latestFeedItem
    ? getFeedStudentName(latestFeedItem)
    : "أبطال الفصل";

  const heroTitle = latestFeedItem
    ? readString(latestFeedItem, "title", "إنجاز جديد")
    : "جاهزون للانطلاق؟";

  const heroDescription = latestFeedItem
    ? readString(latestFeedItem, "description") ||
      readString(latestFeedItem, "badgeTitle") ||
      "أحسنت يا بطل!"
    : encouragementMessage;

  const heroPoints = latestFeedItem ? getFeedPoints(latestFeedItem) : 0;

  async function handleEnableSound() {
    const unlocked = await unlockClassroomDisplaySound();

    setSoundUnlocked(unlocked);
    setSoundNeedsActivation(!unlocked);

    if (unlocked) {
      const kind = resolveCelebrationSoundKind({
        points: heroPoints,
        title: heroTitle,
        description: heroDescription,
      });

      await playClassroomDisplayCelebrationSound(kind);
    }
  }

  useEffect(() => {
    if (!latestFeedKey) return;

    if (!previousLatestFeedIdRef.current) {
      previousLatestFeedIdRef.current = latestFeedKey;
      return;
    }

    if (previousLatestFeedIdRef.current === latestFeedKey) return;

    previousLatestFeedIdRef.current = latestFeedKey;

    setCelebrating(true);
    fireStudentCelebration();

    const kind = resolveCelebrationSoundKind({
      points: heroPoints,
      title: heroTitle,
      description: heroDescription,
    });

    void playClassroomDisplayCelebrationSound(kind).then((played) => {
      setSoundUnlocked(played);

      if (!played) {
        setSoundNeedsActivation(true);
      }
    });

    const timeoutId = window.setTimeout(() => {
      setCelebrating(false);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [heroDescription, heroPoints, heroTitle, latestFeedKey]);

  return (
    <main
      dir="rtl"
      className="fixed inset-0 h-screen w-screen overflow-hidden bg-slate-950 text-white"
    >
      <AnimatePresence>
        {celebrating ? (
          <motion.div
            key="celebration-banner"
            initial={{ opacity: 0, y: -50, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.9 }}
            transition={popSpring}
            className="pointer-events-none absolute inset-x-0 top-10 z-50 flex justify-center"
          >
            <motion.div
              animate={{ y: [0, -10, 0], rotate: [0, 1.5, -1.5, 0] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="rounded-[2rem] border-4 border-yellow-200 bg-yellow-300 px-10 py-5 text-center text-slate-950 shadow-2xl"
            >
              <p className="text-5xl font-black">🎉 برافو يا {heroName} 🎉</p>
              <p className="mt-2 text-2xl font-black">
                نجمة جديدة في طريق الأبطال
              </p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {soundNeedsActivation && !soundUnlocked ? (
        <div className="absolute inset-x-0 bottom-8 z-50 flex justify-center">
          <button
            type="button"
            onClick={handleEnableSound}
            className="rounded-[2rem] border-4 border-cyan-100 bg-cyan-300 px-10 py-5 text-3xl font-black text-slate-950 shadow-2xl transition hover:scale-105"
          >
            🔊 اضغط لتفعيل صوت الاحتفالات
          </button>
        </div>
      ) : null}

      <div className={`absolute inset-0 ${theme.backgroundClassName}`} />

      <div className="absolute inset-0 opacity-25">
        <div
          className={`absolute -right-28 -top-28 size-96 rounded-full ${theme.glowClassName} blur-3xl`}
        />
        <div className="absolute -bottom-32 left-10 size-[28rem] rounded-full bg-fuchsia-400 blur-3xl" />
        <div className="absolute bottom-16 right-1/3 size-72 rounded-full bg-cyan-300 blur-3xl" />
      </div>

      <FloatingShape className="right-10 top-24 text-7xl">
        {theme.shapes[0]}
      </FloatingShape>
      <FloatingShape className="left-14 top-28 text-7xl">
        {theme.shapes[1]}
      </FloatingShape>
      <FloatingShape className="bottom-20 right-20 text-7xl">
        {theme.shapes[2]}
      </FloatingShape>
      <FloatingShape className="bottom-28 left-28 text-7xl">
        {theme.shapes[3]}
      </FloatingShape>
      <FloatingShape className="right-1/2 top-10 text-5xl">
        {theme.shapes[4]}
      </FloatingShape>

      <AnimatePresence mode="wait">
        {isPaused ? (
          <motion.section
            key="paused-screen"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={softSpring}
            className="absolute inset-0 z-40 flex items-center justify-center p-8"
          >
            <div className="max-w-4xl rounded-[3rem] border border-white/20 bg-white/20 p-12 text-center shadow-2xl backdrop-blur-2xl">
              <div className="mx-auto flex size-32 items-center justify-center rounded-[2.5rem] bg-cyan-300 text-slate-950 shadow-2xl">
                <span className="text-7xl">⏸️</span>
              </div>

              <h2 className="mt-8 text-7xl font-black leading-tight">
                استراحة قصيرة
              </h2>

              <p className="mt-5 text-3xl font-bold leading-relaxed text-cyan-100">
                سنعود بعد لحظات يا أبطال
              </p>

              <p className="mt-4 text-xl font-bold text-white/80">
                شاشة الفصل متوقفة مؤقتًا من المعلم
              </p>
            </div>
          </motion.section>
        ) : null}

        {isEnded ? (
          <motion.section
            key="ended-screen"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={softSpring}
            className="absolute inset-0 z-40 flex items-center justify-center p-8"
          >
            <div className="max-w-5xl rounded-[3rem] border border-white/20 bg-white/20 p-12 text-center shadow-2xl backdrop-blur-2xl">
              <div className="mx-auto flex size-36 items-center justify-center rounded-[2.5rem] bg-yellow-300 text-slate-950 shadow-2xl">
                <span className="text-8xl">🏁</span>
              </div>

              <h2 className="mt-8 text-7xl font-black leading-tight">
                انتهت جلسة الأبطال
              </h2>

              <p className="mt-5 text-3xl font-bold leading-relaxed text-yellow-100">
                شكرًا لكم يا نجوم الفصل ✨
              </p>

              <p className="mt-4 text-xl font-bold text-white/80">
                يمكن للمعلم فتح جلسة جديدة في أي وقت
              </p>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <section
        className={`relative z-10 grid h-screen w-screen grid-rows-[auto_1fr_auto] gap-5 p-6 transition-opacity duration-500 xl:p-8 ${
          isPaused || isEnded ? "pointer-events-none opacity-20 blur-[2px]" : ""
        }`}
      >
        <header className="grid grid-cols-[1fr_auto] items-center gap-5">
          <div className="rounded-[2rem] border border-white/15 bg-white/15 px-8 py-5 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex size-20 items-center justify-center rounded-[1.5rem] bg-yellow-300 text-slate-950 shadow-xl">
                <Sparkles className="size-11" />
              </div>

              <div>
                <p className="text-xl font-bold text-cyan-100">{schoolName}</p>

                <h1 className="mt-1 text-4xl font-black leading-tight xl:text-6xl">
                  نجوم {classTitle}
                </h1>

                <p
                  className={`mt-2 flex items-center gap-2 text-2xl font-extrabold ${theme.primaryTextClassName}`}
                >
                  <Rocket className="size-7" />
                  {subjectTitle}
                  <span className="rounded-full bg-white/15 px-3 py-1 text-base">
                    ثيم {theme.title}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-64 rounded-[2rem] border border-emerald-200/30 bg-emerald-400/20 px-6 py-5 text-center shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-center gap-3">
              <span
                className={`size-4 rounded-full ${
                  isLive ? "bg-emerald-300" : "bg-slate-300"
                }`}
              />
              <span className="text-2xl font-black">
                {isLive ? "مباشر الآن" : "غير متصل"}
              </span>
            </div>

            <p className="mt-2 text-sm text-emerald-50">
              آخر تحديث: {formatLastUpdatedAt(lastUpdatedAt)}
            </p>

            <p className="mt-2 rounded-full bg-white/15 px-4 py-1 text-sm font-bold">
              الحالة: {status}
            </p>
          </div>
        </header>

        <section className="grid min-h-0 grid-cols-[1.15fr_0.85fr] gap-5">
          <div className="relative flex min-h-0 flex-col overflow-hidden rounded-[2.5rem] border border-white/15 bg-white/15 p-7 shadow-2xl backdrop-blur-xl">
            <div className="absolute -left-20 -top-20 size-72 rounded-full bg-yellow-300/25 blur-3xl" />
            <div className="absolute -bottom-20 right-12 size-72 rounded-full bg-cyan-300/20 blur-3xl" />

            <div className="relative flex items-start justify-between gap-5">
              <div>
                <p className="flex items-center gap-2 text-2xl font-black text-yellow-200">
                  <PartyPopper className="size-8" />
                  بطل اللحظة
                </p>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={latestFeedKey || "empty-hero"}
                    initial={{ opacity: 0, y: 35, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -25, scale: 0.96 }}
                    transition={softSpring}
                  >
                    <h2 className="mt-5 text-7xl font-black leading-tight xl:text-8xl">
                      {heroName}
                    </h2>

                    <p className="mt-5 text-4xl font-black text-cyan-100">
                      {heroTitle}
                    </p>

                    <p className="mt-4 max-w-3xl text-2xl font-bold leading-relaxed text-white/90">
                      {heroDescription}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <motion.div
                key={`trophy-${latestFeedKey || "empty"}`}
                initial={{ rotate: -8, scale: 0.85 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={popSpring}
                className="flex size-44 shrink-0 items-center justify-center rounded-[2rem] bg-yellow-300 text-slate-950 shadow-2xl"
              >
                <span className="text-8xl">{theme.heroIcon}</span>
              </motion.div>
            </div>

            <motion.div
              layout
              className="relative mt-auto grid grid-cols-3 gap-4 pt-8"
            >
              <div className="rounded-[2rem] bg-slate-950/35 p-5 text-center">
                <Star className="mx-auto size-10 text-yellow-300" />
                <p className="mt-2 text-lg font-bold text-slate-200">
                  نقاط جديدة
                </p>
                <p className="text-5xl font-black">
                  {formatNumber(heroPoints)}
                </p>
              </div>

              <div className="rounded-[2rem] bg-slate-950/35 p-5 text-center">
                <Zap className="mx-auto size-10 text-cyan-200" />
                <p className="mt-2 text-lg font-bold text-slate-200">الحماس</p>
                <p className="text-5xl font-black">عالٍ</p>
              </div>

              <div className="rounded-[2rem] bg-slate-950/35 p-5 text-center">
                <Heart className="mx-auto size-10 text-pink-300" />
                <p className="mt-2 text-lg font-bold text-slate-200">
                  رسالة اليوم
                </p>
                <p className="text-3xl font-black">أحسنتم</p>
              </div>
            </motion.div>
          </div>

          <div className="grid min-h-0 grid-rows-[auto_1fr] gap-5">
            <div className="rounded-[2.5rem] border border-white/15 bg-white/15 p-6 shadow-2xl backdrop-blur-xl">
              <p className="flex items-center gap-2 text-2xl font-black text-yellow-200">
                <Sparkles className="size-7" />
                هدف الحصة
              </p>

              <p className="mt-4 text-3xl font-black leading-relaxed">
                {lessonGoal || "نتعلم ونشارك ونفرح بإنجازاتنا"}
              </p>

              <p className="mt-3 text-xl font-bold text-cyan-100">
                {encouragementMessage}
              </p>
            </div>

            <div className="min-h-0 rounded-[2.5rem] border border-white/15 bg-white/15 p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between">
                <p className="flex items-center gap-2 text-3xl font-black text-yellow-200">
                  <Trophy className="size-8" />
                  أبطال الفصل
                </p>

                <span className="rounded-full bg-yellow-300 px-4 py-2 text-lg font-black text-slate-950">
                  أفضل ٥
                </span>
              </div>

              {showLeaderboard && leaderboard.length > 0 ? (
                <div className="space-y-3">
                  {leaderboard.map((row, index) => {
                    const points = getLeaderboardPoints(row);

                    return (
                      <motion.div
                        layout
                        key={
                          readString(row, "studentId") ||
                          readString(row, "id") ||
                          `${getLeaderboardName(row, index)}-${index}`
                        }
                        initial={{ opacity: 0, x: 40, scale: 0.97 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ ...softSpring, delay: index * 0.05 }}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[1.5rem] bg-slate-950/35 p-4 shadow-lg"
                      >
                        <div className="flex size-16 items-center justify-center rounded-2xl bg-white/15">
                          {getRankIcon(index)}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-3xl font-black">
                            {getLeaderboardName(row, index)}
                          </p>
                          <p className="mt-1 text-lg font-bold text-cyan-100">
                            {getRankLabel(index)}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-yellow-300 px-5 py-3 text-center text-slate-950">
                          <p className="text-4xl font-black">
                            {formatNumber(points)}
                          </p>
                          <p className="text-sm font-bold">نقطة</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full min-h-72 items-center justify-center rounded-[2rem] bg-slate-950/30 p-8 text-center">
                  <div>
                    <Star className="mx-auto size-16 text-yellow-300" />
                    <p className="mt-4 text-3xl font-black">
                      في انتظار أول نجم
                    </p>
                    <p className="mt-2 text-xl text-slate-200">
                      أضف تحفيزًا جديدًا ليظهر أبطال الفصل هنا
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="rounded-[2rem] border border-white/15 bg-white/15 p-5 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-2xl font-black text-cyan-100">
              <Zap className="size-7 text-yellow-300" />
              آخر الإنجازات
            </p>

            <p className="text-sm font-bold text-slate-200">
              تظهر تلقائيًا عند إضافة التحفيز
            </p>
          </div>

          {showGamificationFeed && feedItems.length > 0 ? (
            <div className="grid grid-cols-4 gap-4">
              {feedItems.slice(0, 4).map((item, index) => {
                const studentName = getFeedStudentName(item);
                const points = getFeedPoints(item);
                const title = readString(item, "title", "إنجاز جديد");

                return (
                  <motion.div
                    layout
                    key={
                      readString(item, "id") ||
                      `${studentName}-${title}-${index}`
                    }
                    initial={{ opacity: 0, y: 30, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ ...softSpring, delay: index * 0.06 }}
                    className="rounded-[1.5rem] bg-slate-950/35 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950">
                        <Sparkles className="size-7" />
                      </div>

                      <span className="rounded-full bg-yellow-300 px-3 py-1 text-sm font-black text-slate-950">
                        +{formatNumber(points)}
                      </span>
                    </div>

                    <p className="truncate text-2xl font-black">
                      {studentName}
                    </p>
                    <p className="mt-1 truncate text-lg font-bold text-cyan-100">
                      {title}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[1.5rem] bg-slate-950/30 p-5 text-center text-xl font-bold text-slate-200">
              لا توجد إنجازات بعد — أول تحفيز سيظهر هنا فورًا 🎉
            </div>
          )}
        </footer>
      </section>
    </main>
  );
}
