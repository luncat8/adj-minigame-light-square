// owns: solvable generation, dial profile, exact-count sampling, replay-verified witnesses and preset candidates
// edit for: sampling, profile anchors, scramble policy, fallback assembly

const nBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const nTrace = typeof module !== 'undefined' && module.exports ? require('./trace.js') : null;
const nGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;
const nPresets = typeof module !== 'undefined' && module.exports ? require('./presets.js') : null;

const BN = nBoard ? nBoard.BOARD_N : BOARD_N;
const GL = nBoard ? nBoard.GLASS : GLASS;
const GOFF = nBoard ? nBoard.GLASS_OFF : GLASS_OFF;
const GDIAG = nBoard ? nBoard.TILE_DIAG : TILE_DIAG;
const EMIN = nBoard ? nBoard.EMITTER_MIN : EMITTER_MIN;
const EMAX = nBoard ? nBoard.EMITTER_MAX : EMITTER_MAX;
const MQ = nBoard ? nBoard.MODE_QUARTER : MODE_QUARTER;
const MS = nBoard ? nBoard.MODE_SINGLE : MODE_SINGLE;
const nCreate = nBoard ? nBoard.createPuzzle : createPuzzle;
const nShift = nBoard ? nBoard.shiftRing : shiftRing;
const nStep = nBoard ? nBoard.stepEmitter : stepEmitter;
const nTraceLight = nTrace ? nTrace.traceLight : traceLight;
const nCreateContract = nGoal ? nGoal.createContract : createContract;
const nStrict = nGoal ? nGoal.createStrictContract : createStrictContract;
const nEval = nGoal ? nGoal.evaluateContract : evaluateContract;
const nTemplate = nPresets ? nPresets.presetTemplate : presetTemplate;

const MIRRORS_DEFAULT = 11;
const GEN_ATTEMPTS = 400;
// dial anchors at 0, 1/3, 2/3, 1: quota fraction, exact-color probability, scramble moves, eligible rings
const PROFILE_ANCHORS = [
	[0.50, 0, 3, 1],
	[0.65, 0, 6, 2],
	[0.85, 0.5, 10, 3],
	[1, 1, 14, 4]
];
// action ids match PRESET_MOVES: ring r ccw 2r / cw 2r+1, center flip 7, emitter left 8 / right 9
const ACT_CENTER = 7;
const ACT_LEFT = 8;
const ACT_RIGHT = 9;

const glassOrder = new Uint8Array(GL * GL);
const ringOrder = new Uint8Array(4);
const ringActs = new Int8Array(8);
const emitActs = new Int8Array(2);

function recvNow() {
	return nTrace ? nTrace.traceRecv : traceRecv;
}

// seedable PRNG (mulberry32) so batches replay identically
function makeRng(seed) {
	let a = seed >>> 0;
	return function () {
		a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randInt(rng, n) {
	return (rng() * n) | 0;
}

function profile(difficulty) {
	const x = difficulty * 3;
	const i = Math.min(2, Math.floor(x));
	const t = x - i;
	const a = PROFILE_ANCHORS[i];
	const b = PROFILE_ANCHORS[i + 1];
	return {
		quotaFrac: a[0] + (b[0] - a[0]) * t,
		exactProb: a[1] + (b[1] - a[1]) * t,
		scrambleMoves: Math.round(a[2] + (b[2] - a[2]) * t),
		rings: Math.round(a[3] + (b[3] - a[3]) * t),
		strict: difficulty === 1
	};
}

// explicit, validated generation request shared by generate and presetFor
function genSettings(seed, mode, corner, difficulty, mirrorCount) {
	if (!Number.isInteger(mirrorCount) || mirrorCount < 1 || mirrorCount > GL * GL) throw new RangeError('mirror count must be an integer 1…' + GL * GL);
	if (!Number.isFinite(difficulty)) throw new RangeError('difficulty must be finite');
	const dial = Math.min(1, Math.max(0, difficulty));
	return { seed: seed >>> 0, mode, corner, difficulty: dial, mirrorCount, profile: profile(dial) };
}

function countMirrors(tiles) {
	let n = 0;
	for (let i = 0; i < tiles.length; i++) if (tiles[i] & 7) n++;
	return n;
}

// identity reset keeps draws seed-reproducible regardless of earlier calls
function partialShuffle(rng, order, k) {
	for (let i = 0; i < order.length; i++) order[i] = i;
	for (let i = 0; i < k; i++) {
		const j = i + randInt(rng, order.length - i);
		const t = order[i];
		order[i] = order[j];
		order[j] = t;
	}
}

// exactly mirrorCount occupied cells, uniform over subsets, each with a nonzero mask
function randomGlass(rng, mirrorCount, tiles) {
	partialShuffle(rng, glassOrder, mirrorCount);
	tiles.fill(0);
	for (let i = 0; i < mirrorCount; i++) tiles[glassOrder[i]] = (1 + randInt(rng, 7)) | (rng() < 0.5 ? GDIAG : 0);
	return tiles;
}

// witness emitter always crosses the glass; emitter range is not a difficulty lever
function sampleWitness(rng, mode, corner, mirrorCount) {
	const p = nCreate(mode, corner);
	randomGlass(rng, mirrorCount, p.tiles);
	p.emitter = GOFF + randInt(rng, GL);
	return p;
}

function clonePose(p) {
	const c = nCreate(p.mode, p.corner);
	c.tiles.set(p.tiles);
	c.emitter = p.emitter;
	return c;
}

// border receivers actually hit by a pose (corners never absorb)
function traceHits(tiles, emitter) {
	nTraceLight(tiles, emitter);
	const recv = recvNow();
	const hits = [];
	for (let cell = 0; cell < recv.length; cell++) {
		const mask = recv[cell];
		if (!mask) continue;
		const row = (cell / BN) | 0;
		const col = cell % BN;
		const edgeRow = row === 0 || row === BN - 1;
		const edgeCol = col === 0 || col === BN - 1;
		if (edgeRow !== edgeCol) hits.push({ cell, mask });
	}
	return hits;
}

// light always exits at a border, so every witness has at least one hit
function deriveContract(hits, prof, rng) {
	if (prof.strict) return nStrict(hits.map(h => ({ cell: h.cell, mask: h.mask })));
	// epsilon: binary rounding (20 * 0.65 = 13.000000000000002) must not raise the quota
	const quota = Math.min(hits.length, Math.max(1, Math.ceil(hits.length * prof.quotaFrac - 1e-9)));
	const targets = hits.map(h => ({ cell: h.cell, mask: rng() < prof.exactProb ? h.mask : 0 }));
	return nCreateContract(targets, quota, false);
}

function eligibleRings(rng, count) {
	partialShuffle(rng, ringOrder, count);
	let mask = 0;
	for (let i = 0; i < count; i++) mask |= 1 << ringOrder[i];
	return mask;
}

function inverseAct(a) {
	return a === ACT_CENTER ? a : a ^ 1;
}

function actMove(a) {
	const d = a & 1 ? 1 : -1;
	return a < ACT_LEFT ? { r: a >> 1, d } : { e: d };
}

// ring 0.8 / emitter 0.2 among legal actions; the immediate inverse is never offered, and
// a ring set emptied by that exclusion always leaves an emitter step (13 columns)
function scrambleAct(rng, p, rings, last) {
	const inv = last < 0 ? -1 : inverseAct(last);
	let nr = 0;
	let ne = 0;
	for (let r = 0; r < 4; r++) {
		if (!((rings >> r) & 1)) continue;
		for (let a = r === 3 ? ACT_CENTER : 2 * r; a <= 2 * r + 1; a++) if (a !== inv) ringActs[nr++] = a;
	}
	if (p.emitter > EMIN && inv !== ACT_LEFT) emitActs[ne++] = ACT_LEFT;
	if (p.emitter < EMAX && inv !== ACT_RIGHT) emitActs[ne++] = ACT_RIGHT;
	const ring = nr > 0 && (ne === 0 || rng() < 0.8);
	return ring ? ringActs[randInt(rng, nr)] : emitActs[randInt(rng, ne)];
}

function applyMove(p, m) {
	if (m.e !== undefined) nStep(p, m.e);
	else nShift(p, m.r, m.d);
}

// walk the witness forward with exactly `length` legal moves on the eligible rings
function scramble(rng, witness, rings, length) {
	const start = clonePose(witness);
	const forward = [];
	let last = -1;
	for (let i = 0; i < length; i++) {
		last = scrambleAct(rng, start, rings, last);
		const m = actMove(last);
		applyMove(start, m);
		forward.push(m);
	}
	return { start, forward };
}

// inverse of a forward sequence, applied in reverse order, replays start to witness
function invert(forward) {
	const solution = [];
	for (let i = forward.length - 1; i >= 0; i--) {
		const m = forward[i];
		solution.push(m.e !== undefined ? { e: -m.e } : { r: m.r, d: -m.d });
	}
	return solution;
}

function sameTiles(a, b) {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

function buildCandidate(req, witness, sc, contract, hits, preset, attempts) {
	return {
		mode: req.mode,
		corner: req.corner,
		seed: req.seed,
		difficulty: req.difficulty,
		mirrorCount: req.mirrorCount,
		start: Uint8Array.from(sc.start.tiles),
		startEmitter: sc.start.emitter,
		witness: Uint8Array.from(witness.tiles),
		witnessEmitter: witness.emitter,
		contract,
		solution: invert(sc.forward),
		preset,
		attempts,
		witnessHits: hits
	};
}

// replay the solution from start, then require exact count, a winning witness and a non-winning start
function verifyCandidate(cand) {
	if (countMirrors(cand.witness) !== cand.mirrorCount || countMirrors(cand.start) !== cand.mirrorCount) return false;
	const replay = nCreate(cand.mode, cand.corner);
	replay.tiles.set(cand.start);
	replay.emitter = cand.startEmitter;
	for (const m of cand.solution) applyMove(replay, m);
	if (!sameTiles(replay.tiles, cand.witness)) return false;
	if (replay.emitter !== cand.witnessEmitter) return false;
	nTraceLight(cand.witness, cand.witnessEmitter);
	if (!nEval(cand.contract, recvNow()).won) return false;
	nTraceLight(cand.start, cand.startEmitter);
	if (nEval(cand.contract, recvNow()).won) return false;
	return true;
}

// white-only template: one witness receiver, so quota 1 fits every profile without an RNG
function presetContract(hit, prof) {
	const exact = prof.strict || prof.exactProb >= 0.5;
	const targets = [{ cell: hit.cell, mask: exact ? hit.mask : 0 }];
	return prof.strict ? nStrict(targets) : nCreateContract(targets, 1, false);
}

function presetFor(req, attempts) {
	const witness = nCreate(req.mode, req.corner);
	const tpl = nTemplate(req.mode, req.corner, req.mirrorCount, witness.tiles);
	witness.emitter = tpl.emitter;
	const start = clonePose(witness);
	const forward = tpl.forward.map(actMove);
	for (const m of forward) applyMove(start, m);
	const hits = traceHits(witness.tiles, witness.emitter);
	return buildCandidate(req, witness, { start, forward }, presetContract(hits[0], req.profile), hits, true, attempts);
}

// sample, derive, scramble, replay-verify; the count-matched preset only when bounded out
function generate(seed, mode, corner, difficulty, mirrorCount = MIRRORS_DEFAULT, opts = {}) {
	const req = genSettings(seed, mode, corner, difficulty, mirrorCount);
	const prof = req.profile;
	const maxAttempts = opts.maxAttempts ?? GEN_ATTEMPTS;
	const rng = makeRng(req.seed);
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const witness = sampleWitness(rng, mode, corner, mirrorCount);
		const hits = traceHits(witness.tiles, witness.emitter);
		const contract = deriveContract(hits, prof, rng);
		const sc = scramble(rng, witness, eligibleRings(rng, prof.rings), prof.scrambleMoves);
		const cand = buildCandidate(req, witness, sc, contract, hits, false, attempt);
		if (verifyCandidate(cand)) return cand;
	}
	return presetFor(req, maxAttempts);
}

if (typeof module !== 'undefined') module.exports = {
	MIRRORS_DEFAULT,
	ACT_CENTER,
	ACT_LEFT,
	ACT_RIGHT,
	makeRng,
	profile,
	genSettings,
	countMirrors,
	randomGlass,
	sampleWitness,
	traceHits,
	deriveContract,
	eligibleRings,
	inverseAct,
	actMove,
	scramble,
	invert,
	applyMove,
	verifyCandidate,
	presetFor,
	generate,
	MQ,
	MS
};
