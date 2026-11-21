// owns: deterministic construction and validation of the presets.js catalog
// run: node experiments/build_presets.js — rewrites PRESET_CODES in presets.js

const fs = require('node:fs');
const path = require('node:path');
const board = require('../board.js');
const presets = require('../presets.js');
const gen = require('../generate.js');

const CELLS = board.GLASS * board.GLASS;
const RING_ACTS = [0, 1, 2, 3, 4, 5, gen.ACT_CENTER];
const ALL_ACTS = RING_ACTS.concat([gen.ACT_LEFT, gen.ACT_RIGHT]);
const DIALS = [0, 0.5, 1];
// prefer two ring moves; wider passes exist so a key never stays empty
const PASSES = [{ len: 2, acts: RING_ACTS }, { len: 1, acts: RING_ACTS }, { len: 3, acts: ALL_ACTS }];
const TRIES = 4000;

function encode(tiles, emitter, acts) {
	let code = '';
	for (let k = 0; k < Math.ceil(CELLS / 3); k++) {
		let v = 0;
		for (let j = 0; j < 3; j++) {
			const t = tiles[3 * k + j] || 0;
			v |= (t & 7 ? (t & board.TILE_DIAG ? 2 : 1) : 0) << (2 * j);
		}
		code += presets.PRESET_DIGITS[v];
	}
	code += emitter.toString(16);
	for (const a of acts) code += presets.PRESET_MOVES[a];
	return code;
}

function pickActs(rng, pass, emitter) {
	const acts = [];
	let e = emitter;
	while (acts.length < pass.len) {
		const a = pass.acts[(rng() * pass.acts.length) | 0];
		const last = acts.length ? acts[acts.length - 1] : -1;
		if (last >= 0 && a === gen.inverseAct(last)) continue;
		const ne = a === gen.ACT_LEFT ? e - 1 : a === gen.ACT_RIGHT ? e + 1 : e;
		if (ne < board.EMITTER_MIN || ne > board.EMITTER_MAX) continue;
		e = ne;
		acts.push(a);
	}
	return acts.some(a => a < gen.ACT_LEFT) ? acts : null;
}

const decoded = new Uint8Array(CELLS);
function roundTrips(tiles, emitter, acts, mode, corner, count) {
	const tpl = presets.presetTemplate(mode, corner, count, decoded);
	return tpl.emitter === emitter && tpl.forward.join() === acts.join() && decoded.every((t, i) => t === tiles[i]);
}

function presetValid(mode, corner, count) {
	for (const d of DIALS) {
		const cand = gen.presetFor(gen.genSettings(0, mode, corner, d, count), 0);
		if (!gen.verifyCandidate(cand) || cand.witnessHits.length !== 1) return false;
	}
	return true;
}

function search(mode, corner, count, idx) {
	const rng = gen.makeRng(0x9e5e7000 + idx);
	const p = board.createPuzzle(mode, corner);
	for (let pass = 0; pass < PASSES.length; pass++) {
		for (let t = 0; t < TRIES; t++) {
			gen.randomGlass(rng, count, p.tiles);
			for (let i = 0; i < CELLS; i++) if (p.tiles[i]) p.tiles[i] = 7 | (p.tiles[i] & board.TILE_DIAG);
			const emitter = board.GLASS_OFF + ((rng() * board.GLASS) | 0);
			const acts = pickActs(rng, PASSES[pass], emitter);
			if (!acts) continue;
			presets.PRESET_CODES[idx] = encode(p.tiles, emitter, acts);
			if (!roundTrips(p.tiles, emitter, acts, mode, corner, count)) throw new Error('codec mismatch index=' + idx);
			if (presetValid(mode, corner, count)) return { pass, tries: t + 1 };
		}
	}
	throw new Error('no template mode=' + mode + ' corner=' + corner + ' count=' + count);
}

const t0 = Date.now();
const passHist = [0, 0, 0];
let triesMax = 0;
for (const mode of [gen.MQ, gen.MS]) {
	for (const corner of [false, true]) {
		for (let count = 1; count <= CELLS; count++) {
			const r = search(mode, corner, count, presets.presetIndex(mode, corner, count, CELLS));
			passHist[r.pass]++;
			triesMax = Math.max(triesMax, r.tries);
		}
	}
}

const lines = [];
for (let i = 0; i < presets.PRESET_CODES.length; i += 7) {
	lines.push('\t' + presets.PRESET_CODES.slice(i, i + 7).map(s => '\'' + s + '\'').join(', ') + ',');
}
const file = path.join(__dirname, '..', 'presets.js');
const src = fs.readFileSync(file, 'utf8');
const body = 'const PRESET_CODES = [\n' + lines.join('\n').replace(/,$/, '') + '\n];';
fs.writeFileSync(file, src.replace(/const PRESET_CODES = \[[\s\S]*?\];/, body));
console.log('presets=' + presets.PRESET_CODES.length + ' pass_len2_ring=' + passHist[0] + ' pass_len1_ring=' + passHist[1] +
	' pass_len3_any=' + passHist[2] + ' tries_max=' + triesMax + ' build_ms=' + (Date.now() - t0));
