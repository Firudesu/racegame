import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "https://esm.sh/react@18.2.0";
import ReactDOM from "https://esm.sh/react-dom@18.2.0/client";
import htm from "https://esm.sh/htm@3.1.1";
import { connectWallet, signMessage, getStoredWallet } from "./MetaMaskService.js";
import { fetchNFTs } from "./NFTService.js";
import {
  loadPlayerData,
  savePlayerData,
  createHorse,
  DEFAULT_IMAGE
} from "./PlayerDataManager.js";

const html = htm.bind(React.createElement);

const MAX_ACTIVE_SLOTS = 4;

const TRAINING_PROGRAMS = [
  {
    key: "stride",
    label: "Stride",
    duration: 3,
    chance: 0.7,
    summary: "Improve acceleration and stride efficiency."
  },
  {
    key: "endurance",
    label: "Endurance",
    duration: 4,
    chance: 0.65,
    summary: "Build stamina for longer pushes and stable pacing."
  },
  {
    key: "force",
    label: "Force",
    duration: 5,
    chance: 0.6,
    summary: "Increase raw power output for passes and sprints."
  },
  {
    key: "resolve",
    label: "Resolve",
    duration: 4,
    chance: 0.58,
    summary: "Sharpen late-race focus and recovery under pressure."
  },
  {
    key: "insight",
    label: "Insight",
    duration: 3,
    chance: 0.55,
    summary: "Enhance race awareness and strategic decisions."
  }
];

const SCREEN_METADATA = {
  map: { title: "Project Stride Hub", theme: "map" },
  training: { title: "Training Grounds", theme: "training" },
  paddock: { title: "Paddock", theme: "paddock" },
  race: { title: "Race Track", theme: "race" },
  retired: { title: "Retired Stable", theme: "retired" }
};

function shortenAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function App() {
  const storedWallet = useMemo(() => getStoredWallet(), []);
  const [wallet, setWallet] = useState(storedWallet || null);
  const [playerData, setPlayerData] = useState(() => loadPlayerData(storedWallet));
  const [activeScreen, setActiveScreen] = useState("map");
  const [selectedHorseId, setSelectedHorseId] = useState(() =>
    loadPlayerData(storedWallet).horses[0]?.id || null
  );
  const [trainingState, setTrainingState] = useState({
    focus: null,
    option: null,
    status: "idle",
    remaining: 0,
    log: []
  });
  const trainingTimers = useRef({ timeout: null, interval: null });
  const [flash, setFlash] = useState(null);
  const [modal, setModal] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [nftState, setNftState] = useState({ loading: false, items: [], error: null, fetchedFor: null });
  const [raceStatus, setRaceStatus] = useState(null);

  const activeHorses = playerData.horses || [];
  const retiredHorses = playerData.retired || [];
  const selectedHorse =
    activeHorses.find((horse) => horse.id === selectedHorseId) || activeHorses[0] || null;

  const updatePlayerData = useCallback(
    (updater) => {
      setPlayerData((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (wallet) {
          savePlayerData(wallet, next);
        }
        return next;
      });
    },
    [wallet]
  );

  useEffect(() => {
    if (!selectedHorse && activeHorses.length) {
      setSelectedHorseId(activeHorses[0].id);
    }
  }, [selectedHorse, activeHorses]);

  useEffect(() => {
    if (!wallet) return;
    const data = loadPlayerData(wallet);
    setPlayerData(data);
    setSelectedHorseId(data.horses[0]?.id || null);
  }, [wallet]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("contextmenu", handleClose);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("contextmenu", handleClose);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), flash.duration || 3200);
    return () => clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    return () => {
      clearTrainingTimers();
    };
  }, []);

  useEffect(() => {
    if (trainingState.status === "running" && trainingState.option) {
      clearTrainingTimers();
      trainingTimers.current.interval = setInterval(() => {
        setTrainingState((prev) => ({
          ...prev,
          remaining: Math.max(0, parseFloat((prev.remaining - 0.1).toFixed(2)))
        }));
      }, 100);
      trainingTimers.current.timeout = setTimeout(() => {
        finalizeTraining();
      }, trainingState.option.duration * 1000);
    }
    return () => clearTrainingTimers();
  }, [trainingState.status, trainingState.option]);

  function clearTrainingTimers() {
    if (trainingTimers.current.interval) {
      clearInterval(trainingTimers.current.interval);
      trainingTimers.current.interval = null;
    }
    if (trainingTimers.current.timeout) {
      clearTimeout(trainingTimers.current.timeout);
      trainingTimers.current.timeout = null;
    }
  }

  function pushFlash(message, tone = "info", duration = 3000) {
    setFlash({ message, tone, duration });
  }

  async function handleConnectWallet() {
    try {
      const address = await connectWallet();
      const signed = await signMessage(address);
      if (!signed) {
        pushFlash("Signature required to complete login.", "warn");
        return;
      }
      setWallet(address);
      pushFlash(`Wallet connected: ${shortenAddress(address)}`, "success");
    } catch (error) {
      console.error(error);
      if (error.message && /MetaMask/.test(error.message)) {
        setModal({
          type: "error",
          title: "MetaMask Required",
          body: html`
            <div class="modal-paragraph">
              MetaMask is required to import DayJob Punks. Install it from
              <a href="https://metamask.io/download/" target="_blank" rel="noopener">metamask.io</a>
              and refresh this page.
            </div>
          `,
          actions: [{ label: "Close", variant: "secondary", onClick: () => setModal(null) }]
        });
      } else {
        pushFlash(error.message || "Failed to connect wallet.", "warn");
      }
    }
  }

  function setScreen(screen) {
    setActiveScreen(screen);
    setContextMenu(null);
  }

  function addHorse(newHorse) {
    if (activeHorses.length >= MAX_ACTIVE_SLOTS) {
      pushFlash("Paddock already holds four horses.", "warn");
      return;
    }
    updatePlayerData((prev) => ({
      ...prev,
      horses: [...prev.horses, newHorse]
    }));
    setSelectedHorseId(newHorse.id);
    pushFlash(`${newHorse.name} joined the paddock.`, "success");
  }

  function removeHorse(horseId) {
    const horse = activeHorses.find((item) => item.id === horseId);
    if (!horse) return;
    updatePlayerData((prev) => ({
      ...prev,
      horses: prev.horses.filter((item) => item.id !== horseId)
    }));
    if (selectedHorseId === horseId) {
      setSelectedHorseId(activeHorses.filter((h) => h.id !== horseId)[0]?.id || null);
    }
  }

  function retireHorse(horseId) {
    const horse = activeHorses.find((item) => item.id === horseId);
    if (!horse) return;
    const retiredHorse = {
      ...horse,
      retired: true,
      retiredAt: Date.now()
    };
    updatePlayerData((prev) => ({
      horses: prev.horses.filter((item) => item.id !== horseId),
      retired: [...prev.retired, retiredHorse]
    }));
    setSelectedHorseId((prevId) => (prevId === horseId ? null : prevId));
    pushFlash(`${horse.name} retired to the stable.`, "info");
  }

  function updateHorseStats(horseId, updater) {
    updatePlayerData((prev) => ({
      ...prev,
      horses: prev.horses.map((horse) =>
        horse.id === horseId ? { ...horse, ...updater(horse) } : horse
      )
    }));
  }

  function appendTrainingLog(entry) {
    setTrainingState((prev) => {
      const log = [entry, ...prev.log].slice(0, 8);
      return { ...prev, log };
    });
  }

  function beginTraining(option) {
    if (!selectedHorse) {
      pushFlash("Select a horse in the paddock first.", "warn");
      return;
    }
    if (trainingState.status === "running") return;
    if (selectedHorse.sessionsLeft <= 0) {
      pushFlash(`${selectedHorse.name} has no sessions left.`, "warn");
      return;
    }
    setTrainingState({
      focus: option.key,
      option,
      status: "running",
      remaining: option.duration,
      log: trainingState.log,
      horseId: selectedHorse.id
    });
  }

  function finalizeTraining() {
    const { option, horseId } = trainingState;
    if (!option || !horseId) return;
    clearTrainingTimers();
    const horse = activeHorses.find((item) => item.id === horseId);
    if (!horse) return;
    const success = Math.random() <= option.chance;
    const statKey = option.key;

    updatePlayerData((prev) => {
      const horses = prev.horses.map((item) => {
        if (item.id !== horseId) return item;
        const updated = { ...item };
        updated.sessionsLeft = Math.max(0, (updated.sessionsLeft ?? 10) - 1);
        if (success) {
          const bump = Math.floor(Math.random() * 3) + 2;
          updated.stats = {
            ...updated.stats,
            [statKey]: Math.min(100, (updated.stats?.[statKey] || 0) + bump)
          };
          updated.mood = "Focused";
        } else {
          updated.mood = "Steady";
        }
        updated.lastFocus = statKey;
        return updated;
      });
      return { ...prev, horses };
    });

    appendTrainingLog({
      message: success
        ? `${horse.name} improved ${statKey} training!`
        : `${horse.name} completed ${option.label} drills.`,
      tone: success ? "success" : "info",
      timestamp: Date.now()
    });

    setTrainingState((prev) => ({
      ...prev,
      status: "idle",
      option: null,
      focus: null,
      remaining: 0
    }));
  }

  function clearRaceStatus() {
    setTimeout(() => setRaceStatus(null), 2400);
  }

  function handleRaceSelection(horse) {
    setRaceStatus(`Race Starting… ${horse.name} lining up at the gate.`);
    clearRaceStatus();
  }

  function openContextMenuForHorse(event, horse) {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      horse
    });
  }

  function handleContextAction(action, horse) {
    setContextMenu(null);
    switch (action) {
      case "view":
        setModal({
          type: "horse-details",
          title: horse.name,
          horse
        });
        break;
      case "set-main":
        setSelectedHorseId(horse.id);
        pushFlash(`${horse.name} set as primary horse.`, "info");
        break;
      case "train":
        setSelectedHorseId(horse.id);
        setScreen("training");
        break;
      case "retire":
        if (confirm(`Retire ${horse.name}?`)) {
          retireHorse(horse.id);
        }
        break;
      case "release":
        if (confirm(`Release ${horse.name}? This cannot be undone.`)) {
          removeHorse(horse.id);
          pushFlash(`${horse.name} released from paddock.`, "warn");
        }
        break;
      default:
        break;
    }
  }

  function openCreateHorseModal() {
    setModal({
      type: "create-horse",
      title: "Create Stable Horse",
      onSubmit: (name) => {
        const horse = createHorse({ name });
        addHorse(horse);
        setModal(null);
      }
    });
  }

  async function openImportModal() {
    if (!wallet) {
      pushFlash("Connect your wallet to import NFTs.", "warn");
      return;
    }
    if (nftState.fetchedFor !== wallet) {
      setNftState({ loading: true, items: [], error: null, fetchedFor: wallet });
      try {
        const items = await fetchNFTs(wallet);
        setNftState({ loading: false, items, error: null, fetchedFor: wallet });
      } catch (error) {
        console.error(error);
        setNftState({ loading: false, items: [], error: error.message || "Unable to fetch NFTs.", fetchedFor: wallet });
      }
    }
    setModal({ type: "import-nft" });
  }

  function handleImportNFT(nftInfo) {
    if (activeHorses.length >= MAX_ACTIVE_SLOTS) {
      pushFlash("Paddock already holds four horses.", "warn");
      return;
    }
    const horse = createHorse({
      nftData: {
        tokenId: nftInfo.tokenId,
        image: nftInfo.image || DEFAULT_IMAGE,
        name: nftInfo.name,
        collection: "DayJobPunks"
      }
    });
    addHorse(horse);
    setModal(null);
  }

  function handleLegacyAttach(retiredHorse, targetHorse) {
    updatePlayerData((prev) => ({
      ...prev,
      horses: prev.horses.map((horse) =>
        horse.id === targetHorse.id
          ? { ...horse, legacySource: { name: retiredHorse.name, tokenId: retiredHorse.tokenId, attachedAt: Date.now() } }
          : horse
      )
    }));
    pushFlash(`${retiredHorse.name} mentors ${targetHorse.name}.`, "success");
    setModal(null);
  }

  function openLegacyModal(retiredHorse) {
    if (activeHorses.length === 0) {
      pushFlash("No active horses available for legacy attachment.", "warn");
      return;
    }
    setModal({ type: "attach-legacy", retiredHorse });
  }

  return html`
    <div class="app-shell">
      ${flash
        ? html`
            <div class=${`flash-banner flash-${flash.tone || "info"}`}>
              ${flash.message}
            </div>
          `
        : null}
      <header class="app-header">
        <div class="brand">
          <h1>Project Stride</h1>
          <span class="subtitle">Horse Trainer Demo</span>
        </div>
        <div class="wallet-panel">
          ${wallet
            ? html`<span class="wallet-status">Connected: ${shortenAddress(wallet)}</span>`
            : html`<span class="wallet-status muted">Wallet not connected</span>`}
          <button class="primary" onClick=${handleConnectWallet}>
            ${wallet ? "Reconnect Wallet" : "Connect Wallet"}
          </button>
        </div>
      </header>
      <main class="app-main">
        <aside class="map-panel">
          <h2>World Map</h2>
          <p>Select a destination to manage your stable.</p>
          <div class="map-grid">
            ${Object.entries(SCREEN_METADATA)
              .filter(([key]) => key !== "map")
              .map(([key, meta]) => {
                const titles = {
                  training: "Training Grounds",
                  paddock: "Paddock",
                  race: "Race Track",
                  retired: "Retired Stable"
                };
                const descriptions = {
                  training: "Plan drills and improve stats.",
                  paddock: "Manage active horses & imports.",
                  race: "Prepare horses for the next run.",
                  retired: "Review legacy champions."
                };
                return html`
                  <button
                    key=${key}
                    class=${`map-card map-${key}`}
                    onClick=${() => setScreen(key)}
                  >
                    <span class="map-card__title">${titles[key]}</span>
                    <span class="map-card__subtitle">${descriptions[key]}</span>
                  </button>
                `;
              })}
          </div>
        </aside>
        <section class=${`screen-panel theme-${SCREEN_METADATA[activeScreen].theme}`}>
          <div class="panel-header">
            <h2>${SCREEN_METADATA[activeScreen].title}</h2>
            ${activeScreen !== "map"
              ? html`<button class="return-button" onClick=${() => setScreen("map")}>Back to Map</button>`
              : null}
          </div>
          <div class="screen-wrapper">
            ${activeScreen === "map" &&
            html`
              <div class="map-intro">
                <p>Use the map to explore each training area. Connect your wallet to import DayJob Punks NFTs and style your racers.</p>
                <ul class="feature-list">
                  <li>Training Grounds: focus on stat development with timers and success odds.</li>
                  <li>Paddock: manage a four-slot stable, import NFTs, or create horses.</li>
                  <li>Race Track: stage mock races with your active roster.</li>
                  <li>Retired Stable: attach legacy bonuses from previous champions.</li>
                </ul>
              </div>
            `}
            ${activeScreen === "training" &&
            html`<${TrainingScreen}
              horse=${selectedHorse}
              horses=${activeHorses}
              trainingState=${trainingState}
              setFocus=${(option) =>
                setTrainingState((prev) => ({ ...prev, focus: option.key }))}
              beginTraining=${beginTraining}
            />`}
            ${activeScreen === "paddock" &&
            html`<${PaddockScreen}
              horses=${activeHorses}
              maxSlots=${MAX_ACTIVE_SLOTS}
              selectedHorseId=${selectedHorseId}
              onSelect=${setSelectedHorseId}
              onCreate=${openCreateHorseModal}
              onImport=${openImportModal}
              onContext=${openContextMenuForHorse}
            />`}
            ${activeScreen === "race" &&
            html`<${RaceScreen}
              horses=${activeHorses}
              raceStatus=${raceStatus}
              onSelect=${handleRaceSelection}
            />`}
            ${activeScreen === "retired" &&
            html`<${RetiredScreen}
              retired=${retiredHorses}
              activeHorses=${activeHorses}
              onRequestAttach=${openLegacyModal}
            />`}
          </div>
        </section>
      </main>

      ${contextMenu &&
      html`
        <div
          class="context-menu"
          style=${{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <button onClick=${() => handleContextAction("view", contextMenu.horse)}>View Stats</button>
          <button onClick=${() => handleContextAction("set-main", contextMenu.horse)}>Set as Main</button>
          <button onClick=${() => handleContextAction("train", contextMenu.horse)}>Train</button>
          <button onClick=${() => handleContextAction("retire", contextMenu.horse)}>Retire</button>
          <button class="destructive" onClick=${() => handleContextAction("release", contextMenu.horse)}>
            Release
          </button>
        </div>
      `}

      ${modal &&
      html`<${Modal}
        modal=${modal}
        setModal=${setModal}
        nftState=${nftState}
        onCreate=${(name) => modal.onSubmit && modal.onSubmit(name)}
        onImport=${handleImportNFT}
        onAttach=${handleLegacyAttach}
        activeHorses=${activeHorses}
      />`}
    </div>
  `;
}

function TrainingScreen({ horse, horses, trainingState, setFocus, beginTraining }) {
  return html`
    <div class="training-screen">
      ${horse
        ? html`
            <div class="selected-horse-card">
              <img src=${horse.image || DEFAULT_IMAGE} alt=${`${horse.name} avatar`} class="avatar-img large"/>
              <div>
                <h3>${horse.name}</h3>
                <p class="horse-meta">
                  Sessions left: ${horse.sessionsLeft ?? 0} • Mood: ${horse.mood || "Calm"}
                </p>
                <div class="stat-row">
                  ${Object.entries(horse.stats || {}).map(
                    ([key, value]) =>
                      html`<span class="stat-chip" title=${`${key} ${value}`}>${key}: ${value}</span>`
                  )}
                </div>
              </div>
            </div>
          `
        : html`<div class="empty-state">Select a horse in the paddock to begin training.</div>`}

      <div class="training-prompt">Which aspect would you like to train?</div>

      <div class="training-options-grid">
        ${TRAINING_PROGRAMS.map((option) => {
          const selected = trainingState.focus === option.key;
          return html`
            <button
              key=${option.key}
              class=${`training-card${selected ? " selected" : ""}`}
              onClick=${() => setFocus(option)}
              disabled=${trainingState.status === "running"}
            >
              <div class="training-card__header">
                <span>${option.label}</span>
                <span class="duration">${option.duration}s</span>
              </div>
              <div class="chance">Success chance ${(option.chance * 100).toFixed(0)}%</div>
              <p>${option.summary}</p>
            </button>
          `;
        })}
      </div>

      <div class="training-actions">
        <button
          class="primary"
          disabled=${!trainingState.focus || trainingState.status === "running" || !horse}
          onClick=${() => {
            const option = TRAINING_PROGRAMS.find((item) => item.key === trainingState.focus);
            if (option) beginTraining(option);
          }}
        >
          ${trainingState.status === "running" ? "Training…" : "Start Training"}
        </button>
        <div class="training-timer-label">
          ${trainingState.status === "running"
            ? html`<span>Time remaining: ${trainingState.remaining.toFixed(1)}s</span>`
            : html`<span>Select a program to begin.</span>`}
        </div>
      </div>

      <div class="training-log">
        <h4>Recent sessions</h4>
        ${trainingState.log.length === 0
          ? html`<div class="log-empty">No sessions logged yet.</div>`
          : html`
              <ul>
                ${trainingState.log.map(
                  (entry, index) =>
                    html`<li key=${index} class=${`log-${entry.tone || "info"}`}>
                      ${entry.message}
                    </li>`
                )}
              </ul>
            `}
      </div>

      <div class="alternate-selection">
        <span>Select horse:</span>
        <div class="horse-selector">
          ${horses.map(
            (candidate) =>
              html`
                <div class="horse-pill ${candidate.id === horse?.id ? "active" : ""}">
                  <img src=${candidate.image || DEFAULT_IMAGE} alt="" />
                  <span>${candidate.name}</span>
                </div>
              `
          )}
        </div>
      </div>
    </div>
  `;
}

function PaddockScreen({
  horses,
  maxSlots,
  selectedHorseId,
  onSelect,
  onCreate,
  onImport,
  onContext
}) {
  const slots = Array.from({ length: maxSlots });
  return html`
    <div class="paddock-screen">
      <div class="paddock-actions">
        <button class="secondary" onClick=${onCreate}>Create Horse</button>
        <button class="primary" onClick=${onImport}>Import from Wallet</button>
      </div>
      <div class="paddock-grid">
        ${slots.map((_, index) => {
          const horse = horses[index] || null;
          if (!horse) {
            return html`
              <div key=${index} class="paddock-slot empty" onClick=${onCreate}>
                <span class="placeholder-icon">+</span>
                <p>Add horse to this stable slot.</p>
              </div>
            `;
          }
          const isSelected = horse.id === selectedHorseId;
          return html`
            <div
              key=${horse.id}
              class=${`paddock-slot${isSelected ? " selected" : ""}`}
              onClick=${() => onSelect(horse.id)}
              onContextMenu=${(event) => onContext(event, horse)}
            >
              <img src=${horse.image || DEFAULT_IMAGE} alt=${horse.name} class="avatar-img"/>
              <div class="slot-content">
                <div class="slot-header">
                  <h3>${horse.name}</h3>
                  <span class="slot-meta">${horse.collection || "Stable"}</span>
                </div>
                <div class="slot-stats">
                  ${Object.entries(horse.stats || {}).map(
                    ([key, value]) =>
                      html`<span title=${`${key} ${value}`} key=${key}>${key.slice(0, 3)} ${value}</span>`
                  )}
                </div>
              </div>
              <div class="slot-footer">Right-click for actions</div>
            </div>
          `;
        })}
      </div>
      <p class="paddock-hint">
        Tip: Right-click a horse to view stats, retire, or set as your primary trainee.
      </p>
    </div>
  `;
}

function RaceScreen({ horses, raceStatus, onSelect }) {
  return html`
    <div class="race-screen">
      ${raceStatus
        ? html`<div class="race-status">${raceStatus}</div>`
        : html`<div class="race-status muted">Select a horse to simulate a race start.</div>`}
      <div class="race-grid">
        ${horses.length === 0
          ? html`<div class="empty-state">No active horses available.</div>`
          : horses.map(
              (horse) => html`
                <div key=${horse.id} class="race-card">
                  <img src=${horse.image || DEFAULT_IMAGE} alt=${horse.name} class="avatar-img circle"/>
                  <div class="race-card__content">
                    <h3>${horse.name}</h3>
                    <div class="stat-row compact">
                      <span>Stride ${horse.stats.stride}</span>
                      <span>End ${horse.stats.endurance}</span>
                      <span>Force ${horse.stats.force}</span>
                    </div>
                    <button class="primary" onClick=${() => onSelect(horse)}>Select</button>
                  </div>
                </div>
              `
            )}
      </div>
    </div>
  `;
}

function RetiredScreen({ retired, activeHorses, onRequestAttach }) {
  if (!retired.length) {
    return html`<div class="empty-state">No retired avatars yet. Complete more seasons to build a legacy.</div>`;
  }
  return html`
    <div class="retired-screen">
      <div class="retired-grid">
        ${retired.map(
          (horse) => html`
            <div key=${horse.id} class="retired-card">
              <img src=${horse.image || DEFAULT_IMAGE} alt=${horse.name} class="avatar-img"/>
              <div>
                <h3>${horse.name}</h3>
                <p class="meta">Retired ${new Date(horse.retiredAt || Date.now()).toLocaleDateString()}</p>
                <p class="meta">Mood ${horse.mood || "Calm"}</p>
                <div class="stat-row compact">
                  ${Object.entries(horse.stats || {}).map(
                    ([key, value]) => html`<span key=${key}>${key.slice(0, 3)} ${value}</span>`
                  )}
                </div>
              </div>
              <div class="card-actions">
                <button
                  class="secondary"
                  disabled=${activeHorses.length === 0}
                  onClick=${() => onRequestAttach(horse)}
                >
                  Attach to Horse
                </button>
              </div>
            </div>
          `
        )}
      </div>
    </div>
  `;
}

function Modal({ modal, setModal, nftState, onCreate, onImport, onAttach, activeHorses }) {
  const close = () => setModal(null);

  if (modal.type === "error") {
    return html`
      <div class="modal-backdrop" onClick=${close}>
        <div class="modal-dialog" onClick=${(event) => event.stopPropagation()}>
          <header>
            <h3>${modal.title}</h3>
            <button class="icon-button" onClick=${close}>×</button>
          </header>
          <div class="modal-body">${modal.body}</div>
          <footer>
            ${modal.actions?.map(
              (action) =>
                html`
                  <button
                    class=${action.variant === "secondary" ? "secondary" : "primary"}
                    onClick=${action.onClick}
                  >
                    ${action.label}
                  </button>
                `
            )}
          </footer>
        </div>
      </div>
    `;
  }

  if (modal.type === "create-horse") {
    let nameInput;
    const handleSubmit = (event) => {
      event.preventDefault();
      const name = nameInput?.value.trim();
      onCreate(name);
    };
    return html`
      <div class="modal-backdrop" onClick=${close}>
        <form class="modal-dialog" onSubmit=${handleSubmit} onClick=${(event) => event.stopPropagation()}>
          <header>
            <h3>${modal.title}</h3>
            <button class="icon-button" onClick=${close} type="button">×</button>
          </header>
          <div class="modal-body">
            <label>
              Horse Name
              <input type="text" placeholder="Stable Horse" ref=${(el) => (nameInput = el)} />
            </label>
            <p class="modal-note">
              A non-NFT horse uses a default avatar and balanced stats. You can convert to an NFT later by importing.
            </p>
          </div>
          <footer>
            <button type="button" class="secondary" onClick=${close}>Cancel</button>
            <button type="submit" class="primary">Create Horse</button>
          </footer>
        </form>
      </div>
    `;
  }

  if (modal.type === "import-nft") {
    return html`
      <div class="modal-backdrop" onClick=${close}>
        <div class="modal-dialog" onClick=${(event) => event.stopPropagation()}>
          <header>
            <h3>Import DayJob Punks</h3>
            <button class="icon-button" onClick=${close}>×</button>
          </header>
          <div class="modal-body">
            ${nftState.loading
              ? html`<div class="loading-state">Fetching NFTs from your wallet…</div>`
              : nftState.error
              ? html`<div class="error-state">${nftState.error}</div>`
              : nftState.items.length === 0
              ? html`<div class="empty-state">No DayJob Punk NFTs found. Create a standard horse instead.</div>`
              : html`
                  <div class="nft-grid">
                    ${nftState.items.map(
                      (nft) => html`
                        <div key=${nft.tokenId} class="nft-card">
                          <img src=${nft.image || DEFAULT_IMAGE} alt=${nft.name} />
                          <div>
                            <h4>${nft.name}</h4>
                            <p>Token #${nft.tokenId}</p>
                          </div>
                          <button class="primary" onClick=${() => onImport(nft)}>Import</button>
                        </div>
                      `
                    )}
                  </div>
                `}
          </div>
          <footer>
            <button class="secondary" onClick=${close}>Close</button>
          </footer>
        </div>
      </div>
    `;
  }

  if (modal.type === "attach-legacy") {
    const retiredHorse = modal.retiredHorse;
    const handleSubmit = (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const horseId = data.get("legacy-target");
      const target = activeHorses.find((horse) => horse.id === horseId);
      if (target) {
        onAttach(retiredHorse, target);
      }
    };
    return html`
      <div class="modal-backdrop" onClick=${close}>
        <form class="modal-dialog" onSubmit=${handleSubmit} onClick=${(event) => event.stopPropagation()}>
          <header>
            <h3>Attach ${retiredHorse.name}</h3>
            <button class="icon-button" onClick=${close} type="button">×</button>
          </header>
          <div class="modal-body">
            <p class="modal-note">
              Select an active horse to receive legacy mentorship from ${retiredHorse.name}.
            </p>
            <div class="attach-options">
              ${activeHorses.map(
                (horse, index) => html`
                  <label class="attach-option">
                    <input
                      type="radio"
                      name="legacy-target"
                      value=${horse.id}
                      checked=${index === 0}
                    />
                    <span>
                      <strong>${horse.name}</strong>
                      <small>Stride ${horse.stats.stride} • End ${horse.stats.endurance}</small>
                    </span>
                  </label>
                `
              )}
            </div>
          </div>
          <footer>
            <button type="button" class="secondary" onClick=${close}>Cancel</button>
            <button type="submit" class="primary">Attach Legacy</button>
          </footer>
        </form>
      </div>
    `;
  }

  if (modal.type === "horse-details") {
    const horse = modal.horse;
    return html`
      <div class="modal-backdrop" onClick=${close}>
        <div class="modal-dialog" onClick=${(event) => event.stopPropagation()}>
          <header>
            <h3>${horse.name}</h3>
            <button class="icon-button" onClick=${close}>×</button>
          </header>
          <div class="modal-body horse-details">
            <img src=${horse.image || DEFAULT_IMAGE} alt=${horse.name} class="avatar-img large"/>
            <div>
              <p><strong>Collection:</strong> ${horse.collection || "Stable"}</p>
              <p><strong>Sessions left:</strong> ${horse.sessionsLeft ?? 0}</p>
              <p><strong>Mood:</strong> ${horse.mood || "Calm"}</p>
              <div class="stat-row">
                ${Object.entries(horse.stats || {}).map(
                  ([key, value]) => html`<span key=${key}>${key}: ${value}</span>`
                )}
              </div>
              ${horse.legacySource
                ? html`<p class="meta">Legacy bonus from ${horse.legacySource.name}</p>`
                : null}
            </div>
          </div>
          <footer>
            <button class="secondary" onClick=${close}>Close</button>
          </footer>
        </div>
      </div>
    `;
  }

  return null;
}

const root = document.getElementById("root");
if (root) {
  const rootInstance = ReactDOM.createRoot(root);
  rootInstance.render(html`<${App} />`);
}
