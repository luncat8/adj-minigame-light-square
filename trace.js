// owns: light transport trace, event stream and buffers
// edit for: propagation rules, mirror splits, emitter seed, interaction event log

const DIR_UP = 0;
const DIR_RIGHT = 1;
const DIR_DOWN = 2;
const DIR_LEFT = 3;
const TRACE_WHITE = 7;
const TRACE_QUEUE = 4096;
const EV_GLASS = 0;
const EV_FILTER = 1;
const EV_REFLECT = 2;
const EV_SPLIT = 3;
const EV_ABSORB = 4;
const DELTA_R = [-1, 0, 1, 0];
const DELTA_C = [0, 1, 0, -1];

// node resolves geometry from board.js; browsers read its globals on first
// traceReset — keeps load order free of definition-time cross-file reads
let traceN = 0;
let traceDiag = 0;
let cellGlass = null;
let cellStep = null;
let traceRecv = null;
let traceSeg = null;
let traceVis = null;
let traceBend = null;
let traceBounce = null;
let traceQ = null;
let traceEvCell = null;
let traceEvDepth = null;
let traceEvBranch = null;
let traceEvFork = null;
let traceEvInfo = null;
let traceEvN = 0;
let traceBranch = 0;
let qh = 0;
let qt = 0;

function traceInit() {
	if (traceRecv) return;
	const b = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
	traceN = b ? b.BOARD_N : BOARD_N;
	const side = b ? b.GLASS : GLASS;
	const off = b ? b.GLASS_OFF : GLASS_OFF;
	traceDiag = b ? b.TILE_DIAG : TILE_DIAG;
	const cells = traceN * traceN;
	cellGlass = new Int8Array(cells);
	cellStep = new Uint8Array(cells * 4);
	for (let r = 0; r < traceN; r++) {
		for (let c = 0; c < traceN; c++) {
			const i = r * traceN + c;
			const border = r === 0 || r === traceN - 1 || c === 0 || c === traceN - 1;
			const inGlass = r >= off && r < off + side && c >= off && c < off + side;
			cellGlass[i] = border ? -2 : (inGlass ? (r - off) * side + (c - off) : -1);
			if (!border) {
				for (let d = 0; d < 4; d++) cellStep[i * 4 + d] = (r + DELTA_R[d]) * traceN + c + DELTA_C[d];
			}
		}
	}
	traceRecv = new Uint8Array(cells);
	traceSeg = new Uint8Array(cells * 4);
	traceVis = new Uint8Array(cells * 4);
	traceBend = new Int8Array(cells * 4);
	traceBounce = new Uint8Array(cells * 4);
	traceQ = new Int32Array(TRACE_QUEUE);
	traceEvCell = new Uint8Array(TRACE_QUEUE);
	traceEvDepth = new Uint8Array(TRACE_QUEUE);
	traceEvBranch = new Uint8Array(TRACE_QUEUE);
	traceEvFork = new Uint8Array(TRACE_QUEUE);
	traceEvInfo = new Uint16Array(TRACE_QUEUE);
}

// bend/bounce and event slots are overwritten before read via traceVis/traceEvN, avoiding extra per-trace fills
function traceReset() {
	if (!traceRecv) traceInit();
	traceRecv.fill(0);
	traceSeg.fill(0);
	traceVis.fill(0);
	traceEvN = 0;
	traceBranch = 0;
	qh = 0;
	qt = 0;
}

function traceTurn(dir, refDir) {
	return dir === refDir ? 0 : (((refDir - dir) & 3) === 3 ? 1 : -1);
}

// first parent reaching (cell, dir) sets bend/bounce; later channel merges keep that history
function traceSeed(cell, dir, ch, depth = 1, branch = 0, bend = 0, bounce = 0) {
	const k = (cell << 2) | dir;
	const prev = traceVis[k];
	const newCh = ch & ~prev;
	if (!newCh) return;
	if (!prev) {
		traceBend[k] = bend < -128 ? -128 : (bend > 127 ? 127 : bend);
		traceBounce[k] = bounce > 255 ? 255 : bounce;
	}
	traceVis[k] = prev | newCh;
	traceQ[qt++] = cell | (dir << 8) | (newCh << 10) | (depth << 13) | (branch << 23);
}

function traceRun(tiles) {
	const q = traceQ;
	const recv = traceRecv;
	const seg = traceSeg;
	const vis = traceVis;
	const bendA = traceBend;
	const bounceA = traceBounce;
	const evCell = traceEvCell;
	const evDepth = traceEvDepth;
	const evBranch = traceEvBranch;
	const evFork = traceEvFork;
	const evInfo = traceEvInfo;
	const cg = cellGlass;
	const cs = cellStep;
	const diagBit = traceDiag;
	let h = qh;
	let t = qt;
	let en = traceEvN;
	let bn = traceBranch;
	while (h < t) {
		const e = q[h++];
		const cell = e & 255;
		const dir = (e >> 8) & 3;
		const ch = (e >> 10) & 7;
		const depth = (e >> 13) & 1023;
		const br = (e >>> 23) & 255;
		const d8 = depth > 255 ? 255 : depth;
		const gi = cg[cell];
		// border cells dequeue in FIFO order so EV_ABSORB stays monotone with interior events
		if (gi === -2) {
			const nr = ch & ~recv[cell];
			recv[cell] |= ch;
			if (nr) {
				evCell[en] = cell;
				evDepth[en] = d8;
				evBranch[en] = br;
				evFork[en] = 0;
				evInfo[en++] = EV_ABSORB | (dir << 3) | (nr << 5) | (dir << 11);
			}
			continue;
		}
		const k = (cell << 2) | dir;
		const bd = bendA[k];
		const bc = bounceA[k];
		const nd = depth < 1023 ? depth + 1 : 1023;
		let passCh = ch;
		let refCh = 0;
		let refDir = dir;
		let turn = 0;
		let fork = 0;
		if (gi >= 0) {
			const tile = tiles[gi];
			const mask = tile & 7;
			if (!mask) {
				evCell[en] = cell;
				evDepth[en] = d8;
				evBranch[en] = br;
				evFork[en] = 0;
				evInfo[en++] = (dir << 3) | (ch << 5) | (dir << 11);
			} else {
				passCh = ch & ~mask;
				refCh = ch & mask;
				const diag = tile & diagBit;
				refDir = dir ^ (diag ? 3 : 1);
				turn = (diag ? 1 : -1) * (dir & 1 ? -1 : 1);
				const kind = !refCh ? EV_FILTER : (!passCh ? EV_REFLECT : EV_SPLIT);
				fork = kind === EV_SPLIT ? (bn < 127 ? ++bn : 127) : 0;
				evCell[en] = cell;
				evDepth[en] = d8;
				evBranch[en] = br;
				evFork[en] = fork;
				evInfo[en++] = kind | (dir << 3) | (passCh << 5) | (refCh << 8) | (refDir << 11);
			}
		}
		if (passCh) {
			seg[k] |= passCh;
			const next = cs[k];
			const nk = (next << 2) | dir;
			const pv = vis[nk];
			const nc = passCh & ~pv;
			if (nc) {
				if (!pv) {
					bendA[nk] = bd;
					bounceA[nk] = bc;
				}
				vis[nk] = pv | nc;
				q[t++] = next | (dir << 8) | (nc << 10) | (nd << 13) | (br << 23);
			}
		}
		if (refCh) {
			const rk = (cell << 2) | refDir;
			seg[rk] |= refCh;
			const next = cs[rk];
			const nk = (next << 2) | refDir;
			const pv = vis[nk];
			const nc = refCh & ~pv;
			if (nc) {
				if (!pv) {
					const nbd = bd + turn;
					bendA[nk] = nbd < -128 ? -128 : (nbd > 127 ? 127 : nbd);
					bounceA[nk] = bc < 255 ? bc + 1 : 255;
				}
				vis[nk] = pv | nc;
				const rbr = passCh ? fork : br;
				q[t++] = next | (refDir << 8) | (nc << 10) | (nd << 13) | (rbr << 23);
			}
		}
	}
	qh = h;
	qt = t;
	traceEvN = en;
	traceBranch = bn;
}

function traceLight(tiles, emitter) {
	traceReset();
	const sCell = (traceN - 2) * traceN + emitter;
	const sk = sCell << 2;
	traceVis[sk] = TRACE_WHITE;
	traceBend[sk] = 0;
	traceBounce[sk] = 0;
	traceQ[0] = sCell | (TRACE_WHITE << 10) | (1 << 13);
	qt = 1;
	traceRun(tiles);
}

if (typeof module !== 'undefined') module.exports = {
	DIR_UP,
	DIR_RIGHT,
	DIR_DOWN,
	DIR_LEFT,
	TRACE_WHITE,
	EV_GLASS,
	EV_FILTER,
	EV_REFLECT,
	EV_SPLIT,
	EV_ABSORB,
	traceTurn,
	traceReset,
	traceSeed,
	traceRun,
	traceLight,
	get traceRecv() { return traceRecv; },
	get traceSeg() { return traceSeg; },
	get traceBend() { return traceBend; },
	get traceBounce() { return traceBounce; },
	get traceEvCell() { return traceEvCell; },
	get traceEvDepth() { return traceEvDepth; },
	get traceEvBranch() { return traceEvBranch; },
	get traceEvFork() { return traceEvFork; },
	get traceEvInfo() { return traceEvInfo; },
	get traceEvN() { return traceEvN; }
};
