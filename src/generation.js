// owns: bounded solvable puzzle generation
// edit for: sampling, scrambling and witness verification

if (typeof module !== 'undefined') {
	var { copyPose, moveRing } = require('./movement');
	var { traceLight } = require('./trace');
	var { evaluateContract } = require('./contract');
}

function seededRandom(seed) {
	let state = seed >>> 0;
	return function () {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}

function applyPuzzleMove(pose, move, rules) {
	if (move.emitter !== undefined) pose.emitter = move.emitter;
	else moveRing(pose, move.side, move.direction, rules.mode, rules.corners);
}

function verifiedPuzzle(rules, start, witness, contract, solution, fallback) {
	if (evaluateContract(contract, traceLight(start).hits).won) return null;
	const replay = copyPose(start);
	for (const move of solution) applyPuzzleMove(replay, move, rules);
	if (!evaluateContract(contract, traceLight(replay).hits).won) return null;
	return { rules, start, witness, contract, solution, fallback };
}

function fallbackPuzzle(rules, strict) {
	const witness = { diagonal: new Uint8Array(225), mask: new Uint8Array(225), emitter: 7 };
	const start = copyPose(witness);
	start.emitter = 6;
	const targets = new Uint8Array(225);
	targets[7] = strict ? 7 : 8;
	const contract = { targets, quota: 1, forbidOutside: !!strict };
	return verifiedPuzzle(rules, start, witness, contract, [{ emitter: 7 }], true);
}

function sampleWinRate(puzzle, random, samples, steps) {
	let wins = 0;
	const sides = [7, 5, 3, 1];
	for (let sample = 0; sample < samples; sample++) {
		const pose = copyPose(puzzle.start);
		for (let step = 0; step < steps; step++) {
			const count = 8 + (pose.emitter > 1 ? 1 : 0) + (pose.emitter < 13 ? 1 : 0);
			const choice = Math.floor(random() * count);
			if (choice < 8) {
				moveRing(pose, sides[Math.floor(choice / 2)], choice % 2 ? 1 : -1, puzzle.rules.mode, puzzle.rules.corners);
			} else if (choice === 8 && pose.emitter > 1) pose.emitter--;
			else pose.emitter++;
		}
		if (evaluateContract(puzzle.contract, traceLight(pose).hits).won) wins++;
	}
	return wins / samples;
}

function generatePuzzle(options) {
	const seed = options.seed === undefined ? Date.now() : options.seed;
	const random = seededRandom(seed);
	const scoringRandom = seededRandom((seed ^ 0x9e3779b9) >>> 0);
	const target = options.targetWinRate;
	if (target !== undefined && (!Number.isFinite(target) || target < 0 || target > 1)) throw new RangeError('targetWinRate must be between 0 and 1');
	const candidateLimit = 8;
	let best = null;
	let bestDistance = Infinity;
	let candidates = 0;
	const rules = { mode: options.mode || 'single', corners: !!options.corners };
	const attempts = options.attempts === undefined ? 200 : options.attempts;
	const length = Math.max(1, Math.min(30, options.scrambleLength || 8));
	const sides = [7, 5, 3, 1];
	for (let attempt = 0; attempt < attempts; attempt++) {
		const witness = { diagonal: new Uint8Array(225), mask: new Uint8Array(225), emitter: 1 + Math.floor(random() * 13) };
		for (let y = 4; y <= 10; y++) for (let x = 4; x <= 10; x++) {
			const cell = y * 15 + x;
			witness.mask[cell] = Math.floor(random() * 8);
			witness.diagonal[cell] = Math.floor(random() * 2);
		}
		const hits = traceLight(witness).hits;
		const targets = new Uint8Array(225);
		let count = 0;
		for (let i = 0; i < hits.length; i++) if (hits[i]) {
			targets[i] = options.strict ? hits[i] : 8;
			count++;
		}
		if (!count) continue;
		const contract = { targets, quota: options.strict ? count : Math.max(1, Math.min(count, options.quota || count)), forbidOutside: !!options.strict };
		const start = copyPose(witness);
		const reverse = [];
		for (let i = 0; i < length; i++) {
			if (random() < 0.2) {
				const old = start.emitter;
				const direction = random() < 0.5 ? -1 : 1;
				start.emitter = Math.max(1, Math.min(13, old + direction));
				reverse.push({ emitter: old });
			} else {
				const side = sides[Math.floor(random() * sides.length)];
				const direction = random() < 0.5 ? 1 : -1;
				moveRing(start, side, direction, rules.mode, rules.corners);
				reverse.push({ side, direction: -direction });
			}
		}
		if (evaluateContract(contract, traceLight(start).hits).won) continue;
		const solution = reverse.reverse();
		const puzzle = verifiedPuzzle(rules, start, witness, contract, solution, false);
		if (!puzzle) continue;
		if (target === undefined) return puzzle;
		const rate = sampleWinRate(puzzle, scoringRandom, 64, 20);
		const distance = Math.abs(rate - target);
		candidates++;
		if (distance < bestDistance) {
			best = puzzle;
			bestDistance = distance;
			best.estimatedWinRate = rate;
		}
		if (candidates >= candidateLimit) break;
	}
	if (best) {
		best.candidatesScored = candidates;
		return best;
	}
	return fallbackPuzzle(rules, options.strict);
}

if (typeof module !== 'undefined') module.exports = { seededRandom, applyPuzzleMove, sampleWinRate, generatePuzzle };
