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

// アプリのリリース開始月（これより前の月は表示しない）
export const LAUNCH_YEAR = 2026;
export const LAUNCH_MONTH = 4; // 4月

export const TRAINING_MAX = 3;

export const TIER_THRESHOLDS = [
  { tier: "platinum" as const, min: 300, label: "プラチナ", emoji: "💎", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { tier: "gold" as const, min: 150, label: "ゴールド", emoji: "🥇", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { tier: "silver" as const, min: 80, label: "シルバー", emoji: "🥈", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { tier: "bronze" as const, min: 30, label: "ブロンズ", emoji: "🥉", color: "bg-orange-100 text-orange-700 border-orange-300" },
] as const;

export function isTraining(classCount: number) {
  return classCount >= 1 && classCount <= TRAINING_MAX;
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

// ===== スーパーさとこメッセージ =====

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
