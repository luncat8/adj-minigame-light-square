// owns: fixed-budget random-walk difficulty score and bounded shortest-solve diagnostics
// edit for: walk budget, measurement action graph, BFS cap and state encoding

const WALK_COUNT = 64;
const WALK_STEPS = 20;
const SOLVE_CAP = 20000;
// 3 rings × 2 directions plus one center flip (both center directions are the same move)
const RING_ACTIONS = 7;
const TURN_FLIP = 64;

// dependencies and buffers resolve on first use, keeping load order free of definition-time reads
let dReady = false;
let dTraceMod = null;
let dShift = null;
let dPermute = null;
let dSlots = null;
let dStep = null;
let dTraceLight = null;
let dWon = null;
let dRings = null;
let dSides = null;
let dCenter = 0;
let dEmin = 0;
let dEmax = 0;
let dTiles = null;
let dWalkPose = null;
let dDepth = null;
let dQueue = null;
const dTables = [null, null, null, null];

function difficultyInit() {
	if (dReady) return;
	const node = typeof module !== 'undefined' && module.exports;
	const b = node ? require('./board.js') : null;
	const g = node ? require('./contract.js') : null;
	dTraceMod = node ? require('./trace.js') : null;
	dShift = b ? b.shiftRing : shiftRing;
	dPermute = b ? b.permuteRing : permuteRing;
	dSlots = b ? b.stepSlots : stepSlots;
	dStep = b ? b.stepEmitter : stepEmitter;
	dRings = b ? b.RING_CELLS : RING_CELLS;
	dSides = b ? b.RING_SIDE : RING_SIDE;
	dCenter = b ? b.CENTER_CELL : CENTER_CELL;
	dEmin = b ? b.EMITTER_MIN : EMITTER_MIN;
	dEmax = b ? b.EMITTER_MAX : EMITTER_MAX;
	dTraceLight = dTraceMod ? dTraceMod.traceLight : traceLight;
	dWon = g ? g.contractWon : contractWon;
	const cells = (b ? b.GLASS : GLASS) ** 2;
	dTiles = new Uint8Array(cells);
	dWalkPose = { mode: 0, corner: false, tiles: new Uint8Array(cells), emitter: 0 };
	const maxStates = (dEmax - dEmin + 1) * 2 * dRings[0].length * dRings[1].length * dRings[2].length;
	dDepth = new Int8Array(maxStates);
	dQueue = new Int32Array(maxStates);
	dReady = true;
}

function dRecv() {
	return dTraceMod ? dTraceMod.traceRecv : traceRecv;
}

function walkActionCount(emitter) {
	return RING_ACTIONS + (emitter > dEmin ? 1 : 0) + (emitter < dEmax ? 1 : 0);
}

// uniform over legal actions; backtracking allowed, out-of-bounds emitter steps are not actions
function walkStep(rng, p) {
	let a = (rng() * walkActionCount(p.emitter)) | 0;
	if (a < 6) return dShift(p, a >> 1, a & 1 ? 1 : -1);
	if (a === 6) return dShift(p, 3, 1);
	if (p.emitter === dEmin) a++;
	dStep(p, a === 7 ? -1 : 1);
}

// consumes only `rng`; every walk restarts from the candidate start on a scratch pose
function measureWalks(cand, rng, walks = WALK_COUNT, steps = WALK_STEPS) {
	difficultyInit();
	const p = dWalkPose;
	p.mode = cand.mode;
	p.corner = cand.corner;
	let successes = 0;
	for (let w = 0; w < walks; w++) {
		p.tiles.set(cand.start);
		p.emitter = cand.startEmitter;
		for (let s = 0; s < steps; s++) {
			walkStep(rng, p);
			dTraceLight(p.tiles, p.emitter);
			if (!dWon(cand.contract, dRecv())) continue;
			successes++;
			break;
		}
	}
	const winRate = successes / walks;
	return { successes, walks, winRate, score: 1 - winRate };
}

// per ring and net turn k: source glass cell for each slot, plus TURN_FLIP when a mirror there
// has flipped an odd number of times; an all-mirror probe makes flip parity content-free
function turnTable(mode, corner) {
	difficultyInit();
	const key = mode * 2 + (corner ? 1 : 0);
	if (dTables[key]) return dTables[key];
	const periods = new Int32Array(3);
	const offsets = new Int32Array(3);
	let size = 0;
	for (let r = 0; r < 3; r++) {
		periods[r] = dRings[r].length / dSlots(mode, dSides[r]);
		offsets[r] = size;
		size += periods[r] * dRings[r].length;
	}
	const table = new Uint8Array(size);
	const probe = { mode, corner, tiles: new Uint8Array(dTiles.length), emitter: 0 };
	const src = new Uint8Array(dTiles.length);
	for (let r = 0; r < 3; r++) {
		const cells = dRings[r];
		probe.tiles.fill(7);
		for (let i = 0; i < src.length; i++) src[i] = i;
		for (let k = 0; k < periods[r]; k++) {
			for (let s = 0; s < cells.length; s++) {
				table[offsets[r] + k * cells.length + s] = src[cells[s]] | (probe.tiles[cells[s]] & 8 ? TURN_FLIP : 0);
			}
			dShift(probe, r, 1);
			dPermute(src, r, dSlots(mode, dSides[r]));
		}
	}
	return (dTables[key] = { periods, offsets, table });
}

// the pose after net ring turns t0..t2 and center flips c, rebuilt from the immutable start
function turnedPose(start, tt, t0, t1, t2, c, out) {
	for (let r = 0; r < 3; r++) {
		const cells = dRings[r];
		const k = r === 0 ? t0 : r === 1 ? t1 : t2;
		const base = tt.offsets[r] + k * cells.length;
		for (let s = 0; s < cells.length; s++) {
			const e = tt.table[base + s];
			const tile = start[e & (TURN_FLIP - 1)];
			out[cells[s]] = e & TURN_FLIP && tile & 7 ? tile ^ 8 : tile;
		}
	}
	const center = start[dCenter];
	out[dCenter] = c && center & 7 ? center ^ 8 : center;
	return out;
}

// mixed-radix layout of the active search: state = ((((e·P0 + t0)·P1 + t1)·P2 + t2)·2 + c)
let dP0 = 0;
let dP1 = 0;
let dP2 = 0;
let dS1 = 0;
let dS0 = 0;
let dSE = 0;

function solveLayout(tt) {
	dP0 = tt.periods[0];
	dP1 = tt.periods[1];
	dP2 = tt.periods[2];
	dS1 = dP2 * 2;
	dS0 = dP1 * dS1;
	dSE = dP0 * dS0;
}

function solveWins(cand, tt, s) {
	const t0 = ((s / dS0) | 0) % dP0;
	const t1 = ((s / dS1) | 0) % dP1;
	const t2 = (s >> 1) % dP2;
	turnedPose(cand.start, tt, t0, t1, t2, s & 1, dTiles);
	dTraceLight(dTiles, dEmin + ((s / dSE) | 0));
	return dWon(cand.contract, dRecv());
}

function turnDelta(t, d, p) {
	return (t + d + p) % p - t;
}

// same action order as walkStep: ring r ccw/cw (0…5), center flip (6), emitter left/right (7, 8)
function solveNeighbor(s, a) {
	const d = a & 1 ? 1 : -1;
	if (a < 2) return s + turnDelta(((s / dS0) | 0) % dP0, d, dP0) * dS0;
	if (a < 4) return s + turnDelta(((s / dS1) | 0) % dP1, d, dP1) * dS1;
	if (a < 6) return s + turnDelta((s >> 1) % dP2, d, dP2) * 2;
	if (a === 6) return s ^ 1;
	const de = a === 7 ? -1 : 1;
	const ne = ((s / dSE) | 0) + de;
	return ne < 0 || ne > dEmax - dEmin ? -1 : s + de * dSE;
}

// one legal ring/emitter action = one move; each discovered state is traced once, and the
// first win is minimal because BFS expands level by level. Never mutates the candidate.
function shortestSolve(cand, cap = SOLVE_CAP) {
	const tt = turnTable(cand.mode, cand.corner);
	solveLayout(tt);
	dDepth.fill(-1, 0, (dEmax - dEmin + 1) * dSE);
	if (cap < 1) return { status: 'capped', moves: null, visited: 0 };
	const s0 = (cand.startEmitter - dEmin) * dSE;
	let visited = 1;
	if (solveWins(cand, tt, s0)) return { status: 'exact', moves: 0, visited };
	dDepth[s0] = 0;
	let head = 0;
	let tail = 0;
	dQueue[tail++] = s0;
	while (head < tail) {
		const s = dQueue[head++];
		const depth = dDepth[s] + 1;
		for (let a = 0; a < RING_ACTIONS + 2; a++) {
			const n = solveNeighbor(s, a);
			if (n < 0 || dDepth[n] >= 0) continue;
			if (visited >= cap) return { status: 'capped', moves: null, visited };
			visited++;
			if (solveWins(cand, tt, n)) return { status: 'exact', moves: depth, visited };
			dDepth[n] = depth;
			dQueue[tail++] = n;
		}
	}
	return { status: 'unreachable', moves: null, visited };
}

if (typeof module !== 'undefined') module.exports = {
	WALK_COUNT,
	WALK_STEPS,
	SOLVE_CAP,
	measureWalks,
	turnTable,
	turnedPose,
	shortestSolve
};
