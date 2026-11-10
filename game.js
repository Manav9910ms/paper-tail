(() => {
  "use strict";

  const COLS = 48;
  const ROWS = 32;
  const CELL = 20;
  const TOTAL = COLS * ROWS;
  const STEP_MS = 125;

  const COLORS = {
    0: "#1b2943",
    1: "#b8f36b",
    2: "#ff8197",
    3: "#72c9ef",
    4: "#ffbd69",
    5: "#b39aff"
  };
  const GLOW = {
    1: "#e2ffb6",
    2: "#ffc0ca",
    3: "#c3efff",
    4: "#ffe0b6",
    5: "#e1d4ff"
  };
  const SKINS = {
    lime: { color: "#b8f36b", glow: "#e2ffb6" },
    aqua: { color: "#57e0d0", glow: "#b7fff5" },
    violet: { color: "#aa91ff", glow: "#ded4ff" },
    coral: { color: "#ff8d72", glow: "#ffd0c4" }
  };
  const DIRECTIONS = {
    up: { x: 0, y: -1, name: "up" },
    right: { x: 1, y: 0, name: "right" },
    down: { x: 0, y: 1, name: "down" },
    left: { x: -1, y: 0, name: "left" }
  };
  const DIR_LIST = [DIRECTIONS.up, DIRECTIONS.right, DIRECTIONS.down, DIRECTIONS.left];

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const miniMap = document.getElementById("miniMap");
  const miniCtx = miniMap ? miniMap.getContext("2d") : null;
  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const startButton = document.getElementById("startButton");
  const pauseButton = document.getElementById("pauseButton");
  const resumeButton = document.getElementById("resumeButton");
  const restartButton = document.getElementById("restartButton");
  const playAgainButton = document.getElementById("playAgainButton");
  const soundButton = document.getElementById("soundButton");
  const soundIcon = document.getElementById("soundIcon");

  const ui = {
    arenaStatus: document.getElementById("arenaStatus"),
    hudPercent: document.getElementById("hudPercent"),
    rivalCount: document.getElementById("rivalCount"),
    territoryValue: document.getElementById("territoryValue"),
    territoryProgress: document.getElementById("territoryProgress"),
    cellsValue: document.getElementById("cellsValue"),
    scoreValue: document.getElementById("scoreValue"),
    bestValue: document.getElementById("bestValue"),
    finalPercent: document.getElementById("finalPercent"),
    gameOverTitle: document.getElementById("gameOverTitle"),
    gameOverCopy: document.getElementById("gameOverCopy"),
    careerRuns: document.getElementById("careerRuns"),
    careerWins: document.getElementById("careerWins"),
    careerCells: document.getElementById("careerCells")
  };

  let land = new Uint8Array(TOTAL);
  let player;
  let rivals = [];
  let timer = null;
  let gameState = "ready";
  let score = 0;
  let best = readBest();
  let careerStats = readCareerStats();
  let selectedSkin = readSkin();
  let runRecorded = false;
  let soundOn = false;
  let audioContext = null;
  let tickCount = 0;
  let lastPointer = null;

  function readBest() {
    try {
      return Number(window.localStorage.getItem("paperTailBest") || 0);
    } catch (_) {
      return 0;
    }
  }

  function saveBest(value) {
    best = Math.max(best, value);
    try {
      window.localStorage.setItem("paperTailBest", String(best));
    } catch (_) {
      // The game remains playable when storage is unavailable.
    }
    ui.bestValue.innerHTML = best.toFixed(1) + "<span>%</span>";
  }

  function readCareerStats() {
    try {
      const saved = JSON.parse(window.localStorage.getItem("paperTailCareer") || "{}");
      return {
        runs: Math.max(0, Number(saved.runs) || 0),
        wins: Math.max(0, Number(saved.wins) || 0),
        cells: Math.max(0, Number(saved.cells) || 0)
      };
    } catch (_) {
      return { runs: 0, wins: 0, cells: 0 };
    }
  }

  function saveCareerStats() {
    try {
      window.localStorage.setItem("paperTailCareer", JSON.stringify(careerStats));
    } catch (_) {
      // Local records are optional; game play continues without storage.
    }
    updateCareerHud();
  }

  function updateCareerHud() {
    if (ui.careerRuns) ui.careerRuns.textContent = careerStats.runs.toLocaleString();
    if (ui.careerWins) ui.careerWins.textContent = careerStats.wins.toLocaleString();
    if (ui.careerCells) ui.careerCells.textContent = careerStats.cells.toLocaleString();
  }

  function recordRun(won) {
    if (runRecorded) return;
    runRecorded = true;
    careerStats.runs += 1;
    careerStats.cells += territoryCount(1);
    if (won) careerStats.wins += 1;
    saveCareerStats();
  }

  function readSkin() {
    try {
      const saved = window.localStorage.getItem("paperTailSkin");
      return SKINS[saved] ? saved : "lime";
    } catch (_) {
      return "lime";
    }
  }

  function applySkin(name) {
    if (!SKINS[name]) return;
    selectedSkin = name;
    COLORS[1] = SKINS[name].color;
    GLOW[1] = SKINS[name].glow;
    document.querySelectorAll(".skin-swatch").forEach(button => {
      const active = button.dataset.skin === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    try {
      window.localStorage.setItem("paperTailSkin", name);
    } catch (_) {
      // Skin selection is still active for this session.
    }
    draw();
  }

  function indexOf(x, y) {
    return y * COLS + x;
  }

  function inBounds(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  function opposite(a, b) {
    return a.x + b.x === 0 && a.y + b.y === 0;
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function makeEntity(id, x, y, direction) {
    return {
      id: id,
      x: x,
      y: y,
      dir: direction,
      nextDir: direction,
      trail: [],
      alive: true,
      respawnAt: 0,
      origin: null,
      stepsSinceTurn: 0,
      targetLength: 7 + Math.floor(Math.random() * 6)
    };
  }

  function paintPatch(cx, cy, size, id) {
    const startX = cx - Math.floor(size / 2);
    const startY = cy - Math.floor(size / 2);
    for (let y = startY; y < startY + size; y += 1) {
      for (let x = startX; x < startX + size; x += 1) {
        if (inBounds(x, y)) land[indexOf(x, y)] = id;
      }
    }
  }

  function initializeWorld() {
    land = new Uint8Array(TOTAL);
    player = makeEntity(1, 24, 16, DIRECTIONS.right);
    paintPatch(player.x, player.y, 7, player.id);

    const spawnPoints = [
      { x: 7, y: 7 },
      { x: 40, y: 7 },
      { x: 7, y: 24 },
      { x: 40, y: 24 }
    ];
    rivals = spawnPoints.map((point, i) => {
      const direction = randomItem(DIR_LIST);
      const rival = makeEntity(i + 2, point.x, point.y, direction);
      paintPatch(point.x, point.y, 6, rival.id);
      return rival;
    });

    score = 0;
    tickCount = 0;
    updateHud();
    draw();
  }

  function setStatus(label, active) {
    ui.arenaStatus.textContent = label;
    const dot = document.querySelector(".arena-title .status-dot");
    if (dot) {
      dot.style.background = active ? "#b8f36b" : "#7d8aa3";
      dot.style.boxShadow = active ? "0 0 12px rgba(184,243,107,.65)" : "none";
    }
  }

  function startGame() {
    stopTimer();
    runRecorded = false;
    initializeWorld();
    gameState = "running";
    startOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    gameOverOverlay.classList.add("hidden");
    pauseButton.disabled = false;
    pauseButton.innerHTML = '<span class="pause-glyph">Ⅱ</span> Pause';
    setStatus("LIVE RUN", true);
    timer = window.setInterval(step, STEP_MS);
    playTone(540, 0.07, "sine");
  }

  function stopTimer() {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function pauseGame() {
    if (gameState !== "running") return;
    gameState = "paused";
    stopTimer();
    pauseOverlay.classList.remove("hidden");
    pauseButton.innerHTML = '<span class="pause-glyph">▶</span> Resume';
    setStatus("RUN PAUSED", false);
  }

  function resumeGame() {
    if (gameState !== "paused") return;
    gameState = "running";
    pauseOverlay.classList.add("hidden");
    pauseButton.innerHTML = '<span class="pause-glyph">Ⅱ</span> Pause';
    setStatus("LIVE RUN", true);
    timer = window.setInterval(step, STEP_MS);
  }

  function finishGame(reason) {
    if (gameState !== "running") return;
    gameState = "over";
    stopTimer();
    pauseButton.disabled = true;
    const pct = territoryPercent(1);
    ui.finalPercent.textContent = pct.toFixed(1) + "%";
    ui.gameOverTitle.textContent = reason === "wall"
      ? "You hit the edge."
      : reason === "self"
        ? "You crossed your own tail."
        : "Your trail was cut.";
    ui.gameOverCopy.textContent = reason === "wall"
      ? "The grid has an edge. Your next run can go further."
      : reason === "self"
        ? "Your trail looped back on itself. Leave a little more room next time."
        : "A rival crossed your exposed tail. Plan a shorter loop and strike back.";
    recordRun(false);
    setStatus("RUN COMPLETE", false);
    saveBest(pct);
    gameOverOverlay.classList.remove("hidden");
    playTone(145, 0.25, "triangle");
    draw();
  }

  function capture(entity) {
    if (entity.trail.length === 0) return 0;

    for (const point of entity.trail) {
      if (inBounds(point.x, point.y)) land[indexOf(point.x, point.y)] = entity.id;
    }

    const reached = new Uint8Array(TOTAL);
    const queue = new Int32Array(TOTAL);
    let head = 0;
    let tail = 0;

    function seed(x, y) {
      if (!inBounds(x, y)) return;
      const cellIndex = indexOf(x, y);
      if (reached[cellIndex] || land[cellIndex] === entity.id) return;
      reached[cellIndex] = 1;
      queue[tail++] = cellIndex;
    }

    for (let x = 0; x < COLS; x += 1) {
      seed(x, 0);
      seed(x, ROWS - 1);
    }
    for (let y = 1; y < ROWS - 1; y += 1) {
      seed(0, y);
      seed(COLS - 1, y);
    }

    while (head < tail) {
      const current = queue[head++];
      const x = current % COLS;
      const y = Math.floor(current / COLS);
      seed(x + 1, y);
      seed(x - 1, y);
      seed(x, y + 1);
      seed(x, y - 1);
    }

    let gained = 0;
    for (let i = 0; i < TOTAL; i += 1) {
      if (land[i] !== entity.id && reached[i] === 0) {
        land[i] = entity.id;
        gained += 1;
      }
    }
    entity.trail.length = 0;
    entity.origin = null;
    if (entity.id !== 1) entity.targetLength = 7 + Math.floor(Math.random() * 6);

    if (entity.id === 1) {
      score += gained;
      updateHud();
      if (gained > 0) {
        playTone(680, 0.09, "sine");
        window.setTimeout(() => playTone(920, 0.08, "sine"), 75);
        flashCapture();
      }
      if (territoryPercent(1) >= 99.95) {
        gameState = "over";
        stopTimer();
        pauseButton.disabled = true;
        ui.finalPercent.textContent = "100.0%";
        ui.gameOverTitle.textContent = "The whole map is yours!";
        ui.gameOverCopy.textContent = "A perfect run. You claimed every last tile.";
        recordRun(true);
        saveBest(100);
        setStatus("MAP CONQUERED", false);
        gameOverOverlay.classList.remove("hidden");
      }
    }
    return gained;
  }

  function flashCapture() {
    const arena = document.getElementById("arenaFrame");
    arena.classList.remove("capture-flash");
    void arena.offsetWidth;
    arena.classList.add("capture-flash");
    window.setTimeout(() => arena.classList.remove("capture-flash"), 420);
  }

  function territoryCount(id) {
    let count = 0;
    for (let i = 0; i < land.length; i += 1) {
      if (land[i] === id) count += 1;
    }
    return count;
  }

  function territoryPercent(id) {
    return (territoryCount(id) / TOTAL) * 100;
  }

  function updateHud() {
    const count = territoryCount(1);
    const pct = (count / TOTAL) * 100;
    ui.hudPercent.textContent = pct.toFixed(1) + "%";
    ui.territoryValue.textContent = pct.toFixed(1);
    ui.territoryProgress.style.width = pct.toFixed(2) + "%";
    ui.cellsValue.textContent = count.toLocaleString() + " cells";
    ui.scoreValue.textContent = String(score).padStart(4, "0");
    ui.rivalCount.textContent = String(rivals.filter(r => r.alive).length);
    ui.bestValue.innerHTML = best.toFixed(1) + "<span>%</span>";
    updateCareerHud();
  }

  function queueDirection(directionName) {
    if (gameState !== "running" || !DIRECTIONS[directionName]) return;
    const candidate = DIRECTIONS[directionName];
    if (opposite(candidate, player.dir)) return;
    player.nextDir = candidate;
  }

  function step() {
    if (gameState !== "running") return;
    tickCount += 1;

    movePlayer();
    if (gameState !== "running") {
      draw();
      return;
    }

    if (tickCount % 2 === 0) {
      for (const rival of rivals) {
        if (rival.alive) moveRival(rival);
        else if (tickCount >= rival.respawnAt) respawnRival(rival);
        if (gameState !== "running") break;
      }
    }
    updateHud();
    draw();
  }

  function movePlayer() {
    const chosen = player.nextDir || player.dir;
    if (!opposite(chosen, player.dir)) player.dir = chosen;
    const nx = player.x + player.dir.x;
    const ny = player.y + player.dir.y;

    if (!inBounds(nx, ny)) {
      finishGame("wall");
      return;
    }

    if (player.trail.some(point => point.x === nx && point.y === ny)) {
      finishGame("self");
      return;
    }

    collideWithOtherTrails(player, nx, ny);
    if (gameState !== "running") return;

    player.x = nx;
    player.y = ny;
    const cell = land[indexOf(nx, ny)];

    if (cell === player.id) {
      if (player.trail.length > 0) capture(player);
    } else {
      if (player.trail.length === 0) player.origin = { x: nx, y: ny };
      player.trail.push({ x: nx, y: ny });
      if (player.trail.length > 48) finishGame("self");
    }
  }

  function collideWithOtherTrails(mover, x, y) {
    for (const rival of rivals) {
      if (rival === mover || !rival.alive) continue;
      const hit = rival.trail.some(point => point.x === x && point.y === y);
      if (!hit) continue;

      if (rival.id === 1) {
        finishGame("cut");
        return;
      }
      eliminateRival(rival, "trail");
    }
  }

  function findReturnDirection(rival) {
    const start = indexOf(rival.x, rival.y);
    const queue = new Int32Array(TOTAL);
    const visited = new Uint8Array(TOTAL);
    const firstStep = new Int8Array(TOTAL);
    firstStep.fill(-1);
    const blocked = new Set(rival.trail.map(point => indexOf(point.x, point.y)));
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const current = queue[head++];
      const x = current % COLS;
      const y = Math.floor(current / COLS);
      const directions = DIR_LIST.slice().sort((a, b) => {
        const da = Math.abs(x + a.x - rival.origin.x) + Math.abs(y + a.y - rival.origin.y);
        const db = Math.abs(x + b.x - rival.origin.x) + Math.abs(y + b.y - rival.origin.y);
        return da - db;
      });

      for (let d = 0; d < directions.length; d += 1) {
        const direction = directions[d];
        if (current === start && opposite(direction, rival.dir)) continue;
        const nx = x + direction.x;
        const ny = y + direction.y;
        if (!inBounds(nx, ny)) continue;
        const next = indexOf(nx, ny);
        if (visited[next] || blocked.has(next)) continue;
        const first = current === start ? DIR_LIST.indexOf(direction) : firstStep[current];
        if (land[next] === rival.id) return DIR_LIST[first];
        visited[next] = 1;
        firstStep[next] = first;
        queue[tail++] = next;
      }
    }
    return null;
  }

  function chooseRivalDirection(rival) {
    if (rival.trail.length > 0 && rival.origin) {
      const nextX = rival.x + rival.dir.x;
      const nextY = rival.y + rival.dir.y;
      const nextIndex = inBounds(nextX, nextY) ? indexOf(nextX, nextY) : -1;
      const wouldLoop = nextIndex >= 0 && rival.trail.some(point => point.x === nextX && point.y === nextY);
      const shouldReturn = rival.trail.length >= rival.targetLength ||
        !inBounds(nextX, nextY) || wouldLoop;

      if (shouldReturn) {
        const returnDirection = findReturnDirection(rival);
        if (returnDirection) rival.dir = returnDirection;
        return;
      }

      if (Math.random() < 0.12) {
        const expansionDirections = DIR_LIST.filter(direction => {
          if (opposite(direction, rival.dir)) return false;
          const x = rival.x + direction.x;
          const y = rival.y + direction.y;
          return inBounds(x, y) &&
            land[indexOf(x, y)] !== rival.id &&
            !rival.trail.some(point => point.x === x && point.y === y);
        });
        if (expansionDirections.length) rival.dir = randomItem(expansionDirections);
      }
      return;
    }

    const forwardX = rival.x + rival.dir.x;
    const forwardY = rival.y + rival.dir.y;
    const exitDirections = DIR_LIST.filter(direction => {
      const x = rival.x + direction.x;
      const y = rival.y + direction.y;
      return inBounds(x, y) && land[indexOf(x, y)] !== rival.id && !opposite(direction, rival.dir);
    });

    if (exitDirections.length > 0 && Math.random() < 0.10) {
      rival.dir = randomItem(exitDirections);
      return;
    }

    if (!inBounds(forwardX, forwardY) || land[indexOf(forwardX, forwardY)] !== rival.id) {
      const safeDirections = DIR_LIST.filter(direction => {
        const x = rival.x + direction.x;
        const y = rival.y + direction.y;
        return inBounds(x, y) && land[indexOf(x, y)] === rival.id && !opposite(direction, rival.dir);
      });
      if (safeDirections.length > 0) rival.dir = randomItem(safeDirections);
      else if (exitDirections.length > 0) rival.dir = randomItem(exitDirections);
    } else if (Math.random() < 0.1) {
      const safeDirections = DIR_LIST.filter(direction => {
        const x = rival.x + direction.x;
        const y = rival.y + direction.y;
        return inBounds(x, y) && land[indexOf(x, y)] === rival.id && !opposite(direction, rival.dir);
      });
      if (safeDirections.length > 0) rival.dir = randomItem(safeDirections);
    }
  }

  function moveRival(rival) {
    chooseRivalDirection(rival);
    const nx = rival.x + rival.dir.x;
    const ny = rival.y + rival.dir.y;

    if (!inBounds(nx, ny)) {
      eliminateRival(rival, "edge");
      return;
    }
    if (rival.trail.some(point => point.x === nx && point.y === ny)) {
      eliminateRival(rival, "self");
      return;
    }

    if (player.trail.some(point => point.x === nx && point.y === ny)) {
      finishGame("cut");
      return;
    }

    rival.x = nx;
    rival.y = ny;
    if (land[indexOf(nx, ny)] === rival.id) {
      if (rival.trail.length > 0) capture(rival);
    } else {
      if (rival.trail.length === 0) rival.origin = { x: rival.x - rival.dir.x, y: rival.y - rival.dir.y };
      rival.trail.push({ x: nx, y: ny });
      if (rival.trail.length > 22) eliminateRival(rival, "self");
    }
  }

  function eliminateRival(rival, reason) {
    rival.alive = false;
    rival.trail.length = 0;
    rival.origin = null;
    rival.respawnAt = tickCount + 42;
    updateHud();
  }

  function respawnRival(rival) {
    const spots = [
      { x: 7, y: 7 },
      { x: 40, y: 7 },
      { x: 7, y: 24 },
      { x: 40, y: 24 }
    ];
    const occupied = new Set();
    for (const other of rivals) {
      if (other !== rival && other.alive) occupied.add(indexOf(other.x, other.y));
    }
    const available = spots.filter((point, i) => {
      const patchCenter = point;
      return !occupied.has(indexOf(patchCenter.x, patchCenter.y)) &&
        land[indexOf(patchCenter.x, patchCenter.y)] !== 1;
    });
    const point = available.length ? randomItem(available) : randomItem(spots);
    rival.x = point.x;
    rival.y = point.y;
    rival.dir = randomItem(DIR_LIST);
    rival.nextDir = rival.dir;
    rival.trail = [];
    rival.alive = true;
    rival.origin = null;
    rival.targetLength = 7 + Math.floor(Math.random() * 6);
    paintPatch(point.x, point.y, 6, rival.id);
    updateHud();
  }

  function drawGrid() {
    ctx.fillStyle = "#121d34";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const owner = land[indexOf(x, y)];
        const px = x * CELL;
        const py = y * CELL;

        if (owner === 0) {
          ctx.fillStyle = "#192740";
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          ctx.fillStyle = "rgba(139,163,201,.045)";
          ctx.fillRect(px + CELL / 2 - 0.5, py + CELL / 2 - 0.5, 1, 1);
        } else {
          ctx.globalAlpha = owner === 1 ? 0.92 : 0.78;
          ctx.fillStyle = COLORS[owner];
          ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
          ctx.globalAlpha = 1;
          ctx.fillStyle = "rgba(255,255,255,.09)";
          ctx.fillRect(px + 2, py + 2, CELL - 4, 2);
        }
      }
    }

    ctx.strokeStyle = "rgba(151,177,219,.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= COLS; x += 1) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, ROWS * CELL);
    }
    for (let y = 0; y <= ROWS; y += 1) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(COLS * CELL, y * CELL + 0.5);
    }
    ctx.stroke();
  }

  function drawTrail(entity) {
    if (!entity.alive || entity.trail.length === 0) return;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = GLOW[entity.id];
    ctx.lineWidth = CELL * 0.46;
    ctx.shadowColor = COLORS[entity.id];
    ctx.shadowBlur = entity.id === 1 ? 15 : 8;
    ctx.beginPath();
    const first = entity.trail[0];
    ctx.moveTo(first.x * CELL + CELL / 2, first.y * CELL + CELL / 2);
    for (let i = 1; i < entity.trail.length; i += 1) {
      const point = entity.trail[i];
      ctx.lineTo(point.x * CELL + CELL / 2, point.y * CELL + CELL / 2);
    }
    ctx.lineTo(entity.x * CELL + CELL / 2, entity.y * CELL + CELL / 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHead(entity) {
    if (!entity.alive) return;
    const cx = entity.x * CELL + CELL / 2;
    const cy = entity.y * CELL + CELL / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(entity.dir.y, entity.dir.x));
    ctx.shadowColor = COLORS[entity.id];
    ctx.shadowBlur = entity.id === 1 ? 15 : 9;
    ctx.fillStyle = entity.id === 1 ? "#f2ffd9" : "#ffffff";
    ctx.beginPath();
    ctx.roundRect(-8, -7, 16, 14, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS[entity.id];
    ctx.beginPath();
    ctx.arc(2, -2.5, 1.5, 0, Math.PI * 2);
    ctx.arc(2, 2.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMiniMap() {
    if (!miniCtx) return;
    const cellW = miniMap.width / COLS;
    const cellH = miniMap.height / ROWS;
    miniCtx.clearRect(0, 0, miniMap.width, miniMap.height);
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const owner = land[indexOf(x, y)];
        miniCtx.fillStyle = owner === 0 ? "#263650" : COLORS[owner];
        miniCtx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }
    for (const entity of [...rivals, player]) {
      if (!entity || !entity.alive) continue;
      miniCtx.fillStyle = GLOW[entity.id];
      for (const point of entity.trail) {
        miniCtx.fillRect(point.x * cellW, point.y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
      miniCtx.fillStyle = "#ffffff";
      miniCtx.fillRect(entity.x * cellW - 1, entity.y * cellH - 1, cellW + 2, cellH + 2);
    }
    miniCtx.strokeStyle = "rgba(255,255,255,.45)";
    miniCtx.lineWidth = 2;
    miniCtx.strokeRect(1, 1, miniMap.width - 2, miniMap.height - 2);
  }

  function draw() {
    drawGrid();
    for (const rival of rivals) drawTrail(rival);
    drawTrail(player);
    for (const rival of rivals) drawHead(rival);
    drawHead(player);
    drawMiniMap();
  }

  function playTone(frequency, duration, type) {
    if (!soundOn) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type || "sine";
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.075, audioContext.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration + 0.02);
    } catch (_) {
      // Audio is optional; gameplay never depends on it.
    }
  }

  function toggleSound() {
    soundOn = !soundOn;
    soundButton.setAttribute("aria-label", soundOn ? "Mute sound" : "Enable sound");
    soundIcon.innerHTML = soundOn
      ? '<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/>'
      : '<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m17 9 5 6m0-6-5 6"/>';
    if (soundOn) playTone(620, 0.07, "sine");
  }

  function handleKey(event) {
    const key = event.key.toLowerCase();
    const map = {
      arrowup: "up", w: "up",
      arrowright: "right", d: "right",
      arrowdown: "down", s: "down",
      arrowleft: "left", a: "left"
    };
    if (map[key]) {
      event.preventDefault();
      queueDirection(map[key]);
      return;
    }
    if (key === " " || key === "escape") {
      event.preventDefault();
      if (gameState === "running") pauseGame();
      else if (gameState === "paused") resumeGame();
    }
  }

  function handlePointerDown(event) {
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event) {
    if (!lastPointer) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) queueDirection(dx > 0 ? "right" : "left");
    else queueDirection(dy > 0 ? "down" : "up");
  }

  startButton.addEventListener("click", startGame);
  playAgainButton.addEventListener("click", startGame);
  restartButton.addEventListener("click", startGame);
  pauseButton.addEventListener("click", () => {
    if (gameState === "running") pauseGame();
    else if (gameState === "paused") resumeGame();
  });
  resumeButton.addEventListener("click", resumeGame);
  soundButton.addEventListener("click", toggleSound);
  document.addEventListener("keydown", handleKey);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", () => { lastPointer = null; });

  document.querySelectorAll(".mobile-controls button").forEach(button => {
    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      queueDirection(button.dataset.dir);
    });
  });

  document.querySelectorAll(".skin-swatch").forEach(button => {
    button.addEventListener("click", () => applySkin(button.dataset.skin));
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameState === "running") pauseGame();
  });

  ui.bestValue.innerHTML = best.toFixed(1) + "<span>%</span>";
  updateCareerHud();
  applySkin(selectedSkin);
  initializeWorld();
  setStatus("READY TO PLAY", false);

  // Keep the display crisp on high-density screens while preserving the 3:2 board.
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = COLS * CELL * pixelRatio;
  canvas.height = ROWS * CELL * pixelRatio;
  canvas.style.aspectRatio = "3 / 2";
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  draw();
})();