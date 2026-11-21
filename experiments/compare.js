// owns: keyed comparison of two fixed-key metric logs; flags deltas over thresholds and missing cells
// run: node experiments/compare.js base.log next.log [abs=0.05] [rel=0.05]

const fs = require('node:fs');

const KEY_FIELDS = ['mode', 'corner', 'mirrors', 'difficulty'];
const SKIP = new Set(['split', 'samples', 'par_exact_n', 'par_capped_n', ...KEY_FIELDS]);
// timing and counts scale with the machine or the budget, so they compare relatively; scores and rates absolutely
const RELATIVE = /_ms_|attempts|len|par_exact_avg/;

const files = process.argv.slice(2).filter(a => !a.includes('='));
const opts = Object.fromEntries(process.argv.slice(2).filter(a => a.includes('=')).map(a => a.split('=')));
const absLimit = Number(opts.abs || 0.05);
const relLimit = Number(opts.rel || 0.05);

function load(file) {
	const rows = new Map();
	for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
		const parts = line.trim().split(/\s+/).filter(Boolean);
		if (!parts.length || parts[0] === 'run') continue;
		const kind = parts[0].includes('=') ? 'cell' : parts.shift();
		const rec = Object.fromEntries(parts.map(p => p.split('=')));
		rows.set(kind + ' ' + KEY_FIELDS.map(k => k + '=' + (rec[k] ?? '-')).join(' '), rec);
	}
	return rows;
}

const [base, next] = files.map(load);
let flagged = 0;
for (const [key, a] of base) {
	const b = next.get(key);
	if (!b) {
		console.log('missing side=next ' + key);
		continue;
	}
	for (const metric of Object.keys(a)) {
		if (SKIP.has(metric) || !(metric in b)) continue;
		const x = Number(a[metric]);
		const y = Number(b[metric]);
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		const relative = RELATIVE.test(metric) && x > 0;
		const delta = relative ? (y - x) / x : y - x;
		if (Math.abs(delta) <= (relative ? relLimit : absLimit)) continue;
		flagged++;
		console.log('delta ' + key + ' metric=' + metric + ' base=' + a[metric] + ' next=' + b[metric] + (relative ? ' rel=' : ' abs=') + delta.toFixed(3));
	}
}
for (const key of next.keys()) if (!base.has(key)) console.log('missing side=base ' + key);
console.log('compared=' + base.size + ' flagged=' + flagged + ' abs_limit=' + absLimit + ' rel_limit=' + relLimit);
