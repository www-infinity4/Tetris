'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;
const BLOCK = 30; // px per cell

const COLORS = [
  null,
  '#00cfcf', // I  – cyan
  '#f5a623', // O  – orange/yellow
  '#a855f7', // T  – purple
  '#22c55e', // S  – green
  '#ef4444', // Z  – red
  '#3b82f6', // J  – blue
  '#fb923c', // L  – orange
];

// Tetromino shapes (4 rotations each stored as index offsets into a 4×4 grid)
const PIECES = [
  null,
  // I
  [
    [0, 1, 2, 3],
    [1, 5, 9, 13],
    [12, 13, 14, 15],
    [2, 6, 10, 14],
  ],
  // O
  [
    [0, 1, 4, 5],
    [0, 1, 4, 5],
    [0, 1, 4, 5],
    [0, 1, 4, 5],
  ],
  // T
  [
    [1, 4, 5, 6],
    [1, 5, 6, 9],
    [4, 5, 6, 9],
    [1, 4, 5, 9],
  ],
  // S
  [
    [1, 2, 4, 5],
    [1, 5, 6, 10],
    [5, 6, 8, 9],
    [0, 4, 5, 9],
  ],
  // Z
  [
    [0, 1, 5, 6],
    [2, 5, 6, 9],
    [4, 5, 9, 10],
    [1, 4, 5, 8],
  ],
  // J
  [
    [0, 4, 5, 6],
    [1, 2, 5, 9],
    [4, 5, 6, 10],
    [1, 5, 8, 9],
  ],
  // L
  [
    [2, 4, 5, 6],
    [1, 5, 9, 10],
    [4, 5, 6, 8],
    [0, 1, 5, 9],
  ],
];

const SCORES_PER_LINE = [0, 100, 300, 500, 800];
const LEVEL_UP_LINES = 10;

// ─── Music Engine ─────────────────────────────────────────────────────────────
// Note frequencies (Hz)
const NOTE_HZ = {
  C4: 261.63, E4: 329.63, G4: 392.00, 'G#4': 415.30,
  A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, 'D#5': 622.25, E5: 659.25,
};

const BPM = 132;
const BEAT_S = 60 / BPM; // seconds per quarter note

// Beethoven-inspired theme.
// Phrase A follows the user's motif: A C A C A BBBB [1/8]A [1/4]C [1/2]A  C BBBB
// Extended with a Für Elise bridge so it sounds unmistakably classical.
// Each entry: [note, duration_in_quarter_beats]  (0.5 = eighth, 1 = quarter, 2 = half)
const SONG = [
  // ── Phrase A ──────────────────────────────────────────────────────────────
  ['A4',1],['C5',1],['A4',1],['C5',1],['A4',1],
  ['B4',1],['B4',1],['B4',1],['B4',1],
  ['A4',.5],['C5',1],['A4',2],
  ['C5',1],['B4',1],['B4',1],['B4',1],['B4',1],
  // ── Phrase A (variation ending) ───────────────────────────────────────────
  ['A4',1],['C5',1],['A4',1],['C5',1],['A4',1],
  ['B4',1],['B4',1],['B4',1],['B4',1],
  ['A4',.5],['C5',1],['A4',2],
  ['E5',1],['D5',1],['C5',1],['B4',2],
  // ── Für Elise bridge ──────────────────────────────────────────────────────
  ['E5',.5],['D#5',.5],['E5',.5],['D#5',.5],
  ['E5',1],['B4',1],['D5',1],['C5',1],
  ['A4',2],['C4',1],['E4',1],['A4',1],
  ['B4',2],['E4',1],['G#4',1],['B4',1],
  ['C5',2],
  ['E5',.5],['D#5',.5],['E5',.5],['D#5',.5],
  ['E5',1],['B4',1],['D5',1],['C5',1],
  ['A4',2],['C4',1],['E4',1],['A4',1],
  ['B4',1],['C5',1],['A4',2],
  // ── Return to Phrase A ────────────────────────────────────────────────────
  ['A4',1],['C5',1],['A4',1],['C5',1],['A4',1],
  ['B4',1],['B4',1],['B4',1],['B4',1],
  ['A4',.5],['C5',1],['A4',2],
  ['C5',1],['B4',1],['B4',.5],['A4',2],
];

let audioCtx   = null;
let musicOn    = false;
let musicTimer = null;
let songIndex  = 0;
let nextNoteAt = 0;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function scheduleNote(hz, when, dur) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'square';
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.12, when + 0.01);
  gain.gain.setValueAtTime(0.12, when + dur * 0.82);
  gain.gain.linearRampToValueAtTime(0, when + dur);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

function scheduleSong() {
  if (!musicOn) return;
  const LOOK_AHEAD = 0.15; // seconds
  while (nextNoteAt < audioCtx.currentTime + LOOK_AHEAD) {
    const [note, beats] = SONG[songIndex];
    const hz = NOTE_HZ[note];
    if (hz) scheduleNote(hz, nextNoteAt, beats * BEAT_S);
    nextNoteAt += beats * BEAT_S;
    songIndex = (songIndex + 1) % SONG.length;
  }
  musicTimer = setTimeout(scheduleSong, 60);
}

function startMusic() {
  ensureAudio();
  musicOn   = true;
  songIndex = 0;
  nextNoteAt = audioCtx.currentTime + 0.05;
  scheduleSong();
}

function stopMusic() {
  musicOn = false;
  clearTimeout(musicTimer);
  musicTimer = null;
}

function toggleMusic() {
  if (musicOn) { stopMusic(); } else { startMusic(); }
  const btn = document.getElementById('music-btn');
  if (btn) btn.textContent = musicOn ? '♫ ON' : '♫ OFF';
}

// ─── DOM references ───────────────────────────────────────────────────────────
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

// ─── Game state ───────────────────────────────────────────────────────────────
let board, score, level, linesCleared;
let currentPiece, nextPiece;
let dropInterval, lastTime, animId;
let paused, gameOver;

// ─── Board helpers ────────────────────────────────────────────────────────────
function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// Convert a 4×4 index list into {row, col} cells given top-left position
function cells(type, rotation, row, col) {
  return PIECES[type][rotation].map((idx) => ({
    r: row + Math.floor(idx / 4),
    c: col + (idx % 4),
  }));
}

function isValid(type, rotation, row, col) {
  return cells(type, rotation, row, col).every(
    ({ r, c }) => r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === 0
  );
}

function placePiece() {
  cells(currentPiece.type, currentPiece.rotation, currentPiece.row, currentPiece.col).forEach(
    ({ r, c }) => {
      board[r][c] = currentPiece.type;
    }
  );
}

function clearLines() {
  let count = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every((cell) => cell !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      r++; // recheck same index
      count++;
    }
  }
  if (count > 0) {
    linesCleared += count;
    score += SCORES_PER_LINE[count] * level;
    level = Math.floor(linesCleared / LEVEL_UP_LINES) + 1;
    updateHUD();
  }
}

// ─── Piece factory ────────────────────────────────────────────────────────────
function randomType() {
  return Math.floor(Math.random() * 7) + 1;
}

function spawnPiece(type) {
  return { type, rotation: 0, row: 0, col: 3 };
}

// ─── Drawing ──────────────────────────────────────────────────────────────────
function drawBlock(context, c, r, colorIdx, blockSize) {
  const x = c * blockSize;
  const y = r * blockSize;
  const color = COLORS[colorIdx];

  context.fillStyle = color;
  context.fillRect(x + 1, y + 1, blockSize - 2, blockSize - 2);

  // Highlight
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(x + 1, y + 1, blockSize - 2, 4);
  context.fillRect(x + 1, y + 1, 4, blockSize - 2);

  // Shadow
  context.fillStyle = 'rgba(0,0,0,0.25)';
  context.fillRect(x + 1, y + blockSize - 5, blockSize - 2, 4);
  context.fillRect(x + blockSize - 5, y + 1, 4, blockSize - 2);
}

function drawGrid(context, cols, rows, blockSize) {
  context.strokeStyle = 'rgba(255,255,255,0.04)';
  context.lineWidth = 0.5;
  for (let r = 0; r <= rows; r++) {
    context.beginPath();
    context.moveTo(0, r * blockSize);
    context.lineTo(cols * blockSize, r * blockSize);
    context.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    context.beginPath();
    context.moveTo(c * blockSize, 0);
    context.lineTo(c * blockSize, rows * blockSize);
    context.stroke();
  }
}

function drawGhostPiece() {
  let ghostRow = currentPiece.row;
  while (isValid(currentPiece.type, currentPiece.rotation, ghostRow + 1, currentPiece.col)) {
    ghostRow++;
  }
  if (ghostRow === currentPiece.row) return;

  ctx.globalAlpha = 0.2;
  cells(currentPiece.type, currentPiece.rotation, ghostRow, currentPiece.col).forEach(({ r, c }) => {
    drawBlock(ctx, c, r, currentPiece.type, BLOCK);
  });
  ctx.globalAlpha = 1;
}

function render() {
  // Clear board canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, COLS, ROWS, BLOCK);

  // Draw board
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawBlock(ctx, c, r, board[r][c], BLOCK);
    }
  }

  // Draw ghost
  if (!gameOver && !paused) drawGhostPiece();

  // Draw current piece
  if (currentPiece && !gameOver) {
    cells(currentPiece.type, currentPiece.rotation, currentPiece.row, currentPiece.col).forEach(
      ({ r, c }) => drawBlock(ctx, c, r, currentPiece.type, BLOCK)
    );
  }

  // Draw next piece preview
  const NEXT_BLOCK = 24;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const previewCells = cells(nextPiece.type, 0, 0, 0);
  const minR = Math.min(...previewCells.map((p) => p.r));
  const minC = Math.min(...previewCells.map((p) => p.c));
  const maxR = Math.max(...previewCells.map((p) => p.r));
  const maxC = Math.max(...previewCells.map((p) => p.c));
  const offsetC = Math.floor((nextCanvas.width / NEXT_BLOCK - (maxC - minC + 1)) / 2) - minC;
  const offsetR = Math.floor((nextCanvas.height / NEXT_BLOCK - (maxR - minR + 1)) / 2) - minR;
  previewCells.forEach(({ r, c }) => {
    drawBlock(nextCtx, c + offsetC, r + offsetR, nextPiece.type, NEXT_BLOCK);
  });
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function updateHUD() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  linesEl.textContent = linesCleared;
}

// ─── Game loop ────────────────────────────────────────────────────────────────
function getDropDelay() {
  return Math.max(100, 800 - (level - 1) * 70);
}

function drop() {
  if (isValid(currentPiece.type, currentPiece.rotation, currentPiece.row + 1, currentPiece.col)) {
    currentPiece.row++;
  } else {
    placePiece();
    clearLines();
    currentPiece = nextPiece;
    nextPiece = spawnPiece(randomType());
    if (!isValid(currentPiece.type, currentPiece.rotation, currentPiece.row, currentPiece.col)) {
      endGame();
      return;
    }
  }
}

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = timestamp - lastTime;

  if (delta >= getDropDelay()) {
    drop();
    lastTime = timestamp;
  }

  render();
  animId = requestAnimationFrame(gameLoop);
}

// ─── Controls ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (gameOver) return;

  if (e.key === 'p' || e.key === 'P') {
    togglePause();
    return;
  }

  if (paused) return;

  switch (e.key) {
    case 'ArrowLeft':
      if (isValid(currentPiece.type, currentPiece.rotation, currentPiece.row, currentPiece.col - 1)) {
        currentPiece.col--;
      }
      break;
    case 'ArrowRight':
      if (isValid(currentPiece.type, currentPiece.rotation, currentPiece.row, currentPiece.col + 1)) {
        currentPiece.col++;
      }
      break;
    case 'ArrowDown':
      drop();
      score += 1;
      updateHUD();
      lastTime = performance.now();
      break;
    case 'ArrowUp': {
      const newRot = (currentPiece.rotation + 1) % 4;
      // Try basic rotation, then wall kicks
      const kicks = [0, -1, 1, -2, 2];
      for (const kick of kicks) {
        if (isValid(currentPiece.type, newRot, currentPiece.row, currentPiece.col + kick)) {
          currentPiece.rotation = newRot;
          currentPiece.col += kick;
          break;
        }
      }
      break;
    }
    case ' ':
      e.preventDefault();
      while (isValid(currentPiece.type, currentPiece.rotation, currentPiece.row + 1, currentPiece.col)) {
        currentPiece.row++;
        score += 2;
      }
      drop();
      updateHUD();
      lastTime = performance.now();
      break;
  }
  render();
});

// ─── Pause / Game Over ────────────────────────────────────────────────────────
function togglePause() {
  paused = !paused;
  if (paused) {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSED';
    overlayScore.textContent = 'Press P to resume';
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
    lastTime = null;
    animId = requestAnimationFrame(gameLoop);
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Score: ${score}`;
  overlay.classList.remove('hidden');
}

// ─── Init / Restart ───────────────────────────────────────────────────────────
function initGame() {
  board = createBoard();
  score = 0;
  level = 1;
  linesCleared = 0;
  paused = false;
  gameOver = false;
  lastTime = null;

  currentPiece = spawnPiece(randomType());
  nextPiece = spawnPiece(randomType());

  updateHUD();
  overlay.classList.add('hidden');

  if (animId) cancelAnimationFrame(animId);
  animId = requestAnimationFrame(gameLoop);
}

restartBtn.addEventListener('click', initGame);

// ─── Mobile Joystick ─────────────────────────────────────────────────────────
let stickTouchId    = null;
let stickCX         = 0;
let stickCY         = 0;
let stickAction     = null;
let stickRepeatWait = null; // setTimeout for initial repeat delay
let stickRepeatTick = null; // setInterval for sustained repeat

const STICK_DEAD_PX  = 18;  // px dead-zone radius
const STICK_MAX_PX   = 44;  // px max knob travel
const REPEAT_WAIT_MS = 190; // ms before auto-repeat kicks in
const REPEAT_RATE_MS = 90;  // ms between repeated actions

function doGameAction(action) {
  if (gameOver || paused) return;
  switch (action) {
    case 'left':
      if (isValid(currentPiece.type, currentPiece.rotation, currentPiece.row, currentPiece.col - 1))
        currentPiece.col--;
      break;
    case 'right':
      if (isValid(currentPiece.type, currentPiece.rotation, currentPiece.row, currentPiece.col + 1))
        currentPiece.col++;
      break;
    case 'down':
      drop(); score += 1; updateHUD(); lastTime = performance.now();
      break;
    case 'rotate': {
      const nr = (currentPiece.rotation + 1) % 4;
      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
        if (isValid(currentPiece.type, nr, currentPiece.row, currentPiece.col + k)) {
          currentPiece.rotation = nr;
          currentPiece.col += k;
          break;
        }
      }
      break;
    }
    case 'hardDrop':
      while (isValid(currentPiece.type, currentPiece.rotation, currentPiece.row + 1, currentPiece.col)) {
        currentPiece.row++;
        score += 2;
      }
      drop(); updateHUD(); lastTime = performance.now();
      break;
  }
  render();
}

function clearStickRepeat() {
  clearTimeout(stickRepeatWait);
  clearInterval(stickRepeatTick);
  stickRepeatWait = null;
  stickRepeatTick = null;
}

function setStickAction(action) {
  if (action === stickAction) return;
  stickAction = action;
  clearStickRepeat();
  if (!action) return;

  if (action === 'rotate') {
    // Rotate fires once per gesture; no auto-repeat
    doGameAction('rotate');
    return;
  }

  doGameAction(action);
  stickRepeatWait = setTimeout(() => {
    stickRepeatWait = null;
    stickRepeatTick = setInterval(() => doGameAction(stickAction), REPEAT_RATE_MS);
  }, REPEAT_WAIT_MS);
}

function moveKnob(dx, dy) {
  const dist    = Math.hypot(dx, dy);
  const clamped = Math.min(dist, STICK_MAX_PX);
  const angle   = Math.atan2(dy, dx);
  const knob    = document.getElementById('joystick-knob');
  if (knob) {
    knob.style.transform =
      `translate(${Math.cos(angle) * clamped}px, ${Math.sin(angle) * clamped}px)`;
  }
}

function resetKnob() {
  const knob = document.getElementById('joystick-knob');
  if (knob) knob.style.transform = 'translate(0,0)';
}

function onStickStart(e) {
  e.preventDefault();
  if (stickTouchId !== null) return;
  const t = e.touches ? e.touches[0] : e;
  stickTouchId = e.touches ? t.identifier : 'mouse';
  const rect = document.getElementById('joystick-base').getBoundingClientRect();
  stickCX = rect.left + rect.width  / 2;
  stickCY = rect.top  + rect.height / 2;
  processStickPoint(t.clientX, t.clientY);
}

function onStickMove(e) {
  e.preventDefault();
  let t = null;
  if (e.touches) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === stickTouchId) { t = touch; break; }
    }
    if (!t) return;
  } else {
    if (stickTouchId !== 'mouse') return;
    t = e;
  }
  processStickPoint(t.clientX, t.clientY);
}

function onStickEnd(e) {
  e.preventDefault();
  if (e.touches) {
    let found = false;
    for (const touch of e.changedTouches) {
      if (touch.identifier === stickTouchId) { found = true; break; }
    }
    if (!found) return;
  } else {
    if (stickTouchId !== 'mouse') return;
  }
  stickTouchId = null;
  clearStickRepeat();
  stickAction = null;
  resetKnob();
}

function processStickPoint(clientX, clientY) {
  const dx   = clientX - stickCX;
  const dy   = clientY - stickCY;
  const dist = Math.hypot(dx, dy);
  moveKnob(dx, dy);
  if (dist < STICK_DEAD_PX) {
    setStickAction(null);
    return;
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    setStickAction(dx > 0 ? 'right' : 'left');
  } else {
    setStickAction(dy > 0 ? 'down' : 'rotate');
  }
}

function initJoystick() {
  const base = document.getElementById('joystick-base');
  if (!base) return;

  // Touch events
  base.addEventListener('touchstart',  onStickStart, { passive: false });
  base.addEventListener('touchmove',   onStickMove,  { passive: false });
  base.addEventListener('touchend',    onStickEnd,   { passive: false });
  base.addEventListener('touchcancel', onStickEnd,   { passive: false });

  // Mouse events so the joystick is testable on desktop
  // Listeners are added on mousedown and removed on mouseup to avoid
  // unnecessary global mousemove processing.
  function onMouseMove(e) { onStickMove(e); }
  function onMouseUp(e) {
    onStickEnd(e);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }
  base.addEventListener('mousedown', (e) => {
    onStickStart(e);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  // Action buttons — work with both touch and click
  function addBtn(id, action) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); doGameAction(action); }, { passive: false });
    btn.addEventListener('click', () => doGameAction(action));
  }
  addBtn('btn-rotate', 'rotate');
  addBtn('btn-drop',   'hardDrop');

  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!gameOver) togglePause();
    }, { passive: false });
    pauseBtn.addEventListener('click', () => { if (!gameOver) togglePause(); });
  }

  // Music button
  const musicBtn = document.getElementById('music-btn');
  if (musicBtn) musicBtn.addEventListener('click', toggleMusic);
}

initJoystick();

// Start!
initGame();
