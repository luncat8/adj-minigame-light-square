const fs = require('fs');
const path = require('path');
const Board = require('../js/board.js').Board;
const Generate = require('../js/generate.js').Generate;
const Optics = require('../js/optics.js').Optics;

Optics.init();

function mulberry32(a) {
	return function() {
		a |= 0;
		a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function percentile(sorted, p) {
	if (sorted.length === 0) return 0;
	const i = Math.floor((sorted.length - 1) * p);
	return sorted[i];
}

function par(b, maxStates) {
	const rings = b.rings.length;
	const periods = new Array(rings);
	const mult = new Int32Array(rings);
	let ringStates = 1;
	for (let r = 0; r < rings; r++) {
		periods[r] = Board.period(b, r);
		mult[r] = ringStates;
		ringStates *= periods[r];
	}
	if (ringStates > maxStates) return -1;
	const cols = b.n;
	const total = ringStates * cols;
	const solved = new Uint8Array(total);
	const turns = [0, 0, 0, 0];
	for (let state = 0; state < ringStates; state++) {
		let x = state;
		for (let r = 0; r < rings; r++) {
			turns[r] = x % periods[r];
			x = Math.floor(x / periods[r]);
		}
		Board.applyTurns(b, turns);
		for (let col = 0; col < cols; col++) {
			b.laserCol = col;
			Board.updateLaser(b);
			Optics.trace(b);
			if (Board.isSolved(b)) solved[state * cols + col] = 1;
		}
	}
	Board.applyTurns(b, b.startTurns);
	b.laserCol = b.solutionLaser;
	Board.updateLaser(b);
	Optics.trace(b);
	const start = b.startTurns;
	let startState = 0;
	for (let r = 0; r < rings; r++) startState += start[r] * mult[r];
	const dist = new Int16Array(total);
	dist.fill(-1);
	const queue = new Int32Array(total);
	let head = 0;
	let tail = 0;
	const startIdx = startState * cols + b.laserCol;
	dist[startIdx] = 0;
	queue[tail++] = startIdx;
	while (head < tail) {
		const idx = queue[head++];
		const state = Math.floor(idx / cols);
		const col = idx % cols;
		if (solved[idx]) return dist[idx];
		if (col > 0 && dist[idx - 1] < 0) {
			dist[idx - 1] = dist[idx] + 1;
			queue[tail++] = idx - 1;
		}
		if (col + 1 < cols && dist[idx + 1] < 0) {
			dist[idx + 1] = dist[idx] + 1;
			queue[tail++] = idx + 1;
		}
		for (let r = 0; r < rings; r++) {
			const p = periods[r];
			const cur = Math.floor(state / mult[r]) % p;
			let next = cur + 1;
			if (next >= p) next -= p;
			const plus = (state + (next - cur) * mult[r]) * cols + col;
			if (dist[plus] < 0) {
				dist[plus] = dist[idx] + 1;
				queue[tail++] = plus;
			}
			next = cur - 1;
			if (next < 0) next += p;
			const minus = (state + (next - cur) * mult[r]) * cols + col;
			if (dist[minus] < 0) {
				dist[minus] = dist[idx] + 1;
				queue[tail++] = minus;
			}
		}
	}
	return -1;
}

const modeArg = process.argv[2];
const sampleArg = Number(process.argv[3] || 100);
const modes = modeArg ? [modeArg] : ['quarter', 'shift'];
const values = [0, 0.25, 0.5, 0.75, 1];
const root = path.join(__dirname, '..');
const logDir = path.join(root, 'logs');
fs.mkdirSync(logDir, { recursive: true });

for (const mode of modes) {
	const lines = [];
	for (const value of values) {
		const scores = [];
		const pars = [];
		const genMs = [];
		const rejects = [];
		let fallbacks = 0;
		for (let i = 1; i <= sampleArg; i++) {
			const rng = mulberry32(i * 7919 + Math.round(value * 1000));
			const t = Date.now();
			const b = Generate.make(rng, { mode: mode, flipAtCorners: true, difficulty: value }, Optics.trace);
			genMs.push(Date.now() - t);
			scores.push(b.difficultyScore);
			rejects.push(b.attempts - 1);
			if (b.fallback) fallbacks++;
			const p = par(b, 20000);
			if (p >= 0) pars.push(p);
		}
		scores.sort((a, b) => a - b);
		pars.sort((a, b) => a - b);
		const avg = function(list) {
			if (list.length === 0) return 0;
			let sum = 0;
			for (let i = 0; i < list.length; i++) sum += list[i];
			return sum / list.length;
		};
		lines.push(
			'mode=' + mode +
			' difficulty=' + value.toFixed(2) +
			' sample=' + sampleArg +
			' score_avg=' + avg(scores).toFixed(4) +
			' score_p10=' + percentile(scores, 0.1).toFixed(4) +
			' score_p90=' + percentile(scores, 0.9).toFixed(4) +
			' par_avg=' + avg(pars).toFixed(2) +
			' par_p90=' + percentile(pars, 0.9).toFixed(2) +
			' par_cap=' + (sampleArg - pars.length) +
			' gen_ms_avg=' + avg(genMs).toFixed(3) +
			' reject_avg=' + avg(rejects).toFixed(2) +
			' fallback_avg=' + (fallbacks / sampleArg).toFixed(3)
		);
	}
	const file = path.join(logDir, 'difficulty-' + mode + '.log');
	fs.writeFileSync(file, lines.join('\n') + '\n');
	console.log(file);
	console.log(lines.join('\n'));
}