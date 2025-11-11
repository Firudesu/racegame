export const COLLECTION_ADDRESS = "0xa8D334C9CF7FC57eBA51bF4d98BD880cb16A0DE8";
const RESERVOIR_BASE = "https://api.reservoir.tools";

function normalizeImage(raw) {
  if (!raw) return "";
  if (raw.startsWith("ipfs://")) {
    const cid = raw.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${cid}`;
  }
  return raw;
}

export async function fetchNFTs(walletAddress) {
  if (!walletAddress) return [];
  const url = `${RESERVOIR_BASE}/users/${walletAddress}/tokens/v10?contract=${COLLECTION_ADDRESS}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Failed to fetch NFTs");
  }

  const payload = await response.json();
  const tokens = payload?.tokens ?? [];

  return tokens
    .map((entry) => {
      const details = entry?.token || {};
      const metadata = details.metadata || {};
      const tokenId = details.tokenId || entry.tokenId;
      const name = details.name || metadata.name || `DayJob Punk #${tokenId}`;
      const image = normalizeImage(details.image || metadata.image || metadata.imageUrl || "");
      return tokenId
        ? {
            tokenId,
            name,
            image,
            description: metadata.description || "",
            raw: entry
          }
        : null;
    })
    .filter(Boolean);
}

export function importNFT(tokenId, metadata = {}) {
  return {
    tokenId,
    collection: "DayJobPunks",
    image: metadata.image || "",
    name: metadata.name || `DayJob Punk #${tokenId}`,
    description: metadata.description || ""
  };
}
