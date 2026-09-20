'use strict';
// 4-player (2v2) board: rendering, moves, premoves, timers, promotion, AI wiring.

// Unicode glyphs used to render pieces on the 4-player board.
const PIECE_GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

// Premove storage (declared early so clearAllPremoves is safe at init)
var premoves = { A: [], B: [], C: [], D: [] };
var premoveDraft = null;

let state = createInitialState();
  if (typeof clearAllPremoves === 'function') clearAllPremoves();
refreshAllKingDisplays(state);
let undoStack = [];
// Full position snapshots for the history viewer: index 0 = start position,
// index k = position after move k. Separate from undoStack (which is for
// undo/redo of the live game) - this is read-only browsing.
let positionHistory = [];
let viewIndex = null; // null = live game; a number = viewing positionHistory[viewIndex]

function displayState() {
  if (viewIndex !== null && positionHistory[viewIndex]) return positionHistory[viewIndex];
  return state;
}

function recordPositionSnapshot() {
  positionHistory.push(cloneState(state));
}

function jumpToMove(moveNumber) {
  if (moveNumber < 1 || moveNumber > state.moveHistory.length) return;
  if (!positionHistory[moveNumber]) {
    showMessage(((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'This position is not in memory.':'موقعیت این حرکت در حافظه نیست.'), 'error');
    return;
  }
  stopPendingAI(); // pause - don't let the AI move while the user is browsing history
  viewIndex = moveNumber;
  showMessage(`مشاهدهٔ حرکت ${moveNumber} — بازی متوقف شد. برای ادامه «بازگشت به وضعیت فعلی» را بزنید.`, 'info');
  render();
}

function returnToLive() {
  viewIndex = null;
  showMessage('بازگشت به وضعیت فعلی — بازی از اینجا ادامه می‌یابد.', 'info');
  render();
  maybeTriggerAI();
}

// Per-player control mode: 'human' (default) or 'ai'. Purely a UI-session
// setting, not part of the game state itself (not affected by undo/restart).
const PLAYER_MODE = { A: 'human', B: 'human', C: 'human', D: 'human' };
let aiThinking = false;
const TURN_TIME_LIMIT = 30; // seconds
let turnTimerInterval = null;
let turnTimeLeft = TURN_TIME_LIMIT;
let timerTurnToken = null; // identifies which turn the running timer belongs to
let aiTimer = null;

const el = {
  board: document.getElementById('chessBoard'),
  turnIndicator: document.getElementById('turnIndicator'),
  messageBar: document.getElementById('messageBar'),
  gameOverBanner: document.getElementById('gameOverBanner'),
  moveList: document.getElementById('moveList'),
  eventList: document.getElementById('eventList'),
  debugInfo: document.getElementById('debugInfo'),
  restartBtn: document.getElementById('restartBtn'),
  undoBtn: document.getElementById('undoBtn'),
  aiDifficulty: document.getElementById('aiDifficulty'),
  aiEngineStatus: document.getElementById('aiEngineStatus'),
  viewBanner: document.getElementById('viewBanner'),
  turnTimer: document.getElementById('turnTimer'),
  clockBlue: document.getElementById('clockBlue'),
  clockRed: document.getElementById('clockRed'),
  viewBannerText: document.getElementById('viewBannerText'),
  returnLiveBtn: document.getElementById('returnLiveBtn'),
  kingStatus: { A: document.getElementById('kingStatusA'), B: document.getElementById('kingStatusB'),
                C: document.getElementById('kingStatusC'), D: document.getElementById('kingStatusD') },
  badge: { A: document.getElementById('badge-A'), B: document.getElementById('badge-B'),
           C: document.getElementById('badge-C'), D: document.getElementById('badge-D') },
  modeIndicator: { A: document.getElementById('modeIndicator-A'), B: document.getElementById('modeIndicator-B'),
                    C: document.getElementById('modeIndicator-C'), D: document.getElementById('modeIndicator-D') },
  takeoverBtn: { A: document.getElementById('takeover-A'), B: document.getElementById('takeover-B'),
                 C: document.getElementById('takeover-C'), D: document.getElementById('takeover-D') },
  muteBtn: document.getElementById('muteBtn'),
};

function currentAIDepth() {
  return parseInt(el.aiDifficulty.value, 10) || 2;
}

function showMessage(text, kind) {
  el.messageBar.textContent = text;
  el.messageBar.className = 'message-bar ' + (kind || 'info');
}

function buildCoordLabels4p() {
  const ranks = document.getElementById('ranks4p');
  const files = document.getElementById('files4p');
  if (ranks) {
    ranks.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      const d = document.createElement('span');
      d.textContent = String(ROWS - r); // 8..1
      ranks.appendChild(d);
    }
  }
  if (files) {
    files.innerHTML = '';
    for (let c = 0; c < COLS; c++) {
      const d = document.createElement('span');
      d.textContent = FILES[c]; // a..p
      files.appendChild(d);
    }
  }
}


let drag4 = null;
let suppressNextClick4 = false;

function clearDrag4(){
  if (drag4 && drag4.ghost && drag4.ghost.parentNode) {
    drag4.ghost.parentNode.removeChild(drag4.ghost);
  }
  document.querySelectorAll('#chessBoard .cell.dragging-source, #chessBoard .cell.drag-over-legal').forEach(el => {
    el.classList.remove('dragging-source', 'drag-over-legal');
  });
  drag4 = null;
}

function cell4FromPoint(x, y){
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('#chessBoard .cell') : null;
  if (!cell) return null;
  return { r: +cell.dataset.row, c: +cell.dataset.col, el: cell };
}

function buildBoardCells() {
  el.board.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
      if (c === 8) cell.classList.add('col-boundary');
      cell.dataset.row = r;
      cell.dataset.col = c;

      cell.addEventListener('click', () => {
        if (suppressNextClick4) {
          suppressNextClick4 = false;
          return;
        }
        handleCellClick(r, c);
      });

      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        cell.classList.add('ping-highlight');
        AudioFX.ping();
        setTimeout(() => cell.classList.remove('ping-highlight'), 1500);
      });

      // Drag support — activates only after ~8px movement so clicks stay clean
      cell.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        if (state.gameOver || aiThinking || viewIndex !== null) return;
        if (PLAYER_MODE[PLAYERS[state.currentPlayerIndex]] === 'ai') return;
        const player = PLAYERS[state.currentPlayerIndex];
        const piece = state.board[r][c];
        if (!piece || piece.player !== player) return;
        drag4 = {
          fromR: r, fromC: c, pointerId: e.pointerId,
          startX: e.clientX, startY: e.clientY,
          dragged: false, ghost: null
        };
        try { cell.setPointerCapture(e.pointerId); } catch (_) {}
      });

      cell.addEventListener('pointermove', (e) => {
        if (!drag4 || drag4.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag4.startX;
        const dy = e.clientY - drag4.startY;
        if (!drag4.dragged) {
          if (dx * dx + dy * dy < 64) return;
          drag4.dragged = true;
          const player = PLAYERS[state.currentPlayerIndex];
          state.selected = { row: drag4.fromR, col: drag4.fromC };
          state.legalMovesForSelected = generateLegalMovesForPiece(state, player, drag4.fromR, drag4.fromC);
          render();
          const piece = state.board[drag4.fromR][drag4.fromC];
          const ghost = document.createElement('div');
          ghost.className = 'piece-ghost piece player-' + (piece ? piece.player : 'A');
          const src = el.board.querySelector(
            '.cell[data-row="' + drag4.fromR + '"][data-col="' + drag4.fromC + '"] .piece'
          );
          ghost.textContent = src ? src.textContent : (piece ? PIECE_GLYPH[piece.type] : '');
          ghost.style.left = e.clientX + 'px';
          ghost.style.top = e.clientY + 'px';
          document.body.appendChild(ghost);
          drag4.ghost = ghost;
          const srcCell = el.board.querySelector(
            '.cell[data-row="' + drag4.fromR + '"][data-col="' + drag4.fromC + '"]'
          );
          if (srcCell) srcCell.classList.add('dragging-source');
        }
        if (drag4.ghost) {
          drag4.ghost.style.left = e.clientX + 'px';
          drag4.ghost.style.top = e.clientY + 'px';
        }
        document.querySelectorAll('#chessBoard .cell.drag-over-legal').forEach(el2 => {
          el2.classList.remove('drag-over-legal');
        });
        const hit = cell4FromPoint(e.clientX, e.clientY);
        if (
          hit &&
          state.legalMovesForSelected &&
          state.legalMovesForSelected.some(m => m.row === hit.r && m.col === hit.c)
        ) {
          hit.el.classList.add('drag-over-legal');
        }
      });

      cell.addEventListener('pointerup', (e) => {
        if (!drag4 || drag4.pointerId !== e.pointerId) return;
        const fromR = drag4.fromR, fromC = drag4.fromC;
        const wasDrag = drag4.dragged;
        const hit = cell4FromPoint(e.clientX, e.clientY);
        clearDrag4();
        if (wasDrag) {
          suppressNextClick4 = true;
          if (hit && !(hit.r === fromR && hit.c === fromC)) {
            state.selected = { row: fromR, col: fromC };
            state.legalMovesForSelected = generateLegalMovesForPiece(
              state, PLAYERS[state.currentPlayerIndex], fromR, fromC
            );
            handleCellClick(hit.r, hit.c);
          } else {
            render();
          }
        }
        // pure click: leave selection to the click handler
      });

      cell.addEventListener('pointercancel', () => {
        clearDrag4();
        suppressNextClick4 = false;
      });

      el.board.appendChild(cell);
    }
  }
  buildCoordLabels4p();
}

function cellEl(r, c) {
  return el.board.children[r * COLS + c];
}

function render() {
  const ds = displayState();
  const isViewing = viewIndex !== null;

  // board squares
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellNode = cellEl(r, c);
      cellNode.classList.remove('selected', 'legal-move', 'legal-capture', 'last-move', 'premove-from', 'premove-to', 'premove-legal', 'premove-legal-capture', 'in-check-4p');
      cellNode.innerHTML = '';

      const piece = ds.board[r][c];
      if (piece) {
        const span = document.createElement('span');
        span.className = `piece player-${piece.player}`;
        if (piece.type === 'K' && ds.kings[piece.player].status === 'checkmated') {
          span.classList.add('dead');
        }
        span.textContent = PIECE_GLYPH[piece.type];
        cellNode.appendChild(span);

        const label = document.createElement('span');
        label.className = `badge-letter player-${piece.player}`;
        label.textContent = piece.player;
        cellNode.appendChild(label);
      }

      if (ds.lastMove && (
        (ds.lastMove.from.row === r && ds.lastMove.from.col === c) ||
        (ds.lastMove.to.row === r && ds.lastMove.to.col === c)
      )) {
        cellNode.classList.add('last-move');
      }
    }
  }

  if (!isViewing && state.selected) {
    cellEl(state.selected.row, state.selected.col).classList.add('selected');
    for (const mv of state.legalMovesForSelected) {
      const c = cellEl(mv.row, mv.col);
      const occupied = !!state.board[mv.row][mv.col] || mv.enPassant;
      c.classList.add(occupied ? 'legal-capture' : 'legal-move');
    }
  }

  // Premove draft (selecting) + committed premoves
  if (!isViewing && typeof premoveDraft !== 'undefined' && premoveDraft) {
    cellEl(premoveDraft.from.row, premoveDraft.from.col).classList.add('premove-from');
    for (const mv of premoveDraft.legal) {
      const c = cellEl(mv.row, mv.col);
      const occupied = !!state.board[mv.row][mv.col] || mv.enPassant;
      c.classList.add(occupied ? 'premove-legal-capture' : 'premove-legal');
    }
  }
  if (!isViewing && typeof premoves !== 'undefined') {
    for (const p of PLAYERS) {
      const list = premoves[p];
      if (!list || !list.length) continue;
      for (let i = 0; i < list.length; i++) {
        const pm = list[i];
        try {
          cellEl(pm.from.row, pm.from.col).classList.add('premove-from');
          const dest = cellEl(pm.to.row, pm.to.col);
          dest.classList.add('premove-to');
          // Ghost piece preview on destination
          const fromPiece = state.board[pm.from.row] && state.board[pm.from.row][pm.from.col];
          if (fromPiece && !dest.querySelector('.premove-ghost')) {
            const g = document.createElement('span');
            g.className = 'piece premove-ghost player-' + fromPiece.player;
            g.textContent = PIECE_GLYPH[fromPiece.type];
            g.style.opacity = '0.45';
            g.style.pointerEvents = 'none';
            dest.appendChild(g);
          }
        } catch (_) {}
      }
    }
  }

  // Check highlight for living kings in check
  if (!isViewing) {
    for (const p of PLAYERS) {
      const k = ds.kings[p];
      if (k && k.status === 'check' && typeof k.row === 'number') {
        try { cellEl(k.row, k.col).classList.add('in-check-4p'); } catch (_) {}
      }
    }
  }

  // turn indicator
  const currentPlayer = PLAYERS[ds.currentPlayerIndex];
  const currentRole = ds.kings[currentPlayer].status === 'checkmated' ? 'GUARDIAN' : 'NORMAL';
  el.turnIndicator.textContent = isViewing
    ? `مشاهده حرکت ${viewIndex} / ${state.moveHistory.length}`
    : `${(typeof t==='function'?t('turnLabel'):'Turn')}: Player ${currentPlayer}` + (currentRole === 'GUARDIAN' ? ' · Guardian' : '') + (aiThinking ? ' · AI…' : '');

  // Premove status banner
  const pmEl = document.getElementById('premoveBanner');
  if (pmEl) {
    if (isViewing) pmEl.textContent = '';
    else {
      let t = '';
      if (typeof premoveDraft !== 'undefined' && premoveDraft) {
        t = (typeof appSettings!=='undefined'&&appSettings.lang==='en') ? ('Premove: pick destination (Player ' + premoveDraft.player + ')') : ('Premove: مقصد (Player ' + premoveDraft.player + ')');
      } else if (typeof premoves !== 'undefined') {
        const ps = PLAYERS.filter(p => premoves[p] && premoves[p].length);
        if (ps.length) t = 'Premove: ' + ps.map(p => p + '×' + premoves[p].length).join(' · ') + ' | لغو: کلیک روی مبدأ';
        else {
          const cur = PLAYERS[ds.currentPlayerIndex];
          const anyHumanWaiting = PLAYERS.some(p => PLAYER_MODE[p]==='human' && p !== cur);
          if (anyHumanWaiting || PLAYER_MODE[cur]==='ai')
            t = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Premove: when it is not your turn → your piece → destination (blue)':'Premove: وقتی نوبت شما نیست → مهره → مقصد (آبی)');
        }
      }
      pmEl.textContent = t;
    }
  }

  // player badges (turn highlight + king status + control mode)
  for (const p of PLAYERS) {
    const status = ds.kings[p].status; // 'alive' | 'check' | 'checkmated'
    const label = status.toUpperCase();
    el.kingStatus[p].textContent = label;
    el.kingStatus[p].className = 'king-status ' + status;
    el.badge[p].classList.toggle('turn', !isViewing && p === currentPlayer && !state.gameOver);
    el.badge[p].classList.toggle('guardian', ds.kings[p].status === 'checkmated');
    const isAI = PLAYER_MODE[p] === 'ai';
    if (el.modeIndicator[p]) {
      el.modeIndicator[p].textContent = 'AI';
      el.modeIndicator[p].classList.toggle('show', isAI);
    }
    if (el.takeoverBtn[p]) {
      el.takeoverBtn[p].classList.toggle('show', !isAI && !isViewing && !state.gameOver);
    }
  }

  el.board.classList.toggle('ai-turn', aiThinking);
  el.board.classList.toggle('viewing-history', isViewing);

  // move history - each entry is clickable to jump to that position
  el.moveList.innerHTML = '';
  state.moveHistory.forEach((m, i) => {
    const moveNumber = i + 1;
    const li = document.createElement('li');
    li.textContent = m;
    li.classList.toggle('active-view', viewIndex === moveNumber);
    li.addEventListener('click', () => jumpToMove(moveNumber));
    el.moveList.appendChild(li);
    if (viewIndex === moveNumber && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  });
  if (!isViewing) el.moveList.scrollTop = el.moveList.scrollHeight;

  // events (checkmate / skipped-turn / game-over log)
  el.eventList.innerHTML = '';
  (isViewing ? ds.log : state.log).slice(-8).forEach((m) => {
    const li = document.createElement('li');
    li.textContent = m;
    el.eventList.appendChild(li);
  });

  // debug panel — exact format requested, plus a couple of extras
  const lines = [];
  lines.push(isViewing ? `VIEWING after move ${viewIndex}` : `Current Player: ${currentPlayer}`);
  lines.push(`Blue King A: ${ds.kings.A.status}`);
  lines.push(`Blue King B: ${ds.kings.B.status}`);
  lines.push(`Red King C: ${ds.kings.C.status}`);
  lines.push(`Red King D: ${ds.kings.D.status}`);
  lines.push(`Roles: A:${ds.kings.A.status === 'checkmated' ? 'GUARDIAN' : 'NORMAL'}  B:${ds.kings.B.status === 'checkmated' ? 'GUARDIAN' : 'NORMAL'}  C:${ds.kings.C.status === 'checkmated' ? 'GUARDIAN' : 'NORMAL'}  D:${ds.kings.D.status === 'checkmated' ? 'GUARDIAN' : 'NORMAL'}`);
  lines.push('');
  lines.push(`Pieces  A:${countPieces(ds,'A')}  B:${countPieces(ds,'B')}  C:${countPieces(ds,'C')}  D:${countPieces(ds,'D')}`);
  lines.push(`Moves played: ${state.moveHistory.length}`);
  lines.push(`AI engine: ${aiWorkerAvailable ? 'Web Worker' : 'main thread (fallback, depth capped at 3)'}`);
  if (ds.gameOver) lines.push(`GAME OVER — winner: ${ds.winnerTeam ? ds.winnerTeam.toUpperCase() : 'draw'}`);
  el.debugInfo.textContent = lines.join('\n');

  el.undoBtn.disabled = undoStack.length === 0 || isViewing;

  if (el.viewBanner) {
    if (isViewing) {
      el.viewBanner.classList.add('show');
      el.viewBannerText.textContent = `⏸ بازی متوقف — مشاهدهٔ حرکت ${viewIndex} از ${state.moveHistory.length}`;
    } else {
      el.viewBanner.classList.remove('show');
    }
  }

  // game over banner
  if (!isViewing && state.gameOver) {
    el.gameOverBanner.classList.add('show');
    const en = (typeof appSettings !== 'undefined' && appSettings.lang === 'en');
    if (state.winnerTeam) {
      el.gameOverBanner.textContent = en
        ? ('Game over — Team ' + String(state.winnerTeam).toUpperCase() + ' wins')
        : ('پایان بازی — برد تیم ' + String(state.winnerTeam).toUpperCase());
    } else {
      el.gameOverBanner.textContent = en ? 'Game over — Draw' : 'پایان بازی — تساوی';
    }
    try { if (!window._4pEndSoundPlayed) { window._4pEndSoundPlayed = true; AudioFX.gameOver(); } } catch(_){}
  } else {
    el.gameOverBanner.classList.remove('show');
    window._4pEndSoundPlayed = false;
  }

  syncTurnTimer();
}


// ===== Premove (intent only; never mutates board until real turn) =====
// premoves / premoveDraft declared near top of script

function isLocalHumanSeat(player) {
  if (PLAYER_MODE[player] !== 'human') return false;
  if (ONLINE.role === 'guest' && ONLINE.ready) return player === ONLINE.mySeat;
  if (ONLINE.role === 'host' && ONLINE.ready) {
    const seat = ONLINE.seats[player];
    // host controls local seats; remote human seats are not local
    return !seat || seat === 'local';
  }
  return true;
}

function clearPremove(player) {
  if (typeof premoves === 'undefined' || !premoves) return;
  if (player) premoves[player] = [];
  else {
    for (const p of PLAYERS) premoves[p] = [];
  }
  if (premoveDraft && (!player || premoveDraft.player === player)) premoveDraft = null;
}

function clearAllPremoves() {
  if (typeof premoves === 'undefined' || !premoves) return;
  for (const p of PLAYERS) premoves[p] = [];
  if (typeof premoveDraft !== 'undefined') premoveDraft = null;
}

function premoveBannerText() {
  return ''; // explanations removed — control is in Settings
}

/** Premove UI click when it is NOT this player's real turn. */
function handlePremoveClick(r, c) {
  if (typeof isPremoveEnabled === 'function' && !isPremoveEnabled()) return false;
  if (state.gameOver || viewIndex !== null) return false;

  const piece = state.board[r][c];
  const current = PLAYERS[state.currentPlayerIndex];

  // Cancel: click from-square of any queued premove for that seat
  for (const p of PLAYERS) {
    const list = premoves[p];
    if (!list || !list.length || !isLocalHumanSeat(p)) continue;
    const idx = list.findIndex((pm) => pm.from.row === r && pm.from.col === c);
    if (idx >= 0) {
      list.splice(idx, 1);
      showMessage('یک premove لغو شد (' + list.length + ' باقی).', 'info');
      render();
      return true;
    }
  }

  // Start or retarget draft
  if (!premoveDraft) {
    if (!piece || !isLocalHumanSeat(piece.player)) return false;
    const seatIsRealTurn =
      piece.player === current &&
      PLAYER_MODE[current] === 'human' &&
      isLocalHumanSeat(current) &&
      !aiThinking;
    if (seatIsRealTurn) return false;

    const legal = generateLegalMovesForPiece(state, piece.player, r, c);
    if (!legal.length) {
      showMessage('این مهره حرکت مجازی برای premove ندارد.', 'info');
      return true;
    }
    premoveDraft = {
      player: piece.player,
      from: { row: r, col: c },
      legal: legal.map((m) => ({ row: m.row, col: m.col, promotionType: m.promotionType, enPassant: m.enPassant }))
    };
    showMessage(((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Premove: now click the destination (blue dots)':'Premove: حالا مقصد را بزنید'), 'success');
    render();
    return true;
  }

  // Cancel draft
  if (premoveDraft.from.row === r && premoveDraft.from.col === c) {
    premoveDraft = null;
    showMessage(((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Premove cancelled.':'Premove لغو شد.'), 'info');
    render();
    return true;
  }

  // Switch piece (same player)
  if (piece && piece.player === premoveDraft.player) {
    const legal = generateLegalMovesForPiece(state, piece.player, r, c);
    premoveDraft = { player: piece.player, from: { row: r, col: c }, legal };
    render();
    return true;
  }

  // Re-check legality on the CURRENT board (not only the snapshot at draft time)
  const player = premoveDraft.player;
  const from = premoveDraft.from;
  const legalNow = generateLegalMovesForPiece(state, player, from.row, from.col);
  const match = legalNow.find((m) => m.row === r && m.col === c);
  if (!match) {
    showMessage('این خانه الان برای premove مجاز نیست.', 'error');
    return true;
  }

  let promotionType = match.promotionType || null;
  const moving = state.board[from.row][from.col];
  if (moving && moving.type === 'P' && r === pawnPromotionRow(player) && !promotionType) {
    promotionType = 'Q';
  }

  if (!premoves[player]) premoves[player] = [];
  premoves[player].push({
    from: { row: from.row, col: from.col },
    to: { row: r, col: c },
    promotionType
  });
  premoveDraft = null;
  showMessage('✓ Premove #' + premoves[player].length + ' برای Player ' + player + ' در صف.', 'success');
  render();
  return true;
}

/**
 * When a human's real turn begins, try their queued premove via the SAME
 * generateLegalMovesForPiece / makeMove path as a normal move.
 */
function revalidatePremoves() {
  if (typeof premoves === 'undefined' || !premoves) return;
  for (const p of PLAYERS) {
    const list = premoves[p];
    if (!list || !list.length) continue;
    premoves[p] = list.filter((pm) => {
      const row = state.board[pm.from.row];
      const piece = row && row[pm.from.col];
      if (!piece || piece.player !== p) return false;
      const legal = generateLegalMovesForPiece(state, p, pm.from.row, pm.from.col);
      return legal.some((mv) => mv.row === pm.to.row && mv.col === pm.to.col);
    });
  }
}

function tryExecutePremove() {
  if (state.gameOver || aiThinking || viewIndex !== null) return false;
  const player = PLAYERS[state.currentPlayerIndex];
  if (PLAYER_MODE[player] !== 'human' || !isLocalHumanSeat(player)) return false;
  if (!premoves || !premoves[player] || !premoves[player].length) return false;

  if (ONLINE.role === 'guest' && ONLINE.ready && player !== ONLINE.mySeat) {
    premoves[player] = []; return false;
  }
  if (ONLINE.role === 'host' && ONLINE.ready) {
    const seat = ONLINE.seats[player];
    if (seat && seat !== 'local') { premoves[player] = []; return false; }
  }

  // Drop illegal leading premoves
  while (premoves[player].length) {
    const pm = premoves[player][0];
    const row = state.board[pm.from.row];
    const piece = row && row[pm.from.col];
    if (!piece || piece.player !== player) {
      premoves[player].shift();
      continue;
    }
    const legal = generateLegalMovesForPiece(state, player, pm.from.row, pm.from.col);
    const match = legal.find((mv) => mv.row === pm.to.row && mv.col === pm.to.col);
    if (!match) {
      premoves[player].shift();
      continue;
    }
    // Execute this one
    premoves[player].shift();
    let promotionType = pm.promotionType || match.promotionType || null;
    if (piece.type === 'P' && pm.to.row === pawnPromotionRow(player) && !promotionType) {
      promotionType = 'Q';
    }
    showMessage('⚡ Premove اجرا شد! (' + premoves[player].length + ' در صف)', 'success');
    finalizeHumanMove(
      { row: pm.from.row, col: pm.from.col },
      { row: pm.to.row, col: pm.to.col },
      player,
      promotionType
    );
    return true;
  }
  showMessage('صف premove خالی/غیرقانونی بود — خودتان حرکت کنید.', 'info');
  render();
  return false;
}


function handleCellClick(r, c) {
  if (viewIndex !== null) {
    showMessage('در حالت مشاهده هستید. اول «بازگشت به وضعیت فعلی» را بزنید.', 'info');
    return;
  }
  if (state.gameOver) {
    showMessage('بازی تمام شده است. برای شروع دوباره روی «شروع دوباره» بزنید.', 'info');
    return;
  }

  const current = PLAYERS[state.currentPlayerIndex];
  const pieceAt = state.board[r][c];
  const myRealTurn =
    !aiThinking &&
    PLAYER_MODE[current] === 'human' &&
    isLocalHumanSeat(current);

  // CRITICAL: on the active human's real turn, their own pieces = normal move only
  // (fixes 4-human 2v2 where clicks were swallowed as premove)
  if (myRealTurn && pieceAt && pieceAt.player === current) {
    premoveDraft = null; // abandon unfinished premove draft
  } else if (premoveDraft || !myRealTurn || (pieceAt && isLocalHumanSeat(pieceAt.player) && pieceAt.player !== current)) {
    if (handlePremoveClick(r, c)) return;
    if (!myRealTurn) {
      showMessage(((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Not your turn. Premove: piece → destination (captures allowed).':'نوبت شما نیست. Premove: مهره → مقصد'), 'info');
      return;
    }
  }

  if (!myRealTurn) {
    showMessage('نوبت شما نیست. برای premove مهرهٔ خودتان را بزنید.', 'info');
    return;
  }

  premoveDraft = null;

  const player = PLAYERS[state.currentPlayerIndex];
  const piece = state.board[r][c];

  if (!state.selected) {
    if (!piece) return;
    if (piece.player !== player) {
      if (handlePremoveClick(r, c)) return;
      showMessage(`این مهره متعلق به Player ${piece.player} است — الان نوبت Player ${player} است.`, 'error');
      return;
    }
    const moves = generateLegalMovesForPiece(state, player, r, c);
    state.selected = { row: r, col: c };
    state.legalMovesForSelected = moves;
    showMessage(moves.length
      ? 'خانه‌ی مقصد را از میان خانه‌های هایلایت‌شده انتخاب کنید.'
      : 'این مهره در حال حاضر حرکت مجازی ندارد. مهره‌ی دیگری انتخاب کنید.', 'info');
    render();
    return;
  }

  const sel = state.selected;

  if (sel.row === r && sel.col === c) {
    state.selected = null;
    state.legalMovesForSelected = [];
    showMessage('', 'info');
    render();
    return;
  }

  if (piece && piece.player === player) {
    const moves = generateLegalMovesForPiece(state, player, r, c);
    state.selected = { row: r, col: c };
    state.legalMovesForSelected = moves;
    showMessage(moves.length
      ? 'خانه‌ی مقصد را از میان خانه‌های هایلایت‌شده انتخاب کنید.'
      : 'این مهره در حال حاضر حرکت مجازی ندارد. مهره‌ی دیگری انتخاب کنید.', 'info');
    render();
    return;
  }

  const match = state.legalMovesForSelected.find((m) => m.row === r && m.col === c);
  if (!match) {
    showMessage('حرکت غیرمجاز است. فقط می‌توانید به یکی از خانه‌های هایلایت‌شده بروید.', 'error');
    return;
  }

  const movingPiece = state.board[sel.row][sel.col];
  const needsPromotionChoice = movingPiece.type === 'P' && r === pawnPromotionRow(player);

  if (needsPromotionChoice) {
    showPromotionModal(player, (chosenType) => {
      finalizeHumanMove(sel, { row: r, col: c }, player, chosenType);
    });
    return;
  }

  finalizeHumanMove(sel, { row: r, col: c }, player);
}

// Applies a human move (optionally with a chosen promotion piece) and runs
// every side-effect a move triggers: undo history, notation/log messaging,
// audio, position-history snapshot, re-render, and handing off to the AI.
// Shared by the direct path above and the promotion-modal callback.
function finalizeHumanMove(from, to, movingPlayer, promotionType) {
  undoStack.push(cloneState(state));
  const logLenBefore = state.log.length;
  const result = makeMove(state, from, to, promotionType);

  if (!result.ok) {
    undoStack.pop();
    showMessage('خطا در انجام حرکت.', 'error');
    render();
    return;
  }

  // Premove for the player who just moved is consumed/obsolete
  clearPremove(movingPlayer);
  playMoveSound();
  describeMoveOutcome(movingPlayer, logLenBefore);
  recordPositionSnapshot();
  if (typeof revalidatePremoves === 'function') revalidatePremoves();
  render();
  // Short pause so the human can register a premove on a stable board
  // before AI starts moving (premove is still validated at execution time).
  setTimeout(() => {
    try { maybeTriggerAI(); } catch (_) {}
  }, 900);
}

// --- Audio FX (Web Audio API, no external files) --------------------------
const AudioFX = {
  ctx: null,
  muted: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // unsupported environment - stay silent, never throw
    this.ctx = new AC();
  },
  playTone(freq, type, duration) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + duration);
    osc.stop(this.ctx.currentTime + duration);
  },
  move() { this.playTone(300, 'sine', 0.15); },
  capture() { this.playTone(150, 'square', 0.2); },
  check() { this.playTone(600, 'triangle', 0.4); },
  ping() { this.playTone(880, 'sine', 0.25); },
  gameOver() { this.playTone(200, 'sawtooth', 0.6); },
};

// Reads state.lastMove / current king statuses (already updated by makeMove
// by the time this is called) and plays the matching sound. Shared by both
// the human move path and the AI move path.
function playMoveSound() {
  if (state.gameOver) { AudioFX.gameOver(); return; }
  const nextPlayer = PLAYERS[state.currentPlayerIndex];
  if (state.kings[nextPlayer] && state.kings[nextPlayer].status === 'check') {
    AudioFX.check();
    return;
  }
  if (state.lastMove && state.lastMove.capturedPiece) { AudioFX.capture(); return; }
  AudioFX.move();
}

// --- Pawn promotion modal --------------------------------------------------
// Only ever shown for a human player's own move; the AI always defaults to
// Queen (see applyMoveToBoard). Not dismissable except by choosing, matching
// standard chess UI conventions - the destination square is already legal,
// only the promoted piece remains to be decided.
function showPromotionModal(player, onChoose) {
  const choices = [
    { type: 'Q', label: 'وزیر' },
    { type: 'R', label: 'رخ' },
    { type: 'B', label: 'فیل' },
    { type: 'N', label: 'اسب' },
  ];

  const overlay = document.createElement('div');
  overlay.className = 'promotion-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'promotion-modal';

  const title = document.createElement('h3');
  title.textContent = `Player ${player} — انتخاب مهره ارتقا`;
  modal.appendChild(title);

  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'promotion-options';
  choices.forEach(({ type, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `promotion-choice player-${player}`;
    const glyph = document.createElement('span');
    glyph.className = 'promotion-glyph';
    glyph.textContent = PIECE_GLYPH[type];
    const text = document.createElement('span');
    text.className = 'promotion-label';
    text.textContent = label;
    btn.appendChild(glyph);
    btn.appendChild(text);
    btn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      onChoose(type);
    });
    optionsWrap.appendChild(btn);
  });
  modal.appendChild(optionsWrap);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function describeMoveOutcome(movingPlayer, logLenBefore) {
  if (state.log.length > logLenBefore) {
    showMessage(state.log.slice(logLenBefore).join(' — '), state.gameOver ? 'success' : 'info');
  } else if (state.gameOver) {
    showMessage('بازی به پایان رسید.', 'success');
  } else {
    showMessage(`حرکت Player ${movingPlayer} انجام شد. نوبت Player ${PLAYERS[state.currentPlayerIndex]}.`, 'info');
  }
}

// --- Web Worker wiring for the AI search --------------------------------
// The search runs in ai-worker.js on a separate thread (it loads the shared
// engine.js via importScripts) so a slow position pauses a background
// thread instead of freezing the page.
// If Workers aren't available for some reason (or the page is opened via
// file:// where loading an external worker script is blocked by the
// browser), createAIWorker() returns null and maybeTriggerAI() falls back
// to a depth-capped synchronous call on the main thread instead.
let aiWorker = null;
let aiWorkerAvailable = false;
let aiRequestId = 0;
let pendingAIPlayer = null;
let pendingAILogLenBefore = 0;

function createAIWorker() {
  try {
    if (typeof Worker === 'undefined') return null;
    return new Worker('ai-worker.js');
  } catch (e) {
    console.warn('Web Worker unavailable, falling back to synchronous AI search on the main thread:', e);
    return null;
  }
}

function wireAIWorker() {
  aiWorkerAvailable = !!aiWorker;
  if (el.aiEngineStatus) {
    el.aiEngineStatus.textContent = aiWorkerAvailable
      ? 'موتور: Web Worker (صفحه هنگام فکر کردن قفل نمی‌شود)'
      : 'موتور: ترد اصلی (Worker در دسترس نیست - عمق حداکثر ۳)';
  }
  if (!aiWorker) return;
  aiWorker.onmessage = (e) => {
    const msg = e.data;
    if (msg.requestId !== aiRequestId) return; // stale response from a cancelled/older request
    if (msg.type === 'progress') {
      showMessage(`AI (Player ${pendingAIPlayer}) در حال فکر کردن... عمق ${msg.depth} (${msg.nodes} گره، ${msg.elapsed.toFixed(1)}ث)`, 'info');
      return;
    }
    if (msg.type === 'error') {
      console.error('AI worker error:', msg.message);
      completeAIMove(pendingAIPlayer, null, pendingAILogLenBefore);
      return;
    }
    if (msg.type === 'done') {
      completeAIMove(pendingAIPlayer, msg.move, pendingAILogLenBefore);
    }
  };
  aiWorker.onerror = (e) => {
    console.error('AI worker crashed:', e.message || e);
    aiWorkerAvailable = false;
    completeAIMove(pendingAIPlayer, null, pendingAILogLenBefore);
  };
}

aiWorker = createAIWorker();
wireAIWorker();

// Safety net: if a human turn is active and a premove is queued, try to run it
setInterval(function premoveWatchdog() {
  try {
    if (typeof state === 'undefined' || !state || state.gameOver) return;
    if (typeof aiThinking !== 'undefined' && aiThinking) return;
    if (typeof viewIndex !== 'undefined' && viewIndex !== null) return;
    const p = PLAYERS[state.currentPlayerIndex];
    if (PLAYER_MODE[p] !== 'human') return;
    if (!premoves || !premoves[p] || !premoves[p].length) return;
    tryExecutePremove();
  } catch (_) {}
}, 250);


// Runs the AI for the current player if that player is AI-controlled, then
// (via its own render + recursive call) keeps chaining through however many
// consecutive AI-controlled turns follow - e.g. all 4 players set to AI will
// play an entire game out on their own.
function maybeTriggerAI() {
  // Never play while the user is browsing move history
  if (state.gameOver || aiThinking || viewIndex !== null) return;
  const player = PLAYERS[state.currentPlayerIndex];
  if (PLAYER_MODE[player] !== 'ai') {
    // Human turn: attempt queued premove (validated with real rules)
    tryExecutePremove();
    return;
  }

  aiThinking = true;
  const depth = currentAIDepth();
  showMessage(`AI (Player ${player}) در حال فکر کردن...`, 'info');
  render();

  aiRequestId++;
  const myRequestId = aiRequestId;
  pendingAIPlayer = player;
  pendingAILogLenBefore = state.log.length;

  if (aiWorker && aiWorkerAvailable) {
    aiWorker.postMessage({ type: 'search', requestId: myRequestId, state: cloneState(state), depth });
  } else {
    // Synchronous fallback - this DOES block the UI, so cap the depth well
    // below what's safe in a worker (measured up to ~2.5s worst-case at 3).
    const safeDepth = Math.min(depth, 3);
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (viewIndex !== null) { aiThinking = false; render(); return; } // user opened history while "thinking"
      let result = null;
      try { result = findBestMove(state, safeDepth); }
      catch (e) { console.error('AI fallback search failed:', e); }
      completeAIMove(player, result ? result.move : null, pendingAILogLenBefore);
    }, 80);
  }
}

function completeAIMove(player, move, logLenBefore) {
  aiThinking = false;
  if (viewIndex !== null) { render(); return; } // user opened history while the worker was computing
  if (!move) {
    showMessage(`AI (Player ${player}) حرکتی پیدا نکرد — نوبت به‌صورت دستی رد شد.`, 'error');
    render();
    return;
  }
  undoStack.push(cloneState(state)); // AI moves must be undoable too, same as human moves
  makeMove(state, move.from, move.to);
  playMoveSound();
  recordPositionSnapshot();
  describeMoveOutcome(player, logLenBefore);
  if (typeof revalidatePremoves === 'function') revalidatePremoves();
  render();
  maybeTriggerAI();
}

function stopPendingAI() {
  if (aiTimer !== null) { clearTimeout(aiTimer); aiTimer = null; }
  aiThinking = false;
  aiRequestId++; // invalidate any in-flight worker response
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = createAIWorker();
    wireAIWorker();
  }
}

// --- Turn timer -----------------------------------------------------------
// Runs only during a human player's active turn (AI moves finish in well
// under the limit now, and the timer would just be a distracting, always-
// resetting distraction during their thinking / while browsing history).
function stopTurnTimer() {
  if (turnTimerInterval !== null) { clearInterval(turnTimerInterval); turnTimerInterval = null; }
  timerTurnToken = null;
  if (el.turnTimer) { el.turnTimer.textContent = ''; el.turnTimer.className = 'turn-timer'; }
}

function updateTurnTimerDisplay() {
  if (!el.turnTimer) return;
  el.turnTimer.textContent = `⏱ ${turnTimeLeft}s`;
  el.turnTimer.className = 'turn-timer' + (turnTimeLeft <= 5 ? ' critical' : turnTimeLeft <= 10 ? ' warn' : '');
}

function startTurnTimer(token) {
  if (turnTimerInterval !== null) clearInterval(turnTimerInterval);
  timerTurnToken = token;
  turnTimeLeft = TURN_TIME_LIMIT;
  updateTurnTimerDisplay();
  turnTimerInterval = setInterval(() => {
    turnTimeLeft--;
    if (turnTimeLeft <= 0) {
      stopTurnTimer();
      forceSkipTurn();
      return;
    }
    updateTurnTimerDisplay();
  }, 1000);
}

// Keeps the timer in sync with whatever render() currently displays: running
// only for a live, human-controlled, non-game-over turn; stopped otherwise.
// Uses a "token" (player + move count) so it only restarts on a genuinely
// new turn, not on every render() call triggered by selecting a piece.
function syncTurnTimer() {
  const isViewing = viewIndex !== null;
  const player = PLAYERS[state.currentPlayerIndex];
  const shouldRun = !isViewing && !state.gameOver && !aiThinking && PLAYER_MODE[player] !== 'ai';
  if (!shouldRun) { stopTurnTimer(); return; }
  const token = player + ':' + state.moveHistory.length;
  if (token !== timerTurnToken) {
    startTurnTimer(token);
    // New human turn — try queued premove once
    if (typeof tryExecutePremove === 'function') {
      setTimeout(() => { try { tryExecutePremove(); } catch(_){} }, 0);
    }
  }
}

// Called when a human player's turn timer reaches zero: their turn is
// forfeited (no move made) and play passes to the next player, reusing the
// same rotation/checkmate-skip logic as a normal move.
function forceSkipTurn() {
  if (state.gameOver || viewIndex !== null) return;
  const player = PLAYERS[state.currentPlayerIndex];
  if (PLAYER_MODE[player] === 'ai') return; // shouldn't happen (timer doesn't run for AI turns), but be safe
  undoStack.push(cloneState(state));
  state.selected = null;
  state.legalMovesForSelected = [];
  state.log.push(`Player ${player} timed out — turn skipped.`);
  advanceTurn(state);
  // Deliberately NOT calling recordPositionSnapshot(): a timeout skip adds
  // no entry to moveHistory, so positionHistory (indexed 1:1 against it)
  // must not grow here either, or every later jumpToMove(n) would point at
  // the wrong position for the rest of the game.
  showMessage(`⏱ زمان Player ${player} تمام شد — نوبت رد شد.`, 'error');
  render();
  maybeTriggerAI();
}

function restartGame() {
  if (state.moveHistory.length > 0) {
    const ok = window.confirm('بازی فعلی از ابتدا شروع می‌شود و پیشرفت فعلی از بین می‌رود. ادامه می‌دهید؟');
    if (!ok) return;
  }
  stopPendingAI();
  stopMatchClock();
  state = createInitialState();
  if (typeof clearAllPremoves === 'function') clearAllPremoves();
  refreshAllKingDisplays(state);
  undoStack = [];
  viewIndex = null;
  positionHistory = [cloneState(state)]; // index 0 = start
  teamTimeLeft = selectedTimeControlMinutes > 0
    ? { blue: selectedTimeControlMinutes * 60, red: selectedTimeControlMinutes * 60 }
    : { blue: null, red: null };
  updateClockDisplay();
  showMessage((typeof t==='function'?t('gameStartedTurn'):'New game started. Turn:') + ' Player A', 'info');
  render();
  maybeTriggerAI();
  startMatchClock();
}

function undoMove() {
  if (undoStack.length === 0) {
    showMessage('حرکتی برای Undo وجود ندارد.', 'error');
    return;
  }
  stopPendingAI();
  const moveCountBefore = state.moveHistory.length;
  state = undoStack.pop();
  state.selected = null;
  state.legalMovesForSelected = [];
  viewIndex = null;
  // Only pop positionHistory if a real move is being undone (moveHistory
  // got shorter). Undoing a timeout-skip leaves moveHistory unchanged,
  // since the skip never added an entry to it - and never pushed a
  // matching positionHistory entry either, so there's nothing to pop.
  if (state.moveHistory.length < moveCountBefore && positionHistory.length > 1) {
    positionHistory.pop();
  }
  // Deliberately NOT calling maybeTriggerAI() here: the AI is deterministic,
  // so if the undone move belonged to an AI player, auto-resuming would just
  // recompute and replay the exact same move, making Undo a no-op. The game
  // stays paused on this position; it resumes naturally as soon as a human
  // player moves (or the player badge is toggled), which chains forward
  // through any following AI turns as usual.
  const nowPlayer = PLAYERS[state.currentPlayerIndex];
  showMessage(PLAYER_MODE[nowPlayer] === 'ai'
    ? `آخرین حرکت برگردانده شد. نوبت Player ${nowPlayer} (AI) است — برای ادامه، او را موقتاً Human کنید یا دوباره Undo بزنید.`
    : 'آخرین حرکت به عقب برگردانده شد.', 'info');
  render();
}

el.restartBtn.addEventListener('click', restartGame);
el.undoBtn.addEventListener('click', undoMove);
// Note: the in-game "Human/AI" toggle per player was removed - player
// control mode is now chosen once, before the game starts, on the "بازی با
// ربات" setup screen (see startNewGameFromSetup() and the .setup-player-row
// segmented-button wiring above).

buildBoardCells();
if (el.returnLiveBtn) el.returnLiveBtn.addEventListener('click', returnToLive);

/* ==========================================================================
   Home / Setup / navigation
   ========================================================================== */
let _viewNavSilent = false;
function showView(name, opts) {
  opts = opts || {};
  const el = document.getElementById(name);
  if (!el) return;
  document.querySelectorAll('.view').forEach((v) => { v.style.display = 'none'; });
  if (name === 'gameView' || name === 'game1v1View') el.style.display = 'flex';
  else el.style.display = 'block';

  try { if (typeof applyLanguage === 'function') applyLanguage(appSettings && appSettings.lang); } catch (_) {}
  if (name === 'homeView') {
    try {
      account = loadAccount();
      renderAccountCard();
    } catch (_) {}
    try { c1RenderHomeRecent(); } catch (_) {}
  }
  if (name === 'botsHubView') {
    try { c1RenderBotGrid(); } catch (_) {}
  }

  if (!opts.skipHistory && !_viewNavSilent) {
    try {
      const st = { view: name };
      if (history.state && history.state.view === name) {
        history.replaceState(st, '', '#' + name);
      } else {
        history.pushState(st, '', '#' + name);
      }
    } catch (_) {}
  }
}

(function wireBrowserBack(){
  // Initial state
  try {
    const hash = (location.hash || '').replace(/^#/, '');
    const initial = (hash && document.getElementById(hash)) ? hash : 'homeView';
    history.replaceState({ view: initial }, '', '#' + initial);
  } catch (_) {}

  window.addEventListener('popstate', (e) => {
    const view = (e.state && e.state.view) || 'homeView';
    if (!document.getElementById(view)) {
      showView('homeView', { skipHistory: true });
      return;
    }
    // Leaving a live game: soft confirm only when going to home from game
    showView(view, { skipHistory: true });
  });
})();

let selectedTimeControlMinutes = 10; // matches the pre-selected setup button
let teamTimeLeft = { blue: null, red: null };
let matchClockInterval = null;

function formatClock(seconds) {
  if (seconds === null || seconds === undefined) return '∞';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function clockWarnClass(seconds) {
  if (seconds === null || seconds === undefined) return '';
  if (seconds <= 30) return ' critical';
  if (seconds <= 60) return ' warn';
  return '';
}

function updateClockDisplay() {
  if (el.clockBlue) {
    el.clockBlue.textContent = formatClock(teamTimeLeft.blue);
    el.clockBlue.className = 'team-clock' + clockWarnClass(teamTimeLeft.blue);
  }
  if (el.clockRed) {
    el.clockRed.textContent = formatClock(teamTimeLeft.red);
    el.clockRed.className = 'team-clock' + clockWarnClass(teamTimeLeft.red);
  }
}

function stopMatchClock() {
  if (matchClockInterval !== null) { clearInterval(matchClockInterval); matchClockInterval = null; }
}

// Ticks once per second, decrementing whichever TEAM currently has the move
// (both teammates share one clock, like a real team chess clock). Paused
// while game over or while browsing move history; resumes automatically
// once neither condition holds, since the interval itself is left running
// and just no-ops during a pause rather than being torn down and rebuilt.
function startMatchClock() {
  stopMatchClock();
  if (teamTimeLeft.blue === null && teamTimeLeft.red === null) return; // unlimited - nothing to tick
  matchClockInterval = setInterval(() => {
    if (state.gameOver || viewIndex !== null) return;
    const team = TEAM_OF[PLAYERS[state.currentPlayerIndex]];
    if (teamTimeLeft[team] === null || teamTimeLeft[team] === undefined) return;
    teamTimeLeft[team] = Math.max(0, teamTimeLeft[team] - 1);
    updateClockDisplay();
    if (teamTimeLeft[team] <= 0) flagFall(team);
  }, 1000);
}

function flagFall(team) {
  stopMatchClock();
  stopPendingAI();
  stopTurnTimer();
  state.gameOver = true;
  state.winnerTeam = team === 'blue' ? 'red' : 'blue';
  state.log.push(`Team ${team.toUpperCase()} ran out of time — Team ${state.winnerTeam.toUpperCase()} wins.`);
  showMessage(`⏱ زمان Team ${team.toUpperCase()} تمام شد — Team ${state.winnerTeam.toUpperCase()} برنده شد.`, 'error');
  AudioFX.gameOver();
  render();
}

// --- Setup screen wiring ---------------------------------------------------
document.querySelectorAll('.setup-player-row .segmented').forEach((seg) => {
  const player = seg.dataset.player;
  seg.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      PLAYER_MODE[player] = btn.dataset.value;
    });
  });
});

document.querySelectorAll('#timeControlPicker .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#timeControlPicker .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTimeControlMinutes = parseInt(btn.dataset.minutes, 10);
  });
});

document.getElementById('cardPlayBot').addEventListener('click', () => showView('botSetupView'));
(function wireNewHomeCards(){
  const bots = document.getElementById('cardPlayBotsHub');
  if (bots) bots.addEventListener('click', () => showView('botsHubView'));
  const gm = document.getElementById('cardGameModes');
  if (gm) gm.addEventListener('click', () => showView('gameModesView'));
  const backB = document.getElementById('backFromBotsHubBtn');
  if (backB) backB.addEventListener('click', () => showView('homeView'));
  const backG = document.getElementById('backFromGameModesBtn');
  if (backG) backG.addEventListener('click', () => showView('homeView'));
  const backV = document.getElementById('backFromVariantsBtn');
  if (backV) backV.addEventListener('click', () => showView('homeView'));
  const botsCard = document.getElementById('cardPlayBotsHub');
  if (botsCard) botsCard.addEventListener('click', () => {
    c1InitStockfish();
    c1RenderBotGrid();
    showView('botsHubView');
  });
  document.querySelectorAll('#botColorPicker .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#botColorPicker .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  const b4 = document.getElementById('botsHub4p');
  if (b4) b4.addEventListener('click', () => showView('botSetupView'));
  // game modes format picker
  document.querySelectorAll('#gmFormatPicker .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#gmFormatPicker .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  const cont = document.getElementById('gmContinueBtn');
  if (cont) cont.addEventListener('click', () => {
    const fmt = document.querySelector('#gmFormatPicker .seg-btn.active')?.dataset.format || '1v1';
    window._gmSelected = {
      format: fmt,
      mode: document.querySelector('input[name="gmMode"]:checked')?.value || 'standard'
    };
    if (fmt === '1v1') {
      c1InitStockfish();
      showView('setup1v1View');
    } else {
      showView('botSetupView');
    }
  });
})();
(function(){
  const b1 = document.getElementById('backFromSetupBtn');
  if (b1) b1.addEventListener('click', () => showView('homeView'));
  const b2 = document.getElementById('backFromGameBtn');
  if (b2) b2.addEventListener('click', () => {
    try { stopPendingAI(); } catch(_){}
    try { stopTurnTimer(); } catch(_){}
    try { stopMatchClock(); } catch(_){}
    showView('homeView');
  });
  const st = document.getElementById('startBotGameBtn');
  if (st) st.addEventListener('click', startNewGameFromSetup);
})();

// --- AI Takeover (rage-quit protection) -------------------------------
// One-way handover: once a human hands their player to AI mid-game, getting
// control back requires starting a new game from setup. This is
// deliberately NOT the old bidirectional in-game toggle (removed earlier at
// the user's own request, moved to the pre-game setup screen) - it's a
// narrower "this player stepped away, let the bot take over" safety net.
function triggerAITakeover(player) {
  if (PLAYER_MODE[player] === 'ai') return;
  const ok = window.confirm(`کنترل Player ${player} به AI واگذار شود؟ در همین بازی قابل بازگشت نیست.`);
  if (!ok) return;
  PLAYER_MODE[player] = 'ai';
  showMessage(`Player ${player} به کنترل AI واگذار شد.`, 'info');
  render();
  maybeTriggerAI();
}

for (const p of PLAYERS) {
  if (el.takeoverBtn[p]) {
    el.takeoverBtn[p].addEventListener('click', (e) => {
      e.stopPropagation();
      triggerAITakeover(p);
    });
  }
}

// --- Audio mute toggle ---------------------------------------------------
if (el.muteBtn) {
  el.muteBtn.addEventListener('click', () => {
    AudioFX.muted = !AudioFX.muted;
    el.muteBtn.textContent = AudioFX.muted ? '🔇' : '🔊';
    el.muteBtn.classList.toggle('muted', AudioFX.muted);
  });
}

function startNewGameFromSetup() {
  // Sync the (now hidden, in-game) difficulty select that currentAIDepth()
  // reads, so the rest of the AI code is untouched.
  el.aiDifficulty.value = document.getElementById('setupAiDifficulty').value;

  stopPendingAI();
  stopTurnTimer();
  stopMatchClock();

  state = createInitialState();
  if (typeof clearAllPremoves === 'function') clearAllPremoves();
  refreshAllKingDisplays(state);
  undoStack = [];
  viewIndex = null;
  positionHistory = [cloneState(state)];

  teamTimeLeft = selectedTimeControlMinutes > 0
    ? { blue: selectedTimeControlMinutes * 60, red: selectedTimeControlMinutes * 60 }
    : { blue: null, red: null };
  updateClockDisplay();

  showView('gameView');
  showMessage((typeof t==='function'?t('gameStartedTurn'):'New game started. Turn:') + ' Player A', 'info');
  render();
  maybeTriggerAI();
  startMatchClock();
}


