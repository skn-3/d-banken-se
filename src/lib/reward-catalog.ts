import airpodsPro2Asset from "@/assets/rewards/airpods-pro-2.png.asset.json";
import appleWatchAsset from "@/assets/rewards/apple-watch.png.asset.json";
import fortniteVbucksAsset from "@/assets/rewards/fortnite-vbucks.png.asset.json";
import jblFlipAsset from "@/assets/rewards/jbl-flip.png.asset.json";
import labubuAsset from "@/assets/rewards/labubu.png.asset.json";
import metaQuestAsset from "@/assets/rewards/meta-quest.png.asset.json";
import netflixCardAsset from "@/assets/rewards/netflix-card.png.asset.json";
import nintendoSwitch2Asset from "@/assets/rewards/nintendo-switch-2.png.asset.json";
import playstation5Asset from "@/assets/rewards/playstation-5.png.asset.json";
import pokemonBoosterAsset from "@/assets/rewards/pokemon-booster.png.asset.json";
import pokemonTrainerBoxAsset from "@/assets/rewards/pokemon-trainer-box.png.asset.json";
import robuxCardAsset from "@/assets/rewards/robux-card.png.asset.json";
import spotifyCardAsset from "@/assets/rewards/spotify-card.png.asset.json";
import steamCardAsset from "@/assets/rewards/steam-card.png.asset.json";
import xiaomiScooterAsset from "@/assets/rewards/xiaomi-scooter.png.asset.json";

export const REWARD_CATEGORY_ORDER = [
  "Småpriser",
  "Spel & streaming",
  "Leksaker & samlarkort",
  "Tech & prylar",
  "Drömpriser",
] as const;

export const REWARD_CATEGORY_EMOJI: Record<string, string> = {
  "Småpriser": "🍬",
  "Spel & streaming": "🎮",
  "Leksaker & samlarkort": "🧸",
  "Tech & prylar": "🎧",
  "Drömpriser": "✨",
};

export type RewardSeed = {
  name: string;
  category: string;
  cost_points: number;
  description: string;
  sort_order: number;
  image_url: string | null;
};

export const REWARD_SEEDS: RewardSeed[] = [
  {
    name: "Spotify 1 månad",
    category: "Spel & streaming",
    cost_points: 20,
    description: "En månads premiumlyssning när du vill unna dig musik utan avbrott.",
    sort_order: 210,
    image_url: spotifyCardAsset.url,
  },
  {
    name: "Netflix 1 månad",
    category: "Spel & streaming",
    cost_points: 20,
    description: "En månads streaming för filmkvällar, serier och helgmys.",
    sort_order: 220,
    image_url: netflixCardAsset.url,
  },
  {
    name: "Fortnite 2600 V-bucks",
    category: "Spel & streaming",
    cost_points: 35,
    description: "V-bucks till skins, battle pass eller annat kul i Fortnite.",
    sort_order: 230,
    image_url: fortniteVbucksAsset.url,
  },
  {
    name: "Robux Giftcard ($50)",
    category: "Spel & streaming",
    cost_points: 90,
    description: "Robux-presentkort för spel, prylar och uppgraderingar i Roblox.",
    sort_order: 240,
    image_url: robuxCardAsset.url,
  },
  {
    name: "Steam Gift Card ($50)",
    category: "Spel & streaming",
    cost_points: 90,
    description: "Steam-saldo till nya spel, expansioner eller favoritklassiker.",
    sort_order: 250,
    image_url: steamCardAsset.url,
  },
  {
    name: "Pokémon Booster Pack",
    category: "Leksaker & samlarkort",
    cost_points: 10,
    description: "Ett booster pack för dig som gillar att öppna nya kort och jaga favoriter.",
    sort_order: 310,
    image_url: null,
  },
  {
    name: "Labubu",
    category: "Leksaker & samlarkort",
    cost_points: 40,
    description: "En eftertraktad samlarfigur som sticker ut i hyllan.",
    sort_order: 320,
    image_url: labubuAsset.url,
  },
  {
    name: "Pokémon Trainer Box",
    category: "Leksaker & samlarkort",
    cost_points: 65,
    description: "En större box för dig som vill bygga samlingen med stil.",
    sort_order: 330,
    image_url: null,
  },
  {
    name: "Lego Mechanic",
    category: "Leksaker & samlarkort",
    cost_points: 80,
    description: "Ett större byggset för dig som gillar fart, detaljer och att bygga själv.",
    sort_order: 340,
    image_url: null,
  },
  {
    name: "JBL Flip",
    category: "Tech & prylar",
    cost_points: 180,
    description: "Bärbar högtalare för musik i rummet, på gården eller på utflykten.",
    sort_order: 410,
    image_url: null,
  },
  {
    name: "AirPods Pro 2",
    category: "Tech & prylar",
    cost_points: 450,
    description: "Trådlösa hörlurar i premiumklass för musik, spel och vardag.",
    sort_order: 420,
    image_url: airpodsPro2Asset.url,
  },
  {
    name: "Meta Quest (VR)",
    category: "Drömpriser",
    cost_points: 650,
    description: "VR-headset för spel, rörelse och helt nya upplevelser.",
    sort_order: 510,
    image_url: metaQuestAsset.url,
  },
  {
    name: "Apple Watch",
    category: "Drömpriser",
    cost_points: 750,
    description: "Smartklocka med träningsfunktioner, notiser och premiumkänsla.",
    sort_order: 520,
    image_url: appleWatchAsset.url,
  },
  {
    name: "Xiaomi Elsparkcykel",
    category: "Drömpriser",
    cost_points: 750,
    description: "Elsparkcykel för snabba turer och frihetskänsla i vardagen.",
    sort_order: 530,
    image_url: null,
  },
  {
    name: "Nintendo Switch 2",
    category: "Drömpriser",
    cost_points: 900,
    description: "Ny spelkonsol för både handhållet och hemma i soffan.",
    sort_order: 540,
    image_url: null,
  },
  {
    name: "PlayStation 5",
    category: "Drömpriser",
    cost_points: 1000,
    description: "Ett riktigt drömpris för stora spelkvällar och nästa nivå hemma.",
    sort_order: 550,
    image_url: null,
  },
];

export function getRewardSeedByName(name: string) {
  return REWARD_SEEDS.find((reward) => reward.name === name) ?? null;
}
