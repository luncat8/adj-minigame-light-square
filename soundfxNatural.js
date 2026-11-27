// owns: noise-excited movement foley — noise2 material contacts and the noise1 felt glide
// edit for: friction texture, slot knocks, glide timbre, ring weight and rail settling

const FN_SLOTS = [6, 4, 2, 1];
const FN_MODES = [1, 2.31, 3.87];
// per-variant timing and material pitch; single steps shrink ring moves by `single`
const FN_MOVE = [
	{ stop: 0.055, railBase: 0.15, railStep: 0.022, ringBase: 0.18, ringStep: 0.035, single: 1, hzBase: 145, hzStep: 62, railHz: 250 },
	{ stop: 0.06, railBase: 0.16, railStep: 0.02, ringBase: 0.2, ringStep: 0.038, single: 0.55, hzBase: 120, hzStep: 55, railHz: 300 }
];
let fnContext = null;
let fnNoise = null;
let fnSeed = 0x71b4a93d;
let fnLastRing = -1;
let fnLastRail = -1;

function fnRandom() {
	fnSeed = (Math.imul(fnSeed, 1664525) + 1013904223) >>> 0;
	return fnSeed / 4294967296;
}

function fnBuffer(ac) {
	if (fnContext === ac) return fnNoise;
	fnContext = ac;
	fnNoise = ac.createBuffer(1, Math.ceil(ac.sampleRate), ac.sampleRate);
	const data = fnNoise.getChannelData(0);
	let low = 0;
	for (let i = 0; i < data.length; i++) {
		const white = fnRandom() * 2 - 1;
		low += 0.12 * (white - low);
		data[i] = low * 1.8 + white * 0.18;
	}
	return fnNoise;
}

// Short noise excitation through fixed, inharmonic modes: no pitched oscillators or synth sweeps.
function fnContact(ac, dest, buffer, when, dur, hz, q, peak) {
	const src = ac.createBufferSource();
	src.buffer = buffer;
	src.loop = true;
	const filter = ac.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.setValueAtTime(hz, when);
	filter.Q.setValueAtTime(q, when);
	const env = ac.createGain();
	env.gain.setValueAtTime(0.0001, when);
	env.gain.linearRampToValueAtTime(peak, when + Math.min(0.006, dur * 0.15));
	env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
	src.connect(env);
	env.connect(filter);
	filter.connect(dest);
	const end = when + dur + 0.035;
	src.start(when, fnRandom() * 0.5);
	src.stop(end);
	return src;
}

function fnKnock(ac, dest, buffer, when, hz, strength, landing) {
	const color = 0.94 + fnRandom() * 0.12;
	for (let i = 0; i < FN_MODES.length; i++) {
		fnContact(ac, dest, buffer, when, (landing ? 0.065 : 0.034) / (1 + i * 0.5),
			hz * FN_MODES[i] * color, 3.5 + i, strength / (1 + i * 1.7));
	}
}

// shared movement prologue: velocity from move spacing, ring-mass timing/pitch, stereo pan rail
function fnShell(ac, bus, ring, dir, mode, width, fromCol, toCol, variant) {
	const t = FN_MOVE[variant];
	const rail = ring < 0;
	const r = Math.max(0, Math.min(3, ring));
	const stop = rail && fromCol === toCol;
	const slots = rail ? Math.min(12, Math.abs(toCol - fromCol)) : (mode === 0 ? FN_SLOTS[r] : 1);
	const when = ac.currentTime + 0.003;
	const last = rail ? fnLastRail : fnLastRing;
	const dt = last < 0 ? 1 : when - last;
	if (rail) fnLastRail = when;
	else fnLastRing = when;
	const vel = dt < 0.04 ? 0.52 : (dt < 0.085 ? 0.75 : 1);
	const dur = stop ? t.stop : ((rail ? t.railBase + slots * t.railStep
		: (t.ringBase + slots * t.ringStep) * (mode === 0 ? 1 : t.single)) * (0.85 + vel * 0.15));
	const hz = rail ? t.railHz : t.hzBase + r * t.hzStep;
	const w = Number.isFinite(width) ? Math.max(0, Math.min(1, width)) : 0.85;
	const span = (0.21 - r * 0.07) * (dir < 0 ? -1 : 1) * w;
	const out = ac.createGain();
	out.gain.setValueAtTime(1, when);
	if (ac.createStereoPanner) {
		const pan = ac.createStereoPanner();
		pan.pan.setValueAtTime(rail ? Math.max(-1, Math.min(1, (fromCol - 7) / 6)) * w : -span, when);
		pan.pan.linearRampToValueAtTime(rail ? Math.max(-1, Math.min(1, (toCol - 7) / 6)) * w : span, when + dur);
		out.connect(pan);
		pan.connect(bus);
	} else out.connect(bus);
	return { buffer: fnBuffer(ac), hz, out, slots, stop, dur, vel, when, rail };
}

function fxNaturalMove(ac, bus, ring, dir, mode, width, fromCol, toCol, registerVoice) {
	const s = fnShell(ac, bus, ring, dir, mode, width, fromCol, toCol, 0);
	const source = fnContact(ac, s.out, s.buffer, s.when, s.dur, s.hz * 1.2, 0.65, (s.stop ? 0.035 : 0.24) * s.vel);
	// Keep the registered source alive through the landing tail for the shared voice cap.
	source.stop(s.when + s.dur + 0.13);
	if (!s.stop) {
		// Uneven overlapping brushes avoid the regular flutter that reads as an electronic LFO.
		for (let i = 0; i < 4; i++) {
			const t = s.when + s.dur * (0.05 + i * 0.17 + fnRandom() * 0.045);
			fnContact(ac, s.out, s.buffer, t, s.dur * 0.28, 650 + fnRandom() * 650, 0.8, (0.05 + fnRandom() * 0.055) * s.vel);
		}
		for (let i = 0; i < s.slots; i++) {
			const t = s.when + s.dur * (0.16 + 0.64 * (i + fnRandom() * 0.18) / Math.max(1, s.slots));
			fnKnock(ac, s.out, s.buffer, t, s.hz, (0.16 + fnRandom() * 0.06) * s.vel, false);
		}
	}
	fnKnock(ac, s.out, s.buffer, s.when + s.dur * 0.88, s.hz * 0.82, (s.stop ? 0.16 : 0.3) * s.vel, true);
	registerVoice(s.out, s.when + s.dur + 0.13, source);
}

// swept noise band: the continuous glide core of the noise1 movement
function fnSweep(ac, dest, buffer, when, dur, hz0, hz1, q, peak) {
	const src = ac.createBufferSource();
	src.buffer = buffer;
	src.loop = true;
	const filter = ac.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.setValueAtTime(hz0, when);
	filter.frequency.exponentialRampToValueAtTime(Math.max(30, hz1), when + dur);
	filter.Q.setValueAtTime(q, when);
	const env = ac.createGain();
	env.gain.setValueAtTime(0.0001, when);
	env.gain.linearRampToValueAtTime(peak, when + dur * 0.3);
	env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
	src.connect(env);
	env.connect(filter);
	filter.connect(dest);
	src.start(when, fnRandom() * 0.5);
	src.stop(when + dur + 0.03);
	return src;
}

// noise1: one continuous felt glide per move — direction-swept band, dark mass, sparse air, soft settle
function fxFlowMove(ac, bus, ring, dir, mode, width, fromCol, toCol, registerVoice) {
	const s = fnShell(ac, bus, ring, dir, mode, width, fromCol, toCol, 1);
	const u0 = Math.max(0, Math.min(1, (fromCol - 1) / 12));
	const u1 = Math.max(0, Math.min(1, (toCol - 1) / 12));
	const glide = fnSweep(ac, s.out, s.buffer, s.when, s.dur,
		s.rail ? 340 + 320 * u0 : s.hz * (dir < 0 ? 1.3 : 0.8),
		s.rail ? 340 + 320 * u1 : s.hz * (dir < 0 ? 0.8 : 1.25),
		1.4, (s.stop ? 0.05 : 0.26) * s.vel);
	fnSweep(ac, s.out, s.buffer, s.when, s.dur, s.hz * 0.55, s.hz * 0.42, 0.9, (s.stop ? 0.04 : 0.18) * s.vel);
	if (!s.stop) {
		for (let i = 0; i < 3; i++) {
			const t = s.when + s.dur * (0.12 + i * 0.26 + fnRandom() * 0.08);
			fnContact(ac, s.out, s.buffer, t, 0.05, 1500 + fnRandom() * 900, 2.2, (0.03 + fnRandom() * 0.03) * s.vel);
		}
	}
	fnContact(ac, s.out, s.buffer, s.when + s.dur * 0.92, Math.min(0.11, s.dur * 0.45), s.hz * 0.7, 1.1, (s.stop ? 0.12 : 0.22) * s.vel);
	registerVoice(s.out, s.when + s.dur + 0.13, glide);
}

if (typeof module !== 'undefined') module.exports = { fxNaturalMove, fxFlowMove };
