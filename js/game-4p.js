'use strict';
/* ==========================================================================
   4-Player Chess (16x8) — Core Game Logic
   (Pure state-transition functions; no DOM access below this block so the
   rules can be edited/tested independently of the UI.)
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

function createInitialState() {
  return {
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
  };
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
  return { ok: true, gameOver: turnResult === 'gameover' };
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

/* ==========================================================================
   UI layer — DOM rendering & interaction
   ========================================================================== */

const PIECE_GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

let state = createInitialState();
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
    showMessage('موقعیت این حرکت در حافظه نیست.', 'error');
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
  if(drag4 && drag4.ghost && drag4.ghost.parentNode) {
    drag4.ghost.parentNode.removeChild(drag4.ghost);
  }
  document.querySelectorAll('#chessBoard .cell.dragging-source, #chessBoard .cell.drag-over-legal').forEach(el=>{
    el.classList.remove('dragging-source','drag-over-legal');
  });
  drag4 = null;
}

function cell4FromPoint(x, y){
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('#chessBoard .cell') : null;
  if(!cell) return null;
  return { r:+cell.dataset.row, c:+cell.dataset.col, el:cell };
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
      cell.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        if (state.gameOver || aiThinking || viewIndex !== null) return;
        if (PLAYER_MODE[PLAYERS[state.currentPlayerIndex]] === 'ai') return;
        const player = PLAYERS[state.currentPlayerIndex];
        const piece = state.board[r][c];
        if (!piece || piece.player !== player) return;
        // Do NOT preventDefault / suppress click yet — only after real drag
        const moves = generateLegalMovesForPiece(state, player, r, c);
        state.selected = { row: r, col: c };
        state.legalMovesForSelected = moves;
        render();
        drag4 = {
          fromR: r, fromC: c, pointerId: e.pointerId,
          startX: e.clientX, startY: e.clientY,
          dragged: false, ghost: null
        };
        try { cell.setPointerCapture(e.pointerId); } catch (_) {}
      });
      cell.addEventListener('pointermove', (e) => {
        if (!drag4 || drag4.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag4.startX, dy = e.clientY - drag4.startY;
        if (!drag4.dragged && (dx * dx + dy * dy) < 36) return; // <6px = click
        if (!drag4.dragged) {
          drag4.dragged = true;
          suppressNextClick4 = true;
          const piece = state.board[drag4.fromR][drag4.fromC];
          const ghost = document.createElement('div');
          ghost.className = 'piece-ghost piece player-' + (piece ? piece.player : 'A');
          const src = el.board.querySelector('.cell[data-row="' + drag4.fromR + '"][data-col="' + drag4.fromC + '"] .piece');
          ghost.textContent = src ? src.textContent : (piece ? PIECE_GLYPH[piece.type] : '');
          ghost.style.left = e.clientX + 'px';
          ghost.style.top = e.clientY + 'px';
          document.body.appendChild(ghost);
          drag4.ghost = ghost;
          const srcCell = el.board.querySelector('.cell[data-row="' + drag4.fromR + '"][data-col="' + drag4.fromC + '"]');
          if (srcCell) srcCell.classList.add('dragging-source');
        }
        if (drag4.ghost) {
          drag4.ghost.style.left = e.clientX + 'px';
          drag4.ghost.style.top = e.clientY + 'px';
        }
        document.querySelectorAll('#chessBoard .cell.drag-over-legal').forEach(el2 => el2.classList.remove('drag-over-legal'));
        const hit = cell4FromPoint(e.clientX, e.clientY);
        if (hit && state.legalMovesForSelected && state.legalMovesForSelected.some(m => m.row === hit.r && m.col === hit.c)) {
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
            state.legalMovesForSelected = generateLegalMovesForPiece(state, PLAYERS[state.currentPlayerIndex], fromR, fromC);
            handleCellClick(hit.r, hit.c);
          } else {
            render();
          }
        }
        // if not dragged: leave selection; native click will fire for 2-click move
      });
      cell.addEventListener('pointercancel', () => { clearDrag4(); suppressNextClick4 = false; });
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
      cellNode.classList.remove('selected', 'legal-move', 'legal-capture', 'last-move');
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

  // turn indicator
  const currentPlayer = PLAYERS[ds.currentPlayerIndex];
  const currentRole = ds.kings[currentPlayer].status === 'checkmated' ? 'GUARDIAN' : 'NORMAL';
  el.turnIndicator.textContent = isViewing
    ? `VIEWING move ${viewIndex} of ${state.moveHistory.length}`
    : `CURRENT TURN: Player ${currentPlayer} · ${currentRole}`;

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
    el.gameOverBanner.textContent = state.winnerTeam
      ? `GAME OVER — TEAM ${state.winnerTeam.toUpperCase()} WINS`
      : 'GAME OVER — DRAW (no legal moves remain)';
  } else {
    el.gameOverBanner.classList.remove('show');
  }

  syncTurnTimer();
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
  if (aiThinking || PLAYER_MODE[PLAYERS[state.currentPlayerIndex]] === 'ai') {
    showMessage('الان نوبت یک بازیکن AI است — صبر کنید تا حرکتش را انجام دهد.', 'info');
    return;
  }
  // Online: guests may only move their own seat
  if (ONLINE.role === 'guest' && ONLINE.ready) {
    const cur = PLAYERS[state.currentPlayerIndex];
    if (cur !== ONLINE.mySeat) {
      showMessage('نوبت شما نیست — منتظر حرکت بازیکن ' + cur + ' بمانید.', 'info');
      return;
    }
  }
  if (ONLINE.role === 'host' && ONLINE.ready) {
    const cur = PLAYERS[state.currentPlayerIndex];
    // Host can move local seat; remote seats wait for network; AI handled separately
    if (ONLINE.seats[cur] && ONLINE.seats[cur] !== 'local' && ONLINE.seats[cur] !== 'ai') {
      showMessage('نوبت بازیکن آنلاین است — منتظر حرکت او بمانید.', 'info');
      return;
    }
  }

  const player = PLAYERS[state.currentPlayerIndex];
  const piece = state.board[r][c];

  if (!state.selected) {
    if (!piece) return;
    if (piece.player !== player) {
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

  playMoveSound();
  describeMoveOutcome(movingPlayer, logLenBefore);
  recordPositionSnapshot();
  render();
  maybeTriggerAI();
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
// The search runs in a separate thread (source duplicated verbatim into a
// <script type="text/plain"> tag - see AI opponent comment above) so a
// slow position pauses a background thread instead of freezing the page.
// If Workers aren't available for some reason, createAIWorker() returns
// null and maybeTriggerAI() falls back to a depth-capped synchronous call
// on the main thread instead.
let aiWorker = null;
let aiWorkerAvailable = false;
let aiRequestId = 0;
let pendingAIPlayer = null;
let pendingAILogLenBefore = 0;

function createAIWorker() {
  try {
    if (typeof Worker === 'undefined') return null;
    // Worker lives in js/ai-worker.js (same logic as former inline source)
    return new Worker('js/ai-worker.js');
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

// Runs the AI for the current player if that player is AI-controlled, then
// (via its own render + recursive call) keeps chaining through however many
// consecutive AI-controlled turns follow - e.g. all 4 players set to AI will
// play an entire game out on their own.
function maybeTriggerAI() {
  // Never play while the user is browsing move history
  if (state.gameOver || aiThinking || viewIndex !== null) return;
  const player = PLAYERS[state.currentPlayerIndex];
  if (PLAYER_MODE[player] !== 'ai') return;

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
  if (token !== timerTurnToken) startTurnTimer(token);
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
  refreshAllKingDisplays(state);
  undoStack = [];
  viewIndex = null;
  positionHistory = [cloneState(state)]; // index 0 = start
  teamTimeLeft = selectedTimeControlMinutes > 0
    ? { blue: selectedTimeControlMinutes * 60, red: selectedTimeControlMinutes * 60 }
    : { blue: null, red: null };
  updateClockDisplay();
  showMessage('بازی جدید شروع شد. نوبت Player A است.', 'info');
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
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => { v.style.display = 'none'; });
  document.getElementById(name).style.display = '';
}

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
document.getElementById('backFromSetupBtn').addEventListener('click', () => showView('homeView'));
document.getElementById('backFromGameBtn').addEventListener('click', () => {
  stopPendingAI();
  stopTurnTimer();
  stopMatchClock();
  showView('homeView');
});
document.getElementById('startBotGameBtn').addEventListener('click', startNewGameFromSetup);

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
  refreshAllKingDisplays(state);
  undoStack = [];
  viewIndex = null;
  positionHistory = [cloneState(state)];

  teamTimeLeft = selectedTimeControlMinutes > 0
    ? { blue: selectedTimeControlMinutes * 60, red: selectedTimeControlMinutes * 60 }
    : { blue: null, red: null };
  updateClockDisplay();

  showView('gameView');
  showMessage('بازی جدید شروع شد. نوبت Player A است.', 'info');
  render();
  maybeTriggerAI();
  startMatchClock();
}


/* ==========================================================================
   Online multiplayer — localStorage bus (works on file://) + BroadcastChannel + PeerJS
   --------------------------------------------------------------------------
   Why localStorage: opening index.html as file:// makes BroadcastChannel
   unreliable or isolated per tab in Chrome/Opera/Firefox. storage events
   fire across tabs that share the same file URL, so a tiny message bus on
   localStorage is the most reliable "two tabs, no server" transport.
   Host remains authoritative.
   ========================================================================== */


function peerOptions(preferredId) {
  const ice = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  };
  const opts = {
    debug: 1,
    secure: true,
    config: ice,
  };
  // Default cloud broker (works best on https:// e.g. GitHub Pages)
  // Prefer explicit host so file:// and odd environments behave predictably when allowed
  if (location.protocol === 'https:' || location.protocol === 'http:') {
    opts.host = '0.peerjs.com';
    opts.port = 443;
    opts.path = '/';
  }
  if (preferredId) return new Peer(preferredId, opts);
  return new Peer(opts);
}

function isRemoteCapable() {
  return location.protocol === 'https:' || location.protocol === 'http:';
}

const ONLINE = {
  role: null,
  roomCode: null,
  mySeat: null,
  peer: null,
  connections: {},
  hostConn: null,
  seats: { A: null, B: null, C: null, D: null },
  ready: false,
  selectedSeat: 'A',
  joinSelectedSeat: 'A',
  timeMinutes: 10,
  aiDepth: 3,
  bc: null,
  transport: null,
  lsTimer: null,
  lsLastSeen: 0,
  clientId: null,
};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function peerIdFromCode(code) {
  return 'fc4chess-' + String(code).toUpperCase();
}

function channelName(code) {
  return 'fc4-room-' + String(code).toUpperCase();
}

function lsKey(code) {
  return 'fc4-bus-' + String(code).toUpperCase();
}

function makeClientId() {
  return 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function onlinePost(msg) {
  const payload = Object.assign({
    room: ONLINE.roomCode,
    fromSeat: ONLINE.mySeat,
    fromId: ONLINE.clientId,
    ts: Date.now(),
  }, msg);

  // 1) localStorage bus (works on file:// across tabs)
  try {
    const key = lsKey(ONLINE.roomCode);
    const envelope = JSON.stringify(payload);
    localStorage.setItem(key, envelope);
    // Also write a rotating stamp so identical payloads still trigger storage event
    localStorage.setItem(key + '-tick', String(payload.ts));
  } catch (e) {
    console.warn('localStorage post failed', e);
  }

  // 2) BroadcastChannel (http/https same-origin)
  if (ONLINE.bc) {
    try { ONLINE.bc.postMessage(payload); } catch (e) { console.warn(e); }
  }

  // 3) PeerJS
  if (ONLINE.role === 'host') {
    const str = JSON.stringify(payload);
    Object.values(ONLINE.connections).forEach((conn) => {
      if (conn && conn.open) {
        try { conn.send(str); } catch (e) { console.warn(e); }
      }
    });
  } else if (ONLINE.role === 'guest' && ONLINE.hostConn && ONLINE.hostConn.open) {
    try { ONLINE.hostConn.send(JSON.stringify(payload)); } catch (e) { console.warn(e); }
  }
}

function onlineBroadcast(msg) {
  if (ONLINE.role !== 'host') return;
  onlinePost(msg);
}

function onlineSendToHost(msg) {
  if (ONLINE.role !== 'guest') return;
  onlinePost(msg);
}

function onlineLobbyRender() {
  const list = document.getElementById('onlinePlayersList');
  const status = document.getElementById('onlineLobbyStatus');
  const startBtn = document.getElementById('startOnlineGameBtn');
  if (!list) return;
  const labels = { A: 'آبی A', B: 'آبی B', C: 'قرمز C', D: 'قرمز D' };
  let html = '';
  let filled = 0;
  for (const seat of PLAYERS) {
    const who = ONLINE.seats[seat];
    let label = 'خالی → AI';
    if (who === 'local') { label = 'شما'; filled++; }
    else if (who && who !== 'ai') { label = 'بازیکن دیگر'; filled++; }
    else if (who === 'ai') { label = 'AI'; }
    html += `<div>صندلی ${labels[seat]}: <strong>${label}</strong></div>`;
  }
  list.innerHTML = html;
  if (status) {
    if (ONLINE.role === 'host') {
      status.textContent = `کد را در تب دوم وارد کنید — ${filled}/4 · ${ONLINE.transport || 'localStorage'}`;
    } else {
      status.textContent = 'متصل شدید. منتظر شروع توسط میزبان بمانید.';
    }
  }
  if (startBtn) startBtn.style.display = (ONLINE.role === 'host') ? 'inline-block' : 'none';
}

function onlineCleanup() {
  try {
    if (ONLINE.lsTimer) { clearInterval(ONLINE.lsTimer); ONLINE.lsTimer = null; }
    window.removeEventListener('storage', onlineStorageHandler);
    if (ONLINE.bc) { ONLINE.bc.close(); ONLINE.bc = null; }
    Object.values(ONLINE.connections).forEach((c) => { try { c.close(); } catch (_) {} });
    if (ONLINE.hostConn) try { ONLINE.hostConn.close(); } catch (_) {}
    if (ONLINE.peer) try { ONLINE.peer.destroy(); } catch (_) {}
    if (ONLINE.roomCode) {
      try {
        localStorage.removeItem(lsKey(ONLINE.roomCode));
        localStorage.removeItem(lsKey(ONLINE.roomCode) + '-tick');
      } catch (_) {}
    }
  } catch (_) {}
  ONLINE.role = null;
  ONLINE.roomCode = null;
  ONLINE.mySeat = null;
  ONLINE.peer = null;
  ONLINE.connections = {};
  ONLINE.hostConn = null;
  ONLINE.seats = { A: null, B: null, C: null, D: null };
  ONLINE.ready = false;
  ONLINE.transport = null;
  ONLINE.lsLastSeen = 0;
}

function onlineOnMessage(msg, via) {
  if (!msg || !msg.type) return;
  if (msg.fromId && msg.fromId === ONLINE.clientId) return; // ignore self
  if (msg.room && ONLINE.roomCode && msg.room !== ONLINE.roomCode) return;

  if (ONLINE.role === 'host') {
    if (msg.type === 'join') {
      const seat = msg.seat;
      if (!PLAYERS.includes(seat)) return;
      if (ONLINE.seats[seat] === 'local') {
        onlinePost({ type: 'error', message: 'این صندلی مال میزبان است. صندلی دیگری انتخاب کنید.', toSeat: msg.fromSeat });
        return;
      }
      if (ONLINE.seats[seat] && ONLINE.seats[seat] !== msg.fromId && ONLINE.seats[seat] !== msg.fromSeat) {
        onlinePost({ type: 'error', message: 'این صندلی قبلاً گرفته شده.', toSeat: msg.fromSeat });
        return;
      }
      ONLINE.seats[seat] = msg.fromId || msg.fromSeat || ('guest-' + seat);
      onlineBroadcast({ type: 'lobby', seats: { ...ONLINE.seats }, roomCode: ONLINE.roomCode });
      onlineLobbyRender();
      showMessage('بازیکن به صندلی ' + seat + ' پیوست.', 'success');
    } else if (msg.type === 'move') {
      if (!ONLINE.ready || state.gameOver || viewIndex !== null) return;
      const cur = PLAYERS[state.currentPlayerIndex];
      if (ONLINE.seats[cur] === 'local') return;
      if (msg.fromSeat && msg.fromSeat !== cur) return;
      // Host-authoritative validation: the host is the only source of truth
      // for the shared game, so it must not blindly trust a guest's claimed
      // move. Two checks close real gaps found by direct testing: (1) the
      // sender must actually be the client seated at the current player's
      // seat, not just claim the right seat name; (2) the move itself must
      // be genuinely legal per the real rules, using the same validated
      // function the local UI already uses for human clicks - otherwise a
      // stale/buggy/malicious guest could apply literally any from/to pair
      // (confirmed: an unchecked message could teleport a piece anywhere).
      if (ONLINE.seats[cur] !== msg.fromId) return;
      const { from, to, promotionType } = msg;
      if (!from || !to) return;
      const legalForPiece = generateLegalMovesForPiece(state, cur, from.row, from.col);
      if (!legalForPiece.some((m) => m.row === to.row && m.col === to.col)) return;
      undoStack.push(cloneState(state));
      const logLenBefore = state.log.length;
      const result = makeMove(state, from, to, promotionType);
      if (!result.ok) { undoStack.pop(); return; }
      playMoveSound();
      describeMoveOutcome(cur, logLenBefore);
      recordPositionSnapshot();
      render();
      onlineBroadcast({ type: 'state', state: cloneState(state), teamTimeLeft });
      maybeTriggerAI();
    } else if (msg.type === 'hello' || msg.type === 'ping') {
      onlineBroadcast({ type: 'lobby', seats: { ...ONLINE.seats }, roomCode: ONLINE.roomCode });
    }
  } else if (ONLINE.role === 'guest') {
    if (msg.type === 'lobby') {
      ONLINE.seats = msg.seats || ONLINE.seats;
      onlineLobbyRender();
    } else if (msg.type === 'state') {
      state = msg.state;
      if (msg.teamTimeLeft) teamTimeLeft = msg.teamTimeLeft;
      viewIndex = null;
      state.selected = null;
      state.legalMovesForSelected = [];
      render();
      updateClockDisplay();
    } else if (msg.type === 'start') {
      ONLINE.ready = true;
      if (msg.state) state = msg.state;
      if (msg.teamTimeLeft) teamTimeLeft = msg.teamTimeLeft;
      if (msg.seats) ONLINE.seats = msg.seats;
      for (const p of PLAYERS) {
        PLAYER_MODE[p] = (p === ONLINE.mySeat) ? 'human' : 'ai';
      }
      showView('gameView');
      showMessage('بازی آنلاین شروع شد. شما Player ' + ONLINE.mySeat + ' هستید.', 'info');
      render();
      startMatchClock();
    } else if (msg.type === 'error') {
      if (!msg.toSeat || msg.toSeat === ONLINE.mySeat) {
        showMessage(msg.message || 'خطای اتصال', 'error');
      }
    }
  }
}

function onlineConsumeStorage(code) {
  try {
    const raw = localStorage.getItem(lsKey(code));
    if (!raw) return;
    const msg = JSON.parse(raw);
    if (!msg || !msg.ts) return;
    if (msg.ts <= ONLINE.lsLastSeen) return;
    ONLINE.lsLastSeen = msg.ts;
    onlineOnMessage(msg, 'localStorage');
  } catch (e) {
    console.warn('ls consume', e);
  }
}

function onlineStorageHandler(ev) {
  if (!ONLINE.roomCode) return;
  const key = lsKey(ONLINE.roomCode);
  if (ev.key !== key && ev.key !== key + '-tick') return;
  onlineConsumeStorage(ONLINE.roomCode);
}

function startLocalBus(code) {
  ONLINE.lsLastSeen = Date.now() - 1;
  window.addEventListener('storage', onlineStorageHandler);
  // Polling fallback: some browsers are flaky with storage events on file://
  ONLINE.lsTimer = setInterval(() => onlineConsumeStorage(code), 400);
  ONLINE.transport = 'localStorage';
}

function openBroadcastChannel(code) {
  if (typeof BroadcastChannel === 'undefined') return null;
  // BroadcastChannel is useless on most file:// origins — skip quietly
  if (location.protocol === 'file:') return null;
  try {
    const bc = new BroadcastChannel(channelName(code));
    bc.onmessage = (ev) => onlineOnMessage(ev.data, 'broadcast');
    return bc;
  } catch (e) {
    return null;
  }
}

function onlineCreateRoom() {
  onlineCleanup();
  ONLINE.clientId = makeClientId();
  const code = generateRoomCode();
  ONLINE.role = 'host';
  ONLINE.roomCode = code;
  ONLINE.mySeat = ONLINE.selectedSeat;
  ONLINE.seats = { A: null, B: null, C: null, D: null };
  ONLINE.seats[ONLINE.mySeat] = 'local';
  ONLINE.aiDepth = parseInt((document.getElementById('onlineAiDifficulty') || {}).value, 10) || 3;

  startLocalBus(code);
  ONLINE.bc = openBroadcastChannel(code);
  if (ONLINE.bc) ONLINE.transport += '+BC';

  // PeerJS for remote players (needs http/https — e.g. GitHub Pages)
  if (typeof Peer !== 'undefined' && isRemoteCapable()) {
    try {
      const peer = peerOptions(peerIdFromCode(code));
      ONLINE.peer = peer;
      peer.on('open', (id) => {
        ONLINE.transport = (ONLINE.transport || '') + '+PeerJS';
        onlineLobbyRender();
        const hint = document.getElementById('onlineEnvHint');
        if (hint) hint.textContent = 'آماده برای اتصال از راه دور (PeerJS: ' + id + ')';
        showMessage('اتاق برای راه دور هم آماده است. لینک صفحه + کد را برای دوستتان بفرستید.', 'success');
      });
      peer.on('connection', (conn) => {
        ONLINE.connections[conn.peer] = conn;
        conn.on('data', (data) => {
          try {
            const msg = typeof data === 'string' ? JSON.parse(data) : data;
            onlineOnMessage(msg, 'peerjs');
          } catch (_) {}
        });
        conn.on('close', () => {
          delete ONLINE.connections[conn.peer];
          for (const s of PLAYERS) {
            if (ONLINE.seats[s] === conn.peer) ONLINE.seats[s] = null;
          }
          onlineBroadcast({ type: 'lobby', seats: { ...ONLINE.seats }, roomCode: ONLINE.roomCode });
          onlineLobbyRender();
        });
        conn.on('open', () => {
          conn.send(JSON.stringify({ type: 'lobby', seats: ONLINE.seats, roomCode: code, room: code, fromId: ONLINE.clientId, ts: Date.now() }));
          showMessage('یک بازیکن از راه دور متصل شد.', 'success');
        });
      });
      peer.on('error', (err) => {
        console.warn('PeerJS host:', err.type || err);
        const hint = document.getElementById('onlineEnvHint');
        if (hint) hint.textContent = 'PeerJS خطا داد (' + (err.type || 'unknown') + ') — تب محلی هنوز کار می‌کند.';
      });
    } catch (e) { console.warn(e); }
  } else {
    const hint = document.getElementById('onlineEnvHint');
    if (hint) {
      hint.textContent = location.protocol === 'file:'
        ? 'الان file:// هستید — فقط دو تب محلی. برای راه دور روی GitHub Pages با https منتشر کنید.'
        : 'PeerJS در دسترس نیست.';
    }
  }

  document.getElementById('onlineCreatePanel').style.display = 'none';
  document.getElementById('onlineJoinPanel').style.display = 'none';
  document.getElementById('onlineLobbyPanel').style.display = 'block';
  document.getElementById('onlineRoomCodeDisplay').textContent = code;
  onlineLobbyRender();
  showMessage('اتاق آماده است. تب جدید باز کنید → پیوستن با کد → همین کد را بزنید (صندلی متفاوت).', 'success');
}

function onlineJoinRoom() {
  const input = document.getElementById('joinRoomCodeInput');
  const code = (input && input.value || '').trim().toUpperCase();
  if (code.length < 4) {
    showMessage('کد اتاق معتبر نیست.', 'error');
    return;
  }
  onlineCleanup();
  ONLINE.clientId = makeClientId();
  ONLINE.role = 'guest';
  ONLINE.roomCode = code;
  ONLINE.mySeat = ONLINE.joinSelectedSeat;
  ONLINE.seats[ONLINE.mySeat] = 'local';

  startLocalBus(code);
  ONLINE.bc = openBroadcastChannel(code);
  if (ONLINE.bc) ONLINE.transport += '+BC';

  // Announce join a few times so host polling catches it
  let attempts = 0;
  const announce = () => {
    onlineSendToHost({ type: 'join', seat: ONLINE.mySeat });
    onlineSendToHost({ type: 'hello' });
    attempts++;
    if (attempts < 5) setTimeout(announce, 500);
  };
  setTimeout(announce, 150);

  document.getElementById('onlineCreatePanel').style.display = 'none';
  document.getElementById('onlineJoinPanel').style.display = 'none';
  document.getElementById('onlineLobbyPanel').style.display = 'block';
  document.getElementById('onlineRoomCodeDisplay').textContent = code;
  onlineLobbyRender();
  showMessage('در حال پیوستن… اگر میزبان اتاق را ساخته باشد تا چند ثانیه لیست بازیکنان به‌روز می‌شود.', 'info');

  if (typeof Peer !== 'undefined' && isRemoteCapable()) {
    try {
      const peer = peerOptions();
      ONLINE.peer = peer;
      peer.on('open', () => {
        const conn = peer.connect(peerIdFromCode(code), { reliable: true });
        ONLINE.hostConn = conn;
        let opened = false;
        conn.on('open', () => {
          opened = true;
          ONLINE.transport = (ONLINE.transport || '') + '+PeerJS';
          conn.send(JSON.stringify({ type: 'join', seat: ONLINE.mySeat, fromSeat: ONLINE.mySeat, fromId: ONLINE.clientId, room: code, ts: Date.now() }));
          onlineLobbyRender();
          showMessage('اتصال از راه دور برقرار شد.', 'success');
        });
        conn.on('data', (data) => {
          try {
            const msg = typeof data === 'string' ? JSON.parse(data) : data;
            onlineOnMessage(msg, 'peerjs');
          } catch (_) {}
        });
        conn.on('error', (err) => console.warn('conn error', err));
        setTimeout(() => {
          if (!opened) {
            showMessage('هنوز به میزبان از راه دور وصل نشد. اگر هر دو روی https هستید چند ثانیه صبر کنید یا کد را دوباره بزنید.', 'info');
          }
        }, 8000);
      });
      peer.on('error', (err) => {
        console.warn('PeerJS join:', err.type || err);
        if (err.type === 'peer-unavailable') {
          showMessage('میزبان آنلاین نیست یا کد اشتباه است (برای راه دور باید میزبان روی https اتاق ساخته باشد).', 'error');
        }
      });
    } catch (e) { console.warn(e); }
  } else if (location.protocol === 'file:') {
    showMessage('برای اتصال از راه دور، صفحه باید روی https باشد (مثلاً GitHub Pages). الان فقط تب محلی کار می‌کند.', 'info');
  }
}

function onlineStartGameAsHost() {
  if (ONLINE.role !== 'host') return;
  for (const p of PLAYERS) {
    if (!ONLINE.seats[p]) ONLINE.seats[p] = 'ai';
  }
  for (const p of PLAYERS) {
    if (ONLINE.seats[p] === 'local') PLAYER_MODE[p] = 'human';
    else if (ONLINE.seats[p] === 'ai') PLAYER_MODE[p] = 'ai';
    else PLAYER_MODE[p] = 'human';
  }
  el.aiDifficulty.value = String(ONLINE.aiDepth);
  selectedTimeControlMinutes = ONLINE.timeMinutes;

  stopPendingAI();
  stopTurnTimer();
  stopMatchClock();
  state = createInitialState();
  refreshAllKingDisplays(state);
  undoStack = [];
  viewIndex = null;
  positionHistory = [cloneState(state)];
  teamTimeLeft = selectedTimeControlMinutes > 0
    ? { blue: selectedTimeControlMinutes * 60, red: selectedTimeControlMinutes * 60 }
    : { blue: null, red: null };
  updateClockDisplay();

  ONLINE.ready = true;
  onlineBroadcast({
    type: 'start',
    state: cloneState(state),
    teamTimeLeft,
    seats: { ...ONLINE.seats },
    room: ONLINE.roomCode,
  });

  showView('gameView');
  showMessage('بازی آنلاین شروع شد. نوبت Player A است.', 'info');
  render();
  maybeTriggerAI();
  startMatchClock();
}

(function wireOnlineUI() {
  const card = document.getElementById('cardPlayOnline');
  if (card) card.addEventListener('click', () => {
    onlineCleanup();
    const cp = document.getElementById('onlineCreatePanel');
    const jp = document.getElementById('onlineJoinPanel');
    const lp = document.getElementById('onlineLobbyPanel');
    if (cp) cp.style.display = '';
    if (jp) jp.style.display = 'none';
    if (lp) lp.style.display = 'none';
    const hint = document.getElementById('onlineEnvHint');
    if (hint) {
      if (location.protocol === 'file:') {
        hint.innerHTML = '⚠️ حالت فعلی: <code>file://</code> — فقط دو تب روی همین سیستم. برای دو نفر از راه دور فایل را روی GitHub Pages با https منتشر کنید.';
      } else if (location.protocol === 'https:') {
        hint.innerHTML = '✅ روی https هستید — می‌توانید برای دوست از راه دور کد اتاق بفرستید (PeerJS).';
      } else {
        hint.innerHTML = 'روی http هستید — PeerJS ممکن است کار کند؛ https بهتر است.';
      }
    }
    showView('onlineSetupView');
  });

  const backBtn = document.getElementById('backFromOnlineBtn');
  if (backBtn) backBtn.addEventListener('click', () => {
    onlineCleanup();
    showView('homeView');
  });

  document.querySelectorAll('#onlineModePicker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#onlineModePicker .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.getElementById('onlineCreatePanel').style.display = mode === 'create' ? '' : 'none';
      document.getElementById('onlineJoinPanel').style.display = mode === 'join' ? '' : 'none';
      document.getElementById('onlineLobbyPanel').style.display = 'none';
    });
  });

  document.querySelectorAll('#onlineHostSeatPicker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#onlineHostSeatPicker .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ONLINE.selectedSeat = btn.dataset.seat;
    });
  });

  document.querySelectorAll('#onlineJoinSeatPicker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#onlineJoinSeatPicker .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ONLINE.joinSelectedSeat = btn.dataset.seat;
    });
  });

  document.querySelectorAll('#onlineTimePicker .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#onlineTimePicker .seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ONLINE.timeMinutes = parseInt(btn.dataset.minutes, 10);
    });
  });

  const createBtn = document.getElementById('createOnlineRoomBtn');
  if (createBtn) createBtn.addEventListener('click', onlineCreateRoom);

  const joinBtn = document.getElementById('joinOnlineRoomBtn');
  if (joinBtn) joinBtn.addEventListener('click', onlineJoinRoom);

  const startBtn = document.getElementById('startOnlineGameBtn');
  if (startBtn) startBtn.addEventListener('click', onlineStartGameAsHost);

  const leaveBtn = document.getElementById('leaveOnlineLobbyBtn');
  if (leaveBtn) leaveBtn.addEventListener('click', () => {
    onlineCleanup();
    showView('homeView');
  });
})();

function onlineAwareFinalizeHumanMove(from, to, movingPlayer, promotionType) {
  if (ONLINE.role === 'guest' && ONLINE.ready) {
    if (movingPlayer !== ONLINE.mySeat) {
      showMessage('نوبت شما نیست.', 'error');
      return;
    }
    onlineSendToHost({ type: 'move', from, to, promotionType, seat: ONLINE.mySeat });
    showMessage('حرکت ارسال شد…', 'info');
    return;
  }
  if (ONLINE.role === 'host' && ONLINE.ready) {
    undoStack.push(cloneState(state));
    const logLenBefore = state.log.length;
    const result = makeMove(state, from, to, promotionType);
    if (!result.ok) {
      undoStack.pop();
      showMessage('خطا در انجام حرکت.', 'error');
      render();
      return;
    }
    playMoveSound();
    describeMoveOutcome(movingPlayer, logLenBefore);
    recordPositionSnapshot();
    render();
    onlineBroadcast({ type: 'state', state: cloneState(state), teamTimeLeft, room: ONLINE.roomCode });
    maybeTriggerAI();
    return;
  }
  undoStack.push(cloneState(state));
  const logLenBefore = state.log.length;
  const result = makeMove(state, from, to, promotionType);
  if (!result.ok) {
    undoStack.pop();
    showMessage('خطا در انجام حرکت.', 'error');
    render();
    return;
  }
  playMoveSound();
  describeMoveOutcome(movingPlayer, logLenBefore);
  recordPositionSnapshot();
  render();
  maybeTriggerAI();
}

finalizeHumanMove = function(from, to, movingPlayer, promotionType) {
  onlineAwareFinalizeHumanMove(from, to, movingPlayer, promotionType);
};

// When host AI makes a move, also broadcast
const _origCompleteAIMove = completeAIMove;
completeAIMove = function(player, move, logLenBefore) {
  _origCompleteAIMove(player, move, logLenBefore);
  if (ONLINE.role === 'host' && ONLINE.ready && !state.gameOver) {
    onlineBroadcast({ type: 'state', state: cloneState(state), teamTimeLeft });
  }
};
