// owns: 0.8 seeded difficulty calibration — split seed lists, independent walk probes, BFS subset, timing and the count-11 gate
// run: node experiments/calibrate.js split=train|heldout [samples=200] [bfs=40] [mirrors=5,11,25,49] [dials=0,0.25,0.5,0.75,1] [modes=0,1] [corners=0,1] [high=0.85]

const os = require('node:os');
const gen = require('../generate.js');
const diff = require('../difficulty.js');

const args = {};
for (const a of process.argv.slice(2)) {
	const [k, v] = a.split('=');
	args[k] = v;
}
const list = (v, fallback) => (v === undefined ? fallback : v.split(',').map(Number));
const split = args.split || 'train';
const samples = Number(args.samples || 200);
const bfsSamples = Number(args.bfs || 40);
const mirrors = list(args.mirrors, [5, 11, 25, 49]);
const dials = list(args.dials, [0, 0.25, 0.5, 0.75, 1]);
const modes = list(args.modes, [gen.MQ, gen.MS]);
const corners = list(args.corners, [0, 1]).map(Boolean);
// high= sweeps the dial-1 target anchor on training seeds; omitted, the shipped mapping is measured
const high = args.high === undefined ? undefined : Number(args.high);
const targetFor = d => (high === undefined ? undefined : gen.targetScore(0) + (high - gen.targetScore(0)) * d);
// disjoint salts keep training and held-out seed lists independent of each other and of fixtures
const SPLIT_SALT = { train: 0x7a3c19e5, heldout: 0x2f6d84b1 };
// probe walks use their own stream and 4× the selection budget, so acceptance never reuses selection walks
const PROBE_WALKS = 256;
const PROBE_SALT = 0x51ed270b;

function seedList(mode, corner, n, d) {
	const rng = gen.makeRng((SPLIT_SALT[split] ^ Math.imul(mode * 2 + (corner ? 1 : 0) + 1, 0x9e3779b1) ^ Math.imul(n, 0x85ebca6b) ^ Math.imul(Math.round(d * 1000) + 1, 0xc2b2ae35)) >>> 0);
	const seeds = new Uint32Array(samples);
	for (let i = 0; i < samples; i++) seeds[i] = (rng() * 4294967296) >>> 0;
	return seeds;
}

function stats(xs) {
	const n = xs.length;
	if (!n) return { avg: NaN, se: NaN };
	let sum = 0;
	for (const x of xs) sum += x;
	const avg = sum / n;
	let ss = 0;
	for (const x of xs) ss += (x - avg) ** 2;
	return { avg, se: n > 1 ? Math.sqrt(ss / (n - 1) / n) : 0 };
}

function p95(xs) {
	const sorted = Float64Array.from(xs).sort();
	return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

const fmt = (x, digits) => (Number.isFinite(x) ? x.toFixed(digits) : 'na');

function runCell(mode, corner, n, d) {
	const scores = [];
	const errors = [];
	const probes = [];
	const pars = [];
	const ms = [];
	let capped = 0;
	let fallback = 0;
	let attempts = 0;
	let solutionLen = 0;
	let targetSum = 0;
	const seeds = seedList(mode, corner, n, d);
	for (let i = 0; i < samples; i++) {
		const t0 = performance.now();
		const cand = gen.generate(seeds[i], mode, corner, d, n, { target: targetFor(d) });
		ms.push(performance.now() - t0);
		attempts += cand.attempts;
		solutionLen += cand.solution.length;
		targetSum += cand.targetScore;
		if (cand.preset) fallback++;
		if (cand.selectionScore !== null) {
			scores.push(cand.selectionScore);
			errors.push(Math.abs(cand.selectionScore - cand.targetScore));
		}
		probes.push(diff.measureWalks(cand, gen.makeRng((seeds[i] ^ PROBE_SALT) >>> 0), PROBE_WALKS).score);
		if (i >= bfsSamples) continue;
		const solve = diff.shortestSolve(cand);
		if (solve.status === 'exact') pars.push(solve.moves);
		else capped++;
	}
	const score = stats(scores);
	const probe = stats(probes);
	const par = stats(pars);
	const rec = {
		mode, corner: corner ? 1 : 0, mirrors: n, difficulty: d, split, samples,
		target_avg: fmt(targetSum / samples, 3),
		score_avg: fmt(score.avg, 3), score_se: fmt(score.se, 3),
		target_error_avg: fmt(stats(errors).avg, 3),
		probe_avg: fmt(probe.avg, 3), probe_se: fmt(probe.se, 3),
		par_exact_avg: fmt(par.avg, 2), par_exact_n: pars.length, par_capped_n: capped,
		solution_len_avg: fmt(solutionLen / samples, 2),
		gen_ms_avg: fmt(stats(ms).avg, 2), gen_ms_p95: fmt(p95(ms), 2),
		attempts_avg: fmt(attempts / samples, 2), fallback_rate: fmt(fallback / samples, 3)
	};
	console.log(Object.entries(rec).map(([k, v]) => k + '=' + v).join(' '));
	return probe;
}

// nondecreasing within 2 combined standard errors; adjacent levels inside that band are reported as overlapping
function gate(mode, corner, probes) {
	let monotonic = 1;
	const overlaps = [];
	for (let i = 1; i < probes.length; i++) {
		const delta = probes[i].avg - probes[i - 1].avg;
		const band = 2 * Math.hypot(probes[i].se, probes[i - 1].se);
		if (delta < -band) monotonic = 0;
		if (Math.abs(delta) <= band) overlaps.push(dials[i - 1] + '-' + dials[i]);
	}
	const rise = probes[probes.length - 1].avg - probes[0].avg;
	const pass = monotonic && rise >= 0.10 ? 1 : 0;
	console.log('gate mode=' + mode + ' corner=' + (corner ? 1 : 0) + ' mirrors=11 split=' + split + ' probe_easy=' + fmt(probes[0].avg, 3) +
		' probe_hard=' + fmt(probes[probes.length - 1].avg, 3) + ' rise=' + fmt(rise, 3) + ' monotonic=' + monotonic +
		' overlaps=' + (overlaps.join(',') || 'none') + ' pass=' + pass);
}

console.log('run split=' + split + ' samples=' + samples + ' bfs=' + bfsSamples + ' probe_walks=' + PROBE_WALKS + ' high=' + (high === undefined ? 'shipped' : high) +
	' node=' + process.version + ' cpu=' + os.cpus()[0].model.replace(/\s+/g, '_'));
for (const mode of modes) {
	for (const corner of corners) {
		for (const n of mirrors) {
			const probes = dials.map(d => runCell(mode, corner, n, d));
			if (n === 11 && dials.length > 1) gate(mode, corner, probes);
		}
	}
}
