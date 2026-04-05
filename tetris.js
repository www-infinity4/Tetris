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

// Start!
initGame();
