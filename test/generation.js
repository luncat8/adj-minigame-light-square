// Verify transport, contracts and replay across active rule combinations.
const assert = require('assert');
const { copyPose } = require('../src/movement');
const { traceLight } = require('../src/trace');
const { evaluateContract } = require('../src/contract');
const { generatePuzzle, applyPuzzleMove } = require('../src/generation');

const pose = { diagonal: new Uint8Array(225), mask: new Uint8Array(225), emitter: 7 };
assert.strictEqual(traceLight(pose).hits[7], 7);
pose.mask[112] = 5;
assert.strictEqual(traceLight(pose).hits[7], 2);
assert.strictEqual(traceLight(pose).hits[7 * 15 + 14], 5);
const targets = new Uint8Array(225);
targets[7] = 2;
const contract = { targets, quota: 1, forbidOutside: true };
assert.strictEqual(evaluateContract(contract, traceLight(pose).hits).won, false);
contract.forbidOutside = false;
assert.strictEqual(evaluateContract(contract, traceLight(pose).hits).won, true);

let generated = 0;
for (const mode of ['single', 'quarter']) for (const corners of [false, true]) for (const strict of [false, true]) {
	for (let seed = 0; seed < 40; seed++) {
		const puzzle = generatePuzzle({ seed, mode, corners, strict });
		assert(puzzle, `generation failed ${mode} ${corners} ${strict} ${seed}`);
		assert(!evaluateContract(puzzle.contract, traceLight(puzzle.start).hits).won);
		const replay = copyPose(puzzle.start);
		for (const move of puzzle.solution) {
			if (move.emitter !== undefined) assert(Math.abs(move.emitter - replay.emitter) <= 1);
			applyPuzzleMove(replay, move, puzzle.rules);
		}
		assert.deepStrictEqual(replay, puzzle.witness);
		assert(evaluateContract(puzzle.contract, traceLight(replay).hits).won);
		generated++;
	}
}
for (const mode of ['single', 'quarter']) for (const corners of [false, true]) for (const strict of [false, true]) {
	const puzzle = generatePuzzle({ attempts: 0, mode, corners, strict });
	assert(puzzle && puzzle.fallback);
	assert(!evaluateContract(puzzle.contract, traceLight(puzzle.start).hits).won);
	const replay = copyPose(puzzle.start);
	for (const move of puzzle.solution) applyPuzzleMove(replay, move, puzzle.rules);
	assert.deepStrictEqual(replay, puzzle.witness);
	assert(evaluateContract(puzzle.contract, traceLight(replay).hits).won);
}
console.log(`generation replay passed: ${generated} puzzles`);

for (const mode of ['single', 'quarter']) for (const corners of [false, true]) for (const strict of [false, true]) {
	for (const targetWinRate of [0.01, 0.08, 0.2]) {
		const options = { seed: 314, mode, corners, strict, targetWinRate };
		const puzzle = generatePuzzle(options);
		assert.deepStrictEqual(puzzle, generatePuzzle(options));
		assert(!puzzle.fallback && puzzle.candidatesScored === 8);
		assert(puzzle.estimatedWinRate >= 0 && puzzle.estimatedWinRate <= 1);
		assert(!evaluateContract(puzzle.contract, traceLight(puzzle.start).hits).won);
		const replay = copyPose(puzzle.start);
		for (const move of puzzle.solution) applyPuzzleMove(replay, move, puzzle.rules);
		assert.deepStrictEqual(replay, puzzle.witness);
		assert(evaluateContract(puzzle.contract, traceLight(replay).hits).won);
	}
	assert(generatePuzzle({ attempts: 0, mode, corners, strict, targetWinRate: 0.1 }).fallback);
}
assert.throws(() => generatePuzzle({ targetWinRate: NaN }), RangeError);
assert.throws(() => generatePuzzle({ targetWinRate: 1.1 }), RangeError);
console.log('scored selection and fallback passed');
const bounded = generatePuzzle({ seed: 314, attempts: 1, targetWinRate: 0.08 });
assert(bounded.fallback || bounded.candidatesScored === 1);
