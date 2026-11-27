// owns: natural movement foley from noise-excited wood/stone resonances
// edit for: friction texture, irregular slot knocks, ring weight and rail settling

const FN_SLOTS = [6, 4, 2, 1];
const FN_MODES = [1, 2.31, 3.87];
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

function fxNaturalMove(ac, bus, ring, dir, mode, width, fromCol, toCol, registerVoice) {
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
	const dur = stop ? 0.055 : (rail ? 0.15 + slots * 0.022 : 0.18 + slots * 0.035) * (0.85 + vel * 0.15);
	const hz = rail ? 250 : 145 + r * 62;
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
	const buffer = fnBuffer(ac);
	const source = fnContact(ac, out, buffer, when, dur, hz * 1.2, 0.65, (stop ? 0.035 : 0.24) * vel);
	// Keep the registered source alive through the landing tail for the shared voice cap.
	source.stop(when + dur + 0.13);
	if (!stop) {
		// Uneven overlapping brushes avoid the regular flutter that reads as an electronic LFO.
		for (let i = 0; i < 4; i++) {
			const t = when + dur * (0.05 + i * 0.17 + fnRandom() * 0.045);
			fnContact(ac, out, buffer, t, dur * 0.28, 650 + fnRandom() * 650, 0.8, (0.05 + fnRandom() * 0.055) * vel);
		}
		for (let i = 0; i < slots; i++) {
			const t = when + dur * (0.16 + 0.64 * (i + fnRandom() * 0.18) / Math.max(1, slots));
			fnKnock(ac, out, buffer, t, hz, (0.16 + fnRandom() * 0.06) * vel, false);
		}
	}
	fnKnock(ac, out, buffer, when + dur * 0.88, hz * 0.82, (stop ? 0.16 : 0.3) * vel, true);
	registerVoice(out, when + dur + 0.13, source);
}

if (typeof module !== 'undefined') module.exports = { fxNaturalMove };
