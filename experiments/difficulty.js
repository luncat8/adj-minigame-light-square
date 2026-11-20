// Measures candidate scramble lengths; sampled win rate is not a difficulty guarantee.
const { performance } = require('perf_hooks');
const { copyPose } = require('../src/movement');
const { traceLight } = require('../src/trace');
const { evaluateContract } = require('../src/contract');
const { generatePuzzle, applyPuzzleMove, seededRandom } = require('../src/generation');

function won(puzzle, pose) {
	return evaluateContract(puzzle.contract, traceLight(pose).hits).won;
}

function moves(pose) {
	const result = [];
	for (const side of [7, 5, 3, 1]) for (const direction of [-1, 1]) result.push({ side, direction });
	if (pose.emitter > 1) result.push({ emitter: pose.emitter - 1 });
	if (pose.emitter < 13) result.push({ emitter: pose.emitter + 1 });
	return result;
}

function searchDepth(puzzle) {
	const first = moves(puzzle.start);
	for (const a of first) {
		const pose = copyPose(puzzle.start);
		applyPuzzleMove(pose, a, puzzle.rules);
		if (won(puzzle, pose)) return 1;
	}
	for (const a of first) {
		const pose = copyPose(puzzle.start);
		applyPuzzleMove(pose, a, puzzle.rules);
		for (const b of moves(pose)) {
			const next = copyPose(pose);
			applyPuzzleMove(next, b, puzzle.rules);
			if (won(puzzle, next)) return 2;
		}
	}
	return 0;
}

for (const mode of ['single', 'quarter']) for (const corners of [false, true]) for (const strict of [false, true]) for (const length of [2, 8, 20]) {
	let wins = 0, targets = 0, rejected = 0, shallow1 = 0, shallow2 = 0, unknown = 0, elapsed = 0;
	for (let seed = 0; seed < 24; seed++) {
		const options = { seed, mode, corners, strict, scrambleLength: length };
		const started = performance.now();
		const puzzle = generatePuzzle(options);
		elapsed += performance.now() - started;
		if (generatePuzzle({ ...options, attempts: 1 }).fallback) rejected++;
		targets += puzzle.contract.targets.reduce((n, target) => n + !!target, 0);
		const random = seededRandom(seed + 10000);
		for (let sample = 0; sample < 128; sample++) {
			const pose = copyPose(puzzle.start);
			for (let step = 0; step < 20; step++) {
				const choices = moves(pose);
				applyPuzzleMove(pose, choices[Math.floor(random() * choices.length)], puzzle.rules);
			}
			if (won(puzzle, pose)) wins++;
		}
		if (seed < 8) {
			const depth = searchDepth(puzzle);
			if (depth === 1) shallow1++;
			else if (depth === 2) shallow2++;
			else unknown++;
		}
	}
	console.log(`mode=${mode} corners=${+corners} strict=${+strict} scramble=${length} puzzles=24 samples=3072 win_rate=${(wins / 3072).toFixed(4)} targets_mean=${(targets / 24).toFixed(2)} first_reject_rate=${(rejected / 24).toFixed(4)} depth1=${shallow1} depth2=${shallow2} depth_unknown=${unknown} generation_ms_mean=${(elapsed / 24).toFixed(3)}`);
}
