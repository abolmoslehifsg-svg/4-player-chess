'use strict';
/* ==========================================================================
   Board Editor (1v1 + 2v2) · Puzzles · Share · Local submit
   Sits on top of existing engines — does not replace game logic.
   ========================================================================== */

const PUZZLE_SUBMIT_KEY = 'chess4p_puzzle_submissions_v1';

/* ---- Built-in puzzles (2v2 focused + a few 1v1) ---- */
const BUILTIN_PUZZLES = [
  {
    id: '2v2-mate-demo-1',
    mode: '2v2',
    titleFa: 'مات تیمی ساده',
    titleEn: 'Simple team mate',
    goalFa: 'نوبت A — حرکت برنده‌ی تیم آبی را پیدا کن.',
    goalEn: 'Player A to move — find the winning team idea.',
    goal: 'find_move',
    // Sparse tactical shell: A queen near red king area (illustrative training pos)
    position: '4PC1|turn=A|pieces=0,7,K,A;0,8,K,B;7,7,K,C;7,8,K,D;3,7,Q,A;6,7,R,C;1,0,P,A;1,8,P,B;6,0,P,C;6,15,P,D|kings=A:0,7,alive;B:0,8,alive;C:7,7,alive;D:7,8,alive',
    solution: [{ from: { row: 3, col: 7 }, to: { row: 6, col: 7 } }], // QxR illustrative
  },
  {
    id: '2v2-capture-1',
    mode: '2v2',
    titleFa: 'گرفتن آزاد',
    titleEn: 'Free capture',
    goalFa: 'نوبت A — رخ بی‌دفاع را بگیر.',
    goalEn: 'Player A — take the hanging rook.',
    goal: 'find_move',
    position: '4PC1|turn=A|pieces=0,7,K,A;0,8,K,B;7,7,K,C;7,8,K,D;4,4,R,A;4,10,R,C;1,1,P,A;6,14,P,D|kings=A:0,7,alive;B:0,8,alive;C:7,7,alive;D:7,8,alive',
    solution: [{ from: { row: 4, col: 4 }, to: { row: 4, col: 10 } }],
  },
  {
    id: '2v2-defend-1',
    mode: '2v2',
    titleFa: 'دفاع از شاه',
    titleEn: 'King defense',
    goalFa: 'نوبت C — شاه را از تهدید دور کن یا تهدید را بپوشان.',
    goalEn: 'Player C — step the king out of danger or cover the threat.',
    goal: 'find_move',
    position: '4PC1|turn=C|pieces=0,7,K,A;0,8,K,B;7,7,K,C;7,8,K,D;5,7,Q,A;6,5,P,C;6,9,P,D|kings=A:0,7,alive;B:0,8,alive;C:7,7,alive;D:7,8,alive',
    solution: [
      { from: { row: 7, col: 7 }, to: { row: 7, col: 6 } },
      { from: { row: 7, col: 7 }, to: { row: 6, col: 6 } },
      { from: { row: 7, col: 7 }, to: { row: 7, col: 8 } },
    ],
    solutionAny: true,
  },
  {
    id: '2v2-knight-fork',
    mode: '2v2',
    titleFa: 'شاخ اسب',
    titleEn: 'Knight fork idea',
    goalFa: 'نوبت B — با اسب دو مهره را تهدید کن.',
    goalEn: 'Player B — fork with the knight.',
    goal: 'find_move',
    position: '4PC1|turn=B|pieces=0,7,K,A;0,8,K,B;7,7,K,C;7,8,K,D;2,10,N,B;4,12,Q,C;5,8,R,C|kings=A:0,7,alive;B:0,8,alive;C:7,7,alive;D:7,8,alive',
    solution: [{ from: { row: 2, col: 10 }, to: { row: 3, col: 12 } }],
  },
  {
    id: '2v2-pawn-push',
    mode: '2v2',
    titleFa: 'پیشروی سرباز',
    titleEn: 'Useful pawn push',
    goalFa: 'نوبت A — سرباز را پیش ببر.',
    goalEn: 'Player A — advance the pawn.',
    goal: 'find_move',
    position: '4PC1|turn=A|pieces=0,7,K,A;0,8,K,B;7,7,K,C;7,8,K,D;3,3,P,A;4,3,P,C|kings=A:0,7,alive;B:0,8,alive;C:7,7,alive;D:7,8,alive',
    solution: [{ from: { row: 3, col: 3 }, to: { row: 4, col: 3 } }],
  },
  {
    id: '1v1-mate-1',
    mode: '1v1',
    titleFa: 'مات در یک (۱v۱)',
    titleEn: 'Mate in one (1v1)',
    goalFa: 'سفید مات می‌کند.',
    goalEn: 'White mates in one.',
    goal: 'find_move',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    solution: [{ from: { r: 7, c: 4 }, to: { r: 0, c: 4 } }], // Re8#
  },
  {
    id: '1v1-hanging-queen',
    mode: '1v1',
    titleFa: 'وزیر آویزان (۱v۱)',
    titleEn: 'Hanging queen (1v1)',
    goalFa: 'وزیر سیاه را بگیر.',
    goalEn: 'Take the hanging black queen.',
    goal: 'find_move',
    fen: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2',
    solution: [{ from: { r: 7, c: 6 }, to: { r: 4, c: 7 } }], // Nxh4-ish adjusted - actually knight is on g1
  },
  {
    id: '1v1-back-rank',
    mode: '1v1',
    titleFa: 'مات ردیف آخر',
    titleEn: 'Back-rank mate',
    goalFa: 'مات ردیف آخر با رخ.',
    goalEn: 'Deliver back-rank mate with the rook.',
    goal: 'find_move',
    fen: '3r2k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    solution: [{ from: { r: 7, c: 4 }, to: { r: 0, c: 4 } }],
  },
];

/* ---- Editor state ---- */
const ed1 = {
  board: null,
  turn: 'w',
  brush: { color: 'w', type: 'P' },
  selected: null,
};
const ed4 = {
  board: null,
  turn: 'A',
  brush: { player: 'A', type: 'P' },
  selected: null,
};

let puzzleSession = null; // active puzzle solve state

function pzEn() {
  return typeof appSettings !== 'undefined' && appSettings.lang === 'en';
}
function pzMsg(elId, text, kind) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'message-bar ' + (kind || 'info');
}

/* ==========================================================================
   1v1 Board Editor
   ========================================================================== */
function ed1EmptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}
function ed1StartPos() {
  return c1InitialBoard();
}
function ed1Init() {
  if (!ed1.board) ed1.board = ed1StartPos();
  ed1RenderPalette();
  ed1RenderBoard();
  const fenIn = document.getElementById('ed1FenInput');
  if (fenIn && !fenIn.value) {
    try {
      const st = c1NewState();
      st.board = ed1.board;
      st.turn = ed1.turn;
      fenIn.value = c1ToFen(st);
    } catch (_) {}
  }
}
function ed1RenderPalette() {
  const pal = document.getElementById('ed1Palette');
  if (!pal) return;
  const types = ['K', 'Q', 'R', 'B', 'N', 'P'];
  const colors = ['w', 'b'];
  pal.innerHTML = '';
  colors.forEach((color) => {
    types.forEach((type) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ed-piece-btn' + (ed1.brush.color === color && ed1.brush.type === type ? ' active' : '');
      btn.textContent = (C1 && C1.GLYPH && C1.GLYPH[color] && C1.GLYPH[color][type]) || type;
      btn.title = color + type;
      btn.addEventListener('click', () => {
        ed1.brush = { color, type };
        ed1.selected = null;
        ed1RenderPalette();
      });
      pal.appendChild(btn);
    });
  });
  const eraser = document.createElement('button');
  eraser.type = 'button';
  eraser.className = 'ed-piece-btn eraser' + (!ed1.brush.type ? ' active' : '');
  eraser.textContent = pzEn() ? 'Eraser' : 'پاک‌کن';
  eraser.addEventListener('click', () => {
    ed1.brush = { color: 'w', type: null };
    ed1RenderPalette();
  });
  pal.appendChild(eraser);
}
function ed1RenderBoard() {
  const root = document.getElementById('ed1Board');
  if (!root || !ed1.board) return;
  root.innerHTML = '';
  root.className = 'chess-board-1v1 ed-board';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      cell.dataset.r = r;
      cell.dataset.c = c;
      const p = ed1.board[r][c];
      if (p) {
        const sp = document.createElement('span');
        sp.className = 'piece-1v1 ' + (p.color === 'w' ? 'white' : 'black');
        sp.textContent = (C1 && C1.GLYPH && C1.GLYPH[p.color] && C1.GLYPH[p.color][p.type]) || p.type;
        cell.appendChild(sp);
      }
      cell.addEventListener('click', () => ed1Click(r, c));
      root.appendChild(cell);
    }
  }
  const turnSel = document.getElementById('ed1Turn');
  if (turnSel) turnSel.value = ed1.turn;
}
function ed1Click(r, c) {
  if (!ed1.brush.type) {
    ed1.board[r][c] = null;
  } else {
    ed1.board[r][c] = { type: ed1.brush.type, color: ed1.brush.color };
  }
  ed1RenderBoard();
  ed1SyncFenField();
}
function ed1SyncFenField() {
  const fenIn = document.getElementById('ed1FenInput');
  if (!fenIn) return;
  try {
    const st = c1NewState();
    st.board = ed1.board.map((row) => row.map((p) => (p ? { ...p } : null)));
    st.turn = ed1.turn;
    fenIn.value = c1ToFen(st);
  } catch (_) {}
}
function ed1LoadFenFromInput() {
  const fenIn = document.getElementById('ed1FenInput');
  if (!fenIn) return;
  const st = c1FromFen(fenIn.value.trim());
  if (!st) {
    pzMsg('ed1Msg', pzEn() ? 'Invalid FEN.' : 'FEN نامعتبر.', 'error');
    return;
  }
  ed1.board = st.board;
  ed1.turn = st.turn;
  ed1RenderBoard();
  pzMsg('ed1Msg', pzEn() ? 'FEN loaded.' : 'FEN بارگذاری شد.', 'success');
}
function ed1Play() {
  ed1SyncFenField();
  const fenIn = document.getElementById('ed1FenInput');
  const st = c1FromFen((fenIn && fenIn.value) || '');
  if (!st) {
    pzMsg('ed1Msg', pzEn() ? 'Cannot play — invalid position.' : 'موقعیت نامعتبر است.', 'error');
    return;
  }
  // Require both kings
  let wk = 0, bk = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = st.board[r][c];
    if (p && p.type === 'K') { if (p.color === 'w') wk++; else bk++; }
  }
  if (wk !== 1 || bk !== 1) {
    pzMsg('ed1Msg', pzEn() ? 'Need exactly one white and one black king.' : 'باید دقیقاً یک شاه سفید و یک شاه سیاه باشد.', 'error');
    return;
  }
  const mode = (document.getElementById('ed1PlayMode') || {}).value || 'hva';
  c1StartFromCustomState(st, { mode: mode, humanColor: 'w', aiDepth: 2 });
}
function ed1Share() {
  ed1SyncFenField();
  const fen = (document.getElementById('ed1FenInput') || {}).value || '';
  const url = location.origin + location.pathname + '#editor1v1View&fen=' + encodeURIComponent(fen);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      pzMsg('ed1Msg', pzEn() ? 'Share link copied.' : 'لینک کپی شد.', 'success');
    }).catch(() => {
      pzMsg('ed1Msg', url, 'info');
    });
  } else {
    pzMsg('ed1Msg', url, 'info');
  }
}

/* ==========================================================================
   2v2 Board Editor
   ========================================================================== */
function ed4EmptyBoard() {
  return Array.from({ length: 8 }, () => Array(16).fill(null));
}
function ed4Init() {
  if (!ed4.board) {
    try { ed4.board = createInitialBoard(); }
    catch (_) { ed4.board = ed4EmptyBoard(); }
  }
  ed4RenderPalette();
  ed4RenderBoard();
  ed4SyncField();
}
function ed4RenderPalette() {
  const pal = document.getElementById('ed4Palette');
  if (!pal) return;
  const types = ['K', 'Q', 'R', 'B', 'N', 'P'];
  const players = ['A', 'B', 'C', 'D'];
  pal.innerHTML = '';
  players.forEach((player) => {
    const row = document.createElement('div');
    row.className = 'ed4-pal-row';
    const lab = document.createElement('span');
    lab.className = 'ed4-pal-label player-' + player;
    lab.textContent = player;
    row.appendChild(lab);
    types.forEach((type) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ed-piece-btn player-' + player + (ed4.brush.player === player && ed4.brush.type === type ? ' active' : '');
      btn.textContent = (typeof PIECE_GLYPH !== 'undefined' && PIECE_GLYPH[type]) || type;
      btn.addEventListener('click', () => {
        ed4.brush = { player, type };
        ed4RenderPalette();
      });
      row.appendChild(btn);
    });
    pal.appendChild(row);
  });
  const eraser = document.createElement('button');
  eraser.type = 'button';
  eraser.className = 'ed-piece-btn eraser' + (!ed4.brush.type ? ' active' : '');
  eraser.textContent = pzEn() ? 'Eraser' : 'پاک‌کن';
  eraser.addEventListener('click', () => {
    ed4.brush = { player: 'A', type: null };
    ed4RenderPalette();
  });
  pal.appendChild(eraser);
}
function ed4RenderBoard() {
  const root = document.getElementById('ed4Board');
  if (!root || !ed4.board) return;
  root.innerHTML = '';
  root.className = 'chess-board ed-board ed-board-4p';
  root.style.gridTemplateColumns = 'repeat(16, 1fr)';
  root.style.gridTemplateRows = 'repeat(8, 1fr)';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 16; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      if (c === 8) cell.classList.add('col-boundary');
      const p = ed4.board[r][c];
      if (p) {
        const sp = document.createElement('span');
        sp.className = 'piece player-' + p.player;
        sp.textContent = (typeof PIECE_GLYPH !== 'undefined' && PIECE_GLYPH[p.type]) || p.type;
        cell.appendChild(sp);
      }
      cell.addEventListener('click', () => ed4Click(r, c));
      root.appendChild(cell);
    }
  }
  const turnSel = document.getElementById('ed4Turn');
  if (turnSel) turnSel.value = ed4.turn;
}
function ed4Click(r, c) {
  if (!ed4.brush.type) {
    ed4.board[r][c] = null;
  } else {
    // Only one king per player
    if (ed4.brush.type === 'K') {
      for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 16; cc++) {
        const q = ed4.board[rr][cc];
        if (q && q.type === 'K' && q.player === ed4.brush.player) ed4.board[rr][cc] = null;
      }
    }
    ed4.board[r][c] = { type: ed4.brush.type, player: ed4.brush.player };
  }
  ed4RenderBoard();
  ed4SyncField();
}
function ed4BuildState() {
  const draft = {
    board: ed4.board.map((row) => row.map((p) => (p ? { type: p.type, player: p.player } : null))),
    kings: { A: { row: -1, col: -1, status: 'alive' }, B: { row: -1, col: -1, status: 'alive' }, C: { row: -1, col: -1, status: 'alive' }, D: { row: -1, col: -1, status: 'alive' } },
    currentPlayerIndex: Math.max(0, PLAYERS.indexOf(ed4.turn)),
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
  for (let r = 0; r < 8; r++) for (let c = 0; c < 16; c++) {
    const p = draft.board[r][c];
    if (p && p.type === 'K') draft.kings[p.player] = { row: r, col: c, status: 'alive' };
  }
  if (typeof posKey4 === 'function') draft.posKeys.push(posKey4(draft));
  return draft;
}
function ed4SyncField() {
  const field = document.getElementById('ed4PosInput');
  if (!field) return;
  try {
    field.value = export4pPosition(ed4BuildState());
  } catch (e) {
    console.warn(e);
  }
}
function ed4LoadFromField() {
  const field = document.getElementById('ed4PosInput');
  if (!field) return;
  const st = import4pPosition(field.value.trim());
  if (!st) {
    pzMsg('ed4Msg', pzEn() ? 'Invalid 2v2 position string.' : 'رشتهٔ موقعیت نامعتبر است.', 'error');
    return;
  }
  ed4.board = st.board;
  ed4.turn = PLAYERS[st.currentPlayerIndex] || 'A';
  ed4RenderBoard();
  pzMsg('ed4Msg', pzEn() ? 'Position loaded.' : 'موقعیت بارگذاری شد.', 'success');
}
function ed4Play() {
  const st = ed4BuildState();
  // Require all four kings for a proper 2v2 game
  for (const pl of PLAYERS) {
    if (st.kings[pl].row < 0) {
      pzMsg('ed4Msg', pzEn() ? ('Missing king for player ' + pl) : ('شاه بازیکن ' + pl + ' نیست.'), 'error');
      return;
    }
  }
  startGameFromCustomState(st);
}
function ed4Share() {
  ed4SyncField();
  const pos = (document.getElementById('ed4PosInput') || {}).value || '';
  const url = location.origin + location.pathname + '#editor4pView&pos=' + encodeURIComponent(pos);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      pzMsg('ed4Msg', pzEn() ? 'Share link copied.' : 'لینک کپی شد.', 'success');
    }).catch(() => pzMsg('ed4Msg', url, 'info'));
  } else pzMsg('ed4Msg', url, 'info');
}

/* ==========================================================================
   Puzzle list & solve
   ========================================================================== */
function renderPuzzleList() {
  const list = document.getElementById('puzzleList');
  if (!list) return;
  list.innerHTML = '';
  BUILTIN_PUZZLES.forEach((pz) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'puzzle-card cc-card';
    const title = pzEn() ? (pz.titleEn || pz.titleFa) : (pz.titleFa || pz.titleEn);
    const goal = pzEn() ? (pz.goalEn || pz.goalFa) : (pz.goalFa || pz.goalEn);
    const mode = pz.mode === '2v2' ? '2v2' : '1v1';
    btn.innerHTML =
      '<div class="puzzle-card-top"><span class="puzzle-mode-tag">' + mode + '</span></div>' +
      '<div class="puzzle-card-title">' + title + '</div>' +
      '<div class="puzzle-card-desc">' + goal + '</div>';
    btn.addEventListener('click', () => startPuzzle(pz.id));
    list.appendChild(btn);
  });
}

function startPuzzle(id) {
  const pz = BUILTIN_PUZZLES.find((x) => x.id === id);
  if (!pz) return;
  puzzleSession = {
    puzzle: pz,
    solved: false,
    attempts: 0,
  };
  const title = document.getElementById('puzzlePlayTitle');
  const goal = document.getElementById('puzzlePlayGoal');
  if (title) title.textContent = pzEn() ? (pz.titleEn || pz.titleFa) : (pz.titleFa || pz.titleEn);
  if (goal) goal.textContent = pzEn() ? (pz.goalEn || pz.goalFa) : (pz.goalFa || pz.goalEn);
  pzMsg('puzzlePlayMsg', pzEn() ? 'Find the move.' : 'حرکت درست را پیدا کن.', 'info');

  if (pz.mode === '1v1') {
    const st = c1FromFen(pz.fen);
    if (!st) {
      pzMsg('puzzlePlayMsg', 'Bad puzzle FEN', 'error');
      return;
    }
    // Play in puzzle mode: human moves both? only side to move
    puzzleSession.kind = '1v1';
    puzzleSession.state = st;
    showView('puzzlePlayView');
    renderPuzzle1v1Board(st);
  } else {
    const st = import4pPosition(pz.position);
    if (!st) {
      pzMsg('puzzlePlayMsg', 'Bad puzzle position', 'error');
      return;
    }
    puzzleSession.kind = '2v2';
    puzzleSession.state = st;
    showView('puzzlePlayView');
    renderPuzzle4pBoard(st);
  }
}

function renderPuzzle1v1Board(st) {
  const root = document.getElementById('puzzleBoard');
  if (!root) return;
  root.innerHTML = '';
  root.className = 'chess-board-1v1 ed-board';
  root.style.gridTemplateColumns = 'repeat(8, 1fr)';
  let selected = null;
  let legal = [];
  const draw = () => {
    root.innerHTML = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      if (selected && selected.r === r && selected.c === c) cell.classList.add('selected');
      if (legal.some((m) => m.r === r && m.c === c)) {
        const cap = st.board[r][c];
        cell.classList.add(cap ? 'legal-capture' : 'legal-move');
      }
      const p = st.board[r][c];
      if (p) {
        const sp = document.createElement('span');
        sp.className = 'piece-1v1 ' + (p.color === 'w' ? 'white' : 'black');
        sp.textContent = C1.GLYPH[p.color][p.type];
        cell.appendChild(sp);
      }
      cell.addEventListener('click', () => {
        if (puzzleSession && puzzleSession.solved) return;
        const piece = st.board[r][c];
        if (selected && legal.some((m) => m.r === r && m.c === c)) {
          tryPuzzleMove1(selected, { r, c });
          selected = null; legal = [];
          return;
        }
        if (piece && piece.color === st.turn) {
          selected = { r, c };
          legal = c1LegalMoves(st, r, c);
        } else {
          selected = null; legal = [];
        }
        draw();
      });
      root.appendChild(cell);
    }
  };
  draw();
}

function tryPuzzleMove1(from, to) {
  const pz = puzzleSession.puzzle;
  puzzleSession.attempts++;
  const okList = pz.solution || [];
  const match = okList.some((sol) => {
    const fr = sol.from.r != null ? sol.from.r : sol.from.row;
    const fc = sol.from.c != null ? sol.from.c : sol.from.col;
    const tr = sol.to.r != null ? sol.to.r : sol.to.row;
    const tc = sol.to.c != null ? sol.to.c : sol.to.col;
    return fr === from.r && fc === from.c && tr === to.r && tc === to.c;
  });
  if (match || (pz.solutionAny && match !== false && okList.some((sol) => {
    const fr = sol.from.r != null ? sol.from.r : sol.from.row;
    const fc = sol.from.c != null ? sol.from.c : sol.from.col;
    const tr = sol.to.r != null ? sol.to.r : sol.to.row;
    const tc = sol.to.c != null ? sol.to.c : sol.to.col;
    return fr === from.r && fc === from.c && tr === to.r && tc === to.c;
  }))) {
    puzzleSession.solved = true;
    // apply move for feedback
    const legal = c1LegalMoves(puzzleSession.state, from.r, from.c);
    const mv = legal.find((m) => m.r === to.r && m.c === to.c);
    if (mv) c1MakeMove(puzzleSession.state, from, mv);
    renderPuzzle1v1Board(puzzleSession.state);
    pzMsg('puzzlePlayMsg', pzEn() ? 'Correct!' : 'درست بود!', 'success');
  } else {
    pzMsg('puzzlePlayMsg', pzEn() ? 'Not the idea — try again.' : 'این ایده نیست — دوباره تلاش کن.', 'error');
  }
}

function renderPuzzle4pBoard(st) {
  const root = document.getElementById('puzzleBoard');
  if (!root) return;
  root.innerHTML = '';
  root.className = 'chess-board ed-board ed-board-4p';
  root.style.gridTemplateColumns = 'repeat(16, 1fr)';
  root.style.gridTemplateRows = 'repeat(8, 1fr)';
  let selected = null;
  let legal = [];
  const player = PLAYERS[st.currentPlayerIndex];
  const draw = () => {
    root.innerHTML = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 16; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      if (c === 8) cell.classList.add('col-boundary');
      if (selected && selected.row === r && selected.col === c) cell.classList.add('selected');
      if (legal.some((m) => m.row === r && m.col === c)) {
        const cap = st.board[r][c];
        cell.classList.add(cap ? 'legal-capture' : 'legal-move');
      }
      const p = st.board[r][c];
      if (p) {
        const sp = document.createElement('span');
        sp.className = 'piece player-' + p.player;
        sp.textContent = (typeof PIECE_GLYPH !== 'undefined' && PIECE_GLYPH[p.type]) || p.type;
        cell.appendChild(sp);
      }
      cell.addEventListener('click', () => {
        if (puzzleSession && puzzleSession.solved) return;
        const piece = st.board[r][c];
        if (selected && legal.some((m) => m.row === r && m.col === c)) {
          tryPuzzleMove4(selected, { row: r, col: c });
          selected = null; legal = [];
          return;
        }
        if (piece && piece.player === player) {
          selected = { row: r, col: c };
          legal = typeof generateLegalMovesForPiece === 'function'
            ? generateLegalMovesForPiece(st, player, r, c)
            : [];
        } else {
          selected = null; legal = [];
        }
        draw();
      });
      root.appendChild(cell);
    }
  };
  draw();
}

function tryPuzzleMove4(from, to) {
  const pz = puzzleSession.puzzle;
  puzzleSession.attempts++;
  const okList = pz.solution || [];
  const hit = okList.some((sol) => {
    const fr = sol.from.row != null ? sol.from.row : sol.from.r;
    const fc = sol.from.col != null ? sol.from.col : sol.from.c;
    const tr = sol.to.row != null ? sol.to.row : sol.to.r;
    const tc = sol.to.col != null ? sol.to.col : sol.to.c;
    return fr === from.row && fc === from.col && tr === to.row && tc === to.col;
  });
  if (hit) {
    puzzleSession.solved = true;
    try {
      if (typeof makeMove === 'function') makeMove(puzzleSession.state, from, to, null);
    } catch (_) {}
    renderPuzzle4pBoard(puzzleSession.state);
    pzMsg('puzzlePlayMsg', pzEn() ? 'Correct!' : 'درست بود!', 'success');
  } else {
    pzMsg('puzzlePlayMsg', pzEn() ? 'Not the idea — try again.' : 'این ایده نیست — دوباره تلاش کن.', 'error');
  }
}

/* ==========================================================================
   Submit (local queue — no server yet)
   ========================================================================== */
function loadSubmissions() {
  try { return JSON.parse(localStorage.getItem(PUZZLE_SUBMIT_KEY) || '[]'); }
  catch (_) { return []; }
}
function saveSubmissions(list) {
  try { localStorage.setItem(PUZZLE_SUBMIT_KEY, JSON.stringify(list.slice(-50))); } catch (_) {}
}
function submitPuzzleLocal() {
  const mode = (document.getElementById('submitMode') || {}).value || '2v2';
  const title = ((document.getElementById('submitTitle') || {}).value || '').trim();
  const goal = ((document.getElementById('submitGoal') || {}).value || '').trim();
  const pos = ((document.getElementById('submitPos') || {}).value || '').trim();
  const sol = ((document.getElementById('submitSol') || {}).value || '').trim();
  const contact = ((document.getElementById('submitContact') || {}).value || '').trim();
  if (!title || !pos || !sol) {
    pzMsg('submitMsg', pzEn() ? 'Title, position and solution are required.' : 'عنوان، موقعیت و راه‌حل لازم است.', 'error');
    return;
  }
  if (mode === '2v2' && !pos.startsWith('4PC1|')) {
    pzMsg('submitMsg', pzEn() ? '2v2 position must be a 4PC1|… string from the editor.' : 'موقعیت ۲v۲ باید رشتهٔ 4PC1 از ویرایشگر باشد.', 'error');
    return;
  }
  const entry = {
    id: 'sub-' + Date.now(),
    mode, title, goal, pos, sol, contact,
    createdAt: new Date().toISOString(),
    status: 'queued_local',
  };
  const list = loadSubmissions();
  list.push(entry);
  saveSubmissions(list);
  // Copy package for Telegram / manual review
  const pack = JSON.stringify(entry, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pack).then(() => {
      pzMsg('submitMsg', pzEn()
        ? 'Saved locally and copied JSON. Send it to @tenmanogod for review. Rewards need a real server later.'
        : 'ذخیرهٔ محلی شد و JSON کپی شد. برای بررسی به @tenmanogod بفرست. جایزه بعداً با سرور واقعی.', 'success');
    }).catch(() => {
      pzMsg('submitMsg', pzEn() ? 'Saved locally.' : 'ذخیرهٔ محلی شد.', 'success');
    });
  } else {
    pzMsg('submitMsg', pzEn() ? 'Saved locally.' : 'ذخیرهٔ محلی شد.', 'success');
  }
  renderSubmitQueue();
}
function renderSubmitQueue() {
  const el = document.getElementById('submitQueue');
  if (!el) return;
  const list = loadSubmissions();
  if (!list.length) {
    el.textContent = pzEn() ? 'No local submissions yet.' : 'هنوز ارسالی نیست.';
    return;
  }
  el.innerHTML = list.slice().reverse().map((x) =>
    '<div class="submit-queue-item"><strong>' + (x.title || x.id) + '</strong> · ' + x.mode + ' · ' + (x.status || '') + '</div>'
  ).join('');
}

/* ==========================================================================
   Wiring / hash deep links
   ========================================================================== */
function wirePuzzleUI() {
  // Home cards
  const cardPz = document.getElementById('cardPuzzles');
  if (cardPz) cardPz.addEventListener('click', () => {
    showView('puzzlesView');
    renderPuzzleList();
  });
  const cardEd1 = document.getElementById('cardEditor1v1');
  if (cardEd1) cardEd1.addEventListener('click', () => {
    showView('editor1v1View');
    ed1Init();
  });
  const cardEd4 = document.getElementById('cardEditor4p');
  if (cardEd4) cardEd4.addEventListener('click', () => {
    showView('editor4pView');
    ed4Init();
  });
  const cardSub = document.getElementById('cardSubmitPuzzle');
  if (cardSub) cardSub.addEventListener('click', () => {
    showView('submitPuzzleView');
    renderSubmitQueue();
  });

  // Back buttons
  ['backFromPuzzlesBtn', 'backFromEditor1v1Btn', 'backFromEditor4pBtn', 'backFromPuzzlePlayBtn', 'backFromSubmitPuzzleBtn'].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => showView('homeView'));
  });

  // Editor 1v1 controls
  const ed1Turn = document.getElementById('ed1Turn');
  if (ed1Turn) ed1Turn.addEventListener('change', () => { ed1.turn = ed1Turn.value; ed1SyncFenField(); });
  const ed1Clear = document.getElementById('ed1ClearBtn');
  if (ed1Clear) ed1Clear.addEventListener('click', () => { ed1.board = ed1EmptyBoard(); ed1RenderBoard(); ed1SyncFenField(); });
  const ed1Start = document.getElementById('ed1StartBtn');
  if (ed1Start) ed1Start.addEventListener('click', () => { ed1.board = ed1StartPos(); ed1.turn = 'w'; ed1RenderBoard(); ed1SyncFenField(); });
  const ed1Load = document.getElementById('ed1LoadFenBtn');
  if (ed1Load) ed1Load.addEventListener('click', ed1LoadFenFromInput);
  const ed1PlayBtn = document.getElementById('ed1PlayBtn');
  if (ed1PlayBtn) ed1PlayBtn.addEventListener('click', ed1Play);
  const ed1ShareBtn = document.getElementById('ed1ShareBtn');
  if (ed1ShareBtn) ed1ShareBtn.addEventListener('click', ed1Share);

  // Editor 4p
  const ed4Turn = document.getElementById('ed4Turn');
  if (ed4Turn) ed4Turn.addEventListener('change', () => { ed4.turn = ed4Turn.value; ed4SyncField(); });
  const ed4Clear = document.getElementById('ed4ClearBtn');
  if (ed4Clear) ed4Clear.addEventListener('click', () => { ed4.board = ed4EmptyBoard(); ed4RenderBoard(); ed4SyncField(); });
  const ed4Start = document.getElementById('ed4StartBtn');
  if (ed4Start) ed4Start.addEventListener('click', () => {
    try { ed4.board = createInitialBoard(); } catch (_) { ed4.board = ed4EmptyBoard(); }
    ed4.turn = 'A';
    ed4RenderBoard();
    ed4SyncField();
  });
  const ed4Load = document.getElementById('ed4LoadBtn');
  if (ed4Load) ed4Load.addEventListener('click', ed4LoadFromField);
  const ed4PlayBtn = document.getElementById('ed4PlayBtn');
  if (ed4PlayBtn) ed4PlayBtn.addEventListener('click', ed4Play);
  const ed4ShareBtn = document.getElementById('ed4ShareBtn');
  if (ed4ShareBtn) ed4ShareBtn.addEventListener('click', ed4Share);

  const submitBtn = document.getElementById('submitPuzzleBtn');
  if (submitBtn) submitBtn.addEventListener('click', submitPuzzleLocal);

  // Deep link: #editor1v1View&fen=... or #editor4pView&pos=...
  try {
    const hash = (location.hash || '').replace(/^#/, '');
    if (hash.startsWith('editor1v1View')) {
      const fenMatch = hash.match(/fen=([^&]+)/);
      showView('editor1v1View');
      ed1Init();
      if (fenMatch) {
        const fenIn = document.getElementById('ed1FenInput');
        if (fenIn) fenIn.value = decodeURIComponent(fenMatch[1]);
        ed1LoadFenFromInput();
      }
    } else if (hash.startsWith('editor4pView')) {
      const posMatch = hash.match(/pos=([^&]+)/);
      showView('editor4pView');
      ed4Init();
      if (posMatch) {
        const field = document.getElementById('ed4PosInput');
        if (field) field.value = decodeURIComponent(posMatch[1]);
        ed4LoadFromField();
      }
    } else if (hash === 'puzzlesView') {
      showView('puzzlesView');
      renderPuzzleList();
    }
  } catch (e) {
    console.warn('puzzle deep link', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wirePuzzleUI);
} else {
  wirePuzzleUI();
}
