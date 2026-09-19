'use strict';
/* ==========================================================================
   4-Player Chess (16x8) — Core Game Logic + AI Search
   Pure state-transition + search functions, no DOM access.
   Loaded by index.html (main thread) AND by ai-worker.js (importScripts),
   so there is exactly ONE copy of this logic to maintain.
   ========================================================================== */

const ROWS = 8;
const COLS = 16;
const PLAYERS = ['A', 'B', 'C', 'D'];
const TEAM_OF = { A: 'blue', B: 'blue', C: 'red', D: 'red' };
const FILES = 'abcdefghijklmnop'.split('');

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function squareName(r, c) {
  return FILES[c] + (ROWS - r);
}

const BACK_LEFT = ['R', 'N', 'B', 'Q', 'B', 'N', 'R', 'K'];   // cols 0-7  (king on col 7)
const BACK_RIGHT = ['K', 'R', 'N', 'B', 'Q', 'B', 'N', 'R'];  // cols 8-15 (king on col 8)

function createInitialBoard() {
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let c = 0; c < 8; c++) board[0][c] = { type: BACK_LEFT[c], player: 'A' };
  for (let c = 8; c < 16; c++) board[0][c] = { type: BACK_RIGHT[c - 8], player: 'B' };
  for (let c = 0; c < 8; c++) board[1][c] = { type: 'P', player: 'A' };
  for (let c = 8; c < 16; c++) board[1][c] = { type: 'P', player: 'B' };

  for (let c = 0; c < 8; c++) board[7][c] = { type: BACK_LEFT[c], player: 'C' };
  for (let c = 8; c < 16; c++) board[7][c] = { type: BACK_RIGHT[c - 8], player: 'D' };
  for (let c = 0; c < 8; c++) board[6][c] = { type: 'P', player: 'C' };
  for (let c = 8; c < 16; c++) board[6][c] = { type: 'P', player: 'D' };
  return board;
}

function createInitialKings() {
  return {
    A: { row: 0, col: 7, status: 'alive' },
    B: { row: 0, col: 8, status: 'alive' },
    C: { row: 7, col: 7, status: 'alive' },
    D: { row: 7, col: 8, status: 'alive' },
  };
}

function posKey4(state){
  const parts = [String(state.currentPlayerIndex)];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = state.board[r][c];
      if (p) parts.push(r + ',' + c + p.type + p.player);
    }
  }
  for (const pl of PLAYERS) {
    const k = state.kings[pl];
    parts.push(pl + (k.status || '') + (k.status === 'checkmated' ? 'X' : (k.row + ',' + k.col)));
  }
  // ep targets matter for legal moves
  if (state.epTargets && state.epTargets.length) {
    for (const ep of state.epTargets) {
      parts.push('ep' + ep.captureRow + ',' + ep.captureCol + ep.team);
    }
  }
  return parts.join('|');
}
function countRep4(state, key){
  let n = 0;
  const arr = state.posKeys || [];
  for (let i = 0; i < arr.length; i++) if (arr[i] === key) n++;
  return n;
}
function createInitialState() {
  const s = {
    board: createInitialBoard(),
    kings: createInitialKings(),
    currentPlayerIndex: 0,
    lastMove: null,
    epTargets: [],
    moveHistory: [],
    log: [],
    gameOver: false,
    winnerTeam: null,
    selected: null,
    legalMovesForSelected: [],
    posKeys: [],
  };
  s.posKeys.push(posKey4(s));
  return s;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function pawnHomeRow(player) { return (TEAM_OF[player] === 'blue') ? 1 : 6; }
function pawnDir(player) { return (TEAM_OF[player] === 'blue') ? 1 : -1; }
function pawnPromotionRow(player) { return (TEAM_OF[player] === 'blue') ? ROWS - 1 : 0; }

const SLIDE_DIRS = {
  R: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  Q: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]],
};
const KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_OFFSETS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function getPawnAttackSquares(r, c, player) {
  const dir = pawnDir(player);
  const squares = [];
  for (const dc of [-1, 1]) {
    const nr = r + dir, nc = c + dc;
    if (inBounds(nr, nc)) squares.push({ row: nr, col: nc });
  }
  return squares;
}

function generatePseudoMoves(board, r, c, lastMove, epTargets) {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const myTeam = TEAM_OF[piece.player];

  const tryStep = (nr, nc) => {
    if (!inBounds(nr, nc)) return false;
    const target = board[nr][nc];
    if (!target) { moves.push({ row: nr, col: nc }); return true; }
    if (TEAM_OF[target.player] !== myTeam) moves.push({ row: nr, col: nc });
    return false;
  };

  switch (piece.type) {
    case 'N':
      for (const [dr, dc] of KNIGHT_OFFSETS) tryStep(r + dr, c + dc);
      break;
    case 'K':
      for (const [dr, dc] of KING_OFFSETS) tryStep(r + dr, c + dc);
      break;
    case 'R': case 'B': case 'Q':
      for (const [dr, dc] of SLIDE_DIRS[piece.type]) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          const canContinue = tryStep(nr, nc);
          if (!canContinue) break;
          nr += dr; nc += dc;
        }
      }
      break;
    case 'P': {
      const dir = pawnDir(piece.player);
      const oneR = r + dir;
      if (inBounds(oneR, c) && !board[oneR][c]) {
        moves.push({ row: oneR, col: c });
        const twoR = r + 2 * dir;
        if (r === pawnHomeRow(piece.player) && inBounds(twoR, c) && !board[twoR][c]) {
          moves.push({ row: twoR, col: c });
        }
      }
      for (const { row: nr, col: nc } of getPawnAttackSquares(r, c, piece.player)) {
        const target = board[nr][nc];
        if (target && TEAM_OF[target.player] !== myTeam) {
          moves.push({ row: nr, col: nc });
        } else if (!target && epTargets && epTargets.length) {
          for (const ep of epTargets) {
            if (ep.team === myTeam) continue;
            // Destination = square the enemy pawn passed through; our pawn on same rank, adjacent file
            if (ep.captureRow === nr && ep.captureCol === nc &&
                ep.pawnRow === r && Math.abs(ep.pawnCol - c) === 1) {
              moves.push({ row: nr, col: nc, enPassant: true });
              break;
            }
          }
        }
      }
      break;
    }
    default: break;
  }
  return moves;
}

function getAttackSquares(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  if (piece.type === 'P') return getPawnAttackSquares(r, c, piece.player);
  return generatePseudoMoves(board, r, c, null, null);
}

function isSquareAttacked(board, row, col, byTeam) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r][c];
      if (piece && TEAM_OF[piece.player] === byTeam) {
        const attacks = getAttackSquares(board, r, c);
        if (attacks.some((s) => s.row === row && s.col === col)) return true;
      }
    }
  }
  return false;
}

function isKingInCheck(board, kings, player) {
  const k = kings[player];
  if (!k || k.row === null || k.row === undefined) return false;
  const enemyTeam = TEAM_OF[player] === 'blue' ? 'red' : 'blue';
  return isSquareAttacked(board, k.row, k.col, enemyTeam);
}

function shouldProtectKing(kings, player) {
  const k = kings[player];
  return !!k && k.row !== null && k.row !== undefined && k.status !== 'checkmated';
}

function applyMoveToBoard(board, from, to, lastMove, promotionType, epTargets) {
  const piece = board[from.row][from.col];
  const info = { capturedPiece: null, isEnPassant: false, isPromotion: false };
  let capturedPiece = board[to.row][to.col];

  if (piece.type === 'P' && from.col !== to.col && !capturedPiece) {
    const list = (epTargets && epTargets.length) ? epTargets : (
      lastMove && lastMove.isDoubleStep ? [{
        captureRow: (lastMove.from.row + lastMove.to.row) >> 1,
        captureCol: lastMove.to.col,
        pawnRow: lastMove.to.row,
        pawnCol: lastMove.to.col,
        team: lastMove.piece ? TEAM_OF[lastMove.piece.player] : null,
      }] : []
    );
    for (const ep of list) {
      if (ep.captureRow === to.row && ep.captureCol === to.col &&
          ep.pawnRow === from.row && Math.abs(ep.pawnCol - from.col) === 1) {
        capturedPiece = board[ep.pawnRow][ep.pawnCol];
        if (capturedPiece) {
          board[ep.pawnRow][ep.pawnCol] = null;
          info.isEnPassant = true;
        }
        break;
      }
    }
  }
  info.capturedPiece = capturedPiece || null;

  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;

  if (piece.type === 'P' && to.row === pawnPromotionRow(piece.player)) {
    // promotionType is only ever supplied by a human choosing in the UI;
    // the AI search always uses the default (Queen) - considering under-
    // promotions at every leaf would blow up branching for essentially no
    // benefit, which is standard practice for engines at this scale.
    const validPromotionTypes = { Q: 1, R: 1, B: 1, N: 1 };
    const chosenType = validPromotionTypes[promotionType] ? promotionType : 'Q';
    board[to.row][to.col] = { type: chosenType, player: piece.player };
    info.isPromotion = true;
    info.promotedTo = chosenType;
  }
  return info;
}

function generateLegalMovesForPiece(state, player, r, c) {
  const { board, kings, lastMove, epTargets } = state;
  const piece = board[r][c];
  if (!piece || piece.player !== player) return [];
  const pseudo = generatePseudoMoves(board, r, c, lastMove, epTargets);

  // A king is never captured in this game. Checkmate is a state transition,
  // not a normal capture. This also prevents the UI/AI from ever presenting
  // the enemy king as a legal destination.
  const noKingCapture = pseudo.filter((mv) => {
    const target = board[mv.row][mv.col];
    return !(target && target.type === 'K');
  });

  // Once a player's own king is gone, that player's pieces are unrestricted
  // by personal king safety. Their role has changed to protecting the
  // teammate's surviving king and attacking the enemy.
  if (!shouldProtectKing(kings, player)) return noKingCapture;

  const enemyTeam = TEAM_OF[player] === 'blue' ? 'red' : 'blue';
  const legal = [];
  for (const mv of noKingCapture) {
    const simBoard = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    applyMoveToBoard(simBoard, { row: r, col: c }, { row: mv.row, col: mv.col }, lastMove, undefined, epTargets);
    const kingPos = piece.type === 'K'
      ? { row: mv.row, col: mv.col }
      : { row: kings[player].row, col: kings[player].col };
    if (!isSquareAttacked(simBoard, kingPos.row, kingPos.col, enemyTeam)) legal.push(mv);
  }
  return legal;
}

function generateAllLegalMoves(state, player) {
  const { board } = state;
  const all = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r][c];
      if (piece && piece.player === player) {
        const moves = generateLegalMovesForPiece(state, player, r, c);
        for (const mv of moves) all.push({ from: { row: r, col: c }, to: mv });
      }
    }
  }
  return all;
}

function countPieces(state, player) {
  let n = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (state.board[r][c] && state.board[r][c].player === player) n++;
  return n;
}

function refreshAllKingDisplays(state) {
  for (const p of PLAYERS) {
    const k = state.kings[p];
    if (k.status !== 'checkmated' && k.row !== null && k.row !== undefined) {
      k.status = isKingInCheck(state.board, state.kings, p) ? 'check' : 'alive';
    }
  }
}

function checkTeamDefeat(state, team) {
  const members = team === 'blue' ? ['A', 'B'] : ['C', 'D'];
  const bothDown = members.every((p) => state.kings[p].status === 'checkmated');
  if (bothDown) {
    state.gameOver = true;
    state.winnerTeam = team === 'blue' ? 'red' : 'blue';
    state.log.push(`Team ${state.winnerTeam.toUpperCase()} wins — both ${team} kings are checkmated.`);
  }
  return state.gameOver;
}

function removeMatedKing(state, player) {
  const k = state.kings[player];
  if (!k || k.row === null || k.col === null) return;
  const piece = state.board[k.row][k.col];
  if (piece && piece.type === 'K' && piece.player === player) {
    state.board[k.row][k.col] = null;
  }
  k.row = null;
  k.col = null;
  k.status = 'checkmated';
}

function startTurnForPlayer(state, player) {
  if (countPieces(state, player) === 0) return 'skip';

  let legalMoves = generateAllLegalMoves(state, player);
  const kingAlive = shouldProtectKing(state.kings, player);
  const inCheck = kingAlive ? isKingInCheck(state.board, state.kings, player) : false;

  if (legalMoves.length === 0) {
    if (kingAlive && inCheck) {
      // True checkmate: the king cannot be captured, and is removed only after
      // we establish that no legal escape exists.
      removeMatedKing(state, player);
      state.log.push(`Player ${player} is CHECKMATED — now in GUARDIAN mode.`);
      const defeated = checkTeamDefeat(state, TEAM_OF[player]);
      if (defeated) return 'gameover';
      legalMoves = generateAllLegalMoves(state, player);
      if (legalMoves.length === 0) {
        state.log.push(`Player ${player} has no legal moves — turn skipped.`);
        return 'skip';
      }
      return 'active';
    }
    state.log.push(`Player ${player} has no legal moves — turn skipped.`);
    return 'skip';
  }

  if (kingAlive) state.kings[player].status = inCheck ? 'check' : 'alive';
  return 'active';
}

function advanceTurn(state) {
  let attempts = 0;
  while (attempts < 4) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % 4;
    const player = PLAYERS[state.currentPlayerIndex];
    const result = startTurnForPlayer(state, player);
    if (result === 'gameover') return 'gameover';
    if (result === 'active') return 'active';
    attempts++;
  }
  state.gameOver = true;
  state.winnerTeam = null;
  state.log.push('No player has any legal moves. Game drawn.');
  return 'gameover';
}

function pieceLetterForNotation(type) { return type === 'P' ? '' : type; }

function makeMove(state, from, to, promotionType) {
  const { board } = state;
  const piece = board[from.row][from.col];
  if (!piece) return { ok: false, reason: 'empty-square' };

  const beforeSquare = squareName(from.row, from.col);
  const afterSquare = squareName(to.row, to.col);
  const isCaptureAttempt = !!board[to.row][to.col];

  const info = applyMoveToBoard(board, from, to, state.lastMove, promotionType, state.epTargets);

  if (piece.type === 'K') {
    state.kings[piece.player].row = to.row;
    state.kings[piece.player].col = to.col;
  }

  // Kings are not capturable. Legal move generation prevents this, but keep
  // the transition layer defensive so future rules cannot accidentally bypass it.
  if (info.capturedPiece && info.capturedPiece.type === 'K') {
    return { ok: false, reason: 'king-capture-forbidden' };
  }

  state.lastMove = {
    from, to,
    piece: { ...piece },
    capturedPiece: info.capturedPiece,
    isEnPassant: info.isEnPassant,
    isDoubleStep: piece.type === 'P' && Math.abs(to.row - from.row) === 2,
  };

  // En passant targets: list so teammate double-steps do not erase earlier ones.
  if (!Array.isArray(state.epTargets)) state.epTargets = [];
  // Age existing targets first (they survived previous plies)
  state.epTargets = state.epTargets
    .map((ep) => ({ ...ep, ttl: ep.ttl - 1 }))
    .filter((ep) => ep.ttl > 0);
  // Record a new double-step after aging so it gets full ttl for future plies
  if (piece.type === 'P' && Math.abs(to.row - from.row) === 2) {
    const mid = (from.row + to.row) >> 1;
    state.epTargets.push({
      captureRow: mid,
      captureCol: from.col,
      pawnRow: to.row,
      pawnCol: to.col,
      team: TEAM_OF[piece.player],
      ttl: 3,
    });
  }
  if (info.isEnPassant) {
    state.epTargets = state.epTargets.filter((ep) =>
      !(ep.captureRow === to.row && ep.captureCol === to.col)
    );
  }
  // Drop slots whose pawn is no longer on that square
  state.epTargets = state.epTargets.filter((ep) => {
    const row = state.board[ep.pawnRow];
    const p = row && row[ep.pawnCol];
    return p && p.type === 'P' && TEAM_OF[p.player] === ep.team;
  });

  const captured = isCaptureAttempt || info.isEnPassant;
  const notation = `${piece.player}: ${pieceLetterForNotation(piece.type)}${beforeSquare}${captured ? 'x' : '-'}${afterSquare}${info.isEnPassant ? ' e.p.' : ''}${info.isPromotion ? '=' + info.promotedTo : ''}`;
  state.moveHistory.push(notation);

  state.selected = null;
  state.legalMovesForSelected = [];

  refreshAllKingDisplays(state);

  const turnResult = advanceTurn(state);
  if (turnResult === 'gameover') {
    return { ok: true, gameOver: true };
  }
  if (!state.posKeys) state.posKeys = [];
  const key = posKey4(state);
  state.posKeys.push(key);
  if (countRep4(state, key) >= 3) {
    state.gameOver = true;
    state.winnerTeam = null;
    state.log.push('Draw by threefold repetition.');
    return { ok: true, gameOver: true };
  }
  return { ok: true, gameOver: false };
}

/* ==========================================================================
   AI opponent — minimax with alpha-beta pruning, transposition table,
   killer/history move ordering, and quiescence search.
   --------------------------------------------------------------------------
   Design note: turns rotate A -> B -> C -> D, and teammates (A&B, C&D) share
   one evaluation function (their team's material/king-safety balance), so a
   search rooted at A's turn only reaches an actual ENEMY reply at depth 3
   (A, then teammate B, then enemy C).

   This whole block (through findBestMove) is duplicated verbatim into the
   Web Worker source string near the bottom of the UI section - the search
   runs off the main thread so deeper difficulty settings don't freeze the
   page. If you edit the evaluation or search here, mirror the change into
   AI_WORKER_SOURCE too (search for that constant).

   Deliberately NOT implemented: null-move pruning. Classical null-move
   ("skip my move - if the position is still winning, prune") relies on
   passing actually handing the opponent a free tempo. Here, skipping one
   ply just advances to the mover's OWN teammate (A's null move hands the
   tempo to B, not to an enemy), so the standard justification doesn't hold
   and it risks unsound cutoffs. Left out rather than shipped half-right.
   ========================================================================== */

const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const KING_ALIVE_BONUS = 500;
const PARTNER_KING_BONUS = 180;
const CHECK_BONUS = 25;
const GUARDIAN_KING_BONUS = 260;
const MOBILITY_WEIGHT = 2;
const CENTER_COL = (COLS - 1) / 2; // 7.5 — the seam between the two kings of each team

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
// Optional callback the Web Worker wires up to report progress after each
// completed iterative-deepening depth; left null (no-op) elsewhere.
let onSearchProgress = null;

// Piece-square tables (blue's orientation; mirrored vertically for red so
// each team's pawns are encouraged to advance toward the opposite end).
const PST = {
  P: [
    [0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
    [5,5,5,5,5,5,5,5, 5,5,5,5,5,5,5,5],
    [10,10,12,14,14,12,10,10, 10,10,12,14,14,12,10,10],
    [15,15,18,22,22,18,15,15, 15,15,18,22,22,18,15,15],
    [25,25,30,35,35,30,25,25, 25,25,30,35,35,30,25,25],
    [40,40,45,50,50,45,40,40, 40,40,45,50,50,45,40,40],
    [60,60,65,70,70,65,60,60, 60,60,65,70,70,65,60,60],
    [0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
  ],
  N: [
    [-30,-20,-15,-10,-10,-15,-20,-30, -30,-20,-15,-10,-10,-15,-20,-30],
    [-20,-5,0,5,5,0,-5,-20, -20,-5,0,5,5,0,-5,-20],
    [-15,0,10,15,15,10,0,-15, -15,0,10,15,15,10,0,-15],
    [-10,5,15,20,20,15,5,-10, -10,5,15,20,20,15,5,-10],
    [-10,5,15,20,20,15,5,-10, -10,5,15,20,20,15,5,-10],
    [-15,0,10,15,15,10,0,-15, -15,0,10,15,15,10,0,-15],
    [-20,-5,0,5,5,0,-5,-20, -20,-5,0,5,5,0,-5,-20],
    [-30,-20,-15,-10,-10,-15,-20,-30, -30,-20,-15,-10,-10,-15,-20,-30],
  ],
  B: [
    [-15,-10,-5,-5,-5,-5,-10,-15, -15,-10,-5,-5,-5,-5,-10,-15],
    [-10,5,5,5,5,5,5,-10, -10,5,5,5,5,5,5,-10],
    [-5,5,10,12,12,10,5,-5, -5,5,10,12,12,10,5,-5],
    [-5,8,12,15,15,12,8,-5, -5,8,12,15,15,12,8,-5],
    [-5,8,12,15,15,12,8,-5, -5,8,12,15,15,12,8,-5],
    [-5,5,10,12,12,10,5,-5, -5,5,10,12,12,10,5,-5],
    [-10,5,5,5,5,5,5,-10, -10,5,5,5,5,5,5,-10],
    [-15,-10,-5,-5,-5,-5,-10,-15, -15,-10,-5,-5,-5,-5,-10,-15],
  ],
  R: [
    [0,0,0,5,5,0,0,0, 0,0,0,5,5,0,0,0],
    [0,0,0,5,5,0,0,0, 0,0,0,5,5,0,0,0],
    [0,0,0,5,5,0,0,0, 0,0,0,5,5,0,0,0],
    [0,0,0,5,5,0,0,0, 0,0,0,5,5,0,0,0],
    [5,5,5,10,10,5,5,5, 5,5,5,10,10,5,5,5],
    [10,10,10,15,15,10,10,10, 10,10,10,15,15,10,10,10],
    [15,15,15,20,20,15,15,15, 15,15,15,20,20,15,15,15],
    [0,0,0,5,5,0,0,0, 0,0,0,5,5,0,0,0],
  ],
  Q: [
    [-10,-5,-5,-2,-2,-5,-5,-10, -10,-5,-5,-2,-2,-5,-5,-10],
    [-5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5],
    [-5,0,5,5,5,5,0,-5, -5,0,5,5,5,5,0,-5],
    [-2,0,5,8,8,5,0,-2, -2,0,5,8,8,5,0,-2],
    [-2,0,5,8,8,5,0,-2, -2,0,5,8,8,5,0,-2],
    [-5,0,5,5,5,5,0,-5, -5,0,5,5,5,5,0,-5],
    [-5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5],
    [-10,-5,-5,-2,-2,-5,-5,-10, -10,-5,-5,-2,-2,-5,-5,-10],
  ],
};

function positionalBonus(piece, r, c) {
  let bonus = (8 - Math.abs(c - CENTER_COL)) * 0.5; // mild pull toward the central files
  const table = PST[piece.type];
  if (table) {
    const pr = (TEAM_OF[piece.player] === 'blue') ? r : (ROWS - 1 - r); // mirror for red
    bonus += table[pr][c];
  }
  return bonus;
}

function liveKingCount(state, team) {
  return (team === 'blue' ? ['A', 'B'] : ['C', 'D']).filter((p) => {
    const k = state.kings[p];
    return k.status !== 'checkmated' && k.row !== null && k.row !== undefined;
  }).length;
}

function kingSafetyPressure(state, player) {
  const k = state.kings[player];
  if (!k || k.status === 'checkmated' || k.row === null || k.row === undefined) return 0;
  const enemyTeam = TEAM_OF[player] === 'blue' ? 'red' : 'blue';
  let pressure = 0;
  for (const [dr, dc] of KING_OFFSETS) {
    const r = k.row + dr, c = k.col + dc;
    if (inBounds(r, c) && isSquareAttacked(state.board, r, c, enemyTeam)) pressure++;
  }
  return pressure;
}

// Positive favors Blue, negative favors Red. Terminal (game-over) positions
// get a large fixed score so the search always prefers an actual win/loss
// over any material consideration.
function evaluate(s) {
  if (s.gameOver) {
    if (s.winnerTeam === 'blue') return 1000000;
    if (s.winnerTeam === 'red') return -1000000;
    return 0;
  }
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = s.board[r][c];
      if (!piece) continue;
      const sign = TEAM_OF[piece.player] === 'blue' ? 1 : -1;
      score += sign * (PIECE_VALUE[piece.type] + positionalBonus(piece, r, c));
      // cheap mobility proxy: pseudo-moves only, no self-check filtering
      score += sign * generatePseudoMoves(s.board, r, c, s.lastMove, s.epTargets).length * MOBILITY_WEIGHT;
    }
  }
  for (const p of PLAYERS) {
    const k = s.kings[p];
    const sign = TEAM_OF[p] === 'blue' ? 1 : -1;
    const alive = k.status !== 'checkmated' && k.row !== null && k.row !== undefined;
    if (alive) {
      score += sign * KING_ALIVE_BONUS;
      if (k.status === 'check') score -= sign * CHECK_BONUS;
      score -= sign * kingSafetyPressure(s, p) * 12;
    }
  }

  // A surviving teammate becomes more valuable after the other king is lost.
  // This is what makes Guardian mode strategically meaningful to the bot.
  for (const team of ['blue', 'red']) {
    const members = team === 'blue' ? ['A', 'B'] : ['C', 'D'];
    const dead = members.find((p) => s.kings[p].status === 'checkmated');
    if (dead) {
      const survivor = members.find((p) => p !== dead);
      const k = s.kings[survivor];
      if (k && k.status !== 'checkmated' && k.row !== null) {
        const sign = team === 'blue' ? 1 : -1;
        score += sign * GUARDIAN_KING_BONUS;
      }
    } else {
      // Small bonus for keeping both kings alive, without making king safety
      // overwhelm material and position in the opening.
      score += (team === 'blue' ? 1 : -1) * PARTNER_KING_BONUS * liveKingCount(s, team);
    }
  }

  score -= hangingPiecesPenalty(s.board, 'blue');
  score += hangingPiecesPenalty(s.board, 'red');
  return score;
}

// One-ply Static Exchange Evaluation: "if I capture here, and the only
// enemy reply considered is one recapture on this same square, what do I
// net?" Not a full recursive SEE (which would resolve an entire exchange
// chain), but cheap - a single isSquareAttacked call - and enough to stop
// the search from grabbing a pawn with a queen it's about to lose.
function seeCapture(board, from, to) {
  const attacker = board[from.row][from.col];
  const target = board[to.row][to.col];
  if (!attacker || !target) return 0;
  const gain = PIECE_VALUE[target.type] || 0;
  const cost = PIECE_VALUE[attacker.type] || 0;
  const enemyTeam = TEAM_OF[attacker.player] === 'blue' ? 'red' : 'blue';
  const savedFrom = board[from.row][from.col];
  const savedTo = board[to.row][to.col];
  board[to.row][to.col] = attacker;
  board[from.row][from.col] = null;
  const recapturable = isSquareAttacked(board, to.row, to.col, enemyTeam);
  board[from.row][from.col] = savedFrom;
  board[to.row][to.col] = savedTo;
  return recapturable ? gain - cost : gain;
}

// Flags pieces (not pawns/kings, which are handled elsewhere) that are
// currently attacked and undefended, or attacked-but-defended (a much
// smaller nudge, since a favorable trade there is often fine).
function hangingPiecesPenalty(board, team) {
  let penalty = 0;
  const enemy = team === 'blue' ? 'red' : 'blue';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || TEAM_OF[p.player] !== team || p.type === 'K' || p.type === 'P') continue;
      if (!isSquareAttacked(board, r, c, enemy)) continue;
      const val = PIECE_VALUE[p.type] || 0;
      penalty += isSquareAttacked(board, r, c, team) ? val * 0.08 : val * 0.85;
    }
  }
  return penalty;
}

function captureScore(s, move) {
  const target = s.board[move.to.row][move.to.col];
  if (target) return PIECE_VALUE[target.type];
  if (move.enPassant) return PIECE_VALUE.P;
  return 0;
}

// --- Transposition table -------------------------------------------------
// A fast (non-Zobrist) position hash. Good enough to catch most repeated
// positions for move-ordering purposes; occasional collisions just cost a
// wasted TT hit, never correctness (the stored move is always re-validated
// by nature of being generated fresh from the real position elsewhere).
const TT_SIZE = 1 << 18; // ~262k entries
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;
let tt = new Array(TT_SIZE);

function ttClear() { tt = new Array(TT_SIZE); }

function hashState(s) {
  let h = 0x9e3779b9;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = s.board[r][c];
      if (p) {
        const code = (p.type.charCodeAt(0) << 3) | (p.player.charCodeAt(0) - 65);
        h = ((h << 5) - h + code * 31 + r * 17 + c) | 0;
      }
    }
  }
  h = ((h << 5) - h + s.currentPlayerIndex * 7919) | 0;
  for (const p of PLAYERS) {
    const k = s.kings[p];
    h = ((h << 5) - h + (k.status === 'checkmated' ? 13 : (k.row * 16 + k.col + 1))) | 0;
  }
  return h >>> 0;
}

function ttProbe(key, depth, alpha, beta) {
  const e = tt[key % TT_SIZE];
  if (!e || e.key !== key || e.depth < depth) return null;
  if (e.flag === TT_EXACT) return e.score;
  if (e.flag === TT_LOWER && e.score >= beta) return e.score;
  if (e.flag === TT_UPPER && e.score <= alpha) return e.score;
  return null;
}

function ttStore(key, depth, score, flag, bestMove) {
  const idx = key % TT_SIZE;
  const e = tt[idx];
  if (!e || e.depth <= depth) tt[idx] = { key, depth, score, flag, bestMove };
}

// --- Move ordering: TT move, then MVV-LVA captures, then killers/history --
const killerMoves = Array.from({ length: 64 }, () => [null, null]);
const historyTable = Object.create(null);

function moveKey(mv) { return `${mv.from.row},${mv.from.col}-${mv.to.row},${mv.to.col}`; }

function orderMoves(s, moves, ply, ttMove) {
  const scored = moves.map((mv) => {
    let score = 0;
    if (ttMove && mv.from.row === ttMove.from.row && mv.from.col === ttMove.from.col &&
        mv.to.row === ttMove.to.row && mv.to.col === ttMove.to.col) {
      score += 100000;
    }
    const target = s.board[mv.to.row][mv.to.col];
    if (target) {
      const see = seeCapture(s.board, mv.from, mv.to);
      score += 10000 + see * 10 + PIECE_VALUE[target.type];
      if (see < 0) score -= 5000; // losing capture - order it last, not first
    } else if (mv.enPassant) {
      score += 10000 + 100;
    }
    if (ply != null && ply >= 0 && ply < killerMoves.length) {
      const [k0, k1] = killerMoves[ply];
      if (k0 && moveKey(mv) === moveKey(k0)) score += 900;
      else if (k1 && moveKey(mv) === moveKey(k1)) score += 800;
    }
    score += historyTable[moveKey(mv)] || 0;
    return { mv, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.mv);
}

function recordKiller(ply, mv) {
  if (ply < 0 || ply >= killerMoves.length) return;
  const k = killerMoves[ply];
  if (!k[0] || moveKey(k[0]) !== moveKey(mv)) { k[1] = k[0]; k[0] = mv; }
}

function updateHistory(mv, depth) {
  const key = moveKey(mv);
  historyTable[key] = (historyTable[key] || 0) + depth * depth;
}

// --- Quiescence search -----------------------------------------------------
// Extends the horizon through captures only, so the search doesn't stop
// mid-exchange. Both depth AND width are capped: an earlier, uncapped-width
// version measured 4-6 SECOND spikes on positions where many pieces are
// simultaneously in contact (long-range rooks/bishops create more contact
// on this wider 16-column board than on a standard 8x8 one). Safe to run
// here because the search executes in a Web Worker, off the main thread.
const MAX_QUIESCE_DEPTH = 4;
const QUIESCE_WIDTH = 6;

function quiesce(s, alpha, beta, qDepth) {
  if (s.gameOver) return evaluate(s);
  const standPat = evaluate(s);
  const mover = PLAYERS[s.currentPlayerIndex];
  const maximizing = TEAM_OF[mover] === 'blue';

  // Fail-soft alpha-beta: track this node's own best value separately from
  // the (possibly inherited, unrelated) alpha/beta window, and return THAT
  // - never the raw alpha/beta variables. Returning an inherited bound when
  // no capture actually improved on it silently substitutes a sibling
  // move's score for this position's real one (found via direct testing:
  // it made every quiet move at the root look exactly as good as whichever
  // capture happened to be searched first).
  let best = standPat;
  if (maximizing) {
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return standPat;
    if (standPat < beta) beta = standPat;
  }
  if (qDepth >= MAX_QUIESCE_DEPTH) return standPat;

  // Skip clearly-losing captures (SEE < 0, allowing a little slack for
  // en passant which seeCapture doesn't score) before the width cap, so
  // the limited slots go to captures actually worth searching.
  const captures = orderMoves(s, generateAllLegalMoves(s, mover), -1, null)
    .filter((mv) => {
      if (mv.enPassant) return true;
      const target = s.board[mv.to.row][mv.to.col];
      if (!target) return false;
      return seeCapture(s.board, mv.from, mv.to) >= -50;
    })
    .slice(0, QUIESCE_WIDTH);
  for (const mv of captures) {
    const child = cloneState(s);
    makeMove(child, mv.from, mv.to);
    const val = quiesce(child, alpha, beta, qDepth + 1);
    if (maximizing) {
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (alpha >= beta) return best;
    } else {
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (beta <= alpha) return best;
    }
  }
  return best;
}

// --- Main search: alpha-beta + TT + killers/history + quiescence ----------
// A soft time budget (checked periodically, not a hard timer) lets deeper
// settings bail out with the best move found so far instead of running
// indefinitely - important even in a worker, since "wait 3 minutes for one
// move" is a bad experience regardless of whether the page stays responsive.
const TIME_SOFT_MS = { 1: 250, 2: 500, 3: 1000, 4: 1500, 5: 1800 }; // capped so no depth exceeds ~2-3s including check-interval overshoot
let nodesSearched = 0;
let searchStartTime = 0;
let searchTargetDepth = 3;
let searchAborted = false;

function minimax(simState, depth, alpha, beta, ply) {
  nodesSearched++;
  if (simState.gameOver) return evaluate(simState);

  if ((nodesSearched & 255) === 0) {
    const budget = TIME_SOFT_MS[searchTargetDepth] || 5000;
    if (now() - searchStartTime > budget) { searchAborted = true; return evaluate(simState); }
  }
  if (searchAborted) return evaluate(simState);

  if (depth <= 0) return quiesce(simState, alpha, beta, 0);

  const key = hashState(simState);
  const ttVal = ttProbe(key, depth, alpha, beta);
  if (ttVal !== null) return ttVal;

  const mover = PLAYERS[simState.currentPlayerIndex];
  const ttEntry = tt[key % TT_SIZE];
  const ttMove = (ttEntry && ttEntry.key === key) ? ttEntry.bestMove : null;
  const moves = orderMoves(simState, generateAllLegalMoves(simState, mover), ply, ttMove);
  if (moves.length === 0) return evaluate(simState);

  const maximizing = TEAM_OF[mover] === 'blue';
  const inCheck = shouldProtectKing(simState.kings, mover) && isKingInCheck(simState.board, simState.kings, mover);

  let best = maximizing ? -Infinity : Infinity;
  let bestMove = moves[0];
  let flag = TT_UPPER;
  let moveCount = 0;

  for (const mv of moves) {
    moveCount++;
    const child = cloneState(simState);
    makeMove(child, mv.from, mv.to);

    // Late move reduction: search quieter, later moves at reduced depth
    // first, and only re-search at full depth if the result looks like it
    // could actually beat the current bound.
    let val;
    const reducible = depth >= 3 && moveCount > 5 && !inCheck && captureScore(simState, mv) === 0;
    if (reducible) {
      const reduction = moveCount > 14 ? 2 : 1;
      val = minimax(child, depth - 1 - reduction, alpha, beta, ply + 1);
      if (maximizing ? val > alpha : val < beta) {
        val = minimax(child, depth - 1, alpha, beta, ply + 1);
      }
    } else {
      val = minimax(child, depth - 1, alpha, beta, ply + 1);
    }

    if (maximizing) { if (val > best) { best = val; bestMove = mv; } if (val > alpha) { alpha = val; flag = TT_EXACT; } }
    else { if (val < best) { best = val; bestMove = mv; } if (val < beta) { beta = val; flag = TT_EXACT; } }

    if (beta <= alpha) {
      if (captureScore(simState, mv) === 0) { recordKiller(ply, mv); updateHistory(mv, depth); }
      flag = maximizing ? TT_LOWER : TT_UPPER;
      break;
    }
  }

  ttStore(key, depth, best, flag, bestMove);
  return best;
}

const OPENING_BOOK = {
  '0|00RA|01NA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,1,2,2,31,4],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,14,2,13,0,4],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,14,2,13,-1,3],
  '2|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [6,5,4,5,18,3],
  '2|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,1,5,2,-1,3],
  '2|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,1,5,2,-1,3],
  '2|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,1,5,2,-2,3],
  '3|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|45PC|60PC|61PC|62PC|63PC|64PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,14,5,13,47,3],
  '3|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|52NC|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,14,5,13,29,3],
  '3|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|52NC|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,14,5,13,59,3],
  '3|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|54NC|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,14,5,13,60,3],
  '3|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|52NC|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,14,5,13,59,3],
  '3|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|54NC|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,14,5,13,60,3],
  '3|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|52NC|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,14,5,13,59,3],
  '3|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|54NC|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [7,14,5,13,60,3],
  '0|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|45PC|513ND|60PC|61PC|62PC|63PC|64PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,5,2,4,-53,3],
  '0|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|45PC|511ND|60PC|61PC|62PC|63PC|64PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,5,2,4,-51,3],
  '0|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,5,2,4,59,3],
  '0|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,5,2,4,60,3],
  '0|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,5,2,4,59,3],
  '0|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,5,2,4,60,3],
  '0|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|54NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,5,2,4,60,3],
  '0|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|54NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,5,2,4,61,3],
  '0|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,1,2,2,59,3],
  '0|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,1,2,2,60,3],
  '0|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|54NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,1,2,2,60,3],
  '0|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|54NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,1,2,2,61,3],
  '0|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,1,2,2,59,3],
  '0|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,1,2,2,60,3],
  '0|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|54NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,1,2,2,60,3],
  '0|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|54NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,1,2,2,61,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|213NB|45PC|513ND|60PC|61PC|62PC|63PC|64PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,10,2,11,-53,3],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|33PA|45PC|513ND|60PC|61PC|62PC|63PC|64PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,10,2,11,-65,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|213NB|45PC|511ND|60PC|61PC|62PC|63PC|64PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,10,2,11,-51,3],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|33PA|45PC|511ND|60PC|61PC|62PC|63PC|64PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,10,2,11,-64,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|213NB|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,10,2,11,29,3],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|33PA|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,10,2,11,-88,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|213NB|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,10,2,11,31,3],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|213NB|33PA|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,10,2,11,-87,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|211NB|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,14,2,13,29,3],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|33PA|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,14,2,13,-88,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|211NB|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,14,2,13,31,3],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|33PA|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,14,2,13,-87,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|211NB|54NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,14,2,13,29,3],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|33PA|54NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,14,2,13,-81,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|211NB|54NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,14,2,13,0,3],
  '1|00RA|02BA|03QA|04BA|05NA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|211NB|33PA|54NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,14,2,13,-80,3],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|33PA|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,10,2,11,-90,3],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|33PA|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,10,2,11,-88,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|213NB|54NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,10,2,11,29,3],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|33PA|54NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,10,2,11,-82,3],
  '1|00RA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|13PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|22NA|24NA|213NB|54NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,10,2,11,31,3],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|010NB|011BB|012QB|013BB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|213NB|33PA|54NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,10,2,11,-81,3],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|33PA|52NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,14,2,13,-90,3],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|33PA|52NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|72BC|73QC|74BC|75NC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,14,2,13,-88,3],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|33PA|54NC|513ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|710ND|711BD|712QD|713BD|715RD|07|08|77|78': [0,14,2,13,-82,3],
  '1|00RA|01NA|02BA|03QA|04BA|06RA|07KA|08KB|09RB|011BB|012QB|013BB|014NB|015RB|10PA|11PA|12PA|14PA|15PA|16PA|17PA|18PB|19PB|110PB|111PB|112PB|113PB|114PB|115PB|24NA|211NB|33PA|54NC|511ND|60PC|61PC|62PC|63PC|64PC|65PC|66PC|67PC|68PD|69PD|610PD|611PD|612PD|613PD|614PD|615PD|70RC|71NC|72BC|73QC|74BC|76RC|77KC|78KD|79RD|711BD|712QD|713BD|714ND|715RD|07|08|77|78': [0,14,2,13,-81,3],
};

function bookPosKey(s) {
  const parts = [String(s.currentPlayerIndex)];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = s.board[r][c];
      if (p) parts.push(r + '' + c + p.type + p.player);
    }
  }
  for (const pl of PLAYERS) {
    const k = s.kings[pl];
    parts.push(k.status === 'checkmated' ? 'X' : (k.row + '' + k.col));
  }
  return parts.join('|');
}

function probeOpeningBook(s) {
  // Only use book in the early game (first ~12 half-moves)
  if (s.moveHistory && s.moveHistory.length > 12) return null;
  const key = bookPosKey(s);
  const entry = OPENING_BOOK[key];
  if (!entry) return null;
  const [fr, fc, tr, tc, score, depth] = entry;
  // Validate move is still legal
  const mover = PLAYERS[s.currentPlayerIndex];
  const legal = generateAllLegalMoves(s, mover);
  const ok = legal.some(m => m.from.row === fr && m.from.col === fc && m.to.row === tr && m.to.col === tc);
  if (!ok) return null;
  return {
    move: { from: { row: fr, col: fc }, to: { row: tr, col: tc } },
    value: score,
    nodes: 0,
    time: '0.0',
    fromBook: true,
    bookDepth: depth
  };
}

function findBestMove(s, depth) {
  const mover = PLAYERS[s.currentPlayerIndex];
  let moves = generateAllLegalMoves(s, mover);
  if (moves.length === 0) return null;

  const bookHit = probeOpeningBook(s);
  if (bookHit) return bookHit;

  ttClear();
  for (let i = 0; i < killerMoves.length; i++) killerMoves[i] = [null, null];
  nodesSearched = 0;
  searchStartTime = now();
  searchTargetDepth = depth;
  searchAborted = false;

  const maximizing = TEAM_OF[mover] === 'blue';
  let bestMove = moves[0];
  let bestVal = maximizing ? -Infinity : Infinity;
  let lastIterationResults = [{ move: bestMove, val: bestVal }];

  // Iterative deepening: search depth 1, then 2, ... up to the target depth,
  // re-trying the previous iteration's best move first each time (better
  // move ordering -> more alpha-beta cutoffs at the next depth), and
  // reporting progress after each completed depth via onProgress if given.
  for (let d = 1; d <= depth; d++) {
    const ordered = orderMoves(s, moves, 0, bestMove);
    let alpha = -Infinity, beta = Infinity;
    let iterBestMove = ordered[0];
    let iterBestVal = maximizing ? -Infinity : Infinity;
    const iterResults = [];

    for (const mv of ordered) {
      const child = cloneState(s);
      makeMove(child, mv.from, mv.to);
      const val = minimax(child, d - 1, alpha, beta, 1);
      iterResults.push({ move: mv, val });
      if (maximizing ? val > iterBestVal : val < iterBestVal) { iterBestVal = val; iterBestMove = mv; }
      if (maximizing) alpha = Math.max(alpha, val); else beta = Math.min(beta, val);
    }

    bestMove = iterBestMove;
    bestVal = iterBestVal;
    lastIterationResults = iterResults;
    if (typeof onSearchProgress === 'function') {
      onSearchProgress({ depth: d, nodes: nodesSearched, elapsed: (now() - searchStartTime) / 1000, move: bestMove, value: bestVal });
    }
    if (searchAborted || now() - searchStartTime > (TIME_SOFT_MS[depth] || 5000)) break;
  }

  // Pick randomly among moves scored within a small margin of the best
  // found (roughly "equally good"), so the AI doesn't always play the
  // exact same move in a given position. The margin is small relative to
  // a pawn's value, so this never trades away real strength for variety.
  const TIE_MARGIN = 15;
  const nearBest = lastIterationResults.filter((r) =>
    maximizing ? r.val >= bestVal - TIE_MARGIN : r.val <= bestVal + TIE_MARGIN
  );
  if (nearBest.length > 1) {
    const picked = nearBest[Math.floor(Math.random() * nearBest.length)];
    bestMove = picked.move;
    bestVal = picked.val;
  }

  // Root safety net: never voluntarily play a capture that SEE says loses
  // serious material for nothing, even if the (depth-limited) search missed
  // the refutation - prefer any other move that isn't itself a bad capture.
  if (bestMove) {
    const target = s.board[bestMove.to.row][bestMove.to.col];
    if (target && seeCapture(s.board, bestMove.from, bestMove.to) < -150) {
      const alt = orderMoves(s, moves, 0, null).find((mv) => {
        const t = s.board[mv.to.row][mv.to.col];
        return !t || seeCapture(s.board, mv.from, mv.to) >= -150;
      });
      if (alt) { bestMove = alt; }
    }
  }

  return { move: bestMove, value: bestVal, nodes: nodesSearched, time: ((now() - searchStartTime) / 1000).toFixed(1) };
}
