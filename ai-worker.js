'use strict';
// AI search worker — runs the 4-player chess engine off the main thread
// so a deep search doesn't freeze the UI.
importScripts('engine.js');

self.onmessage = function (e) {
  const msg = e.data;
  if (!msg || msg.type !== 'search') return;
  const { requestId, state, depth } = msg;

  onSearchProgress = function (info) {
    self.postMessage({ type: 'progress', requestId: requestId, depth: info.depth, nodes: info.nodes, elapsed: info.elapsed });
  };

  try {
    const result = findBestMove(state, depth);
    self.postMessage({
      type: 'done',
      requestId: requestId,
      move: result ? result.move : null,
      value: result ? result.value : 0,
      nodes: result ? result.nodes : 0,
      time: result ? result.time : '0',
    });
  } catch (err) {
    self.postMessage({ type: 'error', requestId: requestId, message: String((err && err.message) || err) });
  }
};
