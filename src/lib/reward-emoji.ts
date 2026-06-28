// Pick a playful emoji for a reward based on its name.
// Used in the rewards shop UI in place of a generic image.

const RULES: Array<[RegExp, string]> = [
  [/\bbio(graf)?\b|film|popcorn/i, "🎬"],
  [/glass|ice ?cream/i, "🍦"],
  [/pizza/i, "🍕"],
  [/hamburg|burger/i, "🍔"],
  [/godis|kola|sn[öo]r|polka/i, "🍬"],
  [/choklad/i, "🍫"],
  [/kaka|bulle|fika|kanel/i, "🧁"],
  [/läsk|soda|cola/i, "🥤"],
  [/saft|juice/i, "🧃"],
  [/spel(tid)?|gaming|tv-?spel|playstation|xbox|nintendo|switch/i, "🎮"],
  [/bok|läsa|roman/i, "📚"],
  [/penn|färgpenn|tusch|krita|rita/i, "✏️"],
  [/pyssel|kit|hantverk|skapa/i, "🎨"],
  [/klisterm[äa]rk|stickers?/i, "🦄"],
  [/fotboll|soccer/i, "⚽"],
  [/basket/i, "🏀"],
  [/tennis|padel/i, "🎾"],
  [/badboll|strand/i, "🏖️"],
  [/sim|bad|pool/i, "🏊"],
  [/cykel|bike/i, "🚴"],
  [/skate/i, "🛹"],
  [/lego|kloss|byggsats/i, "🧱"],
  [/pussel/i, "🧩"],
  [/musik|hörlur|headphone|spotify|airpods?/i, "🎧"],
  [/kamera|polaroid|foto/i, "📷"],
  [/blomma|växt|plant/i, "🌸"],
  [/djur|husdjur|katt|hund|nallе|nalle|leksak/i, "🧸"],
  [/present|gåva|gift/i, "🎁"],
  [/trofé|trofe|pris|medalj/i, "🏆"],
  [/stj[äa]rn/i, "⭐"],
  [/raket|space|rymd/i, "🚀"],
  [/dans|disco|fest/i, "🎉"],
  [/utflykt|äventyr|resa/i, "🧭"],
  [/biljett|ticket/i, "🎟️"],
];

export function rewardEmoji(name: string, category?: string | null): string {
  for (const [re, emoji] of RULES) if (re.test(name)) return emoji;
  if (category) {
    switch (category.toLowerCase()) {
      case "småpriser": return "🍬";
      case "mellanpriser": return "🎬";
      case "storpriser": return "🎧";
      case "drömpriser": return "✨";
    }
  }
  return "🎁";
}

// --- Goal stored per-user in localStorage ---

export type RewardGoal = {
  rewardId: string;
  name: string;
  cost: number;
  emoji: string;
};

const GOAL_KEY = (uid: string) => `smaarty:reward-goal:${uid}`;

export function getRewardGoal(uid: string | null | undefined): RewardGoal | null {
  if (!uid || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GOAL_KEY(uid));
    return raw ? (JSON.parse(raw) as RewardGoal) : null;
  } catch { return null; }
}

export function setRewardGoal(uid: string, goal: RewardGoal | null) {
  if (typeof window === "undefined") return;
  try {
    if (goal) window.localStorage.setItem(GOAL_KEY(uid), JSON.stringify(goal));
    else window.localStorage.removeItem(GOAL_KEY(uid));
    window.dispatchEvent(new CustomEvent("smaarty:reward-goal-changed", { detail: { uid } }));
  } catch { /* ignore */ }
}
