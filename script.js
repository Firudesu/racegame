const DAYJOB_PUNKS_CONTRACT = "0xa8d334c9cf7fc57eba51bf4d98bd880cb16a0de8";
const WALLET_KEY = "horseWallet";
const PLACEHOLDER_IMAGE = "assets/default_horse.svg";

const connectButton = document.getElementById("connectButton");
const walletInfo = document.getElementById("walletInfo");
const paddock = document.getElementById("paddock");
const paddockMessage = document.getElementById("paddockMessage");

let walletAddress = null;
let horseSlots = [null, null, null, null];
let availableNFTs = [];

document.addEventListener("DOMContentLoaded", () => {
  walletAddress = localStorage.getItem(WALLET_KEY);
  if (walletAddress) {
    walletInfo.textContent = `Connected Wallet: ${shortenAddress(walletAddress)}`;
    connectButton.textContent = "Reconnect";
    horseSlots = loadHorseData(walletAddress);
    renderPaddock();
    fetchNFTs(walletAddress);
  } else {
    renderPaddock();
  }
});

connectButton.addEventListener("click", async () => {
  await connectWallet();
});

async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found. Please install it to continue.");
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    walletAddress = accounts[0];
    localStorage.setItem(WALLET_KEY, walletAddress);
    walletInfo.textContent = `Connected Wallet: ${shortenAddress(walletAddress)}`;
    connectButton.textContent = "Reconnect";
    horseSlots = loadHorseData(walletAddress);
    renderPaddock();
    fetchNFTs(walletAddress);
  } catch (error) {
    console.error(error);
    alert("Wallet connection cancelled.");
  }
}

async function fetchNFTs(address) {
  paddockMessage.textContent = "Checking your wallet for Dayjob Punks…";
  const url = `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?limit=50&contract_address=${DAYJOB_PUNKS_CONTRACT}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) throw new Error("Failed to fetch NFTs");
    const data = await response.json();
    availableNFTs = (data.nfts || []).map(mapNFT);
    const hasSavedHorses = horseSlots.some(Boolean);
    if (!hasSavedHorses && availableNFTs.length) {
      horseSlots = availableNFTs.slice(0, 4);
      saveHorseData(walletAddress, horseSlots);
      paddockMessage.textContent = "Dayjob Punks imported automatically. Tap a slot to select.";
    } else if (!availableNFTs.length) {
      paddockMessage.textContent = "No Dayjob Punks found. Create horses to continue.";
    } else {
      paddockMessage.textContent = "Tap a slot to select or create a horse.";
    }
    renderPaddock();
  } catch (error) {
    console.error(error);
    paddockMessage.textContent = "Unable to reach the NFT service. You can still create horses manually.";
    renderPaddock();
  }
}

function renderPaddock() {
  paddock.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const slotData = horseSlots[i] || null;
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.index = i;
    if (slotData) {
      slot.classList.toggle("selected", isSelected(slotData));
      slot.innerHTML = `
        <span class="badge">${slotData.type === "nft" ? "NFT" : "Stable"}</span>
        <img src="${slotData.image}" alt="${slotData.name}" />
        <h3>${slotData.name}</h3>
        <span>${slotData.type === "nft" ? `Token #${slotData.tokenId}` : "Custom Horse"}</span>
      `;
      slot.addEventListener("click", () => selectHorse(slotData));
    } else {
      slot.classList.add("empty");
      slot.innerHTML = `
        <div class="placeholder-icon">+</div>
        <p>${availableNFTs.length ? "Import NFT" : "Create Horse"}</p>
      `;
      slot.addEventListener("click", () => handleEmptySlot(i));
    }
    paddock.appendChild(slot);
  }
}

function handleEmptySlot(index) {
  if (!walletAddress && availableNFTs.length === 0) {
    createHorseFlow(index);
    return;
  }
  const nextNFT = getNextNFT();
  if (nextNFT) {
    horseSlots[index] = nextNFT;
    saveHorseData(walletAddress, horseSlots);
    renderPaddock();
    paddockMessage.textContent = "NFT imported into the paddock.";
  } else {
    createHorseFlow(index);
  }
}

function createHorseFlow(index) {
  const name = prompt("Name your new horse:", `Stable Horse #${index + 1}`) || `Stable Horse #${index + 1}`;
  const newHorse = {
    type: "custom",
    name,
    tokenId: null,
    image: PLACEHOLDER_IMAGE,
    stats: randomStats()
  };
  horseSlots[index] = newHorse;
  saveHorseData(walletAddress, horseSlots);
  renderPaddock();
  paddockMessage.textContent = "Stable horse created.";
}

function selectHorse(horse) {
  localStorage.setItem("selectedHorse", JSON.stringify(horse));
  horseSlots = horseSlots.map((slot) => (slot && slot.name === horse.name ? slot : slot));
  renderPaddock();
  alert(`Selected: ${horse.name}`);
}

function getNextNFT() {
  const usedIds = new Set(
    horseSlots.filter(Boolean).filter((slot) => slot.type === "nft").map((slot) => slot.tokenId)
  );
  return availableNFTs.find((nft) => !usedIds.has(nft.tokenId)) || null;
}

function mapNFT(nft) {
  const image =
    nft.image_url ||
    nft.metadata?.image ||
    nft.metadata?.image_url ||
    PLACEHOLDER_IMAGE;
  return {
    type: "nft",
    name: nft.name || nft.metadata?.name || `Dayjob Punk #${nft.identifier ?? nft.token_id ?? "?"}`,
    tokenId: nft.identifier || nft.token_id || "0",
    image: normalizeImage(image),
    stats: randomStats()
  };
}

function randomStats() {
  return {
    stride: randomBetween(60, 80),
    endurance: randomBetween(55, 75),
    force: randomBetween(50, 70),
    resolve: randomBetween(50, 70),
    insight: randomBetween(55, 78)
  };
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeImage(url) {
    if (!url) return PLACEHOLDER_IMAGE;
  if (url.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.replace("ipfs://", "")}`;
  }
  return url;
}

function isSelected(horse) {
  const selected = localStorage.getItem("selectedHorse");
  if (!selected) return false;
  try {
    const parsed = JSON.parse(selected);
    return parsed.tokenId === horse.tokenId && parsed.name === horse.name;
  } catch (error) {
    return false;
  }
}

function loadHorseData(wallet) {
  if (!wallet) return [null, null, null, null];
  const raw = localStorage.getItem(`horseData_${wallet}`);
  if (!raw) return [null, null, null, null];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? padSlots(parsed) : [null, null, null, null];
  } catch (error) {
    return [null, null, null, null];
  }
}

function saveHorseData(wallet, data) {
  if (!wallet) return;
  localStorage.setItem(`horseData_${wallet}`, JSON.stringify(padSlots(data)));
}

function padSlots(arr) {
  const clone = Array.isArray(arr) ? [...arr] : [];
  while (clone.length < 4) clone.push(null);
  return clone.slice(0, 4);
}

function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
