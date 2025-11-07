const DAYJOB_PUNKS_CONTRACT = "0xa8d334c9cf7fc57eba51bf4d98bd880cb16a0de8".toLowerCase();
const WALLET_KEY = "horseWallet";
const PLACEHOLDER_IMAGE = "assets/default_horse.svg";
const RESERVOIR_API_KEY = ""; // Optional: add your Reservoir API key here
const OPENSEA_API_KEY = ""; // Optional: add your OpenSea API key here

const state = {
  wallet: null,
  horses: [null, null, null, null],
  selectedIndex: null,
  availableNFTs: [],
  race: {
    running: false,
    animationId: null,
    racers: []
  }
};

let connectButton;
let walletInfo;
let mapPins;
let panels;
let paddock;
let paddockMessage;
let trainingButtons;
let trainingLogEl;
let trainingHorseName;
let trainingHorseStats;
let trainingHorseImg;
let raceHorseName;
let raceHorseStats;
let raceHorseImg;
let raceCanvas;
let raceCtx;
let raceStatusEl;
let startRaceBtn;
let createHorseBtn;
let importHorseBtn;
let retiredList;

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  bindEvents();
  initializeState();
  renderPaddock();
  updateSelectedHorseUI();
  showPanel("info");

  if (state.wallet) {
    fetchNFTs(state.wallet);
  }
});

function cacheDom() {
  connectButton = document.getElementById("connectButton");
  walletInfo = document.getElementById("walletInfo");
  mapPins = document.querySelectorAll(".map-pin");
  panels = {
    info: document.getElementById("panel-info"),
    training: document.getElementById("panel-training"),
    paddock: document.getElementById("panel-paddock"),
    race: document.getElementById("panel-race"),
    retired: document.getElementById("panel-retired")
  };
  paddock = document.getElementById("paddock");
  paddockMessage = document.getElementById("paddockMessage");
  trainingButtons = document.querySelectorAll("[data-train]");
  trainingLogEl = document.getElementById("trainingLog");
  trainingHorseName = document.getElementById("trainingHorseName");
  trainingHorseStats = document.getElementById("trainingHorseStats");
  trainingHorseImg = document.querySelector("#trainingHorseCard img");
  raceHorseName = document.getElementById("raceHorseName");
  raceHorseStats = document.getElementById("raceHorseStats");
  raceHorseImg = document.querySelector("#raceHorseCard img");
  raceCanvas = document.getElementById("raceCanvas");
  raceCtx = raceCanvas.getContext("2d");
  raceStatusEl = document.getElementById("raceStatus");
  startRaceBtn = document.getElementById("startRaceBtn");
  createHorseBtn = document.getElementById("createHorseBtn");
  importHorseBtn = document.getElementById("importHorseBtn");
  retiredList = document.getElementById("retiredList");
}

function bindEvents() {
  mapPins.forEach((pin) => {
    pin.addEventListener("click", () => showPanel(pin.dataset.target));
  });

  connectButton.addEventListener("click", connectWallet);

  trainingButtons.forEach((button) => {
    button.addEventListener("click", () => handleTraining(button.dataset.train));
  });

  createHorseBtn.addEventListener("click", () => {
    const index = findFirstEmptySlot();
    if (index === -1) {
      alert("All paddock slots are full. Release or retire a horse first.");
      return;
    }
    createHorseFlow(index);
  });

  importHorseBtn.addEventListener("click", () => {
    const index = findFirstEmptySlot();
    if (index === -1) {
      alert("All paddock slots are full.");
      return;
    }
    if (!state.availableNFTs.length) {
      alert("No Dayjob Punks available to import. Create a stable horse instead.");
      return;
    }
    handleEmptySlot(index);
  });

  startRaceBtn.addEventListener("click", startRace);
}

function initializeState() {
  state.wallet = localStorage.getItem(WALLET_KEY);
  if (state.wallet) {
    walletInfo.textContent = `Connected Wallet: ${shortenAddress(state.wallet)}`;
    connectButton.textContent = "Reconnect";
    state.horses = loadHorseData(state.wallet);
  } else {
    state.horses = [null, null, null, null];
  }

  const savedSelection = localStorage.getItem("selectedHorse");
  if (savedSelection) {
    try {
      const parsed = JSON.parse(savedSelection);
      const index = state.horses.findIndex(
        (horse) => horse && horse.name === parsed.name && horse.tokenId === parsed.tokenId
      );
      if (index >= 0) {
        state.selectedIndex = index;
      }
    } catch (error) {
      state.selectedIndex = null;
    }
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found. Please install it to continue.");
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.wallet = accounts[0];
    localStorage.setItem(WALLET_KEY, state.wallet);
    walletInfo.textContent = `Connected Wallet: ${shortenAddress(state.wallet)}`;
    connectButton.textContent = "Reconnect";
    state.horses = loadHorseData(state.wallet);
    renderPaddock();
    updateSelectedHorseUI();
    showPanel("paddock");
    fetchNFTs(state.wallet);
  } catch (error) {
    console.error(error);
    alert("Wallet connection cancelled.");
  }
}

async function fetchNFTs(address) {
  paddockMessage.textContent = "Checking your wallet for Dayjob Punks…";
  state.availableNFTs = [];

  try {
    const reservoirTokens = await fetchReservoirNFTs(address);
    state.availableNFTs = reservoirTokens;
  } catch (error) {
    console.warn("Reservoir lookup failed:", error);
  }

  if (!state.availableNFTs.length) {
    try {
      const openseaTokens = await fetchOpenSeaNFTs(address);
      state.availableNFTs = openseaTokens;
    } catch (error) {
      console.warn("OpenSea lookup failed:", error);
    }
  }

  if (!state.availableNFTs.length) {
    paddockMessage.textContent =
      "No Dayjob Punks found. You can create stable horses and continue playing.";
    renderPaddock();
    return;
  }

  paddockMessage.textContent = "Dayjob Punks available. Tap a slot to import or create horses.";

  const hasSavedHorses = state.horses.some(Boolean);
  if (!hasSavedHorses) {
    state.horses = padSlots(state.availableNFTs.slice(0, 4));
    saveHorseData(state.wallet, state.horses);
  }

  renderPaddock();
  updateSelectedHorseUI();
}

async function fetchReservoirNFTs(address) {
  const url = `https://api.reservoir.tools/users/${address}/tokens/v10?contract=${DAYJOB_PUNKS_CONTRACT}&limit=8`;
  const headers = { Accept: "application/json" };
  if (RESERVOIR_API_KEY) {
    headers["x-api-key"] = RESERVOIR_API_KEY;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error("Reservoir request failed");
  }
  const payload = await response.json();
  const tokens = payload.tokens || [];
  return tokens
    .map((entry) => {
      const details = entry?.token || {};
      const metadata = details.metadata || {};
      const tokenId = details.tokenId || entry.tokenId;
      if (!tokenId) return null;
      const image = details.image || metadata.image || metadata.imageUrl || PLACEHOLDER_IMAGE;
      return {
        type: "nft",
        name: details.name || metadata.name || `Dayjob Punk #${tokenId}`,
        tokenId,
        image: normalizeImage(image),
        stats: randomStats()
      };
    })
    .filter(Boolean);
}

async function fetchOpenSeaNFTs(address) {
  const url = `https://api.opensea.io/api/v2/chain/ethereum/account/${address}/nfts?limit=30&contract_address=${DAYJOB_PUNKS_CONTRACT}`;
  const headers = { Accept: "application/json" };
  if (OPENSEA_API_KEY) {
    headers["x-api-key"] = OPENSEA_API_KEY;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error("OpenSea request failed");
  }
  const payload = await response.json();
  const nfts = payload.nfts || [];
  return nfts.map(mapOpenSeaNFT).filter(Boolean);
}

function mapOpenSeaNFT(nft) {
  const image =
    nft.image_url ||
    nft.image ||
    nft.metadata?.image ||
    nft.metadata?.image_url ||
    PLACEHOLDER_IMAGE;
  const tokenId = nft.identifier || nft.token_id || nft.id;
  if (!tokenId) return null;
  return {
    type: "nft",
    name: nft.name || nft.metadata?.name || `Dayjob Punk #${tokenId}`,
    tokenId,
    image: normalizeImage(image),
    stats: randomStats()
  };
}

function renderPaddock() {
  paddock.innerHTML = "";
  state.horses = padSlots(state.horses);

  for (let i = 0; i < 4; i += 1) {
    const horse = state.horses[i];
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.index = i;

    if (horse) {
      slot.classList.toggle("selected", state.selectedIndex === i);
      slot.innerHTML = `
        <span class="badge">${horse.type === "nft" ? "NFT" : "Stable"}</span>
        <img src="${horse.image}" alt="${horse.name}" />
        <h3>${horse.name}</h3>
        <span>${horse.type === "nft" ? `Token #${horse.tokenId}` : "Custom Horse"}</span>
      `;
      slot.addEventListener("click", () => selectHorse(i));
    } else {
      slot.classList.add("empty");
      slot.innerHTML = `
        <div class="placeholder-icon">+</div>
        <p>${state.availableNFTs.length ? "Import NFT" : "Create Horse"}</p>
      `;
      slot.addEventListener("click", () => handleEmptySlot(i));
    }

    paddock.appendChild(slot);
  }
}

function handleEmptySlot(index) {
  const nextNFT = getNextNFT();
  if (nextNFT) {
    state.horses[index] = nextNFT;
    state.selectedIndex = index;
    paddockMessage.textContent = "NFT imported into the paddock.";
    saveHorseData(state.wallet, state.horses);
    renderPaddock();
    updateSelectedHorseUI();
    return;
  }

  createHorseFlow(index);
}

function findFirstEmptySlot() {
  return state.horses.findIndex((horse) => !horse);
}

function createHorseFlow(index) {
  if (index === -1) {
    alert("All paddock slots are full.");
    return;
  }
  const name =
    prompt("Name your new horse:", `Stable Horse #${index + 1}`) || `Stable Horse #${index + 1}`;
  const newHorse = {
    type: "custom",
    name,
    tokenId: null,
    image: PLACEHOLDER_IMAGE,
    stats: randomStats()
  };
  state.horses[index] = newHorse;
  state.selectedIndex = index;
  paddockMessage.textContent = "Stable horse created.";
  saveHorseData(state.wallet, state.horses);
  renderPaddock();
  updateSelectedHorseUI();
}

function selectHorse(index) {
  state.selectedIndex = index;
  const horse = getSelectedHorse();
  if (horse) {
    localStorage.setItem("selectedHorse", JSON.stringify(horse));
  }
  renderPaddock();
  updateSelectedHorseUI();
}

function getSelectedHorse() {
  if (state.selectedIndex == null) return null;
  return state.horses[state.selectedIndex] || null;
}

function getNextNFT() {
  const usedIds = new Set(
    state.horses.filter(Boolean).filter((horse) => horse.type === "nft").map((horse) => horse.tokenId)
  );
  return state.availableNFTs.find((nft) => !usedIds.has(nft.tokenId)) || null;
}

function handleTraining(stat) {
  const horse = getSelectedHorse();
  if (!horse) {
    alert("Select a horse in the paddock first.");
    showPanel("paddock");
    return;
  }
  if (!horse.stats) {
    horse.stats = randomStats();
  }
  const gain = randomBetween(3, 7);
  horse.stats[stat] = Math.min(99, (horse.stats[stat] || 60) + gain);
  saveHorseData(state.wallet, state.horses);
  appendTrainingLog(`${horse.name} worked on ${stat.toUpperCase()} and gained +${gain}.`);
  updateSelectedHorseUI();
}

function appendTrainingLog(message) {
  const item = document.createElement("li");
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  item.innerHTML = `<span>${timestamp}</span> – ${message}`;
  trainingLogEl.prepend(item);
  const maxEntries = 6;
  while (trainingLogEl.children.length > maxEntries) {
    trainingLogEl.removeChild(trainingLogEl.lastChild);
  }
}

function updateSelectedHorseUI() {
  const horse = getSelectedHorse();
  if (!horse) {
    trainingHorseName.textContent = "No horse selected";
    trainingHorseStats.textContent = "Select a horse in the paddock first.";
    trainingHorseImg.src = PLACEHOLDER_IMAGE;
    raceHorseName.textContent = "No horse selected";
    raceHorseStats.textContent = "Pick a horse from the paddock to race.";
    raceHorseImg.src = PLACEHOLDER_IMAGE;
    startRaceBtn.disabled = true;
    resetRaceCanvas();
    return;
  }

  trainingHorseName.textContent = horse.name;
  trainingHorseStats.textContent = formatStatsLine(horse.stats);
  trainingHorseImg.src = horse.image || PLACEHOLDER_IMAGE;

  raceHorseName.textContent = horse.name;
  raceHorseStats.textContent = formatStatsLine(horse.stats);
  raceHorseImg.src = horse.image || PLACEHOLDER_IMAGE;
  startRaceBtn.disabled = false;
}

function formatStatsLine(stats = {}) {
  const entries = [
    `Stride ${stats.stride ?? 60}`,
    `End ${stats.endurance ?? 60}`,
    `Force ${stats.force ?? 60}`,
    `Resolve ${stats.resolve ?? 60}`,
    `Insight ${stats.insight ?? 60}`
  ];
  return entries.join(" • ");
}

function startRace() {
  if (state.race.running) return;
  const horse = getSelectedHorse();
  if (!horse) {
    alert("Select a horse to race first.");
    return;
  }

  state.race.running = true;
  raceStatusEl.textContent = "Race in progress…";

  const racers = [
    createRacer(horse, UIColor.accent),
    createRacer(generateOpponent("AI Comet"), "#f67280"),
    createRacer(generateOpponent("AI Blitz"), "#ffa45b")
  ];

  state.race.racers = racers;
  animateRace();
}

function createRacer(horse, color) {
  return {
    name: horse.name,
    color,
    image: horse.image || PLACEHOLDER_IMAGE,
    stats: horse.stats || randomStats(),
    progress: 0,
    lane: 0
  };
}

function generateOpponent(name) {
  return {
    name,
    image: PLACEHOLDER_IMAGE,
    stats: {
      stride: randomBetween(55, 78),
      endurance: randomBetween(50, 75),
      force: randomBetween(48, 72),
      resolve: randomBetween(48, 70),
      insight: randomBetween(50, 74)
    }
  };
}

function animateRace() {
  if (!state.race.running) return;
  const { racers } = state.race;
  const laneHeight = raceCanvas.height / racers.length;
  raceCtx.fillStyle = "#0a1124";
  raceCtx.fillRect(0, 0, raceCanvas.width, raceCanvas.height);

  racers.forEach((racer, index) => {
    racer.lane = index;
    const baseSpeed = (racer.stats.stride + racer.stats.force) / 250;
    const staminaBoost = racer.stats.endurance / 500;
    const insightBoost = Math.random() * (racer.stats.insight / 600);
    const delta = baseSpeed + staminaBoost + insightBoost + Math.random() * 0.012;
    racer.progress = Math.min(1, racer.progress + delta);

    const laneY = index * laneHeight;

    raceCtx.fillStyle = index % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)";
    raceCtx.fillRect(0, laneY, raceCanvas.width, laneHeight);

    const x = 40 + racer.progress * (raceCanvas.width - 120);
    const y = laneY + laneHeight / 2;

    raceCtx.fillStyle = racer.color;
    raceCtx.beginPath();
    raceCtx.ellipse(x, y, 26, 16, 0, 0, Math.PI * 2);
    raceCtx.fill();

    raceCtx.fillStyle = "#0a1124";
    raceCtx.font = "11px Inter";
    raceCtx.textAlign = "center";
    raceCtx.fillText(racer.name, x, y + 30);
  });

  const winner = racers.find((racer) => racer.progress >= 1);
  if (winner) {
    finishRace(winner);
  } else {
    state.race.animationId = requestAnimationFrame(animateRace);
  }
}

function finishRace(winner) {
  state.race.running = false;
  if (state.race.animationId) {
    cancelAnimationFrame(state.race.animationId);
    state.race.animationId = null;
  }
  raceStatusEl.textContent = `${winner.name} wins the race!`;
}

function resetRaceCanvas() {
  raceCtx.fillStyle = "#0a1124";
  raceCtx.fillRect(0, 0, raceCanvas.width, raceCanvas.height);
  raceStatusEl.textContent = "Awaiting race selection…";
}

function showPanel(target) {
  Object.entries(panels).forEach(([key, panel]) => {
    if (panel) {
      panel.classList.toggle("hidden", key !== target);
    }
  });
  mapPins.forEach((pin) => {
    pin.classList.toggle("active", pin.dataset.target === target);
  });
  if (target === "race") {
    resetRaceCanvas();
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

function shortenAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const UIColor = {
  accent: "#5ac8fa"
};
