// owns: Spectrum Drift variant — per-channel noise bands, subtractive color splits, direction-driven pan
// edit for: band crossovers, aim modes, drift and tilt rules

const PS_MAX_VOICES = 6;
const PS_VOICE_OUT = 0.13;
const PS_TURN_STEP = 2.2;
const PS_TILT_CENTS = 120;
// absolute aim: outgoing dir (0 up, 1 right, 2 down, 3 left) -> pan target; drift finishes the last bit
const PS_ABS_PAN = [0, 0.9, 0, -0.9];
const PS_BANDS = [
	{ type: 'lowpass', f: 220, q: 0.7, gain: 1.0 },
	{ type: 'bandpass', f: 800, q: 0.9, gain: 0.9 },
	{ type: 'highpass', f: 2400, q: 0.7, gain: 0.8 }
];

let psNoiseCtx = null;
let psNoiseBuf = null;

function psNoise(ac) {
	if (psNoiseCtx === ac && psNoiseBuf) return psNoiseBuf;
	const len = Math.max(4096, Math.floor(ac.sampleRate * 1.5));
	const buf = ac.createBuffer(1, len, ac.sampleRate);
	const data = buf.getChannelData(0);
	let s = 0x7e5a1b33;
	for (let i = 0; i < len; i++) {
		s = (Math.imul(s, 1664525) + 1013904223) | 0;
		data[i] = s / 0x80000000;
	}
	psNoiseCtx = ac;
	psNoiseBuf = buf;
	return buf;
}

function psClamp1(v) {
	return v < -1 ? -1 : (v > 1 ? 1 : v);
}

function psPanner(ac, dest, pan, when) {
	if (!ac.createStereoPanner) return null;
	const p = ac.createStereoPanner();
	p.pan.setValueAtTime(pan, when);
	p.connect(dest);
	return p;
}

function psSpawn(ac, bus, wave, n, when) {
	const st = wave.state;
	if (st.count >= PS_MAX_VOICES) return null;
	st.count++;
	const src = ac.createBufferSource();
	src.buffer = psNoise(ac);
	src.loop = true;
	const out = ac.createGain();
	out.gain.setValueAtTime(0.0001, when);
	out.gain.linearRampToValueAtTime(PS_VOICE_OUT, when + 0.05);
	out.connect(bus);
	const bands = [];
	for (let c = 0; c < 3; c++) {
		const base = PS_BANDS[c];
		const flt = ac.createBiquadFilter();
		flt.type = base.type;
		flt.frequency.setValueAtTime(base.f, when);
		flt.Q.setValueAtTime(base.q, when);
		const g = ac.createGain();
		g.gain.setValueAtTime(0.0001, when);
		src.connect(flt);
		flt.connect(g);
		const pan = psPanner(ac, out, 0, when);
		g.connect(pan || out);
		bands.push({ g, flt, dest: pan || out, pan, on: false, dir: (n.dirOut + n.turn) & 3, panCur: 0, fCur: base.f, gain: base.gain, f: base.f });
	}
	src.start(when);
	const voice = { src, out, bands, alive: true };
	st.list.push(voice);
	st.byBranch[n.branch] = voice;
	wave.hold(stopAt => {
		if (voice.alive) psKillVoice(voice, stopAt, 0.05);
	});
	return voice;
}

// reflect bands turn toward the outgoing dir; straight events drift a step toward the direction
// extreme, so an unobstructed beam ends pinned at the full side while up/down homes to center
function psBandAim(band, p, isRef, turn, dirOut, when) {
	const glide = Math.max(0.02, p.glide);
	let panT;
	if (isRef) {
		band.dir = dirOut;
		panT = p.aim === 'relative' ? psClamp1(band.panCur - turn * PS_TURN_STEP * p.drift) : PS_ABS_PAN[dirOut];
	} else if (band.dir === 3) {
		panT = Math.max(-1, band.panCur - p.drift);
	} else if (band.dir === 1) {
		panT = Math.min(1, band.panCur + p.drift);
	} else {
		panT = band.panCur * (1 - p.drift);
	}
	if (band.pan) {
		band.pan.pan.cancelScheduledValues(when);
		band.pan.pan.setValueAtTime(band.panCur, when);
		band.pan.pan.linearRampToValueAtTime(panT, when + glide);
	}
	band.panCur = panT;
	const cents = band.dir === 0 ? -PS_TILT_CENTS * p.tilt : (band.dir === 2 ? PS_TILT_CENTS * p.tilt : 0);
	const fT = band.f * Math.pow(2, cents / 1200);
	band.flt.frequency.cancelScheduledValues(when);
	band.flt.frequency.setValueAtTime(band.fCur, when);
	band.flt.frequency.linearRampToValueAtTime(fT, when + glide);
	band.fCur = fT;
}

function psBandOn(band, when) {
	band.on = true;
	band.g.gain.cancelScheduledValues(when);
	band.g.gain.setValueAtTime(0.0001, when);
	band.g.gain.linearRampToValueAtTime(band.gain, when + 0.05);
}

// landing: band fades out and a soft ping at its (tilted) center sounds from its pan
function psBandLand(ac, wave, band, vel, when) {
	band.on = false;
	band.g.gain.cancelScheduledValues(when);
	band.g.gain.setValueAtTime(Math.max(0.0002, band.gain), when);
	band.g.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
	const dur = 0.5;
	const osc = ac.createOscillator();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(band.fCur, when);
	const g = ac.createGain();
	g.gain.setValueAtTime(0.0001, when);
	g.gain.linearRampToValueAtTime(0.09 * vel, when + 0.015);
	g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
	osc.connect(g);
	g.connect(band.dest);
	osc.start(when);
	osc.stop(when + dur + 0.02);
	wave.voice(g, when + dur + 0.02, osc);
}

function psKillVoice(voice, when, fade) {
	voice.out.gain.cancelScheduledValues(when);
	voice.out.gain.setValueAtTime(Math.max(0.0002, 0.7 * PS_VOICE_OUT), when);
	voice.out.gain.linearRampToValueAtTime(0.0001, when + fade);
	voice.src.stop(when + fade + 0.02);
}

function psReleaseVoice(st, voice, when) {
	if (!voice.alive) return;
	voice.alive = false;
	st.count--;
	psKillVoice(voice, when, 0.4);
}

function psNote(ac, bus, n, p, when, wave) {
	const st = wave.state;
	if (!st.byBranch) {
		st.byBranch = new Array(128).fill(null);
		st.list = [];
		st.count = 0;
	}
	let v = st.byBranch[n.branch];
	if (!v || !v.alive) {
		v = psSpawn(ac, bus, wave, n, when);
		if (!v) return;
	}
	// a fork aliases the parent voice: its bands redirect inside the shared noise source
	if (n.kind === 3 && n.fork > 0) st.byBranch[n.fork] = v;
	for (let c = 0; c < 3; c++) {
		if (!((n.ch >> c) & 1)) continue;
		const band = v.bands[c];
		if (n.kind === 4) {
			if (band.on) psBandLand(ac, wave, band, n.vel, when);
		} else {
			if (!band.on) psBandOn(band, when);
			if ((n.ref >> c) & 1) psBandAim(band, p, true, n.turn, n.dirOut, when);
			else if (n.kind !== 3) psBandAim(band, p, false, n.turn, n.dirOut, when);
		}
	}
	if (n.kind === 4 && !v.bands[0].on && !v.bands[1].on && !v.bands[2].on) psReleaseVoice(st, v, when);
}

if (typeof module !== 'undefined') module.exports = { psNote };
