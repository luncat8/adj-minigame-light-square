// owns: 0.8 difficulty acceptance — contractWon agreement, walk score, BFS periods/minima/caps, isolation
// run: node experiments/difficulty_fixtures.js

const board = require('../board.js');
const trace = require('../trace.js');
const goal = require('../contract.js');
const gen = require('../generate.js');
const diff = require('../difficulty.js');
const c = require('./check.js');

const N = board.BOARD_N;
const CELLS = board.GLASS * board.GLASS;
const modes = [gen.MQ, gen.MS];
const corners = [false, true];
const dials = [0, 0.5, 1];
const BORDER = [];
for (let cell = 0; cell < N * N; cell++) {
	const row = (cell / N) | 0;
	const col = cell % N;
	if ((row === 0 || row === N - 1) !== (col === 0 || col === N - 1)) BORDER.push(cell);
}

function tag(mode, corner) {
	return 'mode=' + mode + ' corner=' + (corner ? 1 : 0);
}

function makeCand(mode, corner, tiles, emitter, contract) {
	return { mode, corner, start: Uint8Array.from(tiles), startEmitter: emitter, contract };
}

function anyTarget(cell) {
	return goal.createContract([{ cell, mask: 0 }], 1, false);
}

function snapshot(cand) {
	return JSON.stringify([Array.from(cand.start), cand.startEmitter, Array.from(cand.contract.requirements),
		cand.contract.quota, cand.witness ? Array.from(cand.witness) : 0, cand.solution || 0]);
}

function randomTiles(rng, out) {
	for (let i = 0; i < out.length; i++) out[i] = (1 + ((rng() * 7) | 0)) | (rng() < 0.5 ? 8 : 0);
	return out;
}

function sameTiles(a, b) {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

// contractWon agrees with evaluateContract(...).won: any-color, exact, quota, extras
const rngC = gen.makeRng(11);
let disagree = 0;
for (let k = 0; k < 5000; k++) {
	const n = 1 + ((rngC() * 6) | 0);
	const targets = [];
	const used = new Set();
	while (targets.length < n) {
		const cell = BORDER[(rngC() * BORDER.length) | 0];
		if (used.has(cell)) continue;
		used.add(cell);
		targets.push({ cell, mask: rngC() < 0.5 ? 0 : 1 + ((rngC() * 7) | 0) });
	}
	const contract = goal.createContract(targets, 1 + ((rngC() * n) | 0), rngC() < 0.5);
	const recv = new Uint8Array(N * N);
	for (const t of targets) if (rngC() < 0.7) recv[t.cell] = rngC() < 0.5 && t.mask ? t.mask : 1 + ((rngC() * 7) | 0);
	if (rngC() < 0.3) recv[BORDER[(rngC() * BORDER.length) | 0]] |= 1 + ((rngC() * 7) | 0);
	if (goal.contractWon(contract, recv) !== goal.evaluateContract(contract, recv).won) disagree++;
}
c.eq(disagree, 0, 'contractWon agrees with evaluateContract on 5000 random cases');
const recvA = new Uint8Array(N * N);
recvA[5] = 3;
c.ok(goal.contractWon(anyTarget(5), recvA), 'any-color target matches any light');
c.ok(!goal.contractWon(goal.createContract([{ cell: 5, mask: 7 }], 1, false), recvA), 'exact target rejects wrong color');
c.ok(!goal.contractWon(goal.createContract([{ cell: 5, mask: 0 }, { cell: 6, mask: 0 }], 2, false), recvA), 'quota short fails');
recvA[9] = 7;
c.ok(!goal.contractWon(goal.createContract([{ cell: 5, mask: 3 }], 1, true), recvA), 'forbidden extra fails');
c.ok(goal.contractWon(goal.createContract([{ cell: 5, mask: 3 }], 1, false), recvA), 'allowed extra passes');

// ring periods 4/4/4/2 (quarter) and 24/16/8/2 (single) are minimal and include diagonal flips
const want = { [gen.MQ]: [4, 4, 4], [gen.MS]: [24, 16, 8] };
for (const mode of modes) {
	for (const corner of corners) {
		const tt = diff.turnTable(mode, corner);
		c.same(tt.periods, want[mode], 'periods ' + tag(mode, corner));
		const p = board.createPuzzle(mode, corner);
		const start = randomTiles(gen.makeRng(3), new Uint8Array(CELLS));
		for (let r = 0; r < 4; r++) {
			const period = r === 3 ? 2 : want[mode][r];
			let early = 0;
			for (const d of [1, -1]) {
				p.tiles.set(start);
				for (let k = 1; k <= period; k++) {
					board.shiftRing(p, r, d);
					if (k < period && sameTiles(p.tiles, start)) early++;
				}
				c.ok(sameTiles(p.tiles, start), 'period returns ring=' + r + ' dir=' + d + ' ' + tag(mode, corner));
			}
			c.eq(early, 0, 'period minimal ring=' + r + ' ' + tag(mode, corner));
		}
	}
}

// table-rebuilt poses equal incremental legal moves, including ccw and center flips
for (const mode of modes) {
	for (const corner of corners) {
		const tt = diff.turnTable(mode, corner);
		const rng = gen.makeRng(17 + mode * 2 + (corner ? 1 : 0));
		const p = board.createPuzzle(mode, corner);
		const out = new Uint8Array(CELLS);
		let bad = 0;
		for (let seq = 0; seq < 50; seq++) {
			const start = randomTiles(rng, new Uint8Array(CELLS));
			if (seq % 2) for (let i = 0; i < CELLS; i++) if (rng() < 0.6) start[i] = 0;
			p.tiles.set(start);
			const turns = [0, 0, 0, 0];
			for (let m = 0; m < 30; m++) {
				const r = (rng() * 4) | 0;
				const d = rng() < 0.5 ? -1 : 1;
				board.shiftRing(p, r, d);
				const period = r === 3 ? 2 : tt.periods[r];
				turns[r] = (turns[r] + d + period) % period;
			}
			diff.turnedPose(start, tt, turns[0], turns[1], turns[2], turns[3], out);
			if (!sameTiles(out, p.tiles)) bad++;
		}
		c.eq(bad, 0, 'turnedPose matches incremental moves ' + tag(mode, corner));
	}
}

// BFS known minima, exhaustion, honest caps and nonmutation in both modes and corner rules
const empty = new Uint8Array(CELLS);
const centerBack = new Uint8Array(CELLS);
centerBack[(CELLS - 1) >> 1] = 7 | 8;
const right7 = 7 * N + N - 1;
for (const mode of modes) {
	for (const corner of corners) {
		const t = tag(mode, corner);
		const cases = [
			[makeCand(mode, corner, empty, 5, anyTarget(5)), 0, 'start already wins'],
			[makeCand(mode, corner, empty, 4, anyTarget(5)), 1, 'one emitter step'],
			[makeCand(mode, corner, centerBack, 7, anyTarget(right7)), 1, 'one center flip'],
			[makeCand(mode, corner, empty, 4, anyTarget(6)), 2, 'two emitter steps']
		];
		for (const [cand, moves, name] of cases) {
			const before = snapshot(cand);
			const r = diff.shortestSolve(cand);
			c.ok(r.status === 'exact' && r.moves === moves, 'bfs ' + name + ' ' + t + ' got=' + r.status + '/' + r.moves);
			c.eq(snapshot(cand), before, 'bfs preserves input ' + name + ' ' + t);
		}
		const capped = diff.shortestSolve(cases[3][0], 3);
		c.ok(capped.status === 'capped' && capped.moves === null && capped.visited === 3, 'bfs cap is honest ' + t);
		const none = diff.shortestSolve(makeCand(mode, corner, empty, 7, anyTarget(right7)));
		if (mode === gen.MQ) c.ok(none.status === 'unreachable' && none.visited === 13 * 4 * 4 * 4 * 2, 'quarter graph exhausted ' + t);
		else c.ok(none.status === 'capped' && none.visited === diff.SOLVE_CAP, 'single graph capped at 20000 ' + t);
	}
}

// generated candidates: BFS minimum ≤ verified solution length, and moves === 1 iff some single action wins
function oneMoveWin(cand) {
	const p = board.createPuzzle(cand.mode, cand.corner);
	for (let a = 0; a < 9; a++) {
		p.tiles.set(cand.start);
		p.emitter = cand.startEmitter;
		if (a < 6) board.shiftRing(p, a >> 1, a & 1 ? 1 : -1);
		else if (a === 6) board.shiftRing(p, 3, 1);
		else if ((a === 7 && p.emitter === board.EMITTER_MIN) || (a === 8 && p.emitter === board.EMITTER_MAX)) continue;
		else board.stepEmitter(p, a === 7 ? -1 : 1);
		trace.traceLight(p.tiles, p.emitter);
		if (goal.contractWon(cand.contract, trace.traceRecv)) return true;
	}
	return false;
}

for (const mode of modes) {
	for (const corner of corners) {
		for (const d of dials) {
			let bad = 0;
			let exact = 0;
			let cappedN = 0;
			let moves = 0;
			let visited = 0;
			const t0 = Date.now();
			for (let s = 1; s <= 30; s++) {
				const cand = gen.generate(s * 31 + 7, mode, corner, d);
				const before = snapshot(cand);
				const r = diff.shortestSolve(cand);
				visited += r.visited;
				if (snapshot(cand) !== before) bad++;
				if (r.status === 'unreachable') bad++;
				if (r.status === 'capped') {
					cappedN++;
					continue;
				}
				exact++;
				moves += r.moves;
				if (r.moves < 1 || r.moves > cand.solution.length) bad++;
				if ((r.moves === 1) !== oneMoveWin(cand)) bad++;
			}
			if (mode === gen.MQ) c.eq(cappedN, 0, 'quarter search never caps ' + tag(mode, corner) + ' difficulty=' + d);
			c.eq(bad, 0, 'bfs bounded by solution ' + tag(mode, corner) + ' difficulty=' + d);
			console.log(tag(mode, corner) + ' mirrors=11 difficulty=' + d + ' samples=30 par_exact_n=' + exact + ' par_capped_n=' + cappedN +
				' par_exact_avg=' + (exact ? (moves / exact).toFixed(2) : 'na') + ' visited_avg=' + (visited / 30).toFixed(0) +
				' bfs_ms_avg=' + ((Date.now() - t0) / 30).toFixed(2));
		}
	}
}

// walk score: bounds, unreachable, center dedup, emitter bounds, reset/determinism, isolation
const unreachable = makeCand(gen.MQ, false, empty, 7, anyTarget(right7));
const u = diff.measureWalks(unreachable, gen.makeRng(1));
c.ok(u.successes === 0 && u.walks === diff.WALK_COUNT && u.score === 1, 'unreachable scores 1');
const centerOnly = makeCand(gen.MQ, false, centerBack, 7, anyTarget(right7));
const flipRate = diff.measureWalks(centerOnly, gen.makeRng(2), 9000, 1).winRate;
c.ok(Math.abs(flipRate - 1 / 9) < 0.015, 'center flip is one of 9 actions rate=' + flipRate.toFixed(4));
const edge = makeCand(gen.MS, true, empty, board.EMITTER_MIN, anyTarget(board.EMITTER_MIN + 1));
const edgeRate = diff.measureWalks(edge, gen.makeRng(3), 8000, 1).winRate;
c.ok(Math.abs(edgeRate - 1 / 8) < 0.015, 'emitter at bound offers 8 actions rate=' + edgeRate.toFixed(4));

const candA = gen.generate(101, gen.MS, true, 0.5);
const candB = gen.generate(202, gen.MQ, false, 1);
const beforeA = snapshot(candA);
const first = diff.measureWalks(candA, gen.makeRng(9));
diff.measureWalks(candB, gen.makeRng(10));
diff.shortestSolve(candB);
const again = diff.measureWalks(candA, gen.makeRng(9));
c.ok(first.successes === again.successes && first.successes >= 0 && first.successes <= first.walks, 'walks reset and are reproducible');
c.ok(Math.abs(first.score - (1 - first.successes / first.walks)) < 1e-12, 'score is 1 - winRate');
c.eq(snapshot(candA), beforeA, 'walks preserve candidate');
c.same(gen.generate(101, gen.MS, true, 0.5).start, candA.start, 'measurement does not perturb generation');

// measurement cost at the default count: one 64 × 20 walk score per candidate
for (const mode of modes) {
	const t0 = Date.now();
	let score = 0;
	for (let s = 1; s <= 40; s++) score += diff.measureWalks(gen.generate(s, mode, true, 0.25), gen.makeRng(s ^ 0x9e3779b9)).score;
	const ms = (Date.now() - t0) / 40;
	console.log('mode=' + mode + ' corner=1 mirrors=11 difficulty=0.25 samples=40 score_avg=' + (score / 40).toFixed(3) +
		' walk_ms_avg=' + ms.toFixed(2) + ' select8_ms_est=' + (8 * ms).toFixed(1));
}

c.report('difficulty_fixtures');
