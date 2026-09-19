'use strict';
// Online multiplayer transport: localStorage bus / BroadcastChannel / PeerJS.

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
  if (typeof clearAllPremoves === 'function') clearAllPremoves();
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
  showMessage((typeof t==='function'?t('gameStartedTurn'):'New game started. Turn:') + ' Player A', 'info');
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

