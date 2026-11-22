// owns: continuous branch-following and granular synth variants (Prism Pad, Comet, Crystal Grains)
// edit for: sustained dual-saw portamento, HRTF Doppler spatialization and Hann grain clouds

const PF_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3];
const pfChScratch = [0, 0, 0];
let pfSonifyMod = null;
let pfNoiseCtx = null;
let pfNoiseBuf = null;

function pfChMidi(noteMidi, chIdx, rootMidi, scale) {
	if (!pfSonifyMod && typeof module !== 'undefined' && module.exports) pfSonifyMod = require('./sonify.js');
	return (pfSonifyMod ? pfSonifyMod.sonifyChannelMidi : sonifyChannelMidi)(noteMidi, chIdx, rootMidi, scale);
}

function pfHz(midi) {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

function pfNoise(ac) {
	if (pfNoiseCtx === ac && pfNoiseBuf) return pfNoiseBuf;
	const len = Math.max(4096, Math.floor(ac.sampleRate * 1.5));
	const buf = ac.createBuffer(1, len, ac.sampleRate);
	const data = buf.getChannelData(0);
	let s = 0x2468ace1;
	for (let i = 0; i < len; i++) {
		s = (Math.imul(s, 1664525) + 1013904223) | 0;
		data[i] = s / 0x80000000;
	}
	pfNoiseCtx = ac;
	pfNoiseBuf = buf;
	return buf;
}

function pfPanner(ac, dest, pan, panTo, when, dur) {
	if (!ac.createStereoPanner) return dest;
	const p = ac.createStereoPanner();
	p.pan.setValueAtTime(pan, when);
	if (panTo !== pan) p.pan.linearRampToValueAtTime(panTo, when + Math.max(0.02, dur));
	p.connect(dest);
	return p;
}

function pfActiveChannels(ch, out) {
	let k = 0;
	for (let c = 0; c < 3; c++) if ((ch >> c) & 1) out[k++] = c;
	if (!k) out[k++] = 0;
	return k;
}

// Prism Pad: up to 6 per-branch sustained dual-saw voices with portamento, filter bloom and split divergence
function pfPrismSpawn(ac, bus, wave, p, brId, hz, pan, when) {
	const st = wave.state;
	if (st.prismCount >= 6) return null;
	st.prismCount++;
	const flt = ac.createBiquadFilter();
	flt.type = 'lowpass';
	flt.frequency.setValueAtTime(p.cutoff, when);
	flt.Q.setValueAtTime(p.reso, when);
	const panNode = ac.createStereoPanner ? ac.createStereoPanner() : null;
	if (panNode) panNode.pan.setValueAtTime(pan, when);
	const vGain = ac.createGain();
	vGain.gain.setValueAtTime(0.0001, when);
	vGain.gain.linearRampToValueAtTime(0.11, when + 0.045);
	const oscL = ac.createOscillator();
	const oscR = ac.createOscillator();
	oscL.type = 'sawtooth';
	oscR.type = 'sawtooth';
	oscL.frequency.setValueAtTime(hz, when);
	oscR.frequency.setValueAtTime(hz, when);
	oscL.detune.setValueAtTime(-p.detune, when);
	oscR.detune.setValueAtTime(p.detune, when);
	const drift = ac.createOscillator();
	const driftG = ac.createGain();
	drift.frequency.setValueAtTime(0.35 + (brId % 3) * 0.08, when);
	driftG.gain.setValueAtTime(4, when);
	drift.connect(driftG);
	driftG.connect(oscL.detune);
	driftG.connect(oscR.detune);
	oscL.connect(pfPanner(ac, flt, -0.65, -0.65, when, 0.1));
	oscR.connect(pfPanner(ac, flt, 0.65, 0.65, when, 0.1));
	flt.connect(panNode || vGain);
	if (panNode) panNode.connect(vGain);
	vGain.connect(bus);
	oscL.start(when);
	oscR.start(when);
	drift.start(when);
	const voice = { oscL, oscR, drift, flt, panNode, vGain, curHz: hz, curPan: pan, ended: false };
	st.prism[brId] = voice;
	wave.hold(stopAt => {
		if (voice.ended) return;
		voice.ended = true;
		vGain.gain.cancelScheduledValues(stopAt);
		vGain.gain.setValueAtTime(0.05, stopAt);
		vGain.gain.linearRampToValueAtTime(0.0001, stopAt + 0.06);
		oscL.stop(stopAt + 0.08);
		oscR.stop(stopAt + 0.08);
		drift.stop(stopAt + 0.08);
	});
	return voice;
}

function pfPrismNote(ac, bus, n, p, when, wave) {
	const st = wave.state;
	if (!st.prism) { st.prism = {}; st.prismCount = 0; }
	const hz = pfHz(n.midi);
	const v = st.prism[n.branch] || pfPrismSpawn(ac, bus, wave, p, n.branch, hz, n.pan, when);
	if (!v || v.ended) return;
	const gDur = Math.max(0.02, p.glide);
	v.oscL.frequency.cancelScheduledValues(when);
	v.oscR.frequency.cancelScheduledValues(when);
	v.oscL.frequency.setValueAtTime(v.curHz, when);
	v.oscR.frequency.setValueAtTime(v.curHz, when);
	v.oscL.frequency.exponentialRampToValueAtTime(hz, when + gDur);
	v.oscR.frequency.exponentialRampToValueAtTime(hz, when + gDur);
	v.curHz = hz;
	if (v.panNode) {
		v.panNode.pan.cancelScheduledValues(when);
		v.panNode.pan.setValueAtTime(v.curPan, when);
		v.panNode.pan.linearRampToValueAtTime(n.panTo, when + gDur);
		v.curPan = n.panTo;
	}
	const baseCut = Math.max(220, p.cutoff * (0.45 + 0.75 * n.bright));
	v.flt.frequency.cancelScheduledValues(when);
	if (n.kind === 2 || n.kind === 3) {
		v.flt.frequency.setValueAtTime(Math.min(7000, baseCut * 2.3), when);
		v.flt.frequency.exponentialRampToValueAtTime(baseCut, when + 0.26);
	} else {
		v.flt.frequency.setValueAtTime(baseCut, when);
		v.flt.frequency.linearRampToValueAtTime(baseCut, when + gDur);
	}
	if (n.kind === 3 && n.fork > 0 && !st.prism[n.fork]) {
		const forkMidi = pfChMidi(n.midi, (n.ch & 4) ? 2 : 1, wave.rootMidi, wave.scale);
		pfPrismSpawn(ac, bus, wave, p, n.fork, pfHz(forkMidi), n.panTo, when);
	}
	if (n.kind === 4) {
		v.ended = true;
		v.vGain.gain.setValueAtTime(0.11 * n.vel, when);
		v.vGain.gain.linearRampToValueAtTime(0.07 * n.vel, when + 0.35);
		v.vGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.85);
		v.oscL.stop(when + 0.9);
		v.oscR.stop(when + 0.9);
		v.drift.stop(when + 0.9);
	}
}

// Comet: per-branch HRTF 3D whoosh with radial Doppler shift + speed-synced ping-pong delay
function pfCometDelay(ac, bus, wave, p, when) {
	if (wave.state.cometSend) return wave.state.cometSend;
	const stepSec = Math.max(0.06, Math.min(0.42, 0.75 / Math.max(1, wave.speed)));
	const send = ac.createGain();
	const dL = ac.createDelay(1.0);
	const dR = ac.createDelay(1.0);
	const fbL = ac.createGain();
	const fbR = ac.createGain();
	const damp = ac.createBiquadFilter();
	damp.type = 'lowpass';
	damp.frequency.setValueAtTime(2400, when);
	dL.delayTime.setValueAtTime(stepSec, when);
	dR.delayTime.setValueAtTime(stepSec * 1.33, when);
	fbL.gain.setValueAtTime(p.feedback, when);
	fbR.gain.setValueAtTime(p.feedback, when);
	send.connect(damp);
	damp.connect(dL);
	dL.connect(pfPanner(ac, bus, -0.7, -0.7, when, 0.05));
	dL.connect(fbL);
	fbL.connect(dR);
	dR.connect(pfPanner(ac, bus, 0.7, 0.7, when, 0.05));
	dR.connect(fbR);
	fbR.connect(dL);
	wave.state.cometSend = send;
	return send;
}

function pfSetPos(panner, x, z, when) {
	if (panner.positionX && panner.positionX.linearRampToValueAtTime) {
		panner.positionX.linearRampToValueAtTime(x, when);
		panner.positionZ.linearRampToValueAtTime(z, when);
	} else if (panner.setPosition) {
		panner.setPosition(x, 0, z);
	}
}

function pfCometSpawn(ac, bus, wave, p, brId, hz, x, z, when) {
	const st = wave.state;
	if (st.cometCount >= 6) return null;
	st.cometCount++;
	const panner = ac.createPanner ? ac.createPanner() : null;
	if (panner) {
		panner.panningModel = 'HRTF';
		panner.distanceModel = 'inverse';
		panner.refDistance = 1.5;
		panner.rolloffFactor = 0.8;
		if (panner.positionX) {
			panner.positionX.setValueAtTime(x, when);
			panner.positionY.setValueAtTime(0, when);
			panner.positionZ.setValueAtTime(z, when);
		} else if (panner.setPosition) {
			panner.setPosition(x, 0, z);
		}
	}
	const vGain = ac.createGain();
	vGain.gain.setValueAtTime(0.0001, when);
	vGain.gain.linearRampToValueAtTime(0.14, when + 0.04);
	const osc = ac.createOscillator();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(hz, when);
	const nSrc = ac.createBufferSource();
	nSrc.buffer = pfNoise(ac);
	nSrc.loop = true;
	const bp = ac.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.setValueAtTime(1100, when);
	bp.Q.setValueAtTime(2.2, when);
	const airG = ac.createGain();
	airG.gain.setValueAtTime(0.18 * p.air, when);
	nSrc.connect(bp);
	bp.connect(airG);
	const target = panner || vGain;
	osc.connect(target);
	airG.connect(target);
	if (panner) panner.connect(vGain);
	vGain.connect(bus);
	osc.start(when);
	nSrc.start(when);
	const voice = { osc, nSrc, bp, panner, vGain, curHz: hz, ended: false };
	st.comet[brId] = voice;
	wave.hold(stopAt => {
		if (voice.ended) return;
		voice.ended = true;
		vGain.gain.cancelScheduledValues(stopAt);
		vGain.gain.setValueAtTime(0.05, stopAt);
		vGain.gain.linearRampToValueAtTime(0.0001, stopAt + 0.06);
		osc.stop(stopAt + 0.08);
		nSrc.stop(stopAt + 0.08);
	});
	return voice;
}

function pfCometNote(ac, bus, n, p, when, wave) {
	const st = wave.state;
	if (!st.comet) { st.comet = {}; st.cometCount = 0; }
	const row = (n.cell / 15) | 0;
	const col = n.cell - row * 15;
	const x = (col - 7) * 0.45;
	const z = -Math.max(0.4, (14 - row) * 0.38);
	const radial = n.dirOut === 2 ? 1 : (n.dirOut === 0 ? -0.7 : 0);
	const doppler = Math.pow(2, (radial * p.doppler * 1.8) / 12);
	const hz = pfHz(n.midi) * doppler;
	const v = st.comet[n.branch] || pfCometSpawn(ac, bus, wave, p, n.branch, hz, x, z, when);
	if (v && !v.ended) {
		const dt = Math.max(0.04, 0.8 / Math.max(1, wave.speed));
		const nextHz = Math.max(30, hz);
		v.osc.frequency.cancelScheduledValues(when);
		v.osc.frequency.setValueAtTime(v.curHz, when);
		v.osc.frequency.exponentialRampToValueAtTime(nextHz, when + dt);
		v.curHz = nextHz;
		v.bp.frequency.cancelScheduledValues(when);
		v.bp.frequency.setValueAtTime(700 + 1800 * n.bright, when + dt);
		if (v.panner) pfSetPos(v.panner, x, z, when + dt);
	}
	if (n.kind === 3 && n.fork > 0 && !st.comet[n.fork]) {
		const fHz = pfHz(pfChMidi(n.midi, (n.ch & 4) ? 2 : 1, wave.rootMidi, wave.scale)) * doppler;
		pfCometSpawn(ac, bus, wave, p, n.fork, fHz, x, z, when);
	}
	if (n.kind >= 2) {
		const send = pfCometDelay(ac, bus, wave, p, when);
		const ping = ac.createOscillator();
		const pg = ac.createGain();
		ping.type = 'triangle';
		ping.frequency.setValueAtTime(hz * (n.turn > 0 ? 2 : (n.turn < 0 ? 1.5 : 1)), when);
		const dur = n.kind === 4 ? 0.45 : 0.14;
		pg.gain.setValueAtTime(0.2 * n.vel, when);
		pg.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		ping.connect(pg);
		pg.connect(pfPanner(ac, bus, n.pan, n.panTo, when, dur));
		pg.connect(send);
		ping.start(when);
		ping.stop(when + dur + 0.02);
		wave.voice(pg, when + dur + 0.02, ping);
	}
	if (n.kind === 4 && v && !v.ended) {
		v.ended = true;
		v.vGain.gain.setValueAtTime(0.12 * n.vel, when);
		v.vGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
		v.osc.stop(when + 0.38);
		v.nSrc.stop(when + 0.38);
	}
}

// Crystal Grains: cloud of 8-24 windowed sine grains on channel chord tones into a damped feedback delay
function pfGrainDelay(ac, bus, wave, p, when) {
	if (wave.state.grainBus) return wave.state.grainBus;
	const inG = ac.createGain();
	const dly = ac.createDelay(1.0);
	const lp = ac.createBiquadFilter();
	const fb = ac.createGain();
	dly.delayTime.setValueAtTime(0.23, when);
	lp.type = 'lowpass';
	lp.frequency.setValueAtTime(2200, when);
	fb.gain.setValueAtTime(p.feedback, when);
	inG.connect(bus);
	inG.connect(dly);
	dly.connect(lp);
	lp.connect(bus);
	lp.connect(fb);
	fb.connect(dly);
	wave.state.grainBus = inG;
	return inG;
}

function pfGrainsNote(ac, bus, n, p, when, wave) {
	const chN = pfActiveChannels(n.ch, pfChScratch);
	const count = Math.max(8, Math.min(24, Math.round((8 + 5 * PF_POPCOUNT[n.ch]) * p.density)));
	const gSize = Math.max(0.02, Math.min(0.06, p.size));
	const spread = p.scatter * (1 + Math.min(2, n.bounce * 0.25));
	const dest = pfGrainDelay(ac, bus, wave, p, when);
	const cloudG = ac.createGain();
	cloudG.gain.setValueAtTime(1, when);
	cloudG.connect(pfPanner(ac, dest, n.pan, n.panTo, when, spread + gSize));
	const amp = (0.16 * n.vel) / Math.sqrt(count);
	let lastEnd = when + gSize;
	let lastOsc = null;
	let seed = (n.cell * 2654435761 + n.depth * 40503 + 1) >>> 0;
	for (let i = 0; i < count; i++) {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		const t0 = when + (seed / 4294967296) * spread;
		const midi = pfChMidi(n.midi, pfChScratch[i % chN], wave.rootMidi, wave.scale) + (n.bright > 0.65 && (i & 3) === 0 ? 12 : 0);
		const osc = ac.createOscillator();
		const env = ac.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(pfHz(Math.min(96, midi)), t0);
		env.gain.setValueAtTime(0.0001, t0);
		env.gain.linearRampToValueAtTime(amp, t0 + gSize * 0.5);
		env.gain.linearRampToValueAtTime(0.0001, t0 + gSize);
		osc.connect(env);
		env.connect(cloudG);
		osc.start(t0);
		osc.stop(t0 + gSize + 0.005);
		if (t0 + gSize > lastEnd) { lastEnd = t0 + gSize; lastOsc = osc; }
	}
	wave.voice(cloudG, lastEnd + 0.01, lastOsc);
}

if (typeof module !== 'undefined') module.exports = {
	pfPrismNote,
	pfCometNote,
	pfGrainsNote
};
