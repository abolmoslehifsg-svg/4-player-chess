'use strict';

/* ==========================================================================
   1v1 Standard Chess (8x8) — rules + UI + minimax AI
   ========================================================================== */
const C1 = {
  ROWS: 8,
  COLS: 8,
  FILES: 'abcdefgh',
  GLYPH: {
    w: { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙' },
    b: { K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞', P:'♟' },
  },
  VAL: { P:100, N:320, B:330, R:500, Q:900, K:20000 },
};

function c1In(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function c1Sq(r,c){ return C1.FILES[c] + (8-r); }

function c1InitialBoard(){
  const b = Array.from({length:8},()=>Array(8).fill(null));
  const back = ['R','N','B','Q','K','B','N','R']; // a-h: R N B Q K B N R (standard)
  for(let c=0;c<8;c++){ b[0][c]={type:back[c],color:'b'}; b[7][c]={type:back[c],color:'w'}; }
  for(let c=0;c<8;c++){ b[1][c]={type:'P',color:'b'}; b[6][c]={type:'P',color:'w'}; }
  return b;
}

function c1NewState(){
  return {
    board: c1InitialBoard(),
    turn: 'w',
    castling: { wK:true, wQ:true, bK:true, bQ:true },
    ep: null,
    halfmove: 0,
    fullmove: 1,
    history: [],
    moveLog: [],
    selected: null,
    legal: [],
    gameOver: false,
    result: null,
    lastMove: null,
  };
}

function c1Clone(s){ return JSON.parse(JSON.stringify(s)); }

function c1FindKing(board, color){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p && p.type==='K' && p.color===color) return {r,c};
  }
  return null;
}

function c1Attacked(board, r, c, byColor){
  // pawn
  const pr = byColor==='w' ? r+1 : r-1;
  for(const dc of [-1,1]){
    const cc=c+dc;
    if(c1In(pr,cc)){
      const p=board[pr][cc];
      if(p && p.type==='P' && p.color===byColor) return true;
    }
  }
  // knight
  for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
    const rr=r+dr, cc=c+dc;
    if(!c1In(rr,cc)) continue;
    const p=board[rr][cc];
    if(p && p.type==='N' && p.color===byColor) return true;
  }
  // king
  for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
    if(!dr && !dc) continue;
    const rr=r+dr, cc=c+dc;
    if(!c1In(rr,cc)) continue;
    const p=board[rr][cc];
    if(p && p.type==='K' && p.color===byColor) return true;
  }
  // sliding
  const rays = {
    R:[[-1,0],[1,0],[0,-1],[0,1]],
    B:[[-1,-1],[-1,1],[1,-1],[1,1]],
  };
  for(const [dr,dc] of rays.R){
    let rr=r+dr, cc=c+dc;
    while(c1In(rr,cc)){
      const p=board[rr][cc];
      if(p){ if(p.color===byColor && (p.type==='R'||p.type==='Q')) return true; break; }
      rr+=dr; cc+=dc;
    }
  }
  for(const [dr,dc] of rays.B){
    let rr=r+dr, cc=c+dc;
    while(c1In(rr,cc)){
      const p=board[rr][cc];
      if(p){ if(p.color===byColor && (p.type==='B'||p.type==='Q')) return true; break; }
      rr+=dr; cc+=dc;
    }
  }
  return false;
}

function c1InCheck(board, color){
  const k=c1FindKing(board,color);
  if(!k) return true;
  return c1Attacked(board, k.r, k.c, color==='w'?'b':'w');
}

function c1Pseudo(board, r, c, ep){
  const piece=board[r][c];
  if(!piece) return [];
  const moves=[];
  const enemy = piece.color==='w'?'b':'w';
  const push=(rr,cc,extra={})=>{
    if(!c1In(rr,cc)) return false;
    const t=board[rr][cc];
    if(!t){ moves.push(Object.assign({r:rr,c:cc},extra)); return true; }
    if(t.color===enemy){ moves.push(Object.assign({r:rr,c:cc,capture:true},extra)); return false; }
    return false;
  };
  switch(piece.type){
    case 'N':
      for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) push(r+dr,c+dc);
      break;
    case 'K':
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if(dr||dc) push(r+dr,c+dc);
      break;
    case 'R': case 'B': case 'Q': {
      const dirs = piece.type==='R' ? [[-1,0],[1,0],[0,-1],[0,1]]
        : piece.type==='B' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
        : [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
      for(const [dr,dc] of dirs){
        let rr=r+dr, cc=c+dc;
        while(push(rr,cc)){ rr+=dr; cc+=dc; }
      }
      break;
    }
    case 'P': {
      const dir = piece.color==='w' ? -1 : 1;
      const start = piece.color==='w' ? 6 : 1;
      const one=r+dir;
      if(c1In(one,c) && !board[one][c]){
        const promo = (piece.color==='w' && one===0) || (piece.color==='b' && one===7);
        moves.push({r:one,c, promotion: promo||undefined});
        const two=r+2*dir;
        if(r===start && c1In(two,c) && !board[two][c]) moves.push({r:two,c, double:true});
      }
      for(const dc of [-1,1]){
        const rr=r+dir, cc=c+dc;
        if(!c1In(rr,cc)) continue;
        const t=board[rr][cc];
        const promo = (piece.color==='w' && rr===0) || (piece.color==='b' && rr===7);
        if(t && t.color===enemy) moves.push({r:rr,c:cc,capture:true, promotion: promo||undefined});
        else if(!t && ep && ep.r===rr && ep.c===cc) moves.push({r:rr,c:cc,capture:true, enPassant:true});
      }
      break;
    }
  }
  return moves;
}

function c1ApplyRaw(board, from, to, promo){
  const piece = board[from.r][from.c];
  const info = { captured: board[to.r][to.c], epCaptured: null };
  if(piece.type==='P' && to.enPassant){
    const cr = piece.color==='w' ? to.r+1 : to.r-1;
    info.epCaptured = board[cr][to.c];
    board[cr][to.c] = null;
  }
  board[to.r][to.c] = piece;
  board[from.r][from.c] = null;
  if(piece.type==='P' && (to.promotion || to.r===0 || to.r===7)){
    const t = promo || to.promotionType || 'Q';
    board[to.r][to.c] = { type: t, color: piece.color };
    info.promoted = t;
  }
  // castling move rook
  if(piece.type==='K' && Math.abs(to.c-from.c)===2){
    if(to.c===6){ // king side
      board[to.r][5]=board[to.r][7]; board[to.r][7]=null; info.castle='K';
    } else if(to.c===2){
      board[to.r][3]=board[to.r][0]; board[to.r][0]=null; info.castle='Q';
    }
  }
  return info;
}

function c1LegalMoves(state, r, c){
  const piece=state.board[r][c];
  if(!piece || piece.color!==state.turn) return [];
  let raw = c1Pseudo(state.board, r, c, state.ep);
  // castling
  if(piece.type==='K'){
    const color=piece.color;
    const row = color==='w'?7:0;
    const enemy = color==='w'?'b':'w';
    if(r===row && c===4 && !c1InCheck(state.board, color)){
      if(state.castling[color+'K'] && !state.board[row][5] && !state.board[row][6]
        && !c1Attacked(state.board,row,5,enemy) && !c1Attacked(state.board,row,6,enemy)
        && state.board[row][7] && state.board[row][7].type==='R' && state.board[row][7].color===color){
        raw.push({r:row,c:6,castle:'K'});
      }
      if(state.castling[color+'Q'] && !state.board[row][1] && !state.board[row][2] && !state.board[row][3]
        && !c1Attacked(state.board,row,3,enemy) && !c1Attacked(state.board,row,2,enemy)
        && state.board[row][0] && state.board[row][0].type==='R' && state.board[row][0].color===color){
        raw.push({r:row,c:2,castle:'Q'});
      }
    }
  }
  const legal=[];
  for(const mv of raw){
    // expand promotions
    const promos = (mv.promotion || (piece.type==='P' && (mv.r===0||mv.r===7))) ? ['Q','R','B','N'] : [null];
    for(const pr of promos){
      const b2 = state.board.map(row=>row.map(x=>x?{...x}:null));
      const m2 = Object.assign({}, mv);
      if(pr) m2.promotionType=pr;
      c1ApplyRaw(b2, {r,c}, m2, pr);
      if(!c1InCheck(b2, piece.color)) legal.push(Object.assign({}, m2, pr?{promotionType:pr}:{}));
    }
  }
  return legal;
}

function c1AllLegal(state){
  const all=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=state.board[r][c];
    if(p && p.color===state.turn){
      for(const mv of c1LegalMoves(state,r,c)) all.push({from:{r,c}, to:mv});
    }
  }
  return all;
}

function c1MakeMove(state, from, to){
  const piece=state.board[from.r][from.c];
  if(!piece) return false;
  const board=state.board;
  const info=c1ApplyRaw(board, from, to, to.promotionType);
  // castling rights
  if(piece.type==='K'){ state.castling[piece.color+'K']=false; state.castling[piece.color+'Q']=false; }
  if(piece.type==='R'){
    if(from.r===(piece.color==='w'?7:0) && from.c===0) state.castling[piece.color+'Q']=false;
    if(from.r===(piece.color==='w'?7:0) && from.c===7) state.castling[piece.color+'K']=false;
  }
  if(info.captured && info.captured.type==='R'){
    const cr=to.r, cc=to.c;
    if(cr===7&&cc===0) state.castling.wQ=false;
    if(cr===7&&cc===7) state.castling.wK=false;
    if(cr===0&&cc===0) state.castling.bQ=false;
    if(cr===0&&cc===7) state.castling.bK=false;
  }
  // ep
  if(piece.type==='P' && to.double) state.ep = { r: (from.r+to.r)/2, c: from.c };
  else state.ep = null;

  const san = c1Notation(piece, from, to, info);
  state.history.push(san);
  state.lastMove = { from, to };
  state.halfmove = (piece.type==='P' || info.captured || info.epCaptured) ? 0 : state.halfmove+1;
  if(state.turn==='b') state.fullmove++;
  state.turn = state.turn==='w'?'b':'w';
  state.selected=null; state.legal=[];

  if(c1InsufficientMaterial(state.board)){
    state.gameOver=true;
    state.result='draw-material';
  } else {
    const replies = c1AllLegal(state);
    if(replies.length===0){
      state.gameOver=true;
      if(c1InCheck(state.board, state.turn)) state.result = (state.turn==='w'?'b':'w') + '-wins';
      else state.result = 'draw-stalemate';
    } else if(state.halfmove>=100){
      state.gameOver=true; state.result='draw-50';
    }
  }
  return true;
}

/** Draw by insufficient material: K vs K, K+minor vs K, K+B vs K+B (same color). */
function c1InsufficientMaterial(board){
  const pcs = [];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p) pcs.push({ type:p.type, color:p.color, r, c });
  }
  const nonK = pcs.filter(p => p.type !== 'K');
  if(nonK.length === 0) return true; // K vs K
  if(nonK.length === 1){
    const t = nonK[0].type;
    return t === 'B' || t === 'N'; // K+B vs K or K+N vs K
  }
  if(nonK.length === 2){
    const a = nonK[0], b = nonK[1];
    // K+B vs K+B, bishops on same color squares
    if(a.type==='B' && b.type==='B' && a.color!==b.color){
      const colorA = (a.r + a.c) % 2;
      const colorB = (b.r + b.c) % 2;
      return colorA === colorB;
    }
  }
  return false;
}

function c1Notation(piece, from, to, info){
  if(info.castle==='K') return 'O-O';
  if(info.castle==='Q') return 'O-O-O';
  let s = piece.type==='P' ? '' : piece.type;
  if(info.captured || info.epCaptured){
    if(piece.type==='P') s += C1.FILES[from.c];
    s += 'x';
  }
  s += c1Sq(to.r, to.c);
  if(info.promoted) s += '=' + info.promoted;
  return s;
}


// --- Evaluation & AI (Stockfish UCI + fallback minimax) ---
const C1_PST = {
  P:[[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
  N:[[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
  B:[[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,10,10,10,10,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,5,5,5,5,-10],[-10,0,5,0,0,5,0,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
  R:[[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
  Q:[[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
  K:[[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]],
};

function c1Eval(state){
  if(state.gameOver){
    if(state.result==='w-wins') return 100000;
    if(state.result==='b-wins') return -100000;
    return 0;
  }
  let s=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=state.board[r][c];
    if(!p) continue;
    const sign=p.color==='w'?1:-1;
    s += sign * C1.VAL[p.type];
    const table=C1_PST[p.type];
    if(table){
      const pr = p.color==='w' ? r : 7-r;
      s += sign * table[pr][c];
    }
  }
  // mobility
  const turnSave = state.turn;
  state.turn = 'w'; s += c1AllLegal(state).length * 2;
  state.turn = 'b'; s -= c1AllLegal(state).length * 2;
  state.turn = turnSave;
  return s;
}

function c1ToFen(state){
  let fen = '';
  for(let r=0;r<8;r++){
    let empty=0;
    for(let c=0;c<8;c++){
      const p=state.board[r][c];
      if(!p){ empty++; continue; }
      if(empty){ fen+=empty; empty=0; }
      const ch = p.type === 'P' ? 'p' : p.type.toLowerCase();
      fen += p.color==='w' ? ch.toUpperCase() : ch;
    }
    if(empty) fen+=empty;
    if(r<7) fen+='/';
  }
  fen += ' ' + state.turn;
  let castle = '';
  if(state.castling.wK) castle+='K';
  if(state.castling.wQ) castle+='Q';
  if(state.castling.bK) castle+='k';
  if(state.castling.bQ) castle+='q';
  fen += ' ' + (castle || '-');
  if(state.ep) fen += ' ' + c1Sq(state.ep.r, state.ep.c);
  else fen += ' -';
  fen += ' ' + state.halfmove + ' ' + state.fullmove;
  return fen;
}

function c1ParseUci(uci){
  if(!uci || uci.length < 4) return null;
  const files = 'abcdefgh';
  const fc = files.indexOf(uci[0]), fr = 8 - parseInt(uci[1],10);
  const tc = files.indexOf(uci[2]), tr = 8 - parseInt(uci[3],10);
  if(fc<0||tc<0||fr<0||tr<0) return null;
  const move = { from:{r:fr,c:fc}, to:{r:tr,c:tc} };
  if(uci.length>=5){
    const pr = uci[4].toUpperCase();
    if('QRBN'.includes(pr)) move.to.promotionType = pr;
  }
  // mark en passant / castle flags for apply
  const piece = s1.board[fr][fc];
  if(piece && piece.type==='K' && Math.abs(tc-fc)===2) move.to.castle = tc>fc ? 'K' : 'Q';
  if(piece && piece.type==='P' && fc!==tc && !s1.board[tr][tc]) move.to.enPassant = true;
  if(piece && piece.type==='P' && Math.abs(tr-fr)===2) move.to.double = true;
  return move;
}

// Strength presets → Stockfish skill/depth/movetime
const C1_STRENGTH = {
  1: { skill: 2, depth: 8,  movetime: 400,  label: '~1100' },
  2: { skill: 5, depth: 11, movetime: 700,  label: '~1400' },
  3: { skill: 10, depth: 13, movetime: 1000, label: '~1700' },
  4: { skill: 14, depth: 16, movetime: 1500, label: '~2000' },
  5: { skill: 20, depth: 20, movetime: 2500, label: '~2400+' },
};

let c1SfWorker = null;
let c1SfReady = false;
let c1SfPending = null;

function c1InitStockfish(){
  if(c1SfWorker || c1SfReady) return;
  const urls = [
    './stockfish.js',
    'stockfish.js',
    './engine/stockfish.js',
    'engine/stockfish.js',
    'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js',
    'https://unpkg.com/stockfish.js@10.0.2/stockfish.js',
  ];
  const bind = (worker) => {
    c1SfWorker = worker;
    worker.onmessage = (e) => {
      const line = String(e.data || '');
      if(line === 'uciok' || line.startsWith('id name') || line === 'readyok'){
        c1SfReady = true;
        return;
      }
      if(line.startsWith('bestmove') && c1SfPending){
        const parts = line.split(/\s+/);
        const uci = parts[1];
        const cb = c1SfPending;
        c1SfPending = null;
        cb(uci && uci !== '(none)' ? uci : null);
      }
    };
    worker.onerror = (err) => {
      console.warn('Stockfish worker error', err);
      // keep worker null so fallback works
    };
    try {
      worker.postMessage('uci');
      worker.postMessage('isready');
    } catch (e) { console.warn(e); }
  };
  // Prefer blob worker to avoid some CDN worker CORS issues
  const tryBlob = (url) => fetch(url).then(r => {
    if(!r.ok) throw new Error('fetch fail');
    return r.text();
  }).then(code => {
    const blob = new Blob([code], { type: 'application/javascript' });
    const obj = URL.createObjectURL(blob);
    bind(new Worker(obj));
  });
  const tryAll = (i) => {
    if(i >= urls.length){
      console.warn('Stockfish unavailable from all sources');
      c1SfWorker = null;
      return;
    }
    const url = urls[i];
    tryBlob(url).catch(() => {
      try {
        bind(new Worker(url));
      } catch (e) {
        tryAll(i+1);
      }
    });
  };
  tryAll(0);
}

function c1SfPost(cmd){
  if(!c1SfWorker) return;
  try { c1SfWorker.postMessage(cmd); } catch(e){ console.warn(e); }
}

function c1SfGo(fen, strength, cb){
  c1InitStockfish();
  const st = C1_STRENGTH[strength] || C1_STRENGTH[2];
  let attempts = 0;
  const start = () => {
    if(!c1SfWorker){
      if(attempts++ < 25){ setTimeout(start, 120); return; }
      console.warn('Stockfish worker missing — fallback');
      cb(null);
      return;
    }
    if(!c1SfReady && attempts++ < 40){
      setTimeout(start, 100);
      return;
    }
    c1SfPending = cb;
    // Limit strength when available; still search enough depth for real play
    c1SfPost('setoption name Skill Level value ' + st.skill);
    c1SfPost('setoption name Contempt value 0');
    c1SfPost('ucinewgame');
    c1SfPost('isready');
    c1SfPost('position fen ' + fen);
    c1SfPost('go depth ' + st.depth + ' movetime ' + st.movetime);
    setTimeout(()=>{
      if(c1SfPending === cb){
        c1SfPending = null;
        c1SfPost('stop');
        cb(null);
      }
    }, st.movetime + 4000);
  };
  start();
}

// Fallback minimax (only if Stockfish fails)
let c1SearchDeadline = 0;
function c1Minimax(state, depth, alpha, beta){
  if(Date.now() > c1SearchDeadline || depth<=0 || state.gameOver) return c1Eval(state);
  const moves=c1AllLegal(state);
  if(!moves.length) return c1Eval(state);
  const maxing = state.turn==='w';
  let best = maxing ? -Infinity : Infinity;
  moves.sort((a,b)=>(state.board[b.to.r][b.to.c]?1:0)-(state.board[a.to.r][a.to.c]?1:0));
  for(const m of moves){
    if(Date.now() > c1SearchDeadline) break;
    const ch=c1Clone(state);
    c1MakeMove(ch, m.from, m.to);
    const v=c1Minimax(ch, depth-1, alpha, beta);
    if(maxing){ if(v>best) best=v; if(v>alpha) alpha=v; }
    else { if(v<best) best=v; if(v<beta) beta=v; }
    if(beta<=alpha) break;
  }
  return best;
}

function c1BestMoveFallback(state, depth){
  const moves=c1AllLegal(state);
  if(!moves.length) return null;
  const maxing = state.turn==='w';
  c1SearchDeadline = Date.now() + 800;
  moves.sort((a,b)=>(state.board[b.to.r][b.to.c]?1:0)-(state.board[a.to.r][a.to.c]?1:0));
  let best=moves[0], bestVal=maxing?-Infinity:Infinity;
  for(let d=1; d<=Math.min(depth,3); d++){
    for(const m of moves){
      if(Date.now() > c1SearchDeadline) break;
      const ch=c1Clone(state);
      c1MakeMove(ch, m.from, m.to);
      const v=c1Minimax(ch, d-1, -Infinity, Infinity);
      if(maxing ? v>bestVal : v<bestVal){ bestVal=v; best=m; }
    }
  }
  return best;
}

// --- UI state ---
let s1 = c1NewState();
let s1Undo = [];
let s1Mode = 'hva'; // hva | hvh
let s1HumanColor = 'w';
let s1AiDepth = 2;
let s1AiThinking = false;

const el1 = {
  board: null, turn: null, msg: null, over: null, moves: null, debug: null,
};

function c1Bind(){
  el1.board = document.getElementById('board1v1');
  el1.turn = document.getElementById('turn1v1');
  el1.msg = document.getElementById('msg1v1');
  el1.over = document.getElementById('over1v1');
  el1.moves = document.getElementById('moves1v1');
  el1.debug = document.getElementById('debug1v1');
}

function c1Msg(t, kind){
  if(!el1.msg) return;
  el1.msg.textContent = t||'';
  el1.msg.className = 'message-bar ' + (kind||'info');
}

function c1BuildCoordLabels(){
  const ranks = document.getElementById('ranks1v1');
  const files = document.getElementById('files1v1');
  if (ranks) {
    ranks.innerHTML = '';
    for (let r = 0; r < 8; r++) {
      const d = document.createElement('span');
      d.textContent = String(8 - r);
      ranks.appendChild(d);
    }
  }
  if (files) {
    files.innerHTML = '';
    for (let c = 0; c < 8; c++) {
      const d = document.createElement('span');
      d.textContent = C1.FILES[c];
      files.appendChild(d);
    }
  }
}


let c1Drag = null;
let suppressNextClick1 = false;

function c1ClearDrag(){
  if(c1Drag && c1Drag.ghost && c1Drag.ghost.parentNode) {
    c1Drag.ghost.parentNode.removeChild(c1Drag.ghost);
  }
  document.querySelectorAll('#board1v1 .cell.dragging-source, #board1v1 .cell.drag-over-legal').forEach(el=>{
    el.classList.remove('dragging-source','drag-over-legal');
  });
  c1Drag = null;
}

function c1CellFromPoint(x, y){
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('#board1v1 .cell') : null;
  if(!cell) return null;
  return { r:+cell.dataset.r, c:+cell.dataset.c, el:cell };
}

function c1BuildBoard(){
  if(!el1.board) return;
  el1.board.innerHTML='';
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const cell=document.createElement('div');
    cell.className='cell ' + (((r+c)%2===0)?'light':'dark');
    cell.dataset.r=r; cell.dataset.c=c;
    cell.addEventListener('click', ()=>{
      if(suppressNextClick1){ suppressNextClick1=false; return; }
      c1Click(r,c);
    });
    cell.addEventListener('pointerdown', (e) => {
      if(e.button != null && e.button !== 0) return;
      if(s1.gameOver || s1AiThinking) return;
      if(!c1IsHumanTurn()) return;
      const piece = s1.board[r][c];
      if(!piece || piece.color !== s1.turn) return;
      s1.selected = {r,c};
      s1.legal = c1LegalMoves(s1,r,c);
      c1Render();
      c1Drag = {
        fromR:r, fromC:c, pointerId:e.pointerId,
        startX:e.clientX, startY:e.clientY,
        dragged:false, ghost:null
      };
      try { cell.setPointerCapture(e.pointerId); } catch(_){}
    });
    cell.addEventListener('pointermove', (e) => {
      if(!c1Drag || c1Drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - c1Drag.startX, dy = e.clientY - c1Drag.startY;
      if(!c1Drag.dragged && (dx*dx + dy*dy) < 36) return;
      if(!c1Drag.dragged){
        c1Drag.dragged = true;
        suppressNextClick1 = true;
        const piece = s1.board[c1Drag.fromR][c1Drag.fromC];
        const ghost = document.createElement('div');
        ghost.className = 'piece-ghost piece-1v1 ' + (piece.color==='w'?'white':'black');
        ghost.textContent = C1.GLYPH[piece.color][piece.type];
        ghost.style.left = e.clientX + 'px';
        ghost.style.top = e.clientY + 'px';
        document.body.appendChild(ghost);
        c1Drag.ghost = ghost;
        const src = c1Cell(c1Drag.fromR, c1Drag.fromC);
        if(src) src.classList.add('dragging-source');
      }
      if(c1Drag.ghost){
        c1Drag.ghost.style.left = e.clientX + 'px';
        c1Drag.ghost.style.top = e.clientY + 'px';
      }
      document.querySelectorAll('#board1v1 .cell.drag-over-legal').forEach(el=>el.classList.remove('drag-over-legal'));
      const hit = c1CellFromPoint(e.clientX, e.clientY);
      if(hit && s1.legal && s1.legal.some(m => m.r===hit.r && m.c===hit.c)){
        hit.el.classList.add('drag-over-legal');
      }
    });
    cell.addEventListener('pointerup', (e) => {
      if(!c1Drag || c1Drag.pointerId !== e.pointerId) return;
      const fromR = c1Drag.fromR, fromC = c1Drag.fromC;
      const wasDrag = c1Drag.dragged;
      const hit = c1CellFromPoint(e.clientX, e.clientY);
      c1ClearDrag();
      if(wasDrag){
        suppressNextClick1 = true;
        if(hit && !(hit.r===fromR && hit.c===fromC)){
          s1.selected = {r:fromR, c:fromC};
          s1.legal = c1LegalMoves(s1, fromR, fromC);
          c1Click(hit.r, hit.c);
        } else {
          c1Render();
        }
      }
      // no drag → native click handles 2-click moves
    });
    cell.addEventListener('pointercancel', () => { c1ClearDrag(); suppressNextClick1 = false; });
    el1.board.appendChild(cell);
  }
  c1BuildCoordLabels();
}

function c1Cell(r,c){ return el1.board.children[r*8+c]; }

function c1Render(){
  if(!el1.board) return;
  const flip = (s1Mode==='hva' && s1HumanColor==='b');
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const cell=c1Cell(r,c);
    cell.classList.remove('selected','legal-move','legal-capture','last-move','in-check');
    cell.innerHTML='';
    const piece=s1.board[r][c];
    if(piece){
      const sp=document.createElement('span');
      sp.className='piece-1v1 ' + (piece.color==='w'?'white':'black');
      sp.textContent=C1.GLYPH[piece.color][piece.type];
      cell.appendChild(sp);
    }
    if(s1.lastMove && ((s1.lastMove.from.r===r&&s1.lastMove.from.c===c)||(s1.lastMove.to.r===r&&s1.lastMove.to.c===c)))
      cell.classList.add('last-move');
  }
  // check highlight
  const k=c1FindKing(s1.board, s1.turn);
  if(k && c1InCheck(s1.board, s1.turn)) c1Cell(k.r,k.c).classList.add('in-check');

  if(s1.selected){
    c1Cell(s1.selected.r, s1.selected.c).classList.add('selected');
    for(const mv of s1.legal){
      const cell=c1Cell(mv.r,mv.c);
      const cap = !!s1.board[mv.r][mv.c] || mv.enPassant;
      cell.classList.add(cap?'legal-capture':'legal-move');
    }
  }

  const turnName = s1.turn==='w'?'سفید':'سیاه';
  el1.turn.textContent = s1.gameOver ? 'پایان بازی' : ('نوبت: ' + turnName + (s1AiThinking?' (ربات فکر می‌کند…)':''));

  el1.moves.innerHTML='';
  s1.history.forEach((h,i)=>{
    const li=document.createElement('li');
    li.textContent = (Math.floor(i/2)+1) + (i%2===0?'. ':'... ') + h;
    el1.moves.appendChild(li);
  });
  el1.moves.scrollTop = el1.moves.scrollHeight;

  if(s1.gameOver){
    el1.over.classList.add('show');
    const map={ 'w-wins':'سفید برنده شد (مات)', 'b-wins':'سیاه برنده شد (مات)', 'draw-stalemate':'مساوی — پات', 'draw-50':'مساوی — قانون ۵۰ حرکت', 'draw-material':'مساوی — کمبود مهره' };
    el1.over.textContent = map[s1.result] || s1.result;
  } else el1.over.classList.remove('show');

  const lines=[];
  lines.push('نوبت: ' + s1.turn);
  lines.push('کیش: ' + (c1InCheck(s1.board,s1.turn)?'بله':'خیر'));
  lines.push('قلعه سفید: ' + (s1.castling.wK?'K':'') + (s1.castling.wQ?'Q':''));
  lines.push('قلعه سیاه: ' + (s1.castling.bK?'K':'') + (s1.castling.bQ?'Q':''));
  lines.push('حرکات: ' + s1.history.length);
  el1.debug.textContent = lines.join('\n');

  document.getElementById('undo1v1Btn').disabled = s1Undo.length===0 || s1AiThinking;
}

function c1IsHumanTurn(){
  if(s1.gameOver) return false;
  if(s1Mode==='hvh') return true;
  return s1.turn === s1HumanColor;
}

function c1Click(r,c){
  if(s1.gameOver || s1AiThinking) return;
  if(!c1IsHumanTurn()){ c1Msg('نوبت ربات است.', 'info'); return; }
  const piece=s1.board[r][c];
  if(!s1.selected){
    if(!piece || piece.color!==s1.turn) return;
    s1.selected={r,c};
    s1.legal=c1LegalMoves(s1,r,c);
    c1Msg(s1.legal.length?'مقصد را انتخاب کنید.':'حرکت مجازی نیست.', 'info');
    c1Render();
    return;
  }
  if(s1.selected.r===r && s1.selected.c===c){
    s1.selected=null; s1.legal=[]; c1Render(); return;
  }
  if(piece && piece.color===s1.turn){
    s1.selected={r,c}; s1.legal=c1LegalMoves(s1,r,c); c1Render(); return;
  }
  const match=s1.legal.find(m=>m.r===r&&m.c===c);
  if(!match){ c1Msg('حرکت غیرمجاز.', 'error'); return; }

  // promotion choice for human via modal
  let move=Object.assign({}, match);
  const moving=s1.board[s1.selected.r][s1.selected.c];
  const fromSq = {r:s1.selected.r, c:s1.selected.c};
  if(moving.type==='P' && (r===0||r===7) && !move.promotionType){
    c1ShowPromo(moving.color, (t) => {
      move.promotionType = t;
      c1CommitHumanMove(fromSq, move);
    });
    return;
  }
  c1CommitHumanMove(fromSq, move);
}

function c1ShowPromo(color, cb){
  const ov = document.getElementById('promo1v1Overlay');
  const opts = document.getElementById('promo1v1Options');
  if(!ov || !opts){ cb('Q'); return; }
  opts.innerHTML = '';
  const pieces = [
    {t:'Q', g:C1.GLYPH[color].Q, n:'وزیر'},
    {t:'R', g:C1.GLYPH[color].R, n:'رخ'},
    {t:'B', g:C1.GLYPH[color].B, n:'فیل'},
    {t:'N', g:C1.GLYPH[color].N, n:'اسب'},
  ];
  pieces.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = p.g + '<span>' + p.n + '</span>';
    b.addEventListener('click', () => {
      ov.style.display = 'none';
      cb(p.t);
    });
    opts.appendChild(b);
  });
  ov.style.display = 'flex';
}

function c1MoveToUci(from, to){
  const u = C1.FILES[from.c] + (8-from.r) + C1.FILES[to.c] + (8-to.r);
  return to.promotionType ? u + to.promotionType.toLowerCase() : u;
}

function c1CommitHumanMove(from, move){
  s1Undo.push(c1Clone(s1));
  const sanBefore = s1.history.length;
  c1MakeMove(s1, from, move);
  const san = s1.history[s1.history.length-1] || '';
  if(!s1.moveLog) s1.moveLog = [];
  s1.moveLog.push({ uci: c1MoveToUci(from, move), san, from, to: {r:move.r,c:move.c,promotionType:move.promotionType} });
  try{ AudioFX.move(); }catch(_){}
  c1Msg('حرکت انجام شد.', 'info');
  c1Render();
  if(s1.gameOver) c1OnGameOver();
  else c1MaybeAi();
}

function c1ApplyAiMove(mv){
  s1AiThinking=false;
  if(!mv){ c1Msg('ربات حرکتی پیدا نکرد.', 'error'); c1Render(); return; }
  s1Undo.push(c1Clone(s1));
  c1MakeMove(s1, mv.from, mv.to);
  const san = s1.history[s1.history.length-1] || '';
  if(!s1.moveLog) s1.moveLog = [];
  s1.moveLog.push({ uci: c1MoveToUci(mv.from, mv.to), san, from: mv.from, to: mv.to });
  try{ AudioFX.move(); }catch(_){}
  c1Msg('Stockfish بازی کرد.', 'success');
  c1Render();
  if(s1.gameOver) c1OnGameOver();
}

function c1MaybeAi(){
  if(s1.gameOver || s1Mode!=='hva') return;
  if(s1.turn === s1HumanColor) return;
  s1AiThinking=true; c1Render();
  c1InitStockfish();
  const fen = c1ToFen(s1);
  const strength = s1AiDepth;
  c1Msg(c1SfReady ? 'Stockfish در حال فکر…' : 'در حال لود موتور…', 'info');
  setTimeout(()=>{
    c1SfGo(fen, strength, (uci) => {
      if(uci){
        const parsed = c1ParseUci(uci);
        if(parsed){
          const legal = c1LegalMoves(s1, parsed.from.r, parsed.from.c);
          let ok = legal.find(m => m.r===parsed.to.r && m.c===parsed.to.c &&
            (!parsed.to.promotionType || m.promotionType===parsed.to.promotionType));
          if(!ok) ok = legal.find(m => m.r===parsed.to.r && m.c===parsed.to.c);
          if(ok){
            const mv = { from: parsed.from, to: Object.assign({}, ok) };
            if(parsed.to.promotionType) mv.to.promotionType = parsed.to.promotionType;
            c1ApplyAiMove(mv);
            c1Msg('Stockfish بازی کرد.', 'success');
            return;
          }
        }
        console.warn('UCI not matched legal moves', uci);
      }
      c1Msg('Stockfish در دسترس نیست — موتور ضعیف جایگزین شد.', 'error');
      const fb = c1BestMoveFallback(s1, 3);
      c1ApplyAiMove(fb);
    });
  }, 40);
}

function c1StartFromSetup(){
  s1Mode = document.querySelector('#mode1v1Picker .seg-btn.active')?.dataset.mode || 'hva';
  s1HumanColor = document.querySelector('#color1v1Picker .seg-btn.active')?.dataset.color || 'w';
  s1AiDepth = parseInt(document.getElementById('ai1v1Depth').value,10)||2;
  s1 = c1NewState();
  s1Undo = [];
  s1AiThinking=false;
  c1Bind();
  c1BuildBoard();
  showView('game1v1View');
  c1Msg('بازی شروع شد.', 'info');
  c1Render();
  c1MaybeAi(); // if human is black, AI moves first
}

function c1Restart(){
  s1 = c1NewState();
  s1Undo=[];
  s1AiThinking=false;
  c1Msg('بازی از نو شروع شد.', 'info');
  c1Render();
  c1MaybeAi();
}

function c1Undo(){
  if(!s1Undo.length || s1AiThinking) return;
  // undo one human move; if vs AI also undo AI reply when possible
  s1 = s1Undo.pop();
  if(s1Mode==='hva' && s1Undo.length && s1.turn!==s1HumanColor){
    // shouldn't happen often
  }
  if(s1Mode==='hva' && s1.turn!==s1HumanColor && s1Undo.length){
    s1 = s1Undo.pop();
  }
  s1.selected=null; s1.legal=[];
  c1Msg('حرکت برگشت.', 'info');
  c1Render();
}



/* ---- 1v1 recent games + Stockfish analysis ---- */
const C1_RECENT_KEY = 'chess1v1-recent-games';
const C1_RECENT_MAX = 5;

function c1LoadRecent(){
  try {
    const raw = localStorage.getItem(C1_RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch(_){ return []; }
}
function c1SaveRecent(list){
  try { localStorage.setItem(C1_RECENT_KEY, JSON.stringify(list.slice(0, C1_RECENT_MAX))); } catch(_){}
}
function c1ResultLabel(result){
  const map={ 'w-wins':'برد سفید', 'b-wins':'برد سیاه', 'draw-stalemate':'پات', 'draw-50':'تساوی ۵۰', 'draw-material':'کمبود مهره' };
  return map[result] || result || '—';
}
function c1SnapshotGame(){
  return {
    id: Date.now(),
    date: new Date().toLocaleString('fa-IR'),
    result: s1.result,
    mode: s1Mode,
    moves: (s1.moveLog || []).map(m => ({ uci: m.uci, san: m.san })),
    history: (s1.history || []).slice(),
  };
}
function c1OnGameOver(){
  const snap = c1SnapshotGame();
  const list = c1LoadRecent().filter(g => g.id !== snap.id);
  list.unshift(snap);
  c1SaveRecent(list);
  setTimeout(() => c1OpenAnalysis(snap, true), 400);
}

function c1OpenAnalysis(game, autoHint){
  const ov = document.getElementById('analysisOverlay');
  if(!ov) return;
  ov.style.display = 'flex';
  window._c1AnalysisGame = game;
  document.getElementById('analysisTitle').textContent = 'آنالیز — ' + c1ResultLabel(game.result);
  document.getElementById('analysisSub').textContent =
    (game.date || '') + ' · ' + (game.moves ? game.moves.length : 0) + ' نیم‌حرکت' +
    (autoHint ? ' · برای شروع آنالیز دکمه را بزنید' : '');
  const ol = document.getElementById('analysisMoves');
  ol.innerHTML = '';
  (game.moves || []).forEach((m, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span>' + (Math.floor(i/2)+1) + (i%2===0?'. ':'... ') + (m.san || m.uci) + '</span><span class="ev" data-i="'+i+'">—</span>';
    ol.appendChild(li);
  });
  c1RenderRecentList();
}

function c1RenderRecentList(){
  const ul = document.getElementById('recentGamesList');
  if(!ul) return;
  const list = c1LoadRecent();
  ul.innerHTML = '';
  if(!list.length){
    ul.innerHTML = '<li style="color:var(--text-muted)">هنوز بازی ذخیره‌ای نیست.</li>';
    return;
  }
  list.forEach((g) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = (g.date||'') + ' — ' + c1ResultLabel(g.result) + ' (' + (g.moves||[]).length + ')';
    li.appendChild(span);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'آنالیز';
    btn.addEventListener('click', () => c1OpenAnalysis(g, false));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function c1CloseAnalysis(){
  const ov = document.getElementById('analysisOverlay');
  if(ov) ov.style.display = 'none';
}

function c1RunAnalysis(){
  const game = window._c1AnalysisGame;
  if(!game || !game.moves || !game.moves.length){
    alert('حرکتی برای آنالیز نیست.');
    return;
  }
  c1InitStockfish();
  const sub = document.getElementById('analysisSub');
  const runBtn = document.getElementById('analysisRunBtn');
  if(runBtn) runBtn.disabled = true;
  if(sub) sub.textContent = 'در حال آنالیز با Stockfish…';

  let st = c1NewState();
  const positions = [{ fen: c1ToFen(st) }];
  for(const m of game.moves){
    const parsed = c1ParseUci(m.uci);
    if(!parsed) break;
    if(m.uci.length >= 5 && !parsed.to.promotionType){
      const pr = m.uci[4].toUpperCase();
      if('QRBN'.includes(pr)) parsed.to.promotionType = pr;
    }
    const legal = c1LegalMoves(st, parsed.from.r, parsed.from.c);
    let ok = legal.find(x => x.r===parsed.to.r && x.c===parsed.to.c &&
      (!parsed.to.promotionType || x.promotionType===parsed.to.promotionType));
    if(!ok) ok = legal.find(x => x.r===parsed.to.r && x.c===parsed.to.c);
    if(!ok) break;
    const to = Object.assign({}, ok);
    if(parsed.to.promotionType) to.promotionType = parsed.to.promotionType;
    c1MakeMove(st, parsed.from, to);
    positions.push({ fen: c1ToFen(st) });
  }

  let idx = 1;
  const scores = [];
  function step(){
    if(idx >= positions.length){
      const lis = document.querySelectorAll('#analysisMoves li');
      scores.forEach((sc, i) => {
        const el = lis[i] && lis[i].querySelector('.ev');
        if(!el) return;
        el.textContent = sc;
        const n = parseFloat(sc);
        if(!isNaN(n)){
          if(n <= -1.0) lis[i].classList.add('bad');
          else if(n >= 1.0) lis[i].classList.add('good');
        }
      });
      if(sub) sub.textContent = 'آنالیز کامل شد · ارزیابی از دید سفید';
      if(runBtn) runBtn.disabled = false;
      return;
    }
    if(sub) sub.textContent = 'آنالیز حرکت ' + idx + ' / ' + (positions.length-1) + '…';
    c1SfAnalyzeFen(positions[idx].fen, (info) => {
      scores.push(info || '—');
      idx++;
      setTimeout(step, 40);
    });
  }
  let tries = 0;
  (function wait(){
    if(c1SfReady || tries++ > 60) step();
    else { c1InitStockfish(); setTimeout(wait, 120); }
  })();
}

function c1SfAnalyzeFen(fen, cb){
  c1InitStockfish();
  if(!c1SfWorker){ cb(null); return; }
  let done = false;
  let lastScore = null;
  const finish = (v) => {
    if(done) return;
    done = true;
    try { c1SfWorker.removeEventListener('message', handler); } catch(_){}
    cb(v);
  };
  const handler = (e) => {
    const line = String(e.data || '');
    if(line.startsWith('info') && line.indexOf('score') >= 0){
      const mMate = line.match(/score mate (-?\d+)/);
      const mCp = line.match(/score cp (-?\d+)/);
      if(mMate) lastScore = (parseInt(mMate[1],10) > 0 ? 'M' : '-M') + Math.abs(parseInt(mMate[1],10));
      else if(mCp) lastScore = (parseInt(mCp[1],10) / 100).toFixed(2);
    }
    if(line.startsWith('bestmove')) finish(lastScore != null ? lastScore : '—');
  };
  c1SfWorker.addEventListener('message', handler);
  try {
    c1SfWorker.postMessage('ucinewgame');
    c1SfWorker.postMessage('position fen ' + fen);
    c1SfWorker.postMessage('go depth 12 movetime 400');
  } catch(err){ finish(null); return; }
  setTimeout(() => {
    if(!done){
      try { c1SfWorker.postMessage('stop'); } catch(_){}
      finish(lastScore != null ? lastScore : '—');
    }
  }, 2200);
}

(function wireAnalysis(){
  const close = document.getElementById('analysisCloseBtn');
  if(close) close.addEventListener('click', c1CloseAnalysis);
  const run = document.getElementById('analysisRunBtn');
  if(run) run.addEventListener('click', c1RunAnalysis);
  const an = document.getElementById('analyze1v1Btn');
  if(an) an.addEventListener('click', () => {
    if(s1.moveLog && s1.moveLog.length){
      c1OpenAnalysis(c1SnapshotGame(), false);
    } else {
      const list = c1LoadRecent();
      if(list[0]) c1OpenAnalysis(list[0], false);
      else { try{ c1Msg('بازی‌ای برای آنالیز نیست.', 'info'); }catch(_){ alert('بازی‌ای برای آنالیز نیست.'); } }
    }
  });
  const ov = document.getElementById('analysisOverlay');
  if(ov) ov.addEventListener('click', (e) => { if(e.target === ov) c1CloseAnalysis(); });
})();

/* ---- Theme persistence ---- */
function applyTheme(name){
  const allowed = { midnight:1, classic:1, ivory:1 };
  const t = allowed[name] ? name : 'midnight';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('chess-theme', t); } catch(_){}
  document.querySelectorAll('.theme-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.theme === t);
  });
}
(function initTheme(){
  let saved = 'midnight';
  try { saved = localStorage.getItem('chess-theme') || 'midnight'; } catch(_){}
  applyTheme(saved);
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest && e.target.closest('.theme-btn');
    if(!btn) return;
    applyTheme(btn.dataset.theme);
  });
})();

// wire UI
(function wire1v1(){
  const card=document.getElementById('cardPlay1v1');
  if(card) card.addEventListener('click', ()=>{ c1InitStockfish(); showView('setup1v1View'); });
  const backS=document.getElementById('backFrom1v1SetupBtn');
  if(backS) backS.addEventListener('click', ()=>showView('homeView'));
  const backG=document.getElementById('backFrom1v1GameBtn');
  if(backG) backG.addEventListener('click', ()=>showView('homeView'));
  const start=document.getElementById('start1v1Btn');
  if(start) start.addEventListener('click', c1StartFromSetup);
  const undo=document.getElementById('undo1v1Btn');
  if(undo) undo.addEventListener('click', c1Undo);
  const restart=document.getElementById('restart1v1Btn');
  if(restart) restart.addEventListener('click', c1Restart);

  document.querySelectorAll('#mode1v1Picker .seg-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#mode1v1Picker .seg-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const col=document.getElementById('color1v1Section');
      if(col) col.style.display = btn.dataset.mode==='hva' ? '' : 'none';
    });
  });
  document.querySelectorAll('#color1v1Picker .seg-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#color1v1Picker .seg-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
})();


