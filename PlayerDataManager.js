const STORAGE_PREFIX = "playerData_";
export const DEFAULT_IMAGE = "assets/default_horse.svg";

function storageKey(wallet) {
  return `${STORAGE_PREFIX}${wallet}`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function loadPlayerData(wallet) {
  if (!wallet) {
    return {
      wallet: null,
      horses: [],
      retired: []
    };
  }
  const raw = localStorage.getItem(storageKey(wallet));
  if (!raw) {
    return {
      wallet,
      horses: [],
      retired: []
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      wallet,
      horses: parsed.horses || [],
      retired: parsed.retired || []
    };
  } catch (err) {
    console.warn("Failed to parse player data", err);
    return {
      wallet,
      horses: [],
      retired: []
    };
  }
}

export function savePlayerData(wallet, data) {
  if (!wallet) return;
  const payload = {
    horses: data.horses || [],
    retired: data.retired || []
  };
  localStorage.setItem(storageKey(wallet), JSON.stringify(payload));
}

function baseHorse({ name, image, tokenId, collection }) {
  return {
    id: `horse-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`,
    tokenId: tokenId ?? null,
    collection: collection ?? "None",
    image: image || DEFAULT_IMAGE,
    name,
    stats: {
      stride: randomInt(50, 70),
      endurance: randomInt(50, 70),
      force: randomInt(45, 65),
      resolve: randomInt(45, 65),
      insight: randomInt(50, 70)
    },
    sessionsLeft: 10,
    retired: false,
    mood: "Calm",
    createdAt: Date.now(),
    fromNFT: Boolean(tokenId)
  };
}

export function createHorse({ name, nftData } = {}) {
  if (nftData) {
    const horse = baseHorse({
      name: nftData.name || `DayJob Punk #${nftData.tokenId}`,
      image: nftData.image,
      tokenId: nftData.tokenId,
      collection: nftData.collection || "DayJobPunks"
    });
    horse.stats = {
      stride: randomInt(60, 80),
      endurance: randomInt(60, 80),
      force: randomInt(50, 70),
      resolve: randomInt(50, 70),
      insight: randomInt(55, 75)
    };
    return horse;
  }

  const indexSuffix = randomInt(1, 999).toString().padStart(3, "0");
  return baseHorse({
    name: name || `Stable Horse #${indexSuffix}`,
    image: DEFAULT_IMAGE,
    tokenId: null,
    collection: "None"
  });
}
