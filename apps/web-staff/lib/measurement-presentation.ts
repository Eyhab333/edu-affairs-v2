const subjectLabels: Record<string, string> = {
  ARABIC: "اللغة العربية",
  ENGLISH: "اللغة الإنجليزية",
  MATH: "رياضيات",
  SCIENCE: "علوم",
  QURAN: "القرآن الكريم",
  ISLAMIC_STUDIES: "الدراسات الإسلامية",
  QURAN_AND_ISLAMIC_STUDIES: "القرآن والدراسات الإسلامية",
  SOCIAL_STUDIES: "الدراسات الاجتماعية",
  LIFE_SKILLS: "المهارات الحياتية",
  ART: "التربية الفنية",
  PE: "التربية البدنية",
  COMPUTER: "الحاسب الآلي",
};

const measurementLabels: Record<string, string> = {
  KG_TEACHER_MEASUREMENT: "قياس المعلم لرياض الأطفال",
  KG_VP_MEASUREMENT: "قياس وكيل رياض الأطفال",
  KG_MEASUREMENT_1: "القياس الأول لرياض الأطفال",
  KG_MEASUREMENT_2: "القياس الثاني لرياض الأطفال",
  KG_MEASUREMENT_3: "القياس الثالث لرياض الأطفال",
  KG_VALUES_ASSESSMENT: "قياس القيم لرياض الأطفال",
  KG_CORNERS_ASSESSMENT: "قياس الأركان لرياض الأطفال",
  PRIMARY_DIAGNOSTIC_TEST: "اختبار تشخيصي أولي",
  PRIMARY_DIAGNOSTIC: "اختبار تشخيصي أولي",
  PRIMARY_PERIODIC_TEST_1: "اختبار دوري أول",
  PRIMARY_PERIODIC_1: "اختبار دوري أول",
  PRIMARY_PERIODIC_TEST_2: "اختبار دوري ثانٍ",
  PRIMARY_PERIODIC_2: "اختبار دوري ثانٍ",
  PRIMARY_CENTRAL_MEASUREMENT_1: "قياس مركزي أول",
  PRIMARY_CENTRAL_1: "قياس مركزي أول",
  PRIMARY_CENTRAL_MEASUREMENT_2: "قياس مركزي ثانٍ",
  PRIMARY_CENTRAL_2: "قياس مركزي ثانٍ",
  CUSTOM_ASSESSMENT: "قياس مخصص",
  KG_QURAN_TRACKER: "متابعة القرآن لرياض الأطفال",
  KG_LEARNING_GARDENS_TRACKER: "متابعة حدائق التعلم",
  KG_NUMBERS_TRACKER: "متابعة الأرقام",
  KG_VALUES_TRACKER: "متابعة القيم",
  KG_CORNERS_TRACKER: "متابعة الأركان",
  KG_LOSS_TRACKER: "متابعة الفاقد التعليمي لرياض الأطفال",
  PRIMARY_QURAN_TRACKER: "متابعة القرآن الكريم",
  PRIMARY_LOSS_TRACKER: "متابعة الفاقد التعليمي",
  CUSTOM_TRACKER: "متابعة مخصصة",
  CUSTOM: "قياس أو متابعة مخصصة",
};

function normalizeCode(value?: string) {
  return value?.trim().toUpperCase() || "";
}

export function getFriendlySubjectLabel(value?: string) {
  return subjectLabels[normalizeCode(value)] || null;
}

export function getFriendlyMeasurementLabel(value?: string) {
  return measurementLabels[normalizeCode(value)] || null;
}
