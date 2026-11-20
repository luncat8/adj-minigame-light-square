// Evaluate selected candidates with independent random walks.
const { performance } = require('perf_hooks');
const { generatePuzzle, sampleWinRate, seededRandom } = require('../src/generation');

for (const mode of ['single', 'quarter']) for (const corners of [false, true]) for (const strict of [false, true]) for (const target of [0.01, 0.08, 0.2]) {
	let score = 0, holdout = 0, elapsed = 0, fallbacks = 0;
	for (let seed = 100; seed < 124; seed++) {
		const start = performance.now();
		const puzzle = generatePuzzle({ seed, mode, corners, strict, targetWinRate: target });
		elapsed += performance.now() - start;
		if (puzzle.fallback) fallbacks++;
		else score += puzzle.estimatedWinRate;
		holdout += sampleWinRate(puzzle, seededRandom(seed + 200000), 256, 20);
	}
	console.log(`mode=${mode} corners=${+corners} strict=${+strict} target=${target} puzzles=24 scored_samples=64 holdout_samples=256 estimated_mean=${(score / 24).toFixed(4)} holdout_mean=${(holdout / 24).toFixed(4)} fallback_count=${fallbacks} generation_ms_mean=${(elapsed / 24).toFixed(2)}`);
}
