// owns: 0.4/0.8 generation acceptance — exact counts, profile, scramble policy, preset catalog, replay verification and measured selection
// run: node experiments/generate_fixtures.js

const board = require('../board.js');
const presets = require('../presets.js');
const gen = require('../generate.js');
const c = require('./check.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const diff = require('../difficulty.js');

const CELLS = board.GLASS * board.GLASS;
const GMIN = board.GLASS_OFF;
const GMAX = board.GLASS_OFF + board.GLASS - 1;
const modes = [gen.MQ, gen.MS];
const corners = [false, true];
const dials = [0, 0.25, 0.5, 0.75, 1];
const SEEDS = 100;

function key(mode, corner, n, d) {
	return 'mode=' + mode + ' corner=' + (corner ? 1 : 0) + ' mirrors=' + n + (d === undefined ? '' : ' difficulty=' + d);
}

function expectRange(fn, msg) {
	try {
		fn();
		c.ok(false, msg);
	} catch (e) {
		c.ok(e instanceof RangeError, msg);
	}
}

function quotaFor(h, prof) {
	return prof.strict ? h : Math.min(h, Math.max(1, Math.ceil(h * prof.quotaFrac - 1e-9)));
}

// exact-count sampling: every count, clear cells zero, nonzero masks, full cell coverage, reproducible
const tiles = new Uint8Array(CELLS);
for (let n = 1; n <= CELLS; n++) {
	let bad = 0;
	for (let s = 1; s <= 20; s++) {
		gen.randomGlass(gen.makeRng(s * 131 + n), n, tiles);
		let occupied = 0;
		for (let i = 0; i < CELLS; i++) {
			if (tiles[i] & 7) occupied++;
			else if (tiles[i]) bad++;
		}
		if (occupied !== n) bad++;
	}
	c.eq(bad, 0, 'exact count, clear cells zero n=' + n);
}
const seen = new Uint8Array(CELLS);
const rngCover = gen.makeRng(7);
for (let s = 0; s < 2000; s++) {
	gen.randomGlass(rngCover, 1, tiles);
	for (let i = 0; i < CELLS; i++) if (tiles[i]) seen[i] = 1;
}
c.eq(seen.reduce((a, b) => a + b, 0), CELLS, 'count 1 can place a mirror on every cell');
const again = gen.randomGlass(gen.makeRng(99), 11, new Uint8Array(CELLS));
gen.randomGlass(gen.makeRng(5), 30, tiles);
c.same(gen.randomGlass(gen.makeRng(99), 11, tiles), again, 'sampling independent of earlier calls');

// explicit settings API
for (const n of [0, 50, 1.5, NaN, '11', null]) expectRange(() => gen.generate(1, gen.MQ, false, 0, n), 'invalid count throws ' + n);
for (const d of [NaN, Infinity, -Infinity]) expectRange(() => gen.generate(1, gen.MQ, false, d, 11), 'invalid difficulty throws ' + d);
c.eq(gen.generate(1, gen.MQ, false, -1).difficulty, 0, 'difficulty clamps low');
c.eq(gen.generate(1, gen.MQ, false, 2).difficulty, 1, 'difficulty clamps high');
c.eq(gen.generate(1, gen.MQ, false, 0.5).mirrorCount, gen.MIRRORS_DEFAULT, 'default count');
c.eq(gen.MIRRORS_DEFAULT, 11, 'default count is 11');
c.eq(gen.generate(-1, gen.MQ, false, 0.5).seed, 0xffffffff, 'seed is unsigned 32-bit');

for (const maxAttempts of [-1, 1.5, Infinity, NaN]) expectRange(() => gen.generate(1, 0, false, 0, 11, { maxAttempts }), 'invalid attempt budget ' + maxAttempts);
for (const candidateCount of [0, -1, 1.5, Infinity, NaN]) expectRange(() => gen.generate(1, 0, false, 0, 11, { candidateCount }), 'invalid candidate budget ' + candidateCount);

function selectionHarness(scores, extraDraws = 0, reject = false) {
	const records = [];
	let unchanged = true;
	const sandbox = vm.createContext({
		module: { exports: {} },
		require(name) {
			if (name !== './difficulty.js') return require(path.join(__dirname, '..', name));
			return {
				WALK_STEPS: diff.WALK_STEPS,
				measureWalks(cand, rng) {
					const before = JSON.stringify(cand);
					const index = records.length;
					const probe = gen.makeRng((cand.seed ^ 0x9e3779b9 ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0);
					const draws = Array.from({ length: 4 }, () => rng());
					c.same(draws, Array.from({ length: 4 }, () => probe()), 'candidate RNG stream index=' + index);
					const result = diff.measureWalks(cand, rng);
					unchanged = unchanged && before === JSON.stringify(cand);
					for (let i = 0; i < extraDraws; i++) rng();
					if (scores) {
						result.score = scores[index % scores.length];
						result.winRate = 1 - result.score;
						result.successes = result.winRate * result.walks;
					}
					records.push({ candidate: before, score: result.score });
					return result;
				}
			};
		}
	});
	vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'generate.js'), 'utf8'), sandbox);
	if (reject) vm.runInContext('const originalVerify = verifyCandidate; verifyCandidate = cand => cand.preset && originalVerify(cand);', sandbox);
	return { generate: sandbox.module.exports.generate, records, unchanged: () => unchanged };
}

const selected = selectionHarness([0.875, 0.75, 0.5, 0.5, 0.25, 0, 1, 0.125]);
const batch = selected.generate(101, gen.MS, true, 0.5);
c.eq(batch.verifiedCandidates, 8, 'default verified candidate limit');
c.eq(selected.records.length, 8, 'measure exactly eight verified candidates');
c.eq(batch.selectionScore, 0.5, 'closest score selected');
c.eq(batch.targetScore, gen.targetScore(0.5), 'selection uses the target mapping');
c.eq(gen.targetScore(0), 0.2, 'target low anchor');
c.eq(gen.targetScore(1), 1, 'target high anchor selects the hardest candidate');
c.eq(gen.generate(101, gen.MS, true, 0.5, 11, { candidateCount: 1, target: 0.9 }).targetScore, 0.9, 'calibration target override');
c.eq(JSON.stringify(batch.start), JSON.stringify(JSON.parse(selected.records[2].candidate).start), 'earliest tied candidate wins');
c.eq(batch.attempts, JSON.parse(selected.records[7].candidate).attempts, 'selected result records total attempts, not its own attempt');
c.ok(selected.unchanged(), 'measurement does not mutate candidate');
const isolated = selectionHarness([0.875, 0.75, 0.5, 0.5, 0.25, 0, 1, 0.125], 2000);
const isolatedBatch = isolated.generate(101, gen.MS, true, 0.5);
c.eq(JSON.stringify(isolated.records), JSON.stringify(selected.records), 'extra measurement draws cannot change later construction or scores');
c.same(isolatedBatch.start, batch.start, 'measurement draw count cannot change selected pose');
const one = gen.generate(101, gen.MS, true, 0.5, 11, { candidateCount: 1 });
const measured = diff.measureWalks(one, gen.makeRng(one.measurement.seed));
c.eq(one.selectionScore, measured.score, 'real score recorded');
c.eq(one.measurement.successes, measured.successes, 'success count recorded');
c.eq(one.measurement.walks, 64, 'fixed walk budget');
c.eq(one.measurement.steps, 20, 'fixed step budget');
c.eq(one.measurement.winRate, measured.winRate, 'win rate recorded');
c.ok(one.measurement.elapsedMs >= 0, 'measurement wall time reported');
c.eq(one.verifiedCandidates, 1, 'custom candidate limit');
const repeated = gen.generate(101, gen.MS, true, 0.5, 11, { candidateCount: 1 });
const stable = cand => JSON.stringify({ ...cand, measurement: { ...cand.measurement, elapsedMs: 0 } });
c.eq(stable(repeated), stable(one), 'result and metadata reproducible except wall time');
c.eq(one.measurement.seed, (101 ^ 0x9e3779b9 ^ Math.imul(1, 0x85ebca6b)) >>> 0, 'measurement seed recorded');
const partialHarness = selectionHarness([1, 0.5]);
const partial = partialHarness.generate(101, gen.MS, true, 0.5, 11, { maxAttempts: 3 });
c.eq(partial.attempts, 3, 'partial batch spends shared attempt limit');
c.ok(partial.verifiedCandidates > 0 && partial.verifiedCandidates <= 3 && !partial.preset, 'partial batch selects verified candidate');
c.eq(partial.verifiedCandidates, partialHarness.records.length, 'only verified candidates measured');
c.eq(Math.abs(partial.selectionScore - partial.targetScore), Math.min(...partialHarness.records.map(r => Math.abs(r.score - partial.targetScore))), 'partial batch selects closest');
const rejected = selectionHarness(null, 0, true);
const exhausted = rejected.generate(101, gen.MS, true, 1, 49, { maxAttempts: 3 });
c.eq(exhausted.attempts, 3, 'no verified candidate exhausts shared budget');
c.eq(rejected.records.length, 0, 'rejected candidates not measured');
c.ok(exhausted.preset && exhausted.verifiedCandidates === 0 && exhausted.selectionScore === null && exhausted.measurement === null, 'exhausted fallback explicitly unmeasured');
c.ok(gen.verifyCandidate(exhausted) && exhausted.mirrorCount === 49, 'exhausted fallback verified at requested count');

// profile anchors, interpolation and rounding
const p0 = gen.profile(0);
const p1 = gen.profile(1);
const p6 = gen.profile(1 / 6);
c.ok(p0.quotaFrac === 0.5 && p0.exactProb === 0 && p0.scrambleMoves === 3 && p0.rings === 1 && !p0.strict, 'profile at 0');
c.ok(p1.quotaFrac === 1 && p1.exactProb === 1 && p1.scrambleMoves === 14 && p1.rings === 4 && p1.strict, 'profile at 1');
c.ok(Math.abs(p6.quotaFrac - 0.575) < 1e-12 && p6.scrambleMoves === 5 && p6.rings === 2, 'profile interpolates and rounds');
c.ok(gen.profile(2 / 3).exactProb === 0.5 && gen.profile(2 / 3).scrambleMoves === 10, 'profile at 2/3');
c.ok(!gen.profile(0.999).strict, 'strict only at 1');
const hits20 = [];
for (let col = 1; col <= 13; col++) hits20.push({ cell: col, mask: 7 });
for (let row = 1; row <= 7; row++) hits20.push({ cell: row * board.BOARD_N, mask: 7 });
c.eq(gen.deriveContract(hits20, gen.profile(1 / 3), gen.makeRng(1)).quota, 13, 'quota ceil ignores binary rounding');

// scramble: exact length, eligible rings only, no immediate inverse, emitter in bounds
for (const mode of modes) {
	for (const corner of corners) {
		let bad = 0;
		for (let s = 1; s <= 200; s++) {
			const rng = gen.makeRng(s);
			const w = gen.sampleWitness(rng, mode, corner, 11);
			const rings = gen.eligibleRings(rng, 1 + (s % 4));
			const sc = gen.scramble(rng, w, rings, 14);
			if (sc.forward.length !== 14) bad++;
			let e = w.emitter;
			for (let i = 0; i < sc.forward.length; i++) {
				const m = sc.forward[i];
				const prev = sc.forward[i - 1];
				if (m.e !== undefined) {
					e += m.e;
					if (e < board.EMITTER_MIN || e > board.EMITTER_MAX) bad++;
					if (prev && prev.e === -m.e) bad++;
					continue;
				}
				if (!((rings >> m.r) & 1)) bad++;
				if (prev && prev.r === m.r && (m.r === 3 || prev.d === -m.d)) bad++;
			}
		}
		c.eq(bad, 0, 'scramble policy ' + key(mode, corner, 11));
	}
}

// preset catalog: complete, white-only, exact count, valid at every dial and when forced
c.eq(presets.PRESET_CODES.length, 4 * CELLS, 'catalog covers every key');
for (const mode of modes) {
	for (const corner of corners) {
		let bad = 0;
		for (let n = 1; n <= CELLS; n++) {
			const tpl = presets.presetTemplate(mode, corner, n, tiles);
			if (tpl.emitter < GMIN || tpl.emitter > GMAX) bad++;
			if (!tpl.forward.some(a => a < gen.ACT_LEFT)) bad++;
			for (let i = 0; i < CELLS; i++) if (tiles[i] && (tiles[i] & 7) !== 7) bad++;
			for (const d of dials) {
				const p = gen.presetFor(gen.genSettings(3, mode, corner, d, n), 0);
				if (!p.preset || p.mirrorCount !== n || !gen.verifyCandidate(p)) bad++;
				if (!p.solution.some(m => m.r !== undefined)) bad++;
				if (p.witnessHits.length !== 1 || p.contract.quota !== 1 || p.contract.forbidOutside !== (d === 1)) bad++;
			}
			const forced = gen.generate(5, mode, corner, 0.5, n, { maxAttempts: 0 });
			if (!forced.preset || forced.attempts !== 0 || gen.countMirrors(forced.start) !== n || !gen.verifyCandidate(forced)) bad++;
			if (forced.verifiedCandidates !== 0 || forced.selectionScore !== null || forced.measurement !== null || forced.targetScore !== gen.targetScore(0.5)) bad++;
		}
		c.eq(bad, 0, 'preset catalog ' + key(mode, corner, '1..49'));
	}
}

// acceptance sweep: replay-verified, exact count, profile contract and length, reproducible
for (const mode of modes) {
	for (const corner of corners) {
		for (const n of [1, 11, 49]) {
			for (const d of dials) {
				const prof = gen.profile(d);
				let bad = 0;
				let fallback = 0;
				let attempts = 0;
				let hits = 0;
				const t0 = Date.now();
				for (let s = 1; s <= SEEDS; s++) {
					const seed = s * 1000 + mode * 97 + (corner ? 13 : 0) + n;
					const cand = gen.generate(seed, mode, corner, d, n);
					attempts += cand.attempts;
					if (!gen.verifyCandidate(cand) || gen.countMirrors(cand.witness) !== n) bad++;
					if (cand.preset) {
						fallback++;
						continue;
					}
					hits += cand.witnessHits.length;
					if (cand.verifiedCandidates !== 8 || cand.attempts < 8 || cand.attempts > 400) bad++;
					if (cand.selectionScore !== 1 - cand.measurement.successes / 64 || cand.measurement.walks !== 64 || cand.measurement.steps !== 20) bad++;
					if (cand.targetScore !== gen.targetScore(d)) bad++;
					if (cand.contract.quota !== quotaFor(cand.witnessHits.length, prof)) bad++;
					if (cand.contract.forbidOutside !== prof.strict) bad++;
					if (cand.solution.length !== prof.scrambleMoves) bad++;
					if (cand.witnessEmitter < GMIN || cand.witnessEmitter > GMAX) bad++;
					if (s <= 5) c.same(gen.generate(seed, mode, corner, d, n).start, cand.start, 'reproducible ' + key(mode, corner, n, d));
				}
				c.eq(bad, 0, 'generation ' + key(mode, corner, n, d));
				const live = SEEDS - fallback;
				console.log(key(mode, corner, n, d) + ' samples=' + SEEDS + ' fallback_rate=' + (fallback / SEEDS).toFixed(3) +
					' attempts_avg=' + (attempts / SEEDS).toFixed(2) + ' hits_avg=' + (live ? hits / live : 0).toFixed(2) +
					' gen_ms_avg=' + ((Date.now() - t0) / SEEDS).toFixed(3));
			}
		}
	}
}

c.report('generate_fixtures');
