export const TIME_SLOTS = ["10:30", "12:00", "14:30", "16:00"] as const;

export const CLASS_TYPES = ["カリキュラム", "オーダーメイド", "オーダーテック"] as const;

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

export const TIER_THRESHOLDS = [
  { tier: "platinum" as const, min: 100, label: "プラチナ", emoji: "💎", color: "bg-purple-100 text-purple-700 border-purple-300" },
  { tier: "gold" as const, min: 70, label: "ゴールド", emoji: "🥇", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { tier: "silver" as const, min: 40, label: "シルバー", emoji: "🥈", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { tier: "bronze" as const, min: 20, label: "ブロンズ", emoji: "🥉", color: "bg-orange-100 text-orange-700 border-orange-300" },
] as const;

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
