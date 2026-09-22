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

function c1RepKey(state){
  // Threefold key: placement + side to move + castling + ep (no clocks)
  const fen = c1ToFen(state);
  return fen.split(' ').slice(0, 4).join(' ');
}
function c1CountRep(state, key){
  let n = 0;
  const arr = state.posKeys || [];
  for (let i = 0; i < arr.length; i++) if (arr[i] === key) n++;
  return n;
}
function c1NewState(){
  const s = {
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
    posKeys: [],
  };
  s.posKeys.push(c1RepKey(s));
  return s;
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

function c1LegalMoves(state, r, c, opts){
  const piece=state.board[r][c];
  if(!piece) return [];
  // opts.ignoreTurn: used for premove generation when it is not this color's turn
  if(!opts || !opts.ignoreTurn){
    if(piece.color!==state.turn) return [];
  }
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

  if (!state.posKeys) state.posKeys = [];
  const key = c1RepKey(state);
  state.posKeys.push(key);

  if(c1InsufficientMaterial(state.board)){
    state.gameOver=true;
    state.result='draw-material';
  } else if (c1CountRep(state, key) >= 3) {
    state.gameOver=true;
    state.result='draw-repetition';
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

/** Personality bots (1v1) — like Chess.com characters */
const C1_BOTS = [
  {
    id: 'martin', name: 'مارتین', nameEn: 'Martin', avatar: '🐣', rating: 250,
    strength: 1, blunder: 0.55, style: 'تازه‌کار؛ زیاد اشتباه می‌کند', styleEn: 'Beginner — blunders often',
    tag: 'مبتدی', tagEn: 'Beginner', quote: 'اوه… این درست بود؟'
  },
  {
    id: 'nilo', name: 'نیلو', nameEn: 'Nilo', avatar: '🌿', rating: 800,
    strength: 1, blunder: 0.28, style: 'آرام و محتاط، گاهی گیج می‌شود', styleEn: 'Quiet and careful, sometimes lost',
    tag: 'آسان', tagEn: 'Easy', quote: 'بگذار فکر کنم…'
  },
  {
    id: 'arya', name: 'آریا', nameEn: 'Arya', avatar: '🔥', rating: 1200,
    strength: 2, blunder: 0.12, style: 'تهاجمی؛ عاشق قربانی و حمله', styleEn: 'Aggressive — loves attacks',
    tag: 'متوسط', tagEn: 'Intermediate', quote: 'حمله!'
  },
  {
    id: 'kaveh', name: 'کاوه', nameEn: 'Kaveh', avatar: '🛡️', rating: 1500,
    strength: 3, blunder: 0.06, style: 'محکم و موضعی؛ کمتر ریسک می‌کند', styleEn: 'Solid positional player',
    tag: 'سخت', tagEn: 'Hard', quote: 'صبر کن…'
  },
  {
    id: 'leila', name: 'لیلا', nameEn: 'Leila', avatar: '🎯', rating: 1800,
    strength: 4, blunder: 0.03, style: 'تاکتیکی و دقیق', styleEn: 'Tactical and precise',
    tag: 'قوی', tagEn: 'Strong', quote: 'یافتم.'
  },
  {
    id: 'nouri', name: 'استاد نوری', nameEn: 'Master Nouri', avatar: '👑', rating: 2200,
    strength: 5, blunder: 0.0, style: 'قوی‌ترین ربات فعلی', styleEn: 'Strongest bot available',
    tag: 'استاد', tagEn: 'Master', quote: '…'
  },
];
let s1ActiveBot = null; // current personality or null (generic strength)


let c1SfWorker = null;
let c1SfReady = false;
let c1SfPending = null;

function c1InitStockfish(){
  if (c1SfWorker) return;
  if (window._c1SfLoading) return;
  window._c1SfLoading = true;
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
    window._c1SfLoading = false;
    window._c1SfInfoHandlers = window._c1SfInfoHandlers || [];
    worker.onmessage = (e) => {
      const line = String(e.data || '');
      if (line === 'uciok' || line.startsWith('id name') || line === 'readyok') {
        c1SfReady = true;
        return;
      }
      // Analysis score capture
      if (window._c1SfAnalyzing) {
        const job = window._c1SfAnalyzing;
        if (line.startsWith('info') && line.indexOf('score') >= 0) {
          const mMate = line.match(/score mate (-?\d+)/);
          const mCp = line.match(/score cp (-?\d+)/);
          let raw = null;
          if (mMate) raw = (parseInt(mMate[1],10) > 0 ? 'M' : '-M') + Math.abs(parseInt(mMate[1],10));
          else if (mCp) raw = (parseInt(mCp[1],10) / 100).toFixed(2);
          if (raw != null) {
            if (job.stmBlack) {
              if (raw.charAt(0) === 'M') raw = '-M' + raw.slice(1);
              else if (raw.indexOf('-M') === 0) raw = 'M' + raw.slice(2);
              else {
                const n = parseFloat(raw);
                if (!isNaN(n)) raw = (n === 0 ? '0.00' : (-n).toFixed(2));
              }
            }
            job.lastScore = raw;
          }
        }
        if (line.startsWith('bestmove')) {
          const cb = job.cb;
          const sc = job.lastScore != null ? job.lastScore : '0.00';
          window._c1SfAnalyzing = null;
          try { cb(sc); } catch (err) { console.warn(err); }
          return;
        }
      }
      if (line.startsWith('bestmove') && c1SfPending) {
        const parts = line.split(/\s+/);
        const uci = parts[1];
        const cb = c1SfPending;
        c1SfPending = null;
        cb(uci && uci !== '(none)' ? uci : null);
      }
    };
    worker.onerror = (err) => {
      console.warn('Stockfish worker error', err);
    };
    try {
      worker.postMessage('uci');
      worker.postMessage('isready');
    } catch (e) { console.warn(e); }
  };
  const tryBlob = (url) => fetch(url).then(r => {
    if (!r.ok) throw new Error('fetch fail');
    return r.text();
  }).then(code => {
    const blob = new Blob([code], { type: 'application/javascript' });
    const obj = URL.createObjectURL(blob);
    bind(new Worker(obj));
  });
  const tryAll = (idx) => {
    if (idx >= urls.length) {
      console.warn('Stockfish unavailable from all sources');
      c1SfWorker = null;
      window._c1SfLoading = false;
      c1SfReady = false;
      return;
    }
    const url = urls[idx];
    tryBlob(url).catch(() => {
      try {
        bind(new Worker(url));
      } catch (e) {
        tryAll(idx + 1);
      }
    });
  };
  tryAll(0);
}

function c1SfOnLine(fn){
  window._c1SfInfoHandlers = window._c1SfInfoHandlers || [];
  window._c1SfInfoHandlers.push(fn);
  return () => {
    window._c1SfInfoHandlers = (window._c1SfInfoHandlers || []).filter(x => x !== fn);
  };
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
let c1AiJob = 0;
let c1AiWatchdog = null;

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

function c1ShouldFlip(){
  // Always put the human's color at the bottom in vs-AI; in hvh keep white at bottom
  return (s1Mode === 'hva' && s1HumanColor === 'b');
}
function c1Disp(r, c){
  if (c1ShouldFlip()) return { r: 7 - r, c: 7 - c };
  return { r, c };
}
function c1FromDisp(dr, dc){
  if (c1ShouldFlip()) return { r: 7 - dr, c: 7 - dc };
  return { r: dr, c: dc };
}
function c1Perspective(){
  // Eval bar / scores from the human's point of view when vs AI
  if (s1Mode === 'hva') return s1HumanColor || 'w';
  return 'w';
}
function c1ScoreForPerspective(scoreStr){
  // Stockfish scores are always from White. Convert to player perspective.
  if (c1Perspective() === 'w') return scoreStr;
  if (scoreStr == null || scoreStr === '—') return scoreStr;
  if (typeof scoreStr === 'string' && scoreStr.charAt(0) === 'M') {
    return '-M' + scoreStr.slice(1);
  }
  if (typeof scoreStr === 'string' && scoreStr.indexOf('-M') === 0) {
    return 'M' + scoreStr.slice(2);
  }
  const n = parseFloat(scoreStr);
  if (isNaN(n)) return scoreStr;
  const inv = -n;
  return (inv > 0 ? '+' : '') + inv.toFixed(2);
}

function c1BuildCoordLabels(){
  const ranks = document.getElementById('ranks1v1');
  const files = document.getElementById('files1v1');
  const flip = c1ShouldFlip();
  if (ranks) {
    ranks.innerHTML = '';
    for (let dr = 0; dr < 8; dr++) {
      const d = document.createElement('span');
      // top row label
      d.textContent = flip ? String(dr + 1) : String(8 - dr);
      ranks.appendChild(d);
    }
  }
  if (files) {
    files.innerHTML = '';
    for (let dc = 0; dc < 8; dc++) {
      const d = document.createElement('span');
      d.textContent = flip ? C1.FILES[7 - dc] : C1.FILES[dc];
      files.appendChild(d);
    }
  }
}



let c1Drag = null;
let suppressNextClick1 = false;

function c1ClearDrag(){
  if (c1Drag && c1Drag.ghost && c1Drag.ghost.parentNode) {
    c1Drag.ghost.parentNode.removeChild(c1Drag.ghost);
  }
  document.querySelectorAll('#board1v1 .cell.dragging-source, #board1v1 .cell.drag-over-legal').forEach(el => {
    el.classList.remove('dragging-source', 'drag-over-legal');
  });
  c1Drag = null;
}

function c1CellFromPoint(x, y){
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest ? el.closest('#board1v1 .cell') : null;
  if (!cell) return null;
  return { r: +cell.dataset.r, c: +cell.dataset.c, el: cell };
}

function c1BuildBoard(){
  if (!el1.board) return;
  el1.board.innerHTML = '';
  for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) {
    const { r, c } = c1FromDisp(dr, dc);
    const cell = document.createElement('div');
    // square color from logical coords so colors stay correct when flipped
    cell.className = 'cell ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
    cell.dataset.r = r;
    cell.dataset.c = c;

    cell.addEventListener('click', () => {
      if (suppressNextClick1) {
        suppressNextClick1 = false;
        return;
      }
      c1Click(r, c);
    });

    cell.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      if (s1.gameOver || s1AiThinking) return;
      if (!c1IsHumanTurn()) return;
      const piece = s1.board[r][c];
      if (!piece || piece.color !== s1.turn) return;
      c1Drag = {
        fromR: r, fromC: c, pointerId: e.pointerId,
        startX: e.clientX, startY: e.clientY,
        dragged: false, ghost: null
      };
      try { cell.setPointerCapture(e.pointerId); } catch (_) {}
    });

    cell.addEventListener('pointermove', (e) => {
      if (!c1Drag || c1Drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - c1Drag.startX;
      const dy = e.clientY - c1Drag.startY;
      if (!c1Drag.dragged) {
        if (dx * dx + dy * dy < 64) return;
        c1Drag.dragged = true;
        s1.selected = { r: c1Drag.fromR, c: c1Drag.fromC };
        s1.legal = c1LegalMoves(s1, c1Drag.fromR, c1Drag.fromC);
        c1Render();
        const piece = s1.board[c1Drag.fromR][c1Drag.fromC];
        const ghost = document.createElement('div');
        ghost.className = 'piece-ghost piece-1v1 ' + (piece.color === 'w' ? 'white' : 'black');
        ghost.textContent = C1.GLYPH[piece.color][piece.type];
        ghost.style.left = e.clientX + 'px';
        ghost.style.top = e.clientY + 'px';
        document.body.appendChild(ghost);
        c1Drag.ghost = ghost;
        const src = c1Cell(c1Drag.fromR, c1Drag.fromC);
        if (src) src.classList.add('dragging-source');
      }
      if (c1Drag.ghost) {
        c1Drag.ghost.style.left = e.clientX + 'px';
        c1Drag.ghost.style.top = e.clientY + 'px';
      }
      document.querySelectorAll('#board1v1 .cell.drag-over-legal').forEach(el => {
        el.classList.remove('drag-over-legal');
      });
      const hit = c1CellFromPoint(e.clientX, e.clientY);
      if (hit && s1.legal && s1.legal.some(m => m.r === hit.r && m.c === hit.c)) {
        hit.el.classList.add('drag-over-legal');
      }
    });

    cell.addEventListener('pointerup', (e) => {
      if (!c1Drag || c1Drag.pointerId !== e.pointerId) return;
      const fromR = c1Drag.fromR, fromC = c1Drag.fromC;
      const wasDrag = c1Drag.dragged;
      const hit = c1CellFromPoint(e.clientX, e.clientY);
      c1ClearDrag();
      if (wasDrag) {
        suppressNextClick1 = true;
        if (hit && !(hit.r === fromR && hit.c === fromC)) {
          s1.selected = { r: fromR, c: fromC };
          s1.legal = c1LegalMoves(s1, fromR, fromC);
          c1Click(hit.r, hit.c);
        } else {
          c1Render();
        }
      }
    });

    cell.addEventListener('pointercancel', () => {
      c1ClearDrag();
      suppressNextClick1 = false;
    });

    el1.board.appendChild(cell);
  }
  c1BuildCoordLabels();
}

function c1Cell(r,c){
  const d = c1Disp(r, c);
  return el1.board.children[d.r * 8 + d.c];
}

function c1Render(){
  if(!el1.board) return;
  // Re-label coords if orientation changed
  c1BuildCoordLabels();
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const cell=c1Cell(r,c);
    cell.classList.remove('selected','legal-move','legal-capture','last-move','in-check','premove-from','premove-to','premove-legal','premove-legal-capture');
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
  if (c1PremoveDraft) {
    c1Cell(c1PremoveDraft.from.r, c1PremoveDraft.from.c).classList.add('premove-from');
    for (const mv of c1PremoveDraft.legal) {
      const cell = c1Cell(mv.r, mv.c);
      const cap = !!s1.board[mv.r][mv.c] || mv.enPassant;
      cell.classList.add(cap ? 'premove-legal-capture' : 'premove-legal');
    }
  }
  if (c1PremoveQueue && c1PremoveQueue.length) {
    for (const pm of c1PremoveQueue) {
      try {
        c1Cell(pm.from.r, pm.from.c).classList.add('premove-from');
        const dest = c1Cell(pm.to.r, pm.to.c);
        dest.classList.add('premove-to');
        const fromPiece = s1.board[pm.from.r][pm.from.c];
        if (fromPiece && !dest.querySelector('.premove-ghost')) {
          const g = document.createElement('span');
          g.className = 'piece-1v1 premove-ghost ' + (fromPiece.color === 'w' ? 'white' : 'black');
          g.textContent = C1.GLYPH[fromPiece.color][fromPiece.type];
          dest.appendChild(g);
        }
      } catch(_){}
    }
  }

  const turnName = (typeof t === 'function')
    ? (s1.turn === 'w' ? t('white') : t('black'))
    : (s1.turn === 'w' ? 'White' : 'Black');
  const turnPrefix = (typeof t === 'function') ? t('turnPrefix') : 'Turn: ';
  const thinking = s1AiThinking
    ? ((typeof appSettings !== 'undefined' && appSettings.lang === 'en') ? ' (thinking…)' : ' (ربات فکر می‌کند…)')
    : '';
  el1.turn.textContent = s1.gameOver
    ? ((typeof t === 'function') ? t('endTitle') : 'Game over')
    : (turnPrefix + turnName + thinking);
  const pb1 = document.getElementById('premoveBanner1v1');
  if (pb1) {
    if (c1PremoveDraft) pb1.textContent = '';
    else if (c1PremoveQueue && c1PremoveQueue.length)
      pb1.textContent = 'صف Premove: ' + c1PremoveQueue.length;
    else if (s1Mode === 'hva' && s1.turn !== s1HumanColor)
      pb1.textContent = 'می‌توانی premove بزنی: مهره → مقصد';
    else pb1.textContent = '';
  }


  el1.moves.innerHTML='';
  s1.history.forEach((h,i)=>{
    const li=document.createElement('li');
    li.textContent = (Math.floor(i/2)+1) + (i%2===0?'. ':'... ') + h;
    el1.moves.appendChild(li);
  });
  el1.moves.scrollTop = el1.moves.scrollHeight;

  if(s1.gameOver){
    el1.over.classList.add('show');
    const map={ 'w-wins':'سفید برنده شد (مات)', 'b-wins':'سیاه برنده شد (مات)', 'draw-stalemate':'مساوی — پات', 'draw-50':'مساوی — قانون ۵۰ حرکت', 'draw-material':'مساوی — کمبود مهره', 'draw-repetition':'مساوی — تکرار سه‌باره وضعیت' };
    el1.over.textContent = map[s1.result] || s1.result;
  } else el1.over.classList.remove('show');

  const lines=[];
  const enDbg = (typeof appSettings !== 'undefined' && appSettings.lang === 'en');
  lines.push((enDbg ? 'Turn: ' : 'نوبت: ') + s1.turn);
  lines.push((enDbg ? 'Check: ' : 'کیش: ') + (c1InCheck(s1.board,s1.turn) ? (enDbg?'yes':'بله') : (enDbg?'no':'خیر')));
  lines.push((enDbg ? 'White castle: ' : 'قلعه سفید: ') + (s1.castling.wK?'K':'') + (s1.castling.wQ?'Q':''));
  lines.push((enDbg ? 'Black castle: ' : 'قلعه سیاه: ') + (s1.castling.bK?'K':'') + (s1.castling.bQ?'Q':''));
  lines.push((enDbg ? 'Moves: ' : 'حرکات: ') + s1.history.length);
  el1.debug.textContent = lines.join('\n');

  document.getElementById('undo1v1Btn').disabled = s1Undo.length===0 || s1AiThinking;
}

function c1IsHumanTurn(){
  if(s1.gameOver) return false;
  if(s1Mode==='hvh') return true;
  return s1.turn === s1HumanColor;
}


// ===== 1v1 Premove =====
let c1PremoveQueue = []; // [{ from, to }]
let c1PremoveDraft = null;

function c1ClearPremove(){ c1PremoveQueue = []; c1PremoveDraft = null; }

function c1TryPremoveClick(r, c){
  if (typeof isPremoveEnabled === 'function' && !isPremoveEnabled()) return false;

  if (s1.gameOver) return false;
  const piece = s1.board[r][c];

  // Cancel one queued premove by from-square
  const cancelIdx = c1PremoveQueue.findIndex(pm => pm.from.r === r && pm.from.c === c);
  if (cancelIdx >= 0 && !c1PremoveDraft) {
    c1PremoveQueue.splice(cancelIdx, 1);
    c1Msg('Premove لغو شد (' + c1PremoveQueue.length + ' در صف).', 'info');
    c1Render();
    return true;
  }

  if (!c1PremoveDraft) {
    if (!piece) return false;
    if (s1Mode === 'hva' && piece.color !== s1HumanColor) return false;
    if (piece.color === s1.turn && !s1AiThinking) return false;
    const legal = c1LegalMoves(s1, r, c, { ignoreTurn: true });
    if (!legal.length) {
      c1Msg('این مهره حرکت مجازی ندارد.', 'info');
      return true;
    }
    c1PremoveDraft = { color: piece.color, from: { r, c }, legal };
    c1Msg(((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Premove: click destination (captures allowed).':'Premove: مقصد را بزنید'), 'info');
    c1Render();
    return true;
  }
  if (c1PremoveDraft.from.r === r && c1PremoveDraft.from.c === c) {
    c1PremoveDraft = null;
    c1Msg('انتخاب لغو شد.', 'info');
    c1Render();
    return true;
  }
  if (piece && piece.color === c1PremoveDraft.color) {
    c1PremoveDraft = { color: piece.color, from: { r, c }, legal: c1LegalMoves(s1, r, c, { ignoreTurn: true }) };
    c1Render();
    return true;
  }
  // Revalidate on current board (captures included)
  const legalNow = c1LegalMoves(s1, c1PremoveDraft.from.r, c1PremoveDraft.from.c, { ignoreTurn: true });
  const match = legalNow.find(m => m.r === r && m.c === c);
  if (!match) {
    c1Msg(((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Illegal premove.':'Premove غیرمجاز'), 'error');
    return true;
  }
  let promotionType = match.promotionType || null;
  const moving = s1.board[c1PremoveDraft.from.r][c1PremoveDraft.from.c];
  if (moving && moving.type === 'P' && (r === 0 || r === 7) && !promotionType) promotionType = 'Q';
  c1PremoveQueue.push({
    from: { r: c1PremoveDraft.from.r, c: c1PremoveDraft.from.c },
    to: Object.assign({}, match, promotionType ? { promotionType } : {})
  });
  c1PremoveDraft = null;
  c1Msg('Premove #' + c1PremoveQueue.length + ' در صف.', 'success');
  c1Render();
  return true;
}

function c1TryExecutePremove(){
  if (s1.gameOver || s1AiThinking || !c1PremoveQueue.length) return false;
  if (!c1IsHumanTurn()) return false;
  while (c1PremoveQueue.length) {
    const pm = c1PremoveQueue[0];
    const legal = c1LegalMoves(s1, pm.from.r, pm.from.c);
    const ok = legal.find(m => m.r === pm.to.r && m.c === pm.to.c &&
      (!pm.to.promotionType || m.promotionType === pm.to.promotionType));
    if (!ok) {
      c1PremoveQueue.shift();
      continue;
    }
    c1PremoveQueue.shift();
    const move = Object.assign({}, ok);
    if (pm.to.promotionType) move.promotionType = pm.to.promotionType;
    c1Msg('⚡ Premove اجرا شد! (' + c1PremoveQueue.length + ' باقی)', 'success');
    // Don't clear entire queue in commit
    const keep = c1PremoveQueue.slice();
    c1CommitHumanMove(pm.from, move);
    c1PremoveQueue = keep;
    return true;
  }
  c1Msg('صف premove خالی/غیرقانونی بود.', 'info');
  c1Render();
  return false;
}

function c1Click(r,c){
  if(s1.gameOver) return;

  const piece = s1.board[r][c];
  const ourTurn = (s1Mode === 'hvh') || (s1.turn === s1HumanColor);

  // ---- Not our turn: premove only (own pieces) ----
  if (!ourTurn) {
    if (c1TryPremoveClick(r, c)) return;
    c1Msg(s1AiThinking
      ? 'ربات فکر می‌کند… برای premove مهرهٔ خودت را بزن.'
      : 'نوبت ربات — برای premove مهرهٔ خودت → مقصد.', 'info');
    return;
  }

  // Stuck flag recovery
  if (s1AiThinking) {
    s1AiThinking = false;
    if (typeof c1ClearAiWatchdog === 'function') c1ClearAiWatchdog();
  }
  c1PremoveDraft = null; // don't mix premove draft with real turn

  // ---- Our turn: normal chess including CAPTURES on enemy pieces ----
  if (!s1.selected) {
    if (!piece || piece.color !== s1.turn) return;
    s1.selected = { r, c };
    s1.legal = c1LegalMoves(s1, r, c);
    c1Msg(s1.legal.length ? 'مقصد را انتخاب کنید (گرفتن هم مجاز است).' : 'حرکت مجازی نیست.', 'info');
    c1Render();
    return;
  }

  // Deselect
  if (s1.selected.r === r && s1.selected.c === c) {
    s1.selected = null; s1.legal = []; c1Render(); return;
  }

  // Switch to another own piece
  if (piece && piece.color === s1.turn) {
    s1.selected = { r, c };
    s1.legal = c1LegalMoves(s1, r, c);
    c1Render();
    return;
  }

  // Destination: empty square OR enemy piece (capture)
  const match = s1.legal.find(m => m.r === r && m.c === c);
  if (!match) {
    c1Msg('حرکت غیرمجاز.', 'error');
    return;
  }

  let move = Object.assign({}, match);
  const moving = s1.board[s1.selected.r][s1.selected.c];
  const fromSq = { r: s1.selected.r, c: s1.selected.c };
  if (moving && moving.type === 'P' && (r === 0 || r === 7) && !move.promotionType) {
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
  // Keep remaining premove queue; only clear draft
  c1PremoveDraft = null;
  s1Undo.push(c1Clone(s1));
  const wasCapture = !!(s1.board[move.r] && s1.board[move.r][move.c]) || !!move.enPassant;
  c1MakeMove(s1, from, move);
  const san = s1.history[s1.history.length-1] || '';
  if(!s1.moveLog) s1.moveLog = [];
  s1.moveLog.push({ uci: c1MoveToUci(from, move), san, from, to: {r:move.r,c:move.c,promotionType:move.promotionType} });
  try {
    if (s1.gameOver) { /* end sound in end card */ }
    else if (c1InCheck(s1.board, s1.turn)) AudioFX.check();
    else if (wasCapture) AudioFX.capture();
    else AudioFX.move();
  } catch(_){}
  c1Msg('', 'info');
  c1Render();
  if(s1.gameOver) c1OnGameOver();
  else c1MaybeAi();
}

function c1ApplyAiMove(mv){
  s1AiThinking = false;
  c1ClearAiWatchdog();
  if(!mv){ c1Msg('ربات حرکتی پیدا نکرد.', 'error'); c1Render(); return; }
  // Only apply if it is still the AI side to move
  if (s1Mode === 'hva' && s1.turn === s1HumanColor) {
    c1Render();
    return;
  }
  s1Undo.push(c1Clone(s1));
  const wasCapture = !!(s1.board[mv.to.r] && s1.board[mv.to.r][mv.to.c]) || !!mv.to.enPassant;
  c1MakeMove(s1, mv.from, mv.to);
  const san = s1.history[s1.history.length-1] || '';
  if(!s1.moveLog) s1.moveLog = [];
  s1.moveLog.push({ uci: c1MoveToUci(mv.from, mv.to), san, from: mv.from, to: mv.to });
  try {
    if (!s1.gameOver) {
      if (c1InCheck(s1.board, s1.turn)) AudioFX.check();
      else if (wasCapture) AudioFX.capture();
      else AudioFX.move();
    }
  } catch(_){}
  c1Render();
  if(s1.gameOver) c1OnGameOver();
  else {
    if (!c1TryExecutePremove()) c1Render();
  }
}

function c1BotName(){
  return (s1ActiveBot && s1ActiveBot.name) ? s1ActiveBot.name : 'ربات';
}
function c1PickBlunderMove(state){
  const all = c1AllLegal(state);
  if (!all.length) return null;
  // Prefer non-hanging captures randomly among all moves
  return all[Math.floor(Math.random() * all.length)];
}
function c1ClearAiWatchdog(){
  if (c1AiWatchdog) { clearTimeout(c1AiWatchdog); c1AiWatchdog = null; }
}

function c1MaybeAi(){
  if(s1.gameOver) return;
  if(c1IsHumanTurn()){
    s1AiThinking = false;
    c1ClearAiWatchdog();
    c1TryExecutePremove();
    c1Render();
    return;
  }
  if(s1Mode!=='hva') return;
  // Already thinking — don't stack jobs
  if (s1AiThinking) return;

  const job = ++c1AiJob;
  s1AiThinking = true;
  c1Render();
  c1InitStockfish();
  const fen = c1ToFen(s1);
  const bot = s1ActiveBot;
  const strength = bot ? bot.strength : s1AiDepth;
  const blunder = bot ? (bot.blunder || 0) : 0;
  const thinking = bot ? (bot.name + ' در حال فکر…') : (c1SfReady ? 'موتور در حال فکر…' : 'در حال لود موتور…');
  c1Msg(thinking, 'info');

  const finish = (mv, note) => {
    if (job !== c1AiJob) return; // stale
    c1ClearAiWatchdog();
    if (mv) {
      c1ApplyAiMove(mv);
      if (note) c1Msg(note, 'success');
    } else {
      s1AiThinking = false;
      const fb = c1BestMoveFallback(s1, 2);
      if (fb) {
        c1ApplyAiMove(fb);
        c1Msg(note || 'حرکت جایگزین ربات.', 'info');
      } else {
        c1Msg('ربات حرکتی ندارد.', 'error');
        c1Render();
      }
    }
  };

  // Hard safety: never leave UI locked on "ربات"
  c1ClearAiWatchdog();
  c1AiWatchdog = setTimeout(() => {
    if (job !== c1AiJob || !s1AiThinking) return;
    console.warn('AI watchdog — forcing fallback');
    try { if (c1SfPending) { c1SfPending = null; c1SfPost('stop'); } } catch(_){}
    finish(null, 'ربات دیر کرد — حرکت جایگزین');
  }, 12000);

  setTimeout(()=>{
    if (job !== c1AiJob) return;
    if (blunder > 0 && Math.random() < blunder) {
      const bad = c1PickBlunderMove(s1);
      if (bad) {
        finish(bad, (bot && bot.quote) ? bot.quote : (c1BotName() + ' اشتباه کرد!'));
        return;
      }
    }
    c1SfGo(fen, strength, (uci) => {
      if (job !== c1AiJob) return;
      if (uci) {
        const parsed = c1ParseUci(uci);
        if (parsed) {
          const legal = c1LegalMoves(s1, parsed.from.r, parsed.from.c);
          let ok = legal.find(m => m.r===parsed.to.r && m.c===parsed.to.c &&
            (!parsed.to.promotionType || m.promotionType===parsed.to.promotionType));
          if (!ok) ok = legal.find(m => m.r===parsed.to.r && m.c===parsed.to.c);
          if (ok) {
            const mv = { from: parsed.from, to: Object.assign({}, ok) };
            if (parsed.to.promotionType) mv.to.promotionType = parsed.to.promotionType;
            finish(mv, c1BotName() + ' بازی کرد.');
            return;
          }
        }
        console.warn('UCI not matched', uci);
      }
      finish(null, 'موتور در دسترس نیست — جایگزین');
    });
  }, bot ? (120 + Math.random() * 280) : 30);
}

function c1StartFromSetup(){
  s1Mode = document.querySelector('#mode1v1Picker .seg-btn.active')?.dataset.mode || 'hva';
  s1HumanColor = document.querySelector('#color1v1Picker .seg-btn.active')?.dataset.color || 'w';
  s1AiDepth = parseInt(document.getElementById('ai1v1Depth').value,10)||2;
  if (s1Mode !== 'hva') s1ActiveBot = null;
  s1 = c1NewState();
  s1Undo = [];
  s1AiThinking=false;
  c1Bind();
  c1BuildBoard();
  showView('game1v1View');
  const t1 = document.getElementById('title1v1');
  if (t1) t1.textContent = s1ActiveBot ? (s1ActiveBot.avatar + ' ' + s1ActiveBot.name) : 'شطرنج ۱v۱';
  c1Msg(s1ActiveBot ? ('در برابر ' + s1ActiveBot.name) : (typeof t==='function'?t('gameStarted'):'Game started.'), 'info');
  c1Render();
  c1MaybeAi();
}

function c1StartVsBot(botId){
  const bot = C1_BOTS.find(b => b.id === botId);
  if (!bot) return;
  s1ActiveBot = bot;
  s1Mode = 'hva';
  s1HumanColor = document.querySelector('#botColorPicker .seg-btn.active')?.dataset.color || 'w';
  s1AiDepth = bot.strength;
  s1 = c1NewState();
  s1Undo = [];
  s1AiThinking = false;
  c1Bind();
  c1BuildBoard();
  showView('game1v1View');
  const t1 = document.getElementById('title1v1');
  if (t1) t1.textContent = bot.avatar + ' ' + bot.name;
  c1Msg('در برابر ' + bot.name + ' (≈' + bot.rating + ')', 'info');
  c1Render();
  c1MaybeAi();
}

function c1RenderBotGrid(){
  const grid = document.getElementById('botGrid');
  if (!grid) return;
  const en = (typeof appSettings !== 'undefined' && appSettings.lang === 'en');
  grid.innerHTML = '';
  C1_BOTS.forEach(bot => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bot-card';
    const nm = en && bot.nameEn ? bot.nameEn : bot.name;
    const st = en && bot.styleEn ? bot.styleEn : bot.style;
    const tg = en && bot.tagEn ? bot.tagEn : bot.tag;
    btn.innerHTML =
      '<div class="bot-avatar">' + bot.avatar + '</div>' +
      '<div class="bot-name">' + nm + '</div>' +
      '<div class="bot-rating">≈' + bot.rating + '</div>' +
      '<div class="bot-style">' + st + '</div>' +
      '<div class="bot-tag">' + tg + '</div>';
    btn.addEventListener('click', () => c1StartVsBot(bot.id));
    grid.appendChild(btn);
  });
}

function c1Restart(){
  c1ClearPremove();
  s1 = c1NewState();
  s1Undo=[];
  s1AiThinking=false;
  c1BuildBoard();
  c1Msg((typeof t==='function'?t('gameStarted'):'Game started.'), 'info');
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
  const en = (typeof appSettings !== 'undefined' && appSettings.lang === 'en');
  const mapFa = { 'w-wins':'برد سفید', 'b-wins':'برد سیاه', 'draw-stalemate':'پات', 'draw-50':'تساوی ۵۰ حرکت', 'draw-material':'کمبود مهره', 'draw-repetition':'تساوی — تکرار', 'draw':'تساوی' };
  const mapEn = { 'w-wins':'White wins', 'b-wins':'Black wins', 'draw-stalemate':'Stalemate', 'draw-50':'50-move draw', 'draw-material':'Draw · material', 'draw-repetition':'Draw · repetition', 'draw':'Draw' };
  const map = en ? mapEn : mapFa;
  return map[result] || result || '—';
}
function c1SnapshotGame(){
  let playerName = 'Player';
  try {
    const acc = JSON.parse(localStorage.getItem('chess4p_account_v1') || '{}');
    playerName = acc.displayName || acc.username || 'Player';
  } catch(_){}
  let moves = (s1.moveLog || []).map(m => ({ uci: m.uci, san: m.san }));
  // Fallback: build from history SAN list if moveLog missing
  if ((!moves || !moves.length) && s1.history && s1.history.length) {
    moves = s1.history.map(san => ({ uci: '', san: san }));
  }
  return {
    id: Date.now(),
    date: new Date().toLocaleString('fa-IR'),
    result: s1.result,
    mode: s1Mode,
    humanColor: s1HumanColor || 'w',
    playerName: playerName,
    oppName: (s1Mode === 'hva' ? 'Stockfish' : 'Opponent'),
    moves: moves,
    history: (s1.history || []).slice(),
  };
}

function c1Resign(){
  if (!s1 || s1.gameOver) return;
  const ok = confirm((typeof t === 'function') ? t('resignConfirm') : 'Resign?');
  if (!ok) return;
  // Side to resign = human in hva, or side to move in hvh
  let loser = s1HumanColor || 'w';
  if (s1Mode === 'hvh') loser = s1.turn;
  s1.result = (loser === 'w') ? 'b-wins' : 'w-wins';
  s1.gameOver = true;
  try { c1Render(); } catch(_){}
  c1OnGameOver();
}
function resign4pCurrent(){
  if (typeof state === 'undefined' || !state || state.gameOver) return;
  const p = PLAYERS[state.currentPlayerIndex];
  if (PLAYER_MODE[p] !== 'human') {
    alert((typeof appSettings !== 'undefined' && appSettings.lang==='en')
      ? 'Not your turn to resign.' : 'الان نوبت بازیکن انسانی نیست.');
    return;
  }
  const ok = confirm((typeof t === 'function') ? t('resignConfirm') : 'Resign?');
  if (!ok) return;
  try { triggerAITakeover(p); } catch (e) { console.warn(e); }
}

function c1OnGameOver(){
  try {
    const won = (s1.result === 'w-wins' && s1HumanColor === 'w') || (s1.result === 'b-wins' && s1HumanColor === 'b');
    if (typeof accountBumpGame === 'function') accountBumpGame(!!won);
  } catch(_){}

  const snap = c1SnapshotGame();
  window._c1LastSnap = snap;
  try {
    const list = c1LoadRecent().filter(g => String(g.id) !== String(snap.id));
    list.unshift(snap);
    c1SaveRecent(list);
    c1RenderHomeRecent();
  } catch(_){}

  // End-game card first (not forced into analysis)
  try { c1ShowEndGame(); } catch (e) {
    console.warn(e);
    setTimeout(() => { try { c1OpenAnalysis(snap, true); } catch(_){} }, 400);
  }
}

function c1CloseEndGame(){
  const ov = document.getElementById('endGameOverlay');
  if (ov) { ov.classList.remove('show'); ov.style.display = 'none'; }
}
function c1ShowEndGame(){
  const ov = document.getElementById('endGameOverlay');
  if (!ov || !s1) return;
  const en = (typeof appSettings !== 'undefined' && appSettings.lang === 'en');
  const res = s1.result || '';
  const human = s1HumanColor || 'w';
  let title = (typeof t === 'function') ? t('endTitle') : 'Game over';
  let emoji = '♔';
  let sub = (typeof c1ResultLabel === 'function') ? c1ResultLabel(res) : res;
  if (res === 'w-wins' || res === 'b-wins') {
    const won = (res === 'w-wins' && human === 'w') || (res === 'b-wins' && human === 'b');
    if (s1Mode === 'hva') {
      title = won ? t('endYouWin') : t('endYouLose');
      emoji = won ? '🏆' : '♟️';
    } else {
      title = t('endTitle');
      emoji = '♔';
    }
  } else if (res && String(res).indexOf('draw') === 0) {
    title = t('endDraw');
    emoji = '🤝';
  }
  const n = (s1.moveLog && s1.moveLog.length) || (s1.history && s1.history.length) || 0;
  const meta = n + ' ' + t('endMoves');
  const elT = document.getElementById('endGameTitle');
  const elS = document.getElementById('endGameSub');
  const elM = document.getElementById('endGameMeta');
  const elE = document.getElementById('endGameEmoji');
  if (elT) elT.textContent = title;
  if (elS) elS.textContent = sub;
  if (elM) elM.textContent = meta;
  if (elE) elE.textContent = emoji;
  // refresh action labels
  try {
    const a = document.getElementById('endGameAnalyzeBtn');
    const b = document.getElementById('endGameAgainBtn');
    const h = document.getElementById('endGameHomeBtn');
    if (a) a.textContent = t('endAnalyze');
    if (b) b.textContent = t('endAgain');
    if (h) h.textContent = t('endHome');
  } catch(_){}
  ov.style.display = 'flex';
  ov.classList.add('show');
  try { AudioFX.gameOver(); } catch(_){}
}
function c1WireEndGame(){
  const an = document.getElementById('endGameAnalyzeBtn');
  const ag = document.getElementById('endGameAgainBtn');
  const hm = document.getElementById('endGameHomeBtn');
  if (an) an.addEventListener('click', () => {
    c1CloseEndGame();
    try {
      const snap = window._c1LastSnap || c1SnapshotGame();
      c1OpenAnalysis(snap, true);
    } catch (e) { console.warn(e); }
  });
  if (ag) ag.addEventListener('click', () => {
    c1CloseEndGame();
    try {
      if (s1ActiveBot) c1StartVsBot(s1ActiveBot.id);
      else c1Restart();
    } catch (e) {
      try { c1Restart(); } catch(_){}
    }
  });
  if (hm) hm.addEventListener('click', () => {
    c1CloseEndGame();
    showView('homeView');
  });
}


function c1SetEvalBar(scoreStr){
  const youBar = document.getElementById('evalBarYou');
  const label = document.getElementById('evalScoreLabel');
  const topL = document.getElementById('evalLabelTop');
  const botL = document.getElementById('evalLabelBottom');
  if (!youBar || !label) return;
  const persp = c1Perspective();
  const adj = c1ScoreForPerspective(scoreStr);
  // Vertical bar: BOTTOM = you, TOP = opponent
  if (topL && botL) {
    botL.textContent = persp === 'w' ? 'شما' : 'شما';
    topL.textContent = 'حریف';
    // color tint by side
    botL.style.color = persp === 'w' ? 'var(--piece-w, #eee)' : 'var(--text-muted)';
    topL.style.color = persp === 'w' ? 'var(--text-muted)' : 'var(--piece-w, #eee)';
  }
  let pct = 50;
  let display = '0.00';
  if (typeof adj === 'string' && adj.charAt(0) === 'M') {
    pct = 97;
    display = adj;
    label.style.color = 'var(--ok)';
  } else if (typeof adj === 'string' && adj.indexOf('-M') === 0) {
    pct = 3;
    display = adj;
    label.style.color = 'var(--danger)';
  } else {
    const n = parseFloat(adj);
    if (!isNaN(n)) {
      const clamped = Math.max(-6, Math.min(6, n));
      pct = 50 + clamped * (45 / 6);
      display = (n > 0 ? '+' : '') + n.toFixed(2);
      label.style.color = n > 0.35 ? 'var(--ok)' : (n < -0.35 ? 'var(--danger)' : 'var(--gold)');
    }
  }
  // height from bottom = your share
  youBar.style.width = '100%';
  youBar.style.height = pct + '%';
  // your color: light if white, darker gold if black
  if (persp === 'w') {
    youBar.style.background = 'linear-gradient(0deg, #e8e4dc, #faf7f0)';
  } else {
    youBar.style.background = 'linear-gradient(0deg, #2a2a2a, #4a4a4a)';
  }
  label.textContent = display;
}

function c1AnalysisState(){
  if (!window._c1An) {
    window._c1An = {
      game: null,
      scores: [],      // stockfish raw (white POV) per position index (0 = start)
      ready: false,
      running: false,
      cursor: 0,        // which move index we're viewing (0 = before any move)
      maxMove: 0
    };
  }
  return window._c1An;
}

function c1UpdateNavUI(){
  const an = c1AnalysisState();
  const prev = document.getElementById('analysisPrevBtn');
  const next = document.getElementById('analysisNextBtn');
  const pos = document.getElementById('analysisMovePos');
  if (prev) prev.disabled = an.cursor <= 0;
  if (next) next.disabled = an.cursor >= an.maxMove;
  if (pos) {
    if (an.cursor <= 0) pos.textContent = 'شروع';
    else pos.textContent = an.cursor + ' / ' + an.maxMove;
  }
  // highlight move list
  document.querySelectorAll('#analysisMoves li').forEach((li, i) => {
    li.classList.toggle('active-move', i === an.cursor - 1);
  });
}

function c1RenderAnalysisBoard(cursor){
  const an = c1AnalysisState();
  const boardEl = document.getElementById('analysisMiniBoard');
  const noteEl = document.getElementById('analysisEvalNote');
  if (!boardEl) return;
  const boards = an.boards || [];
  const b = boards[cursor];
  boardEl.innerHTML = '';
  if (!b) {
    if (noteEl) noteEl.textContent = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'This position is not ready yet…':'موقعیت این حرکت هنوز آماده نیست…');
    return;
  }
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = document.createElement('div');
    sq.className = 'msq ' + (((r + c) % 2 === 0) ? 'l' : 'd');
    const piece = b[r][c];
    if (piece) {
      sq.textContent = C1.GLYPH[piece.color][piece.type];
      sq.style.color = piece.color === 'w' ? 'var(--piece-w, #f5f2eb)' : 'var(--piece-b, #9ec1ff)';
    }
    // last move highlight
    if (an.lastMoves && an.lastMoves[cursor]) {
      const lm = an.lastMoves[cursor];
      if ((lm.fr === r && lm.fc === c) || (lm.tr === r && lm.tc === c)) sq.classList.add('last');
    }
    boardEl.appendChild(sq);
  }
  if (noteEl) {
    const sc = an.scores[cursor];
    const prev = cursor > 0 ? an.scores[cursor - 1] : null;
    const shown = c1ScoreForPerspective(sc);
    let deltaTxt = '';
    if (prev != null && sc != null) {
      const a = parseFloat(c1ScoreForPerspective(prev));
      const b2 = parseFloat(c1ScoreForPerspective(sc));
      if (!isNaN(a) && !isNaN(b2)) {
        const d = b2 - a;
        deltaTxt = ' · تغییر ارزیابی: ' + (d > 0 ? '+' : '') + d.toFixed(2);
      }
    }
    const mvLabel = cursor === 0 ? ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Starting position':'وضعیت شروع') : ('بعد از حرکت ' + cursor);
    noteEl.textContent = mvLabel + ' · ارزیابی: ' + (shown || '—') + deltaTxt +
      ' (از دید شما)';
  }
}

function c1ShowAnalysisAt(cursor){
  const an = c1AnalysisState();
  an.cursor = Math.max(0, Math.min(cursor, an.maxMove));
  c1UpdateNavUI();
  const sc = an.scores[an.cursor];
  if (sc != null) c1SetEvalBar(sc);
  else c1SetEvalBar('0.00');
  c1RenderAnalysisBoard(an.cursor);
  const li = document.querySelector('#analysisMoves li.active-move');
  if (li) try { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(_){}
}

function c1CloseAnalysis(){
  const ov = document.getElementById('analysisOverlay');
  if (ov) ov.style.display = 'none';
}


function c1ApplyGameMove(state, m){
  if (!m) return false;
  let parsed = null;
  if (m.uci) parsed = c1ParseUci(m.uci);
  if (parsed) {
    if (m.uci.length >= 5 && !parsed.to.promotionType) {
      const pr = m.uci[4].toUpperCase();
      if ('QRBN'.includes(pr)) parsed.to.promotionType = pr;
    }
    const legal = c1LegalMoves(state, parsed.from.r, parsed.from.c);
    let ok = legal.find(x => x.r === parsed.to.r && x.c === parsed.to.c &&
      (!parsed.to.promotionType || x.promotionType === parsed.to.promotionType));
    if (!ok) ok = legal.find(x => x.r === parsed.to.r && x.c === parsed.to.c);
    if (!ok) return false;
    const to = Object.assign({}, ok);
    if (parsed.to.promotionType) to.promotionType = parsed.to.promotionType;
    c1MakeMove(state, parsed.from, to);
    return { fr: parsed.from.r, fc: parsed.from.c, tr: to.r, tc: to.c };
  }
  // Match by SAN against all legal moves of side to move
  const san = (m.san || '').replace(/[+#?!]/g,'').trim();
  if (!san) return false;
  const turn = state.turn;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = state.board[r][c];
    if (!p || p.color !== turn) continue;
    const legal = c1LegalMoves(state, r, c);
    for (const mv of legal) {
      // build a temp state copy is expensive; compare generated san via history trick
      const clone = c1Clone(state);
      c1MakeMove(clone, { r, c }, mv);
      const got = (clone.history[clone.history.length - 1] || '').replace(/[+#?!]/g,'');
      if (got === san || got === m.san) {
        c1MakeMove(state, { r, c }, mv);
        return { fr: r, fc: c, tr: mv.r, tc: mv.c };
      }
    }
  }
  return false;
}



function c1RenderHomeRecent(){
  const ul = document.getElementById('homeRecentList');
  if (!ul) return;
  const list = (typeof c1LoadRecent === 'function') ? c1LoadRecent() : [];
  ul.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'home-recent-empty';
    li.textContent = (typeof t === 'function') ? t('noRecent') : '—';
    ul.appendChild(li);
    return;
  }
  list.forEach((g) => {
    const li = document.createElement('li');
    li.className = 'home-recent-item';
    const n = (g.moves && g.moves.length) || 0;
    const result = (typeof c1ResultLabel === 'function' ? c1ResultLabel(g.result) : (g.result || '—'));
    const left = document.createElement('div');
    left.className = 'home-recent-meta';
    const acc = g.accuracy ? (' · ' + g.accuracy) : '';
    left.innerHTML = '<div class="home-recent-result">' + result + '</div>' +
      '<div class="home-recent-sub">' + n + ' ' + ((typeof t === 'function') ? t('moves') : 'moves') + acc + '</div>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-recent-go';
    btn.textContent = (typeof t === 'function') ? t('go') : 'Go';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof c1OpenAnalysis === 'function') c1OpenAnalysis(g, false);
    });
    li.appendChild(left);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function c1RenderRecentList(){
  const ul = document.getElementById('recentGamesList');
  if (!ul) return;
  const list = c1LoadRecent();
  ul.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.textContent = 'بازی اخیری نیست';
    li.style.opacity = '0.6';
    ul.appendChild(li);
    return;
  }
  list.forEach((g) => {
    const li = document.createElement('li');
    li.style.cursor = 'pointer';
    const n = (g.moves && g.moves.length) || 0;
    li.innerHTML = '<strong>' + c1ResultLabel(g.result) + '</strong> · ' +
      (g.date || '') + ' · ' + n + ' حرکت';
    li.addEventListener('click', () => c1OpenAnalysis(g, false));
    ul.appendChild(li);
  });
}

function c1OpenAnalysis(game, autoHint){
  try { if (typeof applyLanguage === 'function') applyLanguage(appSettings && appSettings.lang); } catch(_){}

  const ov = document.getElementById('analysisOverlay');
  if (!ov) return;
  ov.style.display = 'flex';
  window._c1AnalysisGame = game;
  const an = c1AnalysisState();
  an.game = game;
  an.scores = [];
  an.ready = false;
  an.running = false;
  an.cursor = 0;
  an.maxMove = (game.moves && game.moves.length) ? game.moves.length : 0;
  an.boards = [];
  an.lastMoves = [];
  // Build board snapshots immediately so ◀▶ shows positions even before SF finishes
  try {
    let st0 = c1NewState();
    an.boards.push(st0.board.map(row => row.map(x => x ? Object.assign({}, x) : null)));
    an.lastMoves.push(null);
    for (const m of (game.moves || [])) {
      const lm = c1ApplyGameMove(st0, m);
      if (!lm) { console.warn('analysis stop at move', m); break; }
      an.boards.push(st0.board.map(row => row.map(x => x ? Object.assign({}, x) : null)));
      an.lastMoves.push(lm);
    }
    an.maxMove = Math.max(an.maxMove, an.boards.length - 1);
  } catch (e) { console.warn('analysis boards', e); }

  document.getElementById('analysisTitle').textContent = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Analysis — ':'آنالیز — ') + c1ResultLabel(game.result);
  document.getElementById('analysisSub').textContent =
    (game.date || '') + ' · ' + an.maxMove + ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?' half-moves':' نیم\u200cحرکت');

  const ol = document.getElementById('analysisMoves');
  ol.innerHTML = '';
  (game.moves || []).forEach((m, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span>' + (Math.floor(i/2)+1) + (i%2===0?'. ':'... ') + (m.san || m.uci) +
      '</span><span class="ev" data-i="'+i+'">…</span>';
    li.addEventListener('click', () => {
      c1ShowAnalysisAt(i + 1);
    });
    ol.appendChild(li);
  });

  const fill = document.getElementById('analysisProgressFill');
  if (fill) fill.style.width = '0%';
  c1SetEvalBar('0.00');
  c1UpdateNavUI();
  try { c1RenderRecentList(); } catch (e) { console.warn('recent list', e); }
  const exp = document.getElementById('analysisExport');
  if (exp) exp.style.display = 'flex';
  try { c1ShowAnalysisAt(0); } catch (e) { console.warn('show at0', e); }

  // auto-run analysis in background
  try { c1RunAnalysis(); } catch (e) {
    console.error('run analysis', e);
    const st = document.getElementById('analysisStatusText');
    if (st) st.textContent = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Analysis start error: ':'خطا در شروع آنالیز: ') + (e && e.message ? e.message : e);
    const an = c1AnalysisState();
    an.running = false;
  }
}


function c1ParseEvalCp(s){
  if (s == null || s === '') return null;
  const str = String(s).trim();
  if (/M/i.test(str)) {
    const neg = /^-/.test(str) || /-M/i.test(str);
    // Mate distance → large but finite CP for accuracy
    const n = parseInt(str.replace(/[^0-9]/g,''), 10) || 1;
    const mag = Math.max(400, 900 - Math.min(n, 20) * 20);
    return neg ? -mag : mag;
  }
  const n = parseFloat(str);
  if (isNaN(n)) return null;
  return Math.max(-1200, Math.min(1200, n * 100));
}

function c1WinProb(cp){
  // Logistic used by Lichess/CE for win expectation
  return 1 / (1 + Math.exp(-0.00368212 * cp));
}

/** Per-side accuracy & estimated rating from white-POV scores[] */
function c1ComputeGameStats(scores, sideColor){
  if (!scores || scores.length < 2) return null;
  const moveAcc = [];
  const losses = [];
  let bestCount = 0, goodCount = 0, inacc = 0, mistake = 0, blunder = 0;

  for (let i = 1; i < scores.length; i++) {
    const movedByWhite = (i % 2 === 1);
    const isSide = (sideColor === 'w' && movedByWhite) || (sideColor === 'b' && !movedByWhite);
    if (!isSide) continue;
    const before = c1ParseEvalCp(scores[i - 1]);
    const after = c1ParseEvalCp(scores[i]);
    if (before == null || after == null) continue;

    const beforeS = sideColor === 'w' ? before : -before;
    const afterS = sideColor === 'w' ? after : -after;

    const wp0 = c1WinProb(beforeS);
    const wp1 = c1WinProb(afterS);
    const drop = Math.max(0, wp0 - wp1); // lost win probability

    // Stricter classification (one queen-hang ≈ large drop)
    if (drop < 0.015) { bestCount++; moveAcc.push(100); }
    else if (drop < 0.04) { goodCount++; moveAcc.push(92); }
    else if (drop < 0.08) { goodCount++; moveAcc.push(80); }
    else if (drop < 0.15) { inacc++; moveAcc.push(58); }
    else if (drop < 0.25) { mistake++; moveAcc.push(32); }
    else { blunder++; moveAcc.push(8); }

    const rawLoss = Math.max(0, beforeS - afterS);
    losses.push(Math.min(rawLoss, 800)); // allow larger swing into ACPL
  }

  if (!moveAcc.length) return null;

  // Arithmetic mean — do NOT trim away blunders
  let accuracy = moveAcc.reduce((a,b)=>a+b,0) / moveAcc.length;
  const acpl = losses.reduce((a,b)=>a+b,0) / losses.length;
  const accAcpl = Math.max(5, Math.min(98, 100 * Math.exp(-0.035 * acpl)));
  accuracy = 0.5 * accuracy + 0.5 * accAcpl;
  // Each blunder pulls accuracy down hard
  const blRate = blunder / moveAcc.length;
  const miRate = mistake / moveAcc.length;
  accuracy = accuracy * (1 - 0.35 * blRate - 0.15 * miRate);
  accuracy = Math.max(5, Math.min(99, accuracy));

  // Performance rating estimate (harsher curve)
  // ACPL 25→~2000, 50→~1500, 80→~1100, 120→~800, 200+→~500
  let rating = 2200 - 9.5 * acpl;
  rating = rating * 0.5 + (400 + accuracy * 14) * 0.5;
  rating -= blRate * 550;
  rating -= miRate * 180;
  rating += (bestCount / moveAcc.length) * 40;
  if (moveAcc.length < 10) {
    rating = 0.55 * rating + 0.45 * 1200;
  }
  // Cap: many blunders cannot look like 1700+
  if (blunder >= 2) rating = Math.min(rating, 1400);
  if (blunder >= 3) rating = Math.min(rating, 1200);
  if (blRate >= 0.15) rating = Math.min(rating, 1300);
  rating = Math.round(Math.max(350, Math.min(2500, rating)));

  return {
    accuracy: accuracy.toFixed(1) + '%',
    rating: String(rating),
    acpl: acpl.toFixed(0),
    n: moveAcc.length,
    blunder: blunder,
    mistake: mistake
  };
}

function c1ShowAnalysisStats(){
  const an = c1AnalysisState();
  const box = document.getElementById('analysisStats');
  const exp = document.getElementById('analysisExport');
  if (!box) return;
  const game = an.game || window._c1AnalysisGame;
  const human = (game && game.humanColor) || (typeof s1HumanColor === 'string' ? s1HumanColor : 'w');
  const opp = human === 'w' ? 'b' : 'w';
  const st = c1ComputeGameStats(an.scores, human);
  const stOpp = c1ComputeGameStats(an.scores, opp);
  if (!st && !stOpp) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'flex';
  if (exp) exp.style.display = 'flex';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  if (st) {
    set('anAccuracy', st.accuracy);
    set('anRating', st.rating);
    set('anACPL', st.acpl);
  }
  if (stOpp) {
    set('anOppAccuracy', stOpp.accuracy);
    set('anOppRating', stOpp.rating);
    set('anOppACPL', stOpp.acpl);
  }
  // Persist accuracy + rating on recent list (match by id or newest)
  try {
    if (st && game) {
      game.accuracy = st.accuracy;
      game.ratingEst = st.rating;
      window._c1AnalysisGame = game;
      let list = c1LoadRecent();
      let idx = list.findIndex(x => String(x.id) === String(game.id));
      if (idx < 0 && list.length) idx = 0; // fallback: most recent
      if (idx >= 0) {
        list[idx].accuracy = st.accuracy;
        list[idx].ratingEst = parseInt(st.rating, 10) || st.rating;
        list[idx].analyzed = true;
      } else if (game.moves && game.moves.length) {
        list.unshift(Object.assign({}, game, { analyzed: true }));
      }
      c1SaveRecent(list);
      // Average rating from analyzed games → account
      try {
        const ratings = list.map(g => parseInt(g.ratingEst, 10)).filter(n => !isNaN(n) && n > 0);
        if (ratings.length) {
          const avg = Math.round(ratings.reduce((a,b)=>a+b,0) / ratings.length);
          account = loadAccount();
          account.rating = avg;
          saveAccount(account);
          renderAccountCard();
        }
      } catch (e2) { console.warn(e2); }
      c1RenderHomeRecent();
      try { renderProfileView(); } catch(_){}
    }
  } catch (e) { console.warn(e); }
}

function c1PgnDate(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return y + '.' + m + '.' + day;
}
function c1BuildPgn(game){
  game = game || window._c1AnalysisGame;
  if (!game) return '';
  const result = game.result === 'w-wins' ? '1-0'
    : game.result === 'b-wins' ? '0-1'
    : (game.result && String(game.result).indexOf('draw') === 0) ? '1/2-1/2'
    : game.result === 'draw' ? '1/2-1/2' : '*';
  const human = game.humanColor || 'w';
  const whiteName = (human === 'w' ? (game.playerName || 'Player') : (game.oppName || 'Opponent')).replace(/["\r\n]/g,'');
  const blackName = (human === 'b' ? (game.playerName || 'Player') : (game.oppName || 'Opponent')).replace(/["\r\n]/g,'');
  const date = c1PgnDate();
  const nl = String.fromCharCode(10);
  const headers = [
    '[Event "Casual Game"]',
    '[Site "Chess Web"]',
    '[Date "' + date + '"]',
    '[Round "1"]',
    '[White "' + whiteName + '"]',
    '[Black "' + blackName + '"]',
    '[Result "' + result + '"]'
  ];
  const sans = (game.moves || []).map(m => {
    let s = (m.san || '').trim();
    if (!s && m.uci) s = String(m.uci);
    return s;
  }).filter(Boolean);
  let parts = [];
  for (let i = 0; i < sans.length; i++) {
    if (i % 2 === 0) parts.push((Math.floor(i/2) + 1) + '. ' + sans[i]);
    else parts.push(sans[i]);
  }
  parts.push(result);
  return headers.join(nl) + nl + nl + parts.join(' ') + nl;
}

function c1DownloadText(filename, content, mime){
  const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch(_){} }, 500);
}

function c1DownloadPgn(){
  const game = window._c1AnalysisGame;
  const pgn = c1BuildPgn(game);
  if (!pgn) return;
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  c1DownloadText('game-' + stamp + '.pgn', pgn, 'application/x-chess-pgn');
}


function c1RunAnalysis(){
  const an = c1AnalysisState();
  const game = an.game || window._c1AnalysisGame;
  if (!game || !game.moves || !game.moves.length) {
    const st = document.getElementById('analysisStatusText');
    if (st) st.textContent = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'No moves to analyze':'حرکتی برای آنالیز نیست');
    return;
  }
  if (an.running) {
    // allow retry if previous run hung
    an.running = false;
  }
  an.running = true;
  an.ready = false;
  an.scores = new Array(an.maxMove + 1).fill(null);

  c1InitStockfish();
  const runBtn = document.getElementById('analysisRunBtn');
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Analyzing…':'در حال آنالیز…'); }
  const statusText = document.getElementById('analysisStatusText');
  const statusDot = document.getElementById('analysisStatusDot');
  if (statusDot) { statusDot.className = 'analysis-status-dot busy'; }
  if (statusText) statusText.textContent = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Background analysis…':'آنالیز در پس\u200cزمینه…');

  let st = c1NewState();
  const positions = [{ fen: c1ToFen(st) }];
  const boardSnaps = [st.board.map(row => row.map(x => x ? Object.assign({}, x) : null))];
  const lastMoves = [null];
  for (const m of (game.moves || [])) {
    const lm = c1ApplyGameMove(st, m);
    if (!lm) break;
    positions.push({ fen: c1ToFen(st) });
    boardSnaps.push(st.board.map(row => row.map(x => x ? Object.assign({}, x) : null)));
    lastMoves.push(lm);
  }
  an.boards = boardSnaps;
  an.lastMoves = lastMoves;
  an.maxMove = Math.max(an.maxMove || 0, positions.length - 1);
  try { c1RenderAnalysisBoard(0); } catch (_) {}


  const total = positions.length;
  const fill = document.getElementById('analysisProgressFill');
  let idx = 0;

  function finishAll(){
    an.running = false;
    an.ready = true;
    if (statusDot) statusDot.className = 'analysis-status-dot done';
    if (statusText) statusText.textContent = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Analysis ready · your POV (':'آنالیز آماده · از دید شما (') + (c1Perspective()==='w'?'سفید':'سیاه') + ')';
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = ((typeof appSettings!=='undefined'&&appSettings.lang==='en')?'Re-analyze':'آنالیز دوباره'); }
    if (fill) fill.style.width = '100%';
    try { c1ShowAnalysisStats(); } catch (e) { console.warn(e); }
    c1ShowAnalysisAt(an.cursor);
  }

  function step(){
    if (idx >= total) { finishAll(); return; }
    if (statusText) statusText.textContent = 'آنالیز پس‌زمینه ' + (idx + 1) + ' / ' + total;
    if (fill) fill.style.width = Math.round(idx / total * 100) + '%';
    c1SfAnalyzeFen(positions[idx].fen, (info) => {
      const sc = info || '0.00';
      an.scores[idx] = sc;
      // update move list eval text (for moves after start)
      if (idx > 0) {
        const li = document.querySelectorAll('#analysisMoves li')[idx - 1];
        if (li) {
          const el = li.querySelector('.ev');
          const shown = c1ScoreForPerspective(sc);
          if (el) el.textContent = shown;
          li.classList.add('analyzed');
          // Move quality from win-prob drop (side that moved)
          try {
            const prev = an.scores[idx - 1];
            const before = c1ParseEvalCp(prev);
            const after = c1ParseEvalCp(sc);
            if (before != null && after != null) {
              const movedByWhite = (idx % 2 === 1);
              const side = movedByWhite ? 1 : -1;
              const wp0 = c1WinProb(before * side);
              const wp1 = c1WinProb(after * side);
              const drop = Math.max(0, wp0 - wp1);
              let cls = 'mq-best', lab = 'Best';
              if (drop >= 0.30) { cls = 'mq-blunder'; lab = 'Blunder'; }
              else if (drop >= 0.20) { cls = 'mq-mistake'; lab = 'Mistake'; }
              else if (drop >= 0.10) { cls = 'mq-inacc'; lab = 'Inaccuracy'; }
              else if (drop >= 0.05) { cls = 'mq-good'; lab = 'Good'; }
              else if (drop >= 0.02) { cls = 'mq-good'; lab = 'Good'; }
              let mq = li.querySelector('.mq');
              if (!mq) {
                mq = document.createElement('span');
                mq.className = 'mq';
                const span0 = li.querySelector('span');
                if (span0) span0.appendChild(mq);
                else li.appendChild(mq);
              }
              mq.className = 'mq ' + cls;
              mq.textContent = lab;
            }
          } catch(_){}
        }
      }
      // if user is currently on this position, refresh bar
      if (an.cursor === idx) c1SetEvalBar(sc);
      idx++;
      setTimeout(step, 50);
    });
  }

  let tries = 0;
  (function wait(){
    if (c1SfReady || tries++ > 80) step();
    else { c1InitStockfish(); setTimeout(wait, 100); }
  })();
}

function c1SfAnalyzeFen(fen, cb){
  c1InitStockfish();
  let tries = 0;
  const begin = () => {
    if (!c1SfWorker) {
      if (tries++ < 60) { setTimeout(begin, 150); return; }
      console.warn('SF missing for analysis');
      cb(null);
      return;
    }
    if (!c1SfReady && tries++ < 60) {
      setTimeout(begin, 100);
      return;
    }
    // Cancel previous analysis job
    if (window._c1SfAnalyzing) {
      try { c1SfWorker.postMessage('stop'); } catch(_){}
      const prev = window._c1SfAnalyzing;
      window._c1SfAnalyzing = null;
      try { prev.cb(prev.lastScore != null ? prev.lastScore : '0.00'); } catch(_){}
    }
    const stmBlack = /\sb\s/.test(String(fen));
    window._c1SfAnalyzing = { cb: cb, lastScore: null, stmBlack: stmBlack };
    try {
      c1SfWorker.postMessage('stop');
      c1SfWorker.postMessage('ucinewgame');
      c1SfWorker.postMessage('position fen ' + fen);
      c1SfWorker.postMessage('go depth 12 movetime 500');
    } catch (err) {
      window._c1SfAnalyzing = null;
      cb(null);
      return;
    }
    setTimeout(() => {
      if (window._c1SfAnalyzing && window._c1SfAnalyzing.cb === cb) {
        try { c1SfWorker.postMessage('stop'); } catch(_){}
        const sc = window._c1SfAnalyzing.lastScore != null ? window._c1SfAnalyzing.lastScore : '0.00';
        window._c1SfAnalyzing = null;
        cb(sc);
      }
    }, 3000);
  };
  begin();
}
