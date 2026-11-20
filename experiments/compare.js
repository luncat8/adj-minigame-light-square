const fs = require('fs');

const files = process.argv.slice(2);
if (files.length !== 2) {
	console.error('usage: node experiments/compare.js <a.log> <b.log>');
	process.exit(1);
}

function parse(file) {
	const map = {};
	const lines = fs.readFileSync(file, 'utf8').split('\n');
	for (const line of lines) {
		if (!line.trim()) continue;
		const obj = {};
		for (const part of line.trim().split(/\s+/)) {
			const i = part.indexOf('=');
			if (i > 0) obj[part.slice(0, i)] = part.slice(i + 1);
		}
		map[obj.mode + ':' + obj.difficulty] = obj;
	}
	return map;
}

const a = parse(files[0]);
const b = parse(files[1]);
let flags = 0;
for (const key of Object.keys(a)) {
	if (!b[key]) {
		console.log('missing ' + key);
		flags++;
		continue;
	}
	for (const metric of Object.keys(a[key])) {
		if (metric === 'mode' || metric === 'difficulty' || metric === 'sample') continue;
		const av = Number(a[key][metric]);
		const bv = Number(b[key][metric]);
		if (!isFinite(av) || !isFinite(bv)) continue;
		const delta = av === 0 ? (bv === 0 ? 0 : Infinity) : ((bv - av) / Math.abs(av)) * 100;
		if (!isFinite(delta) || Math.abs(delta) > 5) {
			console.log(key + ' ' + metric + ' ' + av + ' -> ' + bv + ' ' + (isFinite(delta) ? delta.toFixed(1) + '%' : 'new'));
			flags++;
		}
	}
}
console.log('compare flags=' + flags);