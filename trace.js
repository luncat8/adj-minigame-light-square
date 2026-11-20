// owns: light transport trace and its buffers
// edit for: propagation rules, mirror splits, emitter seed

const DIR_UP = 0;
const DIR_RIGHT = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 3;
const TRACE_WHITE = 7;
const TRACE_QUEUE = 4096;
const DELTA_R = [-1, 0, 1, 0];
const DELTA_C = [0, 1, 0, -1];

// node resolves geometry from board.js; browsers read its globals on first
// traceReset — keeps load order free of definition-time cross-file reads
let traceN = 0;
let traceSide = 0;
let traceOff = 0;
let traceDiag = 0;
let traceRecv = null;
let traceSeg = null;
let traceVis = null;
let traceQ = null;
let qh = 0;
let qt = 0;

function traceInit() {
	if (traceRecv) return;
	const b = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
	traceN = b ? b.BOARD_N : BOARD_N;
	traceSide = b ? b.GLASS : GLASS;
	traceOff = b ? b.GLASS_OFF : GLASS_OFF;
	traceDiag = b ? b.TILE_DIAG : TILE_DIAG;
	const cells = traceN * traceN;
	traceRecv = new Uint8Array(cells);
	traceSeg = new Uint8Array(cells * 4);
	traceVis = new Uint8Array(cells * 4);
	traceQ = new Int32Array(TRACE_QUEUE);
}

function traceReset() {
	traceInit();
	traceRecv.fill(0);
	traceSeg.fill(0);
	traceVis.fill(0);
	qh = 0;
	qt = 0;
}

// seeds and enqueues are interior cells only; new channel bits per (cell, dir) bound the queue
function traceSeed(cell, dir, ch) {
	const k = cell * 4 + dir;
	const newCh = ch & ~traceVis[k];
	if (!newCh) return;
	traceVis[k] |= newCh;
	traceQ[qt++] = cell | (dir << 8) | (newCh << 10);
}

function tileAt(r, cc, tiles) {
	if (r < traceOff || r >= traceOff + traceSide || cc < traceOff || cc >= traceOff + traceSide) return 0;
	return tiles[(r - traceOff) * traceSide + (cc - traceOff)];
}

function propagate(cell, dir, ch) {
	if (!ch) return;
	const r = (cell / traceN) | 0;
	const cc = cell - r * traceN;
	const nr = r + DELTA_R[dir];
	const nc = cc + DELTA_C[dir];
	const next = nr * traceN + nc;
	traceSeg[cell * 4 + dir] |= ch;
	// first border cell absorbs, including light returning to the bottom
	if (nr === 0 || nr === traceN - 1 || nc === 0 || nc === traceN - 1) {
		traceRecv[next] |= ch;
		return;
	}
	traceSeed(next, dir, ch);
}

function traceRun(tiles) {
	while (qh < qt) {
		const e = traceQ[qh++];
		const cell = e & 255;
		const dir = (e >> 8) & 3;
		const ch = e >> 10;
		const r = (cell / traceN) | 0;
		const cc = cell - r * traceN;
		const tile = tileAt(r, cc, tiles);
		const mask = tile & 7;
		propagate(cell, dir, ch & ~mask);
		if (mask) propagate(cell, dir ^ (tile & traceDiag ? 3 : 1), ch & mask);
	}
}

function traceLight(tiles, emitter) {
	traceReset();
	traceSeed((traceN - 2) * traceN + emitter, DIR_UP, TRACE_WHITE);
	traceRun(tiles);
}

if (typeof module !== 'undefined') module.exports = {
	DIR_UP,
	DIR_RIGHT,
	DIR_DOWN,
	DIR_LEFT,
	TRACE_WHITE,
	traceReset,
	traceSeed,
	traceRun,
	traceLight,
	get traceRecv() {
		return traceRecv;
	},
	get traceSeg() {
		return traceSeg;
	}
};
