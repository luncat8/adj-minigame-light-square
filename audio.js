// owns: AudioContext lifecycle, master/sfx buses, reverb IR, lookahead scheduler, waves, bed and soundView sink
// edit for: timing, mixing, mechanism/laser sfx routing, ghost preview, win flourish and suspend/resume policy

const AU_SCHED_MS = 25;
const AU_LOOKAHEAD = 0.12;
const AU_DEBOUNCE_MS = 120;
const AU_WAVE_FADE = 0.08;
const AU_BED_FADE = 0.4;
const AU_STEAL_RAMP = 0.03;
const AU_MAX_VOICES = 32;

const auDefaultCfg = {
	on: true, variant: 'glass', volume: 0.7, speed: 4, mode: 'move',
	scale: 'majorPent', root: 'C', pitchSource: 'position',
	width: 0.85, reverb: 0.45, bedLevel: 0.5, params: {}
};

const auMods = {};
let auAc = null, auGraph = null, auOn = false, auVisBound = false;
let auIrTimer = 0, auIrSec = 0, auMoveTimer = 0, auSchedTimer = 0;
let auWave = null, auBed = null, auBedSig = '';
let auVoices = [], auScores = null;
let auLastLiveScore = null, auPreviewScore = null, auLastView = null;
let auWasPreview = false, auWasLiveWon = false;

function auMod(file) {
	if (typeof module === 'undefined' || !module.exports) return null;
	return auMods[file] || (auMods[file] = require(file));
}

function auSettings() {
	const p = auMod('./soundpanel.js');
	if (p) return p.soundPanelSettings();
	return typeof soundPanelSettings !== 'undefined' ? soundPanelSettings() : auDefaultCfg;
}

function auEnsureScores() {
	if (auScores) return;
	const m = auMod('./sonify.js');
	const create = m ? m.sonifyCreateScore : sonifyCreateScore;
	auScores = [create(), create(), create()];
}

function auBuildScore(view, cfg, slot) {
	const m = auMod('./sonify.js');
	return (m ? m.sonifyBuild : sonifyBuild)(view, cfg, slot);
}

function auPatch(id) {
	const m = auMod('./patches.js');
	return (m ? m.patchById : patchById)(id);
}

function auHidden() {
	return typeof document !== 'undefined' && !!(document.hidden || document.visibilityState === 'hidden');
}

function auClearMove() {
	if (!auMoveTimer) return;
	clearTimeout(auMoveTimer);
	auMoveTimer = 0;
}

function auShaperCurve() {
	const curve = new Float32Array(256);
	const norm = Math.tanh(1.5);
	for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i * 2) / 255 - 1) * 1.5) / norm;
	return curve;
}

// stereo decorrelated noise * exponential decay darkened by a one-pole low-pass; zero external audio files
function auBuildImpulse(ac, seconds) {
	const sec = Math.max(0.25, Math.min(4.0, seconds));
	const len = Math.max(512, Math.floor(ac.sampleRate * sec));
	const buf = ac.createBuffer(2, len, ac.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const data = buf.getChannelData(ch);
		let seed = ch ? 0x9e3779b9 : 0x85ebca6b;
		let lp = 0;
		for (let i = 0; i < len; i++) {
			seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
			const env = Math.pow(1 - i / len, 2.6);
			lp += (0.34 - 0.2 * (i / len)) * (seed / 0x80000000 - lp);
			data[i] = lp * env * 0.65;
		}
	}
	return buf;
}

function auCreateContext() {
	if (auAc) return auAc;
	const Ctor = typeof window !== 'undefined' && window.AudioContext
		? window.AudioContext
		: (typeof AudioContext !== 'undefined' ? AudioContext : null);
	if (!Ctor) return null;
	const ac = new Ctor();
	const t = ac.currentTime;
	const waveBus = ac.createGain();
	const bedBus = ac.createGain();
	const ghostFilter = ac.createBiquadFilter();
	ghostFilter.type = 'lowpass';
	ghostFilter.frequency.setValueAtTime(1400, t);
	const ghostGain = ac.createGain();
	ghostGain.gain.setValueAtTime(0.5, t);
	const ghostWet = ac.createGain();
	ghostWet.gain.setValueAtTime(0.35, t);
	const shaper = ac.createWaveShaper();
	shaper.curve = auShaperCurve();
	shaper.oversample = '2x';
	const dryGain = ac.createGain();
	dryGain.gain.setValueAtTime(0.85, t);
	const wetSend = ac.createGain();
	const convolver = ac.createConvolver();
	const limiter = ac.createDynamicsCompressor();
	limiter.threshold.setValueAtTime(-3, t);
	limiter.knee.setValueAtTime(6, t);
	limiter.ratio.setValueAtTime(12, t);
	limiter.attack.setValueAtTime(0.003, t);
	limiter.release.setValueAtTime(0.15, t);
	const master = ac.createGain();
	master.gain.setValueAtTime(0, t);
	const sfxBus = ac.createGain();

	if (ac.listener) {
		if (ac.listener.forwardZ) {
			ac.listener.forwardX.setValueAtTime(0, t);
			ac.listener.forwardY.setValueAtTime(0, t);
			ac.listener.forwardZ.setValueAtTime(-1, t);
		} else if (ac.listener.setOrientation) {
			ac.listener.setOrientation(0, 0, -1, 0, 1, 0);
		}
	}

	ghostFilter.connect(ghostGain);
	ghostGain.connect(waveBus);
	ghostGain.connect(ghostWet);
	ghostWet.connect(convolver);
	waveBus.connect(shaper);
	bedBus.connect(shaper);
	shaper.connect(dryGain);
	dryGain.connect(limiter);
	shaper.connect(wetSend);
	wetSend.connect(convolver);
	convolver.connect(limiter);
	sfxBus.connect(limiter);
	limiter.connect(master);
	master.connect(ac.destination);

	auAc = ac;
	auGraph = { waveBus, bedBus, sfxBus, ghostFilter, wetSend, convolver, master };
	const cfg = auSettings();
	auIrSec = 0.4 + 2.6 * cfg.reverb;
	convolver.buffer = auBuildImpulse(ac, auIrSec);
	auSyncMix(cfg);
	if (!auVisBound && typeof document !== 'undefined' && document.addEventListener) {
		auVisBound = true;
		document.addEventListener('visibilitychange', auOnVis);
	}
	return ac;
}

function auSyncMix(cfg) {
	if (!auAc || !auGraph) return;
	const now = auAc.currentTime;
	const patch = auPatch(cfg.variant);
	const vParams = (cfg.params && cfg.params[patch.id]) || {};
	const varRev = Number.isFinite(vParams.reverb) ? vParams.reverb : 0.5;
	auGraph.master.gain.cancelScheduledValues(now);
	auGraph.master.gain.setValueAtTime(auOn && !auHidden() ? cfg.volume : 0, now);
	auGraph.bedBus.gain.setValueAtTime(cfg.mode === 'off' ? 0 : cfg.bedLevel, now);
	auGraph.wetSend.gain.setValueAtTime(0.12 + 0.65 * cfg.reverb * (0.5 + varRev), now);
}

function auScheduleImpulseRebuild(reverbAmt) {
	if (!auAc || !auGraph) return;
	const want = 0.4 + 2.6 * reverbAmt;
	if (Math.abs(want - auIrSec) < 0.05) return;
	if (auIrTimer) clearTimeout(auIrTimer);
	auIrTimer = setTimeout(() => {
		auIrTimer = 0;
		if (!auAc || !auGraph) return;
		auIrSec = want;
		auGraph.convolver.buffer = auBuildImpulse(auAc, want);
	}, 150);
}

// enforces <= 32 simultaneous live voices; steals the oldest with a 30 ms release ramp
function auRegisterVoice(gainNode, endAt, stopNode) {
	if (!auAc) return;
	const now = auAc.currentTime;
	let w = 0;
	for (let i = 0; i < auVoices.length; i++) {
		const v = auVoices[i];
		if (!v.done && v.endAt > now) auVoices[w++] = v;
	}
	auVoices.length = w;
	while (auVoices.length >= AU_MAX_VOICES) {
		const old = auVoices.shift();
		old.done = true;
		const t = Math.max(now, old.startAt || now);
		if (old.gain && old.gain.gain) {
			old.gain.gain.cancelScheduledValues(t);
			old.gain.gain.setValueAtTime(0.05, t);
			old.gain.gain.linearRampToValueAtTime(0.0001, t + AU_STEAL_RAMP);
		}
		if (old.node && old.node.stop) old.node.stop(t + AU_STEAL_RAMP + 0.005);
	}
	const entry = { gain: gainNode, endAt, node: stopNode, startAt: now, done: false };
	if (stopNode) stopNode.onended = () => { entry.done = true; };
	auVoices.push(entry);
}

function auStopWave() {
	if (auSchedTimer) { clearInterval(auSchedTimer); auSchedTimer = 0; }
	if (!auWave) return;
	const w = auWave;
	auWave = null;
	if (w.loopTimer) { clearTimeout(w.loopTimer); w.loopTimer = 0; }
	if (!auAc) return;
	const now = auAc.currentTime;
	w.gain.gain.cancelScheduledValues(now);
	if (now - w.createdAt < 0.005) {
		w.gain.gain.setValueAtTime(0.0001, now);
	} else {
		w.gain.gain.setValueAtTime(Math.max(0.0001, w.gain.gain.value || 1), now);
		w.gain.gain.linearRampToValueAtTime(0.0001, now + AU_WAVE_FADE);
	}
	for (let i = 0; i < w.holds.length; i++) w.holds[i](now);
	w.holds.length = 0;
	setTimeout(() => { if (w.gain.disconnect) w.gain.disconnect(); }, Math.ceil((AU_WAVE_FADE + 0.03) * 1000));
}

function auStopBed(immediate) {
	auBedSig = '';
	if (!auBed) return;
	const old = auBed;
	auBed = null;
	if (!auAc) return;
	const now = auAc.currentTime;
	const fade = immediate ? 0.02 : AU_BED_FADE;
	old.gain.gain.cancelScheduledValues(now);
	old.gain.gain.setValueAtTime(0.2, now);
	old.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
	old.stop(now + fade + 0.03);
}

function auHaltAndSuspend() {
	auClearMove();
	auStopWave();
	auStopBed(true);
	if (!auAc || !auGraph) return;
	auGraph.master.gain.cancelScheduledValues(auAc.currentTime);
	auGraph.master.gain.setValueAtTime(0, auAc.currentTime);
	if (auAc.suspend) auAc.suspend();
}

function auBedSignature(bed, variantId) {
	let s = variantId + ':' + bed.state + ':' + Math.round(bed.tension * 20) + ':' + bed.beat + ':' + bed.rub + ':' + bed.rootMidi + ':';
	for (let i = 0; i < bed.chordN; i++) s += bed.chord[i] + ',';
	return s;
}

function auUpdateBed(score, cfg) {
	if (!auAc || !auGraph || !auOn || cfg.mode === 'off' || auHidden() || !score) return;
	const patch = auPatch(cfg.variant);
	const sig = auBedSignature(score.bed, patch.id);
	if (auBed && sig === auBedSig) return;
	const now = auAc.currentTime;
	if (auBed) {
		const prev = auBed;
		prev.gain.gain.cancelScheduledValues(now);
		prev.gain.gain.setValueAtTime(0.8, now);
		prev.gain.gain.linearRampToValueAtTime(0.0001, now + AU_BED_FADE);
		prev.stop(now + AU_BED_FADE + 0.04);
	}
	const next = patch.bed(auAc, auGraph.bedBus, score.bed, (cfg.params && cfg.params[patch.id]) || {}, now);
	next.gain.gain.setValueAtTime(0.0001, now);
	next.gain.gain.linearRampToValueAtTime(1, now + AU_BED_FADE);
	auBed = next;
	auBedSig = sig;
}

function auNoteTime(wave, depth, cfg) {
	const spd = Math.max(1, wave.speed);
	let t = wave.phaseTime + (depth - wave.phaseDepth) / spd;
	if (wave.patch.id === 'pulse' && (depth & 1)) {
		const vParams = (cfg.params && cfg.params.pulse) || {};
		const swing = Number.isFinite(vParams.swing) ? vParams.swing : 0.2;
		t += (swing * 0.33) / spd;
	}
	return t;
}

function auResolvedParams(patch, cfg) {
	const raw = (cfg.params && cfg.params[patch.id]) || {};
	const out = {};
	for (let i = 0; i < patch.params.length; i++) {
		const d = patch.params[i];
		out[d.key] = d.choices
			? (d.choices.indexOf(raw[d.key]) >= 0 ? raw[d.key] : d.def)
			: (Number.isFinite(raw[d.key]) ? raw[d.key] : d.def);
	}
	return out;
}

function auLaunchWave(score) {
	auStopWave();
	const cfg = auSettings();
	if (!auAc || !auGraph || !auOn || cfg.mode === 'off' || cfg.mode === 'bed' || auHidden() || !score) return;
	const now = auAc.currentTime;
	const wGain = auAc.createGain();
	wGain.gain.setValueAtTime(1, now);
	wGain.connect(score.ghost ? auGraph.ghostFilter : auGraph.waveBus);
	const patch = auPatch(cfg.variant);
	const t0 = now + 0.012;
	const wave = {
		gain: wGain, score, patch, params: auResolvedParams(patch, cfg), createdAt: now,
		speed: Math.max(1, cfg.speed), phaseDepth: 0, phaseTime: t0, cursor: 0,
		rootMidi: score.rootMidi, scale: score.scale, state: {}, holds: [], loopTimer: 0,
		voice: auRegisterVoice, hold(fn) { this.holds.push(fn); }
	};
	auWave = wave;
	const m = auMod('./patches.js');
	(m ? m.paBreath : paBreath)(auAc, wGain, auLastView ? auLastView.emitter : 7, cfg.width, t0, auRegisterVoice);
	auTick();
	if (auWave === wave && wave.cursor < score.n) auSchedTimer = setInterval(auTick, AU_SCHED_MS);
}

function auTick() {
	const w = auWave;
	if (!w || !auAc) return;
	const cfg = auSettings();
	const horizon = auAc.currentTime + AU_LOOKAHEAD;
	while (w.cursor < w.score.n) {
		const note = w.score.notes[w.cursor];
		const when = auNoteTime(w, note.depth, cfg);
		if (when > horizon) break;
		w.patch.note(auAc, w.gain, note, w.params, Math.max(auAc.currentTime, when), w);
		w.cursor++;
	}
	if (w.cursor < w.score.n) return;
	if (auSchedTimer) { clearInterval(auSchedTimer); auSchedTimer = 0; }
	const shouldLoop = cfg.mode === 'loop' || (w.patch.id === 'pulse' && cfg.mode === 'move');
	if (!shouldLoop || w.score.ghost) return;
	const spd = Math.max(1, w.speed);
	const spanSteps = w.patch.id === 'pulse'
		? Math.max(16, Math.ceil((w.score.maxDepth + 1) / 16) * 16)
		: w.score.maxDepth + Math.max(2, spd * 0.45);
	const endTime = w.phaseTime + (spanSteps - w.phaseDepth) / spd;
	const waitMs = Math.max(80, Math.round((endTime - auAc.currentTime) * 1000));
	w.loopTimer = setTimeout(() => {
		if (auWave === w) auLaunchWave(auLastLiveScore || w.score);
	}, waitMs);
}

function auScheduleMoveWave() {
	auClearMove();
	auStopWave();
	const cfg = auSettings();
	if (!auOn || !auAc || cfg.mode === 'off' || cfg.mode === 'bed' || auHidden()) return;
	auMoveTimer = setTimeout(() => {
		auMoveTimer = 0;
		if (!auWasPreview && auLastLiveScore) auLaunchWave(auLastLiveScore);
	}, AU_DEBOUNCE_MS);
}

function auPlayWinFlourish(score) {
	const cfg = auSettings();
	if (!auAc || !auGraph || !auOn || cfg.mode === 'off' || auHidden() || !score) return;
	const m = auMod('./patches.js');
	(m ? m.paWinFlourish : paWinFlourish)(auAc, auGraph.waveBus, score.bed, auAc.currentTime + 0.03, auRegisterVoice);
}

function soundView(v) {
	if (!v) return;
	auEnsureScores();
	auLastView = v;
	const cfg = auSettings();
	if (v.previewing) {
		auPreviewScore = auBuildScore(v, cfg, auScores[2]);
		auWasPreview = true;
		auClearMove();
		if (auOn && auAc && cfg.mode !== 'off' && !auHidden()) {
			auUpdateBed(auPreviewScore, cfg);
			if (cfg.mode !== 'bed') auLaunchWave(auPreviewScore);
		}
		return;
	}
	const endedPreview = auWasPreview;
	auWasPreview = false;
	const slotIdx = auWave && auWave.score === auScores[0] ? 1 : 0;
	const score = auBuildScore(v, cfg, auScores[slotIdx]);
	auLastLiveScore = score;
	const wonNow = !!(v.result && v.result.won);
	const justWon = wonNow && !auWasLiveWon;
	auWasLiveWon = wonNow;
	if (!auOn || !auAc || cfg.mode === 'off' || auHidden()) return;
	if (endedPreview) {
		auStopWave();
		auUpdateBed(score, cfg);
		return;
	}
	auUpdateBed(score, cfg);
	if (justWon) auPlayWinFlourish(score);
	if (v.moved) auScheduleMoveWave();
}

function soundSetOn(nextOn) {
	if (!nextOn) {
		if (!auOn) return false;
		auOn = false;
		auHaltAndSuspend();
		return false;
	}
	const cfg = auSettings();
	const ac = auCreateContext();
	if (!ac) { auOn = true; return true; }
	const wasOn = auOn;
	auOn = true;
	if (auHidden()) return true;
	const resumed = !!(ac.resume && (!wasOn || ac.state === 'suspended'));
	if (resumed) ac.resume();
	if (wasOn && !resumed) return true;
	auSyncMix(cfg);
	const cur = auWasPreview ? auPreviewScore : auLastLiveScore;
	if (!wasOn && cur && cfg.mode !== 'off') {
		auUpdateBed(cur, cfg);
		if (cfg.mode !== 'bed') auLaunchWave(cur);
	}
	return true;
}

function soundRotate(ring, dir, mode) {
	if (!auAc || !auGraph || !auOn || auHidden()) return;
	const m = auMod('./soundfx.js');
	(m ? m.fxRotate : fxRotate)(auAc, auGraph.sfxBus, ring, dir, mode, auSettings().width, auRegisterVoice);
}

function soundEmitter(fromCol, toCol) {
	if (!auAc || !auGraph || !auOn || auHidden()) return;
	const m = auMod('./soundfx.js');
	(m ? m.fxLaser : fxLaser)(auAc, auGraph.sfxBus, fromCol, toCol, auSettings().width, auRegisterVoice);
}

function soundReplay() {
	if (!auOn) soundSetOn(true);
	const cfg = auSettings();
	if (!auAc || !auOn || cfg.mode === 'off' || cfg.mode === 'bed' || auHidden()) return;
	auClearMove();
	const cur = auWasPreview ? auPreviewScore : auLastLiveScore;
	if (cur) auLaunchWave(cur);
}

function soundApplySettings() {
	const cfg = auSettings();
	if (auLastView && !auWasPreview) {
		auEnsureScores();
		const slotIdx = auWave && auWave.score === auScores[0] ? 1 : 0;
		auLastLiveScore = auBuildScore(auLastView, cfg, auScores[slotIdx]);
	}
	if (!auAc || !auGraph) return;
	if (auWave) {
		const now = auAc.currentTime;
		const nextSpeed = Math.max(1, cfg.speed);
		if (nextSpeed !== auWave.speed) {
			auWave.phaseDepth += Math.max(0, now - auWave.phaseTime) * auWave.speed;
			auWave.phaseTime = now;
			auWave.speed = nextSpeed;
		}
	}
	auScheduleImpulseRebuild(cfg.reverb);
	if (!auOn || auHidden()) return auHaltAndSuspend();
	if (auAc.resume && auAc.state === 'suspended') auAc.resume();
	auSyncMix(cfg);
	if (cfg.mode === 'off') { auClearMove(); auStopWave(); auStopBed(true); return; }
	const cur = auWasPreview ? auPreviewScore : auLastLiveScore;
	if (cur) auUpdateBed(cur, cfg);
	if (cfg.mode === 'bed') { auClearMove(); auStopWave(); }
	else if (cfg.mode === 'loop' && !auWave && cur) auLaunchWave(cur);
}

function auOnVis() {
	if (!auAc) return;
	const cfg = auSettings();
	if (auHidden()) return auHaltAndSuspend();
	if (!auOn) return;
	if (auAc.resume) auAc.resume();
	auSyncMix(cfg);
	const cur = auWasPreview ? auPreviewScore : auLastLiveScore;
	if (cur && cfg.mode !== 'off') auUpdateBed(cur, cfg);
}

function soundIsOn() { return auOn; }
function soundContext() { return auAc; }

if (typeof module !== 'undefined') module.exports = {
	AU_SCHED_MS, AU_LOOKAHEAD, AU_DEBOUNCE_MS, AU_MAX_VOICES,
	soundView, soundSetOn, soundIsOn, soundRotate, soundEmitter, soundReplay, soundApplySettings, soundContext
};
