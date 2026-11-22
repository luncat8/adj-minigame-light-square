// owns: 0.7 score event-count, chord-density and duration measurement over generated puzzles
// run: node experiments/score_dump.js

const trace = require('../trace.js');
const goal = require('../contract.js');
const gen = require('../generate.js');
const sonify = require('../sonify.js');

const SPEED_DEF = 4;
const SAMPLES = 100;
const score = sonify.sonifyCreateScore();

function median(arr) {
	const sorted = arr.slice().sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length & 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function maxChord(s) {
	let best = 0;
	let run = 0;
	let prev = -1;
	for (let i = 0; i < s.n; i++) {
		const d = s.notes[i].depth;
		run = d === prev ? run + 1 : 1;
		prev = d;
		if (run > best) best = run;
	}
	return best;
}

for (const mirrors of [1, 11, 25, 49]) {
	const raws = [];
	const events = [];
	const durs = [];
	let chordMax = 0;
	for (let i = 1; i <= SAMPLES; i++) {
		const mode = i & 1;
		const corner = !!(i & 2);
		const dial = (i % 5) * 0.25;
		const cand = gen.generate(9000 + mirrors * 200 + i, mode, corner, dial, mirrors, { candidateCount: 1 });
		for (const [tiles, emitter] of [[cand.start, cand.startEmitter], [cand.witness, cand.witnessEmitter]]) {
			trace.traceLight(tiles, emitter);
			raws.push(trace.traceEvN);
			const res = goal.evaluateContract(cand.contract, trace.traceRecv);
			sonify.sonifyBuild({ emitter, recv: trace.traceRecv, result: res, overlays: null, previewing: false }, {}, score);
			events.push(score.n);
			durs.push(score.maxDepth / SPEED_DEF);
			const mc = maxChord(score);
			if (mc > chordMax) chordMax = mc;
		}
	}
	console.log(
		'mirrors=' + mirrors +
		' poses=' + events.length +
		' raw_med=' + median(raws).toFixed(1) +
		' raw_max=' + Math.max(...raws) +
		' events_med=' + median(events).toFixed(1) +
		' events_max=' + Math.max(...events) +
		' dur_med_s=' + median(durs).toFixed(2) +
		' chord_max=' + chordMax +
		' plan=0.7'
	);
}
