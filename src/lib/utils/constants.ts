export const TIME_SLOTS = ["10:30", "12:00", "14:30", "16:00"] as const;

export const CLASS_TYPES = ["カリキュラム", "オーダーメイド"] as const;

export const CLASS_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "カリキュラム": { bg: "#DBEAFE", text: "#1E40AF", border: "#93C5FD" },
  "オーダーメイド": { bg: "#FEF3C7", text: "#B45309", border: "#FCD34D" },
  "オーダーテック": { bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  collecting: "回答受付中",
  shift_created: "シフト作成済み",
  published: "公開済み",
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  collecting: "bg-brand-100 text-brand-700",
  shift_created: "bg-yellow-100 text-yellow-700",
  published: "bg-green-100 text-green-700",
};

export const CLASS_DURATION_MINUTES = 70;

// ===== 休憩時間（12:00〜14:30の間） =====
export const BREAK_START = "13:30";
export const BREAK_END = "14:15";
export const BREAK_MINUTES = 45;

/** 日ごとのスロットキーから休憩控除分(分)を返す。12:00と14:30の両方にアサインされている場合のみ45分控除 */
export function getBreakDeduction(daySlotKeys: string[]): number {
  const times = daySlotKeys.map((k) => k.split("_")[1]);
  if (times.includes("12:00") && times.includes("14:30")) return BREAK_MINUTES;
  return 0;
}

// アプリのリリース開始月（これより前の月は表示しない）
export const LAUNCH_YEAR = 2026;
export const LAUNCH_MONTH = 4; // 4月

export const DEMO_MONTH_ID = "2026-03";

// デモ月で時給未設定のユーザー（管理者など）向けの仮時給
export const DEMO_HOURLY_RATE = 1500;

export const TRAINING_MAX = 3;
export const TRAINING_HOURLY_RATE = 1000;

// 支払額がこの閾値以下の場合は翌月に繰り越してまとめて支払う
export const PAYMENT_MIN_THRESHOLD = 3000;

export const TIER_THRESHOLDS = [
  { tier: "platinum" as const, min: 300, label: "プラチナ", emoji: "💎", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { tier: "gold" as const, min: 150, label: "ゴールド", emoji: "🥇", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { tier: "silver" as const, min: 80, label: "シルバー", emoji: "🥈", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { tier: "bronze" as const, min: 30, label: "ブロンズ", emoji: "🥉", color: "bg-orange-100 text-orange-700 border-orange-300" },
] as const;

export function isTraining(classCount: number) {
  return classCount >= 1 && classCount <= TRAINING_MAX;
}

/** 研修中（classCount 1〜3）は TRAINING_HOURLY_RATE、それ以降は設定時給 */
export function getEffectiveRate(classCount: number, hourlyRate: number): number {
  if (classCount >= 1 && classCount <= TRAINING_MAX) return TRAINING_HOURLY_RATE;
  return hourlyRate;
}

/** 月を考慮した実効時給。デモ月で時給が未設定のユーザーには DEMO_HOURLY_RATE を使う */
export function getEffectiveRateForMonth(monthId: string, classCount: number, hourlyRate: number): number {
  const base = getEffectiveRate(classCount, hourlyRate);
  if (monthId === DEMO_MONTH_ID && base === 0) return DEMO_HOURLY_RATE;
  return base;
}

export function getTier(classCount: number) {
  for (const t of TIER_THRESHOLDS) {
    if (classCount >= t.min) return t;
  }
  return null;
}

export function getNextTier(classCount: number) {
  const tiers = [...TIER_THRESHOLDS].reverse();
  for (const t of tiers) {
    if (classCount < t.min) return { ...t, remaining: t.min - classCount };
  }
  return null;
}

// ===== 集合時間（10:30は30分前、他は10分前） =====

export function getAssemblyTime(classTime: string): string {
  const [h, m] = classTime.split(":").map(Number);
  const offset = classTime === "10:30" ? 30 : 10;
  const total = h * 60 + m - offset;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// ===== 子ども人数 → 必要ファシリテーター数 =====

export function getRequiredFacilitators(childCount?: number): number {
  if (!childCount || childCount <= 0) return 0;
  if (childCount <= 4) return 1;
  if (childCount <= 8) return 2;
  if (childCount <= 10) return 3;
  return 3; // 11名以上は安全側
}

// ===== AI-SATO-β メッセージ =====

const SATOKO_MESSAGES_STARTER = [
  "{name}さん、はじめの一歩を応援してるよ！一緒にがんばろうね！",
  "{name}さん、ようこそ！子どもたちとの時間、きっと楽しいよ！",
  "{name}さん、まずは1回目から！楽しみにしてるね！",
  "{name}さん、新しい仲間が増えてうれしい！一緒に素敵なクラスつくろう！",
  "{name}さん、最初はドキドキするけど大丈夫！みんなサポートするよ！",
  "{name}さん、子どもたちの笑顔が最高のごほうびだよ！",
  "{name}さん、アートの力で子どもたちの未来を一緒に広げよう！",
  "{name}さん、ワクワクする気持ちを大切にね！",
];

const SATOKO_MESSAGES_TRAINING = [
  "{name}さん、研修{count}回目お疲れさま！どんどん慣れてきてるね！",
  "{name}さん、研修中！先輩たちも最初はみんな同じだったよ、大丈夫！",
  "{name}さん、研修がんばってるね！子どもたちとの接し方、上手になってるよ！",
  "{name}さん、あと{trainingLeft}回で研修卒業だよ！この調子！",
  "{name}さん、研修期間は学びの宝庫！たくさん吸収してね！",
  "{name}さん、研修中の{name}さんの成長が楽しみだよ！",
];

const SATOKO_MESSAGES_BRONZE_ROAD = [
  "{name}さん、{count}回参加ありがとう！ブロンズまであと{remaining}回、いけるよ！",
  "{name}さん、着実に積み重ねてるね！{count}回の経験が力になってるよ！",
  "{name}さん、{count}回もクラスに入ってくれてありがとう！子どもたちも喜んでるよ！",
  "{name}さん、いい感じ！ブロンズランクまであと少しだよ！",
  "{name}さん、毎回成長してるの伝わるよ！この調子でいこう！",
  "{name}さん、{count}回の実績すごいね！自信持っていこう！",
];

const SATOKO_MESSAGES_BRONZE = [
  "{name}さん、ブロンズ達成おめでとう！{count}回の実績は本物だよ！",
  "{name}さん、ブロンズファシリテーター！シルバー目指してこの調子！",
  "{name}さん、{count}回もありがとう！頼れる存在だよ！",
  "{name}さん、ブロンズの輝き！シルバーまであと{remaining}回だね！",
  "{name}さん、子どもたちとの信頼関係、しっかり築けてるよ！",
  "{name}さん、安定感出てきたね！次はシルバーだ！",
];

const SATOKO_MESSAGES_SILVER = [
  "{name}さん、シルバー達成！{count}回の経験、すごい財産だよ！",
  "{name}さん、シルバーファシリテーター！クラスの柱だね！",
  "{name}さん、{count}回もの経験から生まれる安心感、さすがだよ！",
  "{name}さん、ゴールドまであと{remaining}回！応援してる！",
  "{name}さん、ベテランの風格が出てきたね！頼りにしてるよ！",
  "{name}さん、子どもたちにとって特別な存在だよ！",
];

const SATOKO_MESSAGES_GOLD = [
  "{name}さん、ゴールド達成！{count}回の歩み、尊敬するよ！",
  "{name}さん、ゴールドファシリテーター！まさにエース！",
  "{name}さん、{count}回の経験は伝説級だよ！プラチナ目指そう！",
  "{name}さん、あなたがいるだけでクラスが明るくなるよ！",
  "{name}さん、プラチナまであと{remaining}回！一緒に頂点へ！",
  "{name}さん、後輩たちの目標になってるよ！すごい！",
];

const SATOKO_MESSAGES_PLATINUM = [
  "{name}さん、プラチナ達成！{count}回、本当にありがとう！レジェンドだよ！",
  "{name}さん、プラチナファシリテーター！アートデザインラボの誇りだよ！",
  "{name}さん、{count}回の歩みはみんなの道しるべだよ！",
  "{name}さん、最高ランク到達！これからも一緒に楽しもうね！",
  "{name}さん、あなたなしではラボは語れないよ！感謝！",
  "{name}さん、{count}回の情熱、子どもたちにしっかり届いてるよ！",
];

export function getSatokoEncouragement(name: string, classCount: number): string {
  const tier = getTier(classCount);
  const nextTier = getNextTier(classCount);
  const remaining = nextTier?.remaining ?? 0;
  const trainingLeft = Math.max(0, TRAINING_MAX - classCount + 1);

  let pool: string[];
  if (classCount === 0) {
    pool = SATOKO_MESSAGES_STARTER;
  } else if (isTraining(classCount)) {
    pool = SATOKO_MESSAGES_TRAINING;
  } else if (!tier) {
    pool = SATOKO_MESSAGES_BRONZE_ROAD;
  } else if (tier.tier === "bronze") {
    pool = SATOKO_MESSAGES_BRONZE;
  } else if (tier.tier === "silver") {
    pool = SATOKO_MESSAGES_SILVER;
  } else if (tier.tier === "gold") {
    pool = SATOKO_MESSAGES_GOLD;
  } else {
    pool = SATOKO_MESSAGES_PLATINUM;
  }

  const msg = pool[Math.floor(Math.random() * pool.length)];
  return msg
    .replace(/{name}/g, name)
    .replace(/{count}/g, String(classCount))
    .replace(/{remaining}/g, String(remaining))
    .replace(/{trainingLeft}/g, String(trainingLeft));
}

// ===== AI-SATO-β 給与画面「ありがとう」メッセージ（30パターン） =====

const SATOKO_PAYROLL_THANKS = [
  "{name}さん、今月も子どもたちと過ごしてくれてありがとう！",
  "{name}さん、今月もお疲れさま！あなたの時間に感謝だよ。",
  "{name}さん、毎回真剣に向き合ってくれて本当にありがとう！",
  "{name}さん、あなたのクラスに救われた子、今月もきっといるよ。",
  "{name}さん、子どもたちの笑顔、{name}さんが作ってるんだよ。ありがとう！",
  "{name}さん、準備から片付けまで、いつもありがとう！",
  "{name}さん、今月のクラス、しっかり見てたよ。ありがとう！",
  "{name}さん、いてくれて本当に心強い！今月もありがとう！",
  "{name}さん、一人ひとりに寄り添ってくれてありがとう。",
  "{name}さん、あなたの言葉がけ、いつもあたたかいよ。感謝！",
  "{name}さん、今月もラボを支えてくれてありがとう！",
  "{name}さん、細やかな気配り、いつも見てるよ。ありがとう！",
  "{name}さん、子どもたちの「できた！」を一緒に喜んでくれてありがとう。",
  "{name}さん、アートの時間を特別にしてくれてありがとう。",
  "{name}さん、忙しい中、毎回クラスに来てくれてありがとう！",
  "{name}さん、チームに{name}さんがいてくれて嬉しいよ。ありがとう！",
  "{name}さん、今月もたくさんの子どもたちに関わってくれてありがとう！",
  "{name}さん、{name}さんのアイデアがクラスを彩ってるよ。感謝！",
  "{name}さん、今月も{name}さんらしいクラスをありがとう！",
  "{name}さん、{name}さんがいるだけで場が和むよ。ありがとう！",
  "{name}さん、今月も最後までやり切ってくれてありがとう！",
  "{name}さん、子どもたちの小さな変化に気づいてくれてありがとう。",
  "{name}さん、アートを通じて大切なことを届けてくれてありがとう。",
  "{name}さん、今月の歩み、子どもたちの心にちゃんと残ってるよ。",
  "{name}さん、一緒に働けて嬉しい！今月もありがとう。",
  "{name}さん、今月のクラスでの笑顔、素敵だったよ。",
  "{name}さん、子どもたちのために走ってくれてありがとう！",
  "{name}さん、{name}さんのおかげで今月も安心して子どもを迎えられたよ。",
  "{name}さん、来月もまた一緒にアートの魔法を届けようね。今月もありがとう！",
  "{name}さん、今月も本当にお疲れさま。ゆっくり休んでね！",
];

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 給与画面用の AI-SATO-β「ありがとう」メッセージを取得。
 * seedKey を指定すると同じキーに対して同じメッセージが返る（月・ユーザー単位で安定表示したい時に）。
 */
export function getSatokoPayrollThanks(name: string, seedKey?: string): string {
  const pool = SATOKO_PAYROLL_THANKS;
  const idx =
    seedKey !== undefined && seedKey !== ""
      ? hashSeed(seedKey) % pool.length
      : Math.floor(Math.random() * pool.length);
  return pool[idx].replace(/{name}/g, name);
}
