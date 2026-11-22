// owns: 0.7 sonification fixtures — scale membership, pan/vel bounds, caps, no-sort order, leak rule, ghost and bed tension
// run: node experiments/sonify_fixtures.js

const board = require('../board.js');
const trace = require('../trace.js');
const goal = require('../contract.js');
const hints = require('../hints.js');
const gen = require('../generate.js');
const sonify = require('../sonify.js');
const c = require('./check.js');

const N = board.BOARD_N;
const flat = (r, col) => r * N + col;

function inScale(midi, rootMidi, scaleKey) {
	const steps = sonify.SO_SCALES[scaleKey].steps;
	const pc = ((Math.round(midi) - rootMidi) % 12 + 12) % 12;
	return midi >= 36 && midi <= 96 && steps.includes(pc);
}

function nondecreasing(score) {
	for (let i = 1; i < score.n; i++) if (score.notes[i].depth < score.notes[i - 1].depth) return false;
	return true;
}

function maxChordAtSameDepth(score) {
	let maxC = 0;
	let run = 0;
	let prev = -1;
	for (let i = 0; i < score.n; i++) {
		const d = score.notes[i].depth;
		run = d === prev ? run + 1 : 1;
		prev = d;
		if (run > maxC) maxC = run;
	}
	return maxC;
}

function snapshotNotes(score) {
	const out = [];
	for (let i = 0; i < score.n; i++) out.push({ ...score.notes[i] });
	return out;
}

// 1. Scale membership, pan range, brightness, direction glide across all scales, roots and pitch sources
const scaleKeys = Object.keys(sonify.SO_SCALES);
const roots = ['C', 'Eb', 'G', 'A'];
const sources = ['position', 'contour'];
for (const scale of scaleKeys) {
	for (const root of roots) {
		const rootMidi = sonify.sonifyRootMidi(root);
		for (const pitchSource of sources) {
			let badPitch = 0;
			let badPan = 0;
			let badOrder = 0;
			let badCap = 0;
			for (const mirrors of [1, 11, 49]) {
				const cand = gen.generate(700 + mirrors, 0, true, 0.5, mirrors, { candidateCount: 1 });
				trace.traceLight(cand.start, cand.startEmitter);
				const res = goal.evaluateContract(cand.contract, trace.traceRecv);
				const view = {
					emitter: cand.startEmitter,
					recv: trace.traceRecv,
					result: res,
					overlays: { current: null, discoveries: null, targets: null },
					previewing: false
				};
				const s = sonify.sonifyBuild(view, { scale, root, pitchSource, width: 0.8 });
				if (!nondecreasing(s)) badOrder++;
				if (s.n > sonify.SO_MAX_NOTES || maxChordAtSameDepth(s) > sonify.SO_MAX_CHORD) badCap++;
				for (let i = 0; i < s.n; i++) {
					const n = s.notes[i];
					if (!inScale(n.midi, rootMidi, scale)) badPitch++;
					for (let ch = 0; ch < 3; ch++) {
						if (!inScale(sonify.sonifyChannelMidi(n.midi, ch, rootMidi, scale), rootMidi, scale)) badPitch++;
					}
					if (n.pan < -0.800001 || n.pan > 0.800001 || n.panTo < -0.800001 || n.panTo > 0.800001) badPan++;
					if (n.bright < 0 || n.bright > 1) badPan++;
				}
				for (let i = 0; i < s.bed.chordN; i++) {
					if (!inScale(s.bed.chord[i], rootMidi, scale)) badPitch++;
				}
			}
			c.eq(badPitch, 0, 'all note, channel and bed pitches in scale ' + scale + ' ' + root + ' ' + pitchSource);
			c.eq(badPan, 0, 'pan/panTo/bright within bounds ' + scale + ' ' + root + ' ' + pitchSource);
			c.eq(badOrder, 0, 'score depth nondecreasing ' + scale + ' ' + root + ' ' + pitchSource);
			c.eq(badCap, 0, 'score caps respected ' + scale + ' ' + root + ' ' + pitchSource);
		}
	}
}

// 2. Energy conservation: velocity scales with sqrt(channel count); horizontal travel glides panTo; left vs right turn separates pitch
const splitTiles = new Uint8Array(49);
splitTiles[3 * 7 + 3] = 1; // (7,7) '/' reflects R right, passes G+B up
trace.traceLight(splitTiles, 7);
const sSplit = sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: null, overlays: null, previewing: false }, { scale: 'majorPent', root: 'C', width: 1 });
const topNote = Array.from({ length: sSplit.n }, (_, i) => sSplit.notes[i]).find(n => n.kind === trace.EV_ABSORB && n.cell === flat(0, 7));
const rightNote = Array.from({ length: sSplit.n }, (_, i) => sSplit.notes[i]).find(n => n.kind === trace.EV_ABSORB && n.cell === flat(7, 14));
c.ok(!!topNote && !!rightNote, 'split produces top (2ch) and right (1ch) absorbs');
c.ok(Math.abs(topNote.vel / rightNote.vel - Math.sqrt(2)) < 1e-6, 'velocity scales with sqrt(channel count)');
const splitEv = Array.from({ length: sSplit.n }, (_, i) => sSplit.notes[i]).find(n => n.kind === trace.EV_SPLIT);
c.ok(!!splitEv && splitEv.panTo > splitEv.pan && splitEv.fork === 1, 'rightward split glides panTo right and carries fork branch');

const leftMirror = new Uint8Array(49);
leftMirror[3 * 7 + 3] = 7 | board.TILE_DIAG; // '\' turns left from UP
const rightMirror = new Uint8Array(49);
rightMirror[3 * 7 + 3] = 7; // '/' turns right from UP
const sA = sonify.sonifyCreateScore();
const sB = sonify.sonifyCreateScore();
trace.traceLight(leftMirror, 7);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: null, overlays: null, previewing: false }, { scale: 'majorPent', root: 'C' }, sA);
trace.traceLight(rightMirror, 7);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: null, overlays: null, previewing: false }, { scale: 'majorPent', root: 'C' }, sB);
const refL = Array.from({ length: sA.n }, (_, i) => sA.notes[i]).find(n => n.kind === trace.EV_REFLECT);
const refR = Array.from({ length: sB.n }, (_, i) => sB.notes[i]).find(n => n.kind === trace.EV_REFLECT);
c.ok(refL.turn === 1 && refR.turn === -1 && refL.midi > refR.midi && refL.panTo < refR.panTo, 'left vs right reflect resolved by turn, pitch and pan glide');

// 3. No-sort proof: sonifyBuild never invokes Array.prototype.sort
const origSort = Array.prototype.sort;
let sortCalled = false;
Array.prototype.sort = function () { sortCalled = true; return origSort.apply(this, arguments); };
try {
	trace.traceLight(leftMirror, 7);
	sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: null, overlays: null, previewing: false }, {});
} finally {
	Array.prototype.sort = origSort;
}
c.ok(!sortCalled, 'sonifyBuild consumes event order without sorting');

// 4. Leak rule: target vs non-target receiver produces identical score unless Current matches overlay is active
const emptyTiles = new Uint8Array(49);
trace.traceLight(emptyTiles, 7); // hits (0, 7) with white
const contractTarget = goal.createStrictContract([{ cell: flat(0, 7), mask: 7 }]);
const contractOther = goal.createStrictContract([{ cell: flat(0, 3), mask: 7 }]);
const progTarget = goal.createContractProgress(contractTarget);
const progOther = goal.createContractProgress(contractOther);
goal.updateContractProgress(progTarget, trace.traceRecv);
goal.updateContractProgress(progOther, trace.traceRecv);

// even with discoveries and targets overlays ON, Current matches OFF must not leak target identity in note score
const ovNoCurrentA = hints.hintOverlay(progTarget, { current: false, discoveries: true, targets: true }, false);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: progTarget.result, overlays: ovNoCurrentA, previewing: false }, {}, sA);
const ovNoCurrentB = hints.hintOverlay(progOther, { current: false, discoveries: true, targets: true }, false);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: progOther.result, overlays: ovNoCurrentB, previewing: false }, {}, sB);
c.eq(JSON.stringify(snapshotNotes(sA)), JSON.stringify(snapshotNotes(sB)), 'leak rule: target and non-target score identically when Current matches is off');
c.eq(sA.notes[sA.n - 1].status, 0, 'status stays 0 when Current matches is off');

// with Current matches ON (and not previewing), status reflects match (2), wrong-color (1), outside (3)
const progWrong = goal.createContractProgress(goal.createStrictContract([{ cell: flat(0, 7), mask: 1 }]));
goal.updateContractProgress(progWrong, trace.traceRecv);
const ovCurMatch = hints.hintOverlay(progTarget, { current: true, discoveries: false, targets: false }, false);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: progTarget.result, overlays: ovCurMatch, previewing: false }, {}, sA);
c.eq(sA.notes[sA.n - 1].status, 2, 'Current matches on marks matched receiver status=2');
const ovCurWrong = hints.hintOverlay(progWrong, { current: true, discoveries: false, targets: false }, false);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: progWrong.result, overlays: ovCurWrong, previewing: false }, {}, sA);
c.eq(sA.notes[sA.n - 1].status, 1, 'Current matches on marks wrong-color receiver status=1');
const ovCurOut = hints.hintOverlay(progOther, { current: true, discoveries: false, targets: false }, false);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: progOther.result, overlays: ovCurOut, previewing: false }, {}, sA);
c.eq(sA.notes[sA.n - 1].status, 3, 'Current matches on marks outside receiver status=3');

// preview suppresses status and sets ghost = true
const ovPrev = hints.hintOverlay(progTarget, { current: true, discoveries: true, targets: true }, true);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: progTarget.result, overlays: ovPrev, previewing: true }, {}, sB);
c.ok(sB.ghost && !sA.ghost, 'previewing sets ghost flag');
c.eq(sB.notes[sB.n - 1].status, 0, 'preview suppresses per-receiver status');

// 5. Bed tension monotonic in percent, beat/rub follow readout flags
let prevTension = -1;
let mono = true;
for (let pct = 0; pct <= 100; pct += 10) {
	const res = { percent: pct, won: pct === 100, matches: pct > 0 ? 1 : 0, wrongColor: false, forbiddenLight: false };
	sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: res, overlays: null, previewing: false }, {}, sA);
	if (sA.bed.tension < prevTension || sA.bed.tension < 0 || sA.bed.tension > 1) mono = false;
	prevTension = sA.bed.tension;
}
c.ok(mono && prevTension === 1, 'bed tension is monotonic in percent and reaches 1 at 100%');
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: { percent: 50, won: false, matches: 1, wrongColor: true, forbiddenLight: true }, overlays: null, previewing: false }, {}, sA);
c.ok(sA.bed.beat > 0 && sA.bed.rub > 0 && sA.bed.state === goal.CONTRACT_PARTIAL, 'bed beat and rub reflect forbiddenLight and wrongColor');

// 6. Cap overflow: >6 equal-depth notes merge same-kind channels; >160 total notes drop glass before reflects/absorbs
trace.traceReset();
const denseGlass = new Uint8Array(49);
for (let col = 4; col <= 10; col++) {
	const ch = ((col - 4) % 3 === 0) ? 1 : (((col - 4) % 3 === 1) ? 2 : 4);
	trace.traceSeed(flat(10, col), trace.DIR_UP, ch, 1, col - 4);
}
trace.traceRun(denseGlass);
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: null, overlays: null, previewing: false }, {}, sA);
c.ok(maxChordAtSameDepth(sA) <= sonify.SO_MAX_CHORD, 'equal-depth slice capped at 6');
const d1Notes = Array.from({ length: sA.n }, (_, i) => sA.notes[i]).filter(n => n.depth === 1);
const chUnion = d1Notes.reduce((acc, n) => acc | n.ch, 0);
c.eq(chUnion, 7, 'equal-depth merge preserves union of channels');

// >160 wave cap stress: 7-row snake traversed forward & backward by R, G, B from depth=1 seeds (~300 events, <=6/depth)
const waveStress = new Uint8Array(49);
const gIdx = (r, col) => (r - 4) * 7 + (col - 4);
for (let r = 10; r >= 4; r--) {
	const even = ((10 - r) & 1) === 0;
	waveStress[gIdx(r, 4)] = 7 | (even ? 0 : board.TILE_DIAG);
	if (r > 4) waveStress[gIdx(r, 10)] = 7 | (even ? 0 : board.TILE_DIAG);
}
trace.traceReset();
trace.traceSeed(flat(13, 4), trace.DIR_UP, 1, 1, 0);
trace.traceSeed(flat(12, 4), trace.DIR_UP, 2, 1, 1);
trace.traceSeed(flat(11, 4), trace.DIR_UP, 4, 1, 2);
trace.traceSeed(flat(4, 13), trace.DIR_LEFT, 1, 1, 3);
trace.traceSeed(flat(4, 12), trace.DIR_LEFT, 2, 1, 4);
trace.traceSeed(flat(4, 11), trace.DIR_LEFT, 4, 1, 5);
trace.traceRun(waveStress);
c.ok(trace.traceEvN > sonify.SO_MAX_NOTES, 'stress trace exceeds 160 raw events');
sonify.sonifyBuild({ emitter: 7, recv: trace.traceRecv, result: null, overlays: null, previewing: false }, {}, sB);
c.eq(sB.n, sonify.SO_MAX_NOTES, 'wave note count capped at 160');
c.ok(nondecreasing(sB) && maxChordAtSameDepth(sB) <= sonify.SO_MAX_CHORD, 'capped wave keeps nondecreasing depth and <=6 chord cap');
const rawAbsorbs = Array.from({ length: trace.traceEvN }, (_, i) => trace.traceEvInfo[i] & 7).filter(k => k === trace.EV_ABSORB).length;
const keptAbsorbs = Array.from({ length: sB.n }, (_, i) => sB.notes[i].kind).filter(k => k === trace.EV_ABSORB).length;
c.ok(rawAbsorbs === 6 && keptAbsorbs === 6, 'priority drop preserves all 6 absorbs over glass under >160 overflow');

c.report('sonify_fixtures');
