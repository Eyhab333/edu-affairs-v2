export type ClassPresentationItem = {
  gradeId?: string;
  streamId?: string;
  title?: string;
  sectionLabel?: string;
  gradeTitle?: string;
};

export function normalizeText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function getTitleParts(item: ClassPresentationItem) {
  return normalizeText(item.title)
    .split(/\s*(?:\/|\||•)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isTechnicalIdentifier(value: string) {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value);
}

function compactGradeName(value: string) {
  const words = value
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter(
      (word) =>
        ![
          "الصف",
          "صف",
          "المرحلة",
          "مرحلة",
          "ابتدائي",
          "الابتدائي",
          "الابتدائية",
        ].includes(word),
    )
    .map(
      (word) =>
        ({
          "الأول": "أول",
          "الاول": "أول",
          "الثاني": "ثان",
          "الثانى": "ثان",
          "الثالث": "ثالث",
          "الرابع": "رابع",
          "الخامس": "خامس",
          "السادس": "سادس",
          "السابع": "سابع",
          "الثامن": "ثامن",
          "التاسع": "تاسع",
        })[word] ?? word,
    );

  return normalizeText(words.join(" ")) || value;
}

function getGradeName(item: ClassPresentationItem) {
  const titleParts = getTitleParts(item);
  const gradeTitle = normalizeText(item.gradeTitle);
  const source =
    gradeTitle && !isTechnicalIdentifier(gradeTitle)
      ? gradeTitle
      : titleParts[0];

  if (!source || isTechnicalIdentifier(source)) return "فصل";

  return compactGradeName(source);
}

function getStreamName(item: ClassPresentationItem) {
  const streamId = normalizeText(item.streamId).toLowerCase();
  const knownNames: Record<string, string> = {
    "stream-general": "عام",
    general: "عام",
    "stream-quran": "تحفيظ",
    quran: "تحفيظ",
  };

  if (knownNames[streamId]) return knownNames[streamId];

  const titleStream = getTitleParts(item)[1];
  if (titleStream && !isTechnicalIdentifier(titleStream)) {
    return titleStream.replace(/^المسار\s*/, "");
  }

  return "";
}

function getSectionLabel(item: ClassPresentationItem) {
  return normalizeText(item.sectionLabel) || getTitleParts(item)[2] || "";
}

function getClassDisplayContext(item: ClassPresentationItem) {
  const gradeName = getGradeName(item);
  const streamName = getStreamName(item);

  return {
    gradeKey: normalizeText(item.gradeId) || gradeName,
    streamKey: streamName || normalizeText(item.streamId) || "general",
    sectionLabel: getSectionLabel(item),
    gradeName,
    streamName,
  };
}

export function getFriendlyClassTitle(
  item: ClassPresentationItem,
  classes: ClassPresentationItem[],
) {
  const context = getClassDisplayContext(item);
  const contexts = classes.map((classItem) =>
    getClassDisplayContext(classItem),
  );
  const sameGrade = contexts.filter(
    (other) => other.gradeKey === context.gradeKey,
  );
  const streamCount = new Set(sameGrade.map((other) => other.streamKey)).size;
  const sameGradeAndStream = sameGrade.filter(
    (other) => other.streamKey === context.streamKey,
  );
  const sectionCount = new Set(
    sameGradeAndStream.map((other) => other.sectionLabel).filter(Boolean),
  ).size;

  return [
    context.gradeName,
    streamCount > 1 ? context.streamName : "",
    sectionCount > 1 ? context.sectionLabel : "",
  ]
    .filter(Boolean)
    .join(" ");
}
