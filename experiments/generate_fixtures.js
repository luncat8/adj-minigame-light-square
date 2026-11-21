// owns: 0.4 generation acceptance — replay-verified witnesses, no invalid/already-won starts
// run: node experiments/generate_fixtures.js

const board = require('../board.js');
const gen = require('../generate.js');
const c = require('./check.js');

const MQ = board.MODE_QUARTER;
const MS = board.MODE_SINGLE;
const modes = [MQ, MS];
const corners = [false, true];
const bands = [0, 1, 2];
const SEEDS = 200;

// forced fallback: the preset itself must be replay-verified in every ruleset
for (const mode of modes) {
	for (const corner of corners) {
		for (const band of bands) {
			const preset = gen.presetFor(mode, corner, band);
			c.ok(gen.verifyCandidate(preset), 'preset valid mode=' + mode + ' corner=' + corner + ' band=' + band);
			const forced = gen.generate(gen.makeRng(1), mode, corner, band, { maxAttempts: 0 });
			c.ok(forced.preset && gen.verifyCandidate(forced), 'forced fallback valid mode=' + mode + ' corner=' + corner + ' band=' + band);
		}
	}
}

for (const mode of modes) {
	for (const corner of corners) {
		for (const band of bands) {
			let fallback = 0;
			const attempts = [];
			const hitHist = {};
			let quotaMin = 99, quotaMax = 0, poolMin = 99, poolMax = 0;
			for (let s = 1; s <= SEEDS; s++) {
				const seed = s * 1000 + mode * 97 + (corner ? 13 : 0) + band * 11;
				const cand = gen.generate(gen.makeRng(seed), mode, corner, band);
				c.ok(gen.verifyCandidate(cand), 'replay-verified mode=' + mode + ' corner=' + corner + ' band=' + band + ' seed=' + s);
				const h = cand.witnessHits.length;
				// holds for the preset too (one hit, quota 1)
				if (band === 0) c.eq(cand.contract.quota, Math.max(1, (h + 1) >> 1), 'band 0 quota is half the hits seed=' + s);
				if (band === 1) c.eq(cand.contract.quota, h, 'band 1 quota is all hits seed=' + s);
				if (band === 2) c.ok(cand.contract.forbidOutside, 'band 2 forbids outside seed=' + s);
				if (cand.preset) {
					fallback++;
					continue;
				}
				attempts.push(cand.attempts);
				hitHist[h] = (hitHist[h] || 0) + 1;
				quotaMin = Math.min(quotaMin, cand.contract.quota);
				quotaMax = Math.max(quotaMax, cand.contract.quota);
				let pool = 0;
				for (let i = 0; i < cand.contract.requirements.length; i++) if (cand.contract.requirements[i]) pool++;
				poolMin = Math.min(poolMin, pool);
				poolMax = Math.max(poolMax, pool);
			}
			const sorted = attempts.slice().sort((a, b) => a - b);
			const median = sorted.length ? sorted[sorted.length >> 1] : 0;
			const min = sorted.length ? sorted[0] : 0;
			const max = sorted.length ? sorted[sorted.length - 1] : 0;
			const fbPct = (100 * fallback / SEEDS).toFixed(1);
			console.log('mode=' + mode + ' corner=' + (corner ? 1 : 0) + ' band=' + band +
				' n=' + SEEDS + ' fallback=' + fallback + '(' + fbPct + '%)' +
				' attempts[min/med/max]=' + min + '/' + median + '/' + max +
				' hits=' + JSON.stringify(hitHist) +
				' quota[' + quotaMin + '..' + quotaMax + ']' +
				' pool[' + poolMin + '..' + poolMax + ']');
		}
	}
}

// pool enlargement must still produce replay-verified, non-already-won puzzles
for (const mode of modes) {
	for (const corner of corners) {
		let bad = 0;
		for (let s = 1; s <= 50; s++) {
			const cand = gen.generate(gen.makeRng(s + 5000), mode, corner, 1, { poolSamples: 8 });
			if (!gen.verifyCandidate(cand)) bad++;
		}
		c.ok(bad === 0, 'enlarged-pool band-1 valid mode=' + mode + ' corner=' + corner);
	}
}

c.report('generate_fixtures');
