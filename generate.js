// owns: solvable generation, difficulty bands, replay-verified witnesses and presets
// edit for: sampling, band mapping, scramble policy, fallback puzzles

const gBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const gTrace = typeof module !== 'undefined' && module.exports ? require('./trace.js') : null;
const gGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;

const BN = gBoard ? gBoard.BOARD_N : BOARD_N;
const GL = gBoard ? gBoard.GLASS : GLASS;
const CENTER = gBoard ? gBoard.CENTER_CELL : CENTER_CELL;
const EMIN = gBoard ? gBoard.EMITTER_MIN : EMITTER_MIN;
const EMAX = gBoard ? gBoard.EMITTER_MAX : EMITTER_MAX;
const EMID = gBoard ? gBoard.EMITTER_MID : EMITTER_MID;
const MQ = gBoard ? gBoard.MODE_QUARTER : MODE_QUARTER;
const MS = gBoard ? gBoard.MODE_SINGLE : MODE_SINGLE;
const fCreate = gBoard ? gBoard.createPuzzle : createPuzzle;
const fShift = gBoard ? gBoard.shiftRing : shiftRing;
const fStep = gBoard ? gBoard.stepEmitter : stepEmitter;
const fTrace = gTrace ? gTrace.traceLight : traceLight;
const fCreateContract = gGoal ? gGoal.createContract : createContract;
const fStrict = gGoal ? gGoal.createStrictContract : createStrictContract;
const fEval = gGoal ? gGoal.evaluateContract : evaluateContract;

function recvNow() {
	return gTrace ? gTrace.traceRecv : traceRecv;
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

function randomGlass(rng) {
	const tiles = new Uint8Array(GL * GL);
	for (let i = 0; i < tiles.length; i++) {
		const mask = randInt(rng, 8);
		const diag = rng() < 0.5 ? 8 : 0;
		tiles[i] = mask | diag;
	}
	return tiles;
}

// a witness pose: random glass plus a random emitter column
function sampleWitness(rng, mode, corner) {
	const p = fCreate(mode, corner);
	p.tiles.set(randomGlass(rng));
	p.emitter = EMIN + randInt(rng, EMAX - EMIN + 1);
	return p;
}

// border receivers actually hit by a pose (corners never absorb)
function traceHits(tiles, emitter) {
	fTrace(tiles, emitter);
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

// enlarge the easy pool with receivers seen in nearby reachable poses
function enlargePool(rng, witness, mode, corner, pool, samples) {
	const seen = new Set();
	for (const t of pool) seen.add(t.cell);
	for (let s = 0; s < samples; s++) {
		const p = fCreate(mode, corner);
		p.tiles.set(witness.tiles);
		p.emitter = witness.emitter;
		const steps = 1 + randInt(rng, 4);
		for (let i = 0; i < steps; i++) applyMove(p, randomMove(rng, mode, corner));
		for (const h of traceHits(p.tiles, p.emitter)) {
			if (!seen.has(h.cell)) {
				seen.add(h.cell);
				pool.push({ cell: h.cell, mask: 0 });
			}
		}
	}
}

// strict uses the whole lit set with exact masks; easy uses a quota <= hits, any color
function deriveContract(hits, difficulty, rng, witness, mode, corner, poolSamples) {
	if (hits.length === 0) return null;
	if (difficulty === 'strict') {
		const targets = hits.map(h => ({ cell: h.cell, mask: h.mask }));
		try {
			return fStrict(targets);
		} catch (e) {
			return null;
		}
	}
	const pool = hits.map(h => ({ cell: h.cell, mask: 0 }));
	if (poolSamples > 0) enlargePool(rng, witness, mode, corner, pool, poolSamples);
	const quota = Math.max(1, hits.length);
	try {
		return fCreateContract(pool, quota, false);
	} catch (e) {
		return null;
	}
}

function randomMove(rng, mode, corner) {
	if (rng() < 0.8) return { r: randInt(rng, 4), d: rng() < 0.5 ? -1 : 1 };
	return { e: rng() < 0.5 ? -1 : 1 };
}

function applyMove(p, m) {
	if (m.e !== undefined) fStep(p, m.e);
	else fShift(p, m.r, m.d);
}

// walk the witness forward with legal moves to get a non-winning start
function scramble(rng, witness, mode, corner, length) {
	const start = fCreate(mode, corner);
	start.tiles.set(witness.tiles);
	start.emitter = witness.emitter;
	const forward = [];
	for (let i = 0; i < length; i++) {
		const m = randomMove(rng, mode, corner);
		if (m.e !== undefined) {
			if ((m.e < 0 && start.emitter <= EMIN) || (m.e > 0 && start.emitter >= EMAX)) continue;
		}
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

// replay the solution from start, then require the witness wins and the start does not
function verifyCandidate(cand) {
	const replay = fCreate(cand.mode, cand.corner);
	replay.tiles.set(cand.start);
	replay.emitter = cand.startEmitter;
	for (const m of cand.solution) applyMove(replay, m);
	if (!sameTiles(replay.tiles, cand.witness)) return false;
	if (replay.emitter !== cand.witnessEmitter) return false;
	fTrace(cand.witness, cand.witnessEmitter);
	if (!fEval(cand.contract, recvNow()).won) return false;
	fTrace(cand.start, cand.startEmitter);
	if (fEval(cand.contract, recvNow()).won) return false;
	return true;
}

// a single center mirror: '/' wins (right border), '\' sends the beam down (different cell).
// the center flip is invertible in both modes and ignores the corner rule, so one
// preset serves every (mode, corner, difficulty) as a guaranteed replay-verified fallback.
function makeTrivialPreset(mode, corner, difficulty) {
	const target = 7 * BN + (BN - 1);
	const witness = new Uint8Array(GL * GL);
	const start = new Uint8Array(GL * GL);
	witness[CENTER] = 7;
	start[CENTER] = 7 | 8;
	const contract = difficulty === 'strict'
		? fStrict([{ cell: target, mask: 7 }])
		: fCreateContract([{ cell: target, mask: 0 }], 1, false);
	return {
		mode,
		corner,
		difficulty,
		start,
		startEmitter: EMID,
		witness,
		witnessEmitter: EMID,
		contract,
		solution: [{ r: 3, d: 1 }],
		preset: true,
		attempts: 0,
		witnessHits: [{ cell: target, mask: 7 }]
	};
}

function presetFor(mode, corner, difficulty) {
	return makeTrivialPreset(mode, corner, difficulty);
}

// sample, derive, scramble, replay-verify; fall back to a preset only when bounded out
function generate(rng, mode, corner, difficulty, opts) {
	opts = opts || {};
	const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : 400;
	const poolSamples = opts.poolSamples != null ? opts.poolSamples : 0;
	const scrambleLen = opts.scrambleLen != null
		? opts.scrambleLen
		: 4 + randInt(rng, 12);
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const witness = sampleWitness(rng, mode, corner);
		const hits = traceHits(witness.tiles, witness.emitter);
		const contract = deriveContract(hits, difficulty, rng, witness, mode, corner, poolSamples);
		if (!contract) continue;
		const sc = scramble(rng, witness, mode, corner, scrambleLen);
		const cand = {
			mode,
			corner,
			difficulty,
			start: Uint8Array.from(sc.start.tiles),
			startEmitter: sc.start.emitter,
			witness: Uint8Array.from(witness.tiles),
			witnessEmitter: witness.emitter,
			contract,
			solution: invert(sc.forward),
			preset: false,
			attempts: attempt + 1,
			witnessHits: hits
		};
		if (verifyCandidate(cand)) return cand;
	}
	return presetFor(mode, corner, difficulty);
}

if (typeof module !== 'undefined') module.exports = {
	makeRng,
	randomGlass,
	sampleWitness,
	traceHits,
	deriveContract,
	scramble,
	invert,
	randomMove,
	applyMove,
	verifyCandidate,
	makeTrivialPreset,
	presetFor,
	generate,
	MQ,
	MS
};
