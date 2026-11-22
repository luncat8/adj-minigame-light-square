// owns: event-to-score sonification mapping, scales, pitch sources, caps and leak rule
// edit for: note/bed mappings, scale tables, rim degrees and per-depth/per-wave caps

const SO_MAX_CHORD = 6;
const SO_MAX_NOTES = 160;
const SO_RAW_CAP = 4096;
const SO_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3];
const SO_KIND_VEL = [0.34, 0.56, 0.78, 0.86, 0.92];
const SO_DELTA_C = [0, 1, 0, -1];

const SO_SCALES = {
	majorPent: { label: 'major pentatonic', steps: [0, 2, 4, 7, 9], chord: [0, 3, 2] },
	minorPent: { label: 'minor pentatonic', steps: [0, 3, 5, 7, 10], chord: [0, 3, 1] },
	lydian: { label: 'lydian', steps: [0, 2, 4, 6, 7, 9, 11], chord: [0, 4, 2] },
	wholeTone: { label: 'whole tone', steps: [0, 2, 4, 6, 8, 10], chord: [0, 4, 2] },
	hirajoshi: { label: 'hirajoshi', steps: [0, 2, 3, 7, 8], chord: [0, 3, 2] }
};

const SO_ROOTS = { C: 48, D: 50, Eb: 51, F: 53, G: 55, A: 57, Bb: 58 };

let soReady = false;
let soN = 0;
let soGlassOff = 0;
let soTraceMod = null;
let soGoalMod = null;
let soRimIdx = null;
let soRimCells = null;
let soRawActive = null;
let soRawCell = null;
let soRawDepth = null;
let soRawBranch = null;
let soRawFork = null;
let soRawKind = null;
let soRawDirIn = null;
let soRawDirOut = null;
let soRawCh = null;
let soRawRefCh = null;
let soRawPassCh = null;
let soRawTurn = null;
let soDefaultScore = null;

function sonifyInit() {
	if (soReady) return;
	const node = typeof module !== 'undefined' && module.exports;
	const b = node ? require('./board.js') : null;
	soTraceMod = node ? require('./trace.js') : null;
	soGoalMod = node ? require('./contract.js') : null;
	soN = b ? b.BOARD_N : BOARD_N;
	soGlassOff = b ? b.GLASS_OFF : GLASS_OFF;
	soRimIdx = new Int8Array(soN * soN).fill(-1);
	soRimCells = new Uint8Array((soN - 2) * 4);
	let k = 0;
	for (let c = 1; c < soN - 1; c++) { soRimIdx[c] = k; soRimCells[k++] = c; }
	for (let r = 1; r < soN - 1; r++) { const i = r * soN + soN - 1; soRimIdx[i] = k; soRimCells[k++] = i; }
	for (let c = soN - 2; c >= 1; c--) { const i = (soN - 1) * soN + c; soRimIdx[i] = k; soRimCells[k++] = i; }
	for (let r = soN - 2; r >= 1; r--) { const i = r * soN; soRimIdx[i] = k; soRimCells[k++] = i; }
	soRawActive = new Uint8Array(SO_RAW_CAP);
	soRawCell = new Uint8Array(SO_RAW_CAP);
	soRawDepth = new Uint8Array(SO_RAW_CAP);
	soRawBranch = new Uint8Array(SO_RAW_CAP);
	soRawFork = new Uint8Array(SO_RAW_CAP);
	soRawKind = new Uint8Array(SO_RAW_CAP);
	soRawDirIn = new Uint8Array(SO_RAW_CAP);
	soRawDirOut = new Uint8Array(SO_RAW_CAP);
	soRawCh = new Uint8Array(SO_RAW_CAP);
	soRawRefCh = new Uint8Array(SO_RAW_CAP);
	soRawPassCh = new Uint8Array(SO_RAW_CAP);
	soRawTurn = new Int8Array(SO_RAW_CAP);
	soDefaultScore = sonifyCreateScore();
	soReady = true;
}

function sonifyCreateScore() {
	const notes = new Array(SO_MAX_NOTES);
	for (let i = 0; i < SO_MAX_NOTES; i++) {
		notes[i] = {
			depth: 0, cell: 0, branch: 0, fork: 0, kind: 0,
			midi: 60, pan: 0, panTo: 0, vel: 0, ch: 0,
			bright: 0.5, turn: 0, dirOut: 0, dirIn: 0, bounce: 0, status: 0,
			refCh: 0, passCh: 0
		};
	}
	return {
		notes,
		n: 0,
		maxDepth: 0,
		ghost: false,
		scale: 'majorPent',
		rootMidi: 48,
		bed: { chord: new Float32Array(16), chordN: 0, rootMidi: 48, tension: 0, beat: 0, rub: 0, state: 0 }
	};
}

function sonifyRootMidi(root) {
	if (typeof root === 'number' && Number.isFinite(root)) return Math.max(36, Math.min(72, Math.round(root)));
	return SO_ROOTS[root] || 48;
}

function sonifyScaleMidi(rootMidi, scaleKey, deg) {
	const steps = (SO_SCALES[scaleKey] || SO_SCALES.majorPent).steps;
	const n = steps.length;
	const oct = Math.floor(deg / n);
	const idx = ((deg % n) + n) % n;
	let midi = rootMidi + oct * 12 + steps[idx];
	while (midi < 36) midi += 12;
	while (midi > 96) midi -= 12;
	return midi;
}

// shifts a scale MIDI note by `stepOffset` scale degrees while staying inside the scale
function sonifyStepMidi(midi, rootMidi, scaleKey, stepOffset) {
	if (!stepOffset) return midi;
	const steps = (SO_SCALES[scaleKey] || SO_SCALES.majorPent).steps;
	const rel = midi - rootMidi;
	const oct = Math.floor(rel / 12);
	const pc = ((rel % 12) + 12) % 12;
	let idx = steps.indexOf(pc);
	if (idx < 0) idx = 0;
	return sonifyScaleMidi(rootMidi, scaleKey, oct * steps.length + idx + stepOffset);
}

// returns the scale-locked MIDI tone for channel c (0=R, 1=G, 2=B) above a note's root degree
function sonifyChannelMidi(noteMidi, chIndex, rootMidi, scaleKey) {
	const chord = (SO_SCALES[scaleKey] || SO_SCALES.majorPent).chord;
	return sonifyStepMidi(noteMidi, rootMidi, scaleKey, chord[chIndex] || 0);
}

function soLeadStep(ch, chord) {
	if (ch & 1) return chord[0];
	if (ch & 4) return chord[2];
	return chord[1];
}

function soClampPan(v) {
	return v < -1 ? -1 : (v > 1 ? 1 : v);
}

function soEvN() { return soTraceMod ? soTraceMod.traceEvN : traceEvN; }
function soEvCell() { return soTraceMod ? soTraceMod.traceEvCell : traceEvCell; }
function soEvDepth() { return soTraceMod ? soTraceMod.traceEvDepth : traceEvDepth; }
function soEvBranch() { return soTraceMod ? soTraceMod.traceEvBranch : traceEvBranch; }
function soEvFork() { return soTraceMod ? soTraceMod.traceEvFork : traceEvFork; }
function soEvInfo() { return soTraceMod ? soTraceMod.traceEvInfo : traceEvInfo; }
function soBend() { return soTraceMod ? soTraceMod.traceBend : traceBend; }
function soBounce() { return soTraceMod ? soTraceMod.traceBounce : traceBounce; }
function soContractState(res) { return (soGoalMod ? soGoalMod.contractState : contractState)(res); }

// merges equal-depth same-kind notes from lowest priority upward until slice has <= SO_MAX_CHORD active notes
function soCapSlice(start, end) {
	let active = end - start;
	while (active > SO_MAX_CHORD) {
		let merged = false;
		for (let kind = 0; kind <= 4 && !merged; kind++) {
			let first = -1;
			for (let i = start; i < end; i++) {
				if (!soRawActive[i] || soRawKind[i] !== kind) continue;
				if (first < 0) {
					first = i;
					continue;
				}
				soRawCh[first] |= soRawCh[i];
				if (!soRawFork[first] && soRawFork[i]) soRawFork[first] = soRawFork[i];
				soRawActive[i] = 0;
				active--;
				merged = true;
				break;
			}
		}
		if (merged) continue;
		for (let kind = 0; kind <= 4; kind++) {
			let dropped = false;
			for (let i = end - 1; i >= start; i--) {
				if (!soRawActive[i] || soRawKind[i] !== kind) continue;
				soRawActive[i] = 0;
				active--;
				dropped = true;
				break;
			}
			if (dropped) break;
		}
	}
	return active;
}

function soDropWaveOverflow(total, active) {
	let excess = active - SO_MAX_NOTES;
	for (let kind = 0; kind <= 4 && excess > 0; kind++) {
		for (let i = total - 1; i >= 0 && excess > 0; i--) {
			if (!soRawActive[i] || soRawKind[i] !== kind) continue;
			soRawActive[i] = 0;
			excess--;
		}
	}
}

function soRimDegree(cell, row, col, scaleLen) {
	if (row === soN - 1) return (col - 1) % scaleLen;
	const rim = soRimIdx[cell];
	return scaleLen + (rim >= 0 ? rim % (scaleLen * 2) : 0);
}

function soBuildBed(bed, view, scaleKey, rootMidi) {
	const scale = SO_SCALES[scaleKey] || SO_SCALES.majorPent;
	const steps = scale.steps;
	const chord = scale.chord;
	const recv = view && view.recv;
	let cn = 0;
	if (recv) {
		for (let i = 0; i < soRimCells.length && cn < bed.chord.length; i++) {
			const cell = soRimCells[i];
			const bits = recv[cell];
			if (!bits) continue;
			const row = (cell / soN) | 0;
			const col = cell - row * soN;
			const deg = soRimDegree(cell, row, col, steps.length) + soLeadStep(bits, chord);
			const midi = sonifyScaleMidi(rootMidi, scaleKey, deg);
			let dup = false;
			for (let j = 0; j < cn; j++) if (bed.chord[j] === midi) dup = true;
			if (!dup) bed.chord[cn++] = midi;
		}
	}
	const res = view ? view.result : null;
	bed.chordN = cn;
	bed.rootMidi = rootMidi;
	bed.state = soContractState(res);
	bed.tension = res ? Math.max(0, Math.min(1, res.percent / 100)) : 0;
	bed.beat = res && res.forbiddenLight ? 3.5 : 0;
	bed.rub = res && res.wrongColor ? 1 : 0;
}

function sonifyBuild(view, cfg, out) {
	sonifyInit();
	const score = out || soDefaultScore;
	const scaleKey = cfg && SO_SCALES[cfg.scale] ? cfg.scale : 'majorPent';
	const rootMidi = sonifyRootMidi(cfg && cfg.root !== undefined ? cfg.root : 'C');
	const contour = !!(cfg && cfg.pitchSource === 'contour');
	const width = cfg && Number.isFinite(cfg.width) ? Math.max(0, Math.min(1, cfg.width)) : 0.85;
	const scale = SO_SCALES[scaleKey];
	const scaleLen = scale.steps.length;
	const chord = scale.chord;
	// leak rule: per-receiver contract status is exposed only when Current matches overlay is visible
	const curOverlay = view && view.overlays && !view.previewing ? view.overlays.current : null;
	const emitter = view && Number.isFinite(view.emitter) ? view.emitter : 7;

	const total = Math.min(soEvN(), SO_RAW_CAP);
	const evCell = soEvCell();
	const evDepth = soEvDepth();
	const evBranch = soEvBranch();
	const evFork = soEvFork();
	const evInfo = soEvInfo();
	const bendA = soBend();
	const bounceA = soBounce();

	for (let i = 0; i < total; i++) {
		const info = evInfo[i];
		const kind = info & 7;
		const dirIn = (info >> 3) & 3;
		const passCh = (info >> 5) & 7;
		const refCh = (info >> 8) & 7;
		const refDir = (info >> 11) & 3;
		const dirOut = kind === 2 || kind === 3 ? refDir : dirIn;
		soRawActive[i] = 1;
		soRawCell[i] = evCell[i];
		soRawDepth[i] = evDepth[i];
		soRawBranch[i] = evBranch[i];
		soRawFork[i] = evFork[i];
		soRawKind[i] = kind;
		soRawDirIn[i] = dirIn;
		soRawDirOut[i] = dirOut;
		soRawCh[i] = passCh | refCh;
		soRawRefCh[i] = refCh;
		soRawPassCh[i] = passCh;
		soRawTurn[i] = dirIn === refDir ? 0 : (((refDir - dirIn) & 3) === 3 ? 1 : -1);
	}

	let active = 0;
	let s = 0;
	while (s < total) {
		const d = soRawDepth[s];
		let e = s + 1;
		while (e < total && soRawDepth[e] === d) e++;
		active += soCapSlice(s, e);
		s = e;
	}
	if (active > SO_MAX_NOTES) soDropWaveOverflow(total, active);

	let n = 0;
	const half = (soN - 1) / 2;
	const startDeg = scaleLen + (emitter - soGlassOff);
	for (let i = 0; i < total && n < SO_MAX_NOTES; i++) {
		if (!soRawActive[i]) continue;
		const cell = soRawCell[i];
		const kind = soRawKind[i];
		const dirIn = soRawDirIn[i];
		const dirOut = soRawDirOut[i];
		const ch = soRawCh[i] & 7;
		const refCh = soRawRefCh[i];
		const passCh = soRawPassCh[i];
		const turn = soRawTurn[i];
		const row = (cell / soN) | 0;
		const col = cell - row * soN;
		const k = (cell << 2) | dirIn;
		const bend = bendA ? bendA[k] : 0;
		const bounce = bounceA ? bounceA[k] : 0;
		let deg = 0;
		if (kind === 4) {
			deg = soRimDegree(cell, row, col, scaleLen);
		} else if (contour) {
			deg = startDeg + (bend + turn) * 2 + bounce + (turn ? 1 : 0);
		} else {
			const band = ((soGlassOff + 6 - row) >> 1);
			deg = scaleLen + band * 2 + (col - soGlassOff) + turn;
		}
		deg += soLeadStep(ch, chord);
		const note = score.notes[n++];
		note.depth = soRawDepth[i];
		note.cell = cell;
		note.branch = soRawBranch[i];
		note.fork = soRawFork[i];
		note.kind = kind;
		note.midi = sonifyScaleMidi(rootMidi, scaleKey, deg);
		note.pan = soClampPan((col - half) / half) * width;
		note.panTo = soClampPan((col + 0.5 * SO_DELTA_C[dirOut] - half) / half) * width;
		note.vel = Math.min(1, SO_KIND_VEL[kind] * Math.sqrt(SO_POPCOUNT[ch] / 3));
		note.ch = ch;
		note.bright = 1 - row / (soN - 1);
		note.turn = turn;
		note.dirOut = dirOut;
		note.dirIn = dirIn;
		note.refCh = refCh;
		note.passCh = passCh;
		note.bounce = bounce;
		if (kind === 4 && curOverlay) {
			const st = curOverlay[cell];
			note.status = st === 2 ? 2 : (st === 1 ? 1 : 3);
		} else {
			note.status = 0;
		}
	}
	score.n = n;
	score.maxDepth = n ? score.notes[n - 1].depth : 0;
	score.ghost = !!(view && view.previewing);
	score.scale = scaleKey;
	score.rootMidi = rootMidi;
	soBuildBed(score.bed, view, scaleKey, rootMidi);
	return score;
}

if (typeof module !== 'undefined') module.exports = {
	SO_MAX_CHORD,
	SO_MAX_NOTES,
	SO_SCALES,
	SO_ROOTS,
	sonifyCreateScore,
	sonifyRootMidi,
	sonifyScaleMidi,
	sonifyStepMidi,
	sonifyChannelMidi,
	sonifyBuild
};
