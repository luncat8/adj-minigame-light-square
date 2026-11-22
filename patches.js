// owns: synth variant table, param schemas, struck/groove variants (Glass Harp, Pulse) and harmonic bed
// edit for: variant registry, Glass Harp / Pulse timbres and sustained bed synthesis

const paChScratch = [0, 0, 0];
let paSonifyMod = null;
let paFlowMod = null;
let paNoiseCtx = null;
let paNoiseBuf = null;

function paChMidi(noteMidi, chIdx, rootMidi, scale) {
	if (!paSonifyMod && typeof module !== 'undefined' && module.exports) paSonifyMod = require('./sonify.js');
	return (paSonifyMod ? paSonifyMod.sonifyChannelMidi : sonifyChannelMidi)(noteMidi, chIdx, rootMidi, scale);
}

function paFlow() {
	if (!paFlowMod && typeof module !== 'undefined' && module.exports) paFlowMod = require('./patchesFlow.js');
	return paFlowMod;
}

function paHz(midi) {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

function paNoise(ac) {
	if (paNoiseCtx === ac && paNoiseBuf) return paNoiseBuf;
	const len = Math.max(4096, Math.floor(ac.sampleRate * 1.5));
	const buf = ac.createBuffer(1, len, ac.sampleRate);
	const data = buf.getChannelData(0);
	let s = 0x12345678;
	for (let i = 0; i < len; i++) {
		s = (Math.imul(s, 1664525) + 1013904223) | 0;
		data[i] = s / 0x80000000;
	}
	paNoiseCtx = ac;
	paNoiseBuf = buf;
	return buf;
}

function paPanner(ac, dest, pan, panTo, when, dur) {
	if (!ac.createStereoPanner) return dest;
	const p = ac.createStereoPanner();
	p.pan.setValueAtTime(pan, when);
	if (panTo !== pan) p.pan.linearRampToValueAtTime(panTo, when + Math.max(0.02, dur));
	p.connect(dest);
	return p;
}

function paDirCents(n) {
	if (n.kind === 4 && n.bright <= 0.01) return -220;
	if (n.dirOut === 0) return 22;
	if (n.dirOut === 2) return -28;
	return n.turn * 12;
}

function paApplyGlide(osc, baseHz, n, when, dur) {
	osc.frequency.setValueAtTime(baseHz, when);
	const cents = paDirCents(n);
	if (cents) osc.frequency.exponentialRampToValueAtTime(Math.max(20, baseHz * Math.pow(2, cents / 1200)), when + Math.max(0.03, dur));
}

function paStatusTint(ac, out, baseHz, n, when, dur) {
	if (n.status !== 1 && n.status !== 2) return;
	const osc = ac.createOscillator();
	const g = ac.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(n.status === 2 ? baseHz * 2 : baseHz * Math.pow(2, 70 / 1200), when);
	g.gain.setValueAtTime(0.0001, when);
	g.gain.linearRampToValueAtTime((n.status === 2 ? 0.08 : 0.06) * n.vel, when + 0.015);
	g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
	osc.connect(g);
	g.connect(out);
	osc.start(when);
	osc.stop(when + dur + 0.02);
}

function paActiveChannels(ch, out) {
	let k = 0;
	for (let c = 0; c < 3; c++) if ((ch >> c) & 1) out[k++] = c;
	if (!k) out[k++] = 0;
	return k;
}

// Glass Harp: 2-op FM bell on reflects, vibrato sine hum on filter pass, band-pass noise tick on clear glass, chord bell on absorb
function paGlassNote(ac, bus, n, p, when, wave) {
	const root = wave.rootMidi;
	const scale = wave.scale;
	if (n.kind === 0) {
		if (p.tick <= 0) return;
		const dur = 0.022;
		const src = ac.createBufferSource();
		src.buffer = paNoise(ac);
		const bp = ac.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.setValueAtTime(1600 + 2400 * n.bright * p.bright, when);
		bp.Q.setValueAtTime(6, when);
		const g = ac.createGain();
		g.gain.setValueAtTime(Math.max(0.0002, 0.22 * n.vel * p.tick), when);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		src.connect(bp);
		bp.connect(g);
		g.connect(paPanner(ac, bus, n.pan, n.panTo, when, dur));
		src.start(when);
		src.stop(when + dur + 0.01);
		wave.voice(g, when + dur + 0.01, src);
		return;
	}
	if (n.kind === 1) {
		const dur = 0.36 * p.decay;
		const hz = paHz(n.midi);
		const osc = ac.createOscillator();
		osc.type = 'sine';
		paApplyGlide(osc, hz, n, when, dur);
		const lfo = ac.createOscillator();
		const lfoG = ac.createGain();
		lfo.frequency.setValueAtTime(5.5, when);
		lfoG.gain.setValueAtTime(hz * (0.003 + Math.min(0.02, n.bounce * 0.0035)), when);
		lfo.connect(lfoG);
		lfoG.connect(osc.frequency);
		const g = ac.createGain();
		g.gain.setValueAtTime(0.0001, when);
		g.gain.linearRampToValueAtTime(0.18 * n.vel, when + 0.045);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		osc.connect(g);
		g.connect(paPanner(ac, bus, n.pan, n.panTo, when, dur));
		lfo.start(when);
		osc.start(when);
		lfo.stop(when + dur + 0.02);
		osc.stop(when + dur + 0.02);
		wave.voice(g, when + dur + 0.02, osc);
		return;
	}
	const isAbs = n.kind === 4;
	const dur = (isAbs ? 1.35 : 0.65) * p.decay * (n.status === 3 ? 0.65 : 1);
	const chN = isAbs || n.kind === 3 ? paActiveChannels(n.ch, paChScratch) : 1;
	if (chN === 1) paChScratch[0] = (n.ch & 1) ? 0 : ((n.ch & 4) ? 2 : 1);
	const outG = ac.createGain();
	outG.gain.setValueAtTime(0.0001, when);
	outG.gain.linearRampToValueAtTime((isAbs ? 0.22 : 0.2) * n.vel / Math.sqrt(chN), when + 0.006);
	outG.gain.exponentialRampToValueAtTime(0.0001, when + dur);
	let dest = paPanner(ac, bus, n.pan, n.panTo, when, dur);
	if (isAbs && n.bright <= 0.01) {
		const lp = ac.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.setValueAtTime(900, when);
		lp.frequency.exponentialRampToValueAtTime(280, when + dur);
		lp.connect(dest);
		dest = lp;
	}
	outG.connect(dest);
	const ratio = n.turn > 0 ? 3.5 : (n.turn < 0 ? 1.4 : 2.0);
	let mainOsc = null;
	for (let i = 0; i < chN; i++) {
		const hz = paHz(chN > 1 ? paChMidi(n.midi, paChScratch[i], root, scale) : n.midi);
		const car = ac.createOscillator();
		const mod = ac.createOscillator();
		const modG = ac.createGain();
		car.type = 'sine';
		mod.type = 'sine';
		paApplyGlide(car, hz, n, when, dur);
		mod.frequency.setValueAtTime(hz * ratio, when);
		modG.gain.setValueAtTime(Math.max(1, hz * (0.9 + 1.5 * n.bright * p.bright)), when);
		modG.gain.exponentialRampToValueAtTime(0.5, when + dur * 0.45);
		mod.connect(modG);
		modG.connect(car.frequency);
		car.connect(outG);
		mod.start(when);
		car.start(when);
		mod.stop(when + dur + 0.02);
		car.stop(when + dur + 0.02);
		if (!mainOsc) mainOsc = car;
	}
	if (isAbs) paStatusTint(ac, outG, paHz(n.midi), n, when, dur);
	wave.voice(outG, when + dur + 0.02, mainOsc);
}

// Pulse: quantized rhythmic kit — closed hat, rimshot, low/high pitched toms, clap, plucked bass + chord stab
function paPulseNote(ac, bus, n, p, when, wave) {
	const pan = paPanner(ac, bus, n.pan, n.panTo, when, 0.25);
	if (n.kind === 0) {
		const dur = 0.038;
		const src = ac.createBufferSource();
		src.buffer = paNoise(ac);
		const hp = ac.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.setValueAtTime(5800 * p.tone, when);
		const g = ac.createGain();
		g.gain.setValueAtTime(0.15 * n.vel, when);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		src.connect(hp);
		hp.connect(g);
		g.connect(pan);
		src.start(when);
		src.stop(when + dur + 0.01);
		wave.voice(g, when + dur + 0.01, src);
		return;
	}
	if (n.kind === 1) {
		const dur = 0.045;
		const osc = ac.createOscillator();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(1450 * p.tone, when);
		osc.frequency.exponentialRampToValueAtTime(420 * p.tone, when + dur);
		const g = ac.createGain();
		g.gain.setValueAtTime(0.22 * n.vel, when);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		osc.connect(g);
		g.connect(pan);
		osc.start(when);
		osc.stop(when + dur + 0.01);
		wave.voice(g, when + dur + 0.01, osc);
		return;
	}
	if (n.kind === 2) {
		const high = n.turn > 0;
		const dur = high ? 0.12 : 0.16;
		const base = paHz(n.midi - 12) * p.tone * (high ? 1.35 : 0.85);
		const osc = ac.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(base * 1.45, when);
		osc.frequency.exponentialRampToValueAtTime(Math.max(35, base * 0.55), when + dur);
		const g = ac.createGain();
		g.gain.setValueAtTime(0.32 * n.vel, when);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		osc.connect(g);
		g.connect(pan);
		osc.start(when);
		osc.stop(when + dur + 0.02);
		wave.voice(g, when + dur + 0.02, osc);
		return;
	}
	if (n.kind === 3) {
		const dur = 0.16;
		const src = ac.createBufferSource();
		src.buffer = paNoise(ac);
		const bp = ac.createBiquadFilter();
		bp.type = 'bandpass';
		bp.frequency.setValueAtTime(1250 * p.tone, when);
		bp.Q.setValueAtTime(2.4, when);
		const g = ac.createGain();
		const pk = 0.25 * n.vel;
		g.gain.setValueAtTime(pk, when);
		g.gain.exponentialRampToValueAtTime(pk * 0.25, when + 0.01);
		g.gain.setValueAtTime(pk * 0.9, when + 0.012);
		g.gain.exponentialRampToValueAtTime(pk * 0.25, when + 0.022);
		g.gain.setValueAtTime(pk, when + 0.024);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
		src.connect(bp);
		bp.connect(g);
		g.connect(pan);
		src.start(when);
		src.stop(when + dur + 0.02);
		wave.voice(g, when + dur + 0.02, src);
		return;
	}
	const dur = 0.38;
	const outG = ac.createGain();
	outG.gain.setValueAtTime(0.26 * n.vel, when);
	outG.gain.exponentialRampToValueAtTime(0.0001, when + dur);
	outG.connect(pan);
	const bass = ac.createOscillator();
	const bLp = ac.createBiquadFilter();
	const bG = ac.createGain();
	bass.type = 'sawtooth';
	bass.frequency.setValueAtTime(paHz(Math.max(36, n.midi - 12)), when);
	bLp.type = 'lowpass';
	bLp.frequency.setValueAtTime(950 * p.tone, when);
	bLp.frequency.exponentialRampToValueAtTime(180, when + dur);
	bG.gain.setValueAtTime(Math.max(0.0001, p.bass), when);
	bass.connect(bLp);
	bLp.connect(bG);
	bG.connect(outG);
	bass.start(when);
	bass.stop(when + dur + 0.02);
	const chN = paActiveChannels(n.ch, paChScratch);
	for (let i = 0; i < chN; i++) {
		const stOsc = ac.createOscillator();
		const stG = ac.createGain();
		stOsc.type = 'triangle';
		stOsc.frequency.setValueAtTime(paHz(paChMidi(n.midi, paChScratch[i], wave.rootMidi, wave.scale)), when);
		stG.gain.setValueAtTime(0.32 / chN, when);
		stG.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
		stOsc.connect(stG);
		stG.connect(outG);
		stOsc.start(when);
		stOsc.stop(when + 0.2);
	}
	wave.voice(outG, when + dur + 0.02, bass);
}

// Sustained harmonic bed: idle root drone -> partial rising tremolo -> met consonant shimmer
function paBed(ac, bus, b, p, when) {
	const out = ac.createGain();
	out.gain.setValueAtTime(0.0001, when);
	out.connect(bus);
	const lp = ac.createBiquadFilter();
	lp.type = 'lowpass';
	lp.frequency.setValueAtTime(b.state === 2 ? 1750 : (b.state === 1 ? 520 + 880 * b.tension : 310), when);
	const modG = ac.createGain();
	modG.gain.setValueAtTime(0.14, when);
	modG.connect(lp);
	lp.connect(out);
	const lfo = ac.createOscillator();
	const lfoAmt = ac.createGain();
	lfo.frequency.setValueAtTime(b.state === 2 ? 0.1 : (b.state === 1 ? 0.2 + 1.8 * b.tension : 0.12), when);
	lfoAmt.gain.setValueAtTime(b.state === 1 ? 0.045 : 0.025, when);
	lfo.connect(lfoAmt);
	lfoAmt.connect(modG.gain);
	const stops = [lfo];
	function addTone(hz, type, gainVal, panVal) {
		const o = ac.createOscillator();
		const g = ac.createGain();
		o.type = type;
		o.frequency.setValueAtTime(hz, when);
		g.gain.setValueAtTime(gainVal, when);
		o.connect(g);
		g.connect(paPanner(ac, modG, panVal, panVal, when, 0.1));
		o.start(when);
		stops.push(o);
	}
	const rootHz = paHz(Math.max(36, b.rootMidi - 12));
	addTone(rootHz, 'sine', 0.42, 0);
	addTone(rootHz * (b.state === 2 ? 1.5 : 1.002), 'triangle', b.state === 0 ? 0.12 : 0.2, -0.2);
	const maxChord = b.state === 0 ? 0 : Math.min(b.chordN, 5);
	for (let i = 0; i < maxChord; i++) {
		const pan = maxChord > 1 ? ((i / (maxChord - 1)) - 0.5) * 0.9 : 0;
		addTone(paHz(b.chord[i]), b.state === 2 ? 'triangle' : 'sine', 0.24 / Math.sqrt(maxChord), pan);
	}
	if (b.state === 2) addTone(paHz(Math.min(84, b.rootMidi + 12)), 'sine', 0.12, 0.25);
	if (b.beat > 0) {
		const beatBase = paHz(b.rootMidi);
		addTone(beatBase, 'sine', 0.11, -0.35);
		addTone(beatBase + b.beat, 'sine', 0.11, 0.35);
	}
	if (b.rub > 0) addTone(paHz(b.rootMidi + 13), 'sine', 0.07, 0.15);
	lfo.start(when);
	return { gain: out, stop(stopAt) { for (let i = 0; i < stops.length; i++) stops[i].stop(stopAt); } };
}

// soft rising band-passed noise swell at emitter column as photon leaves the laser
function paBreath(ac, outBus, emitter, width, when, registerVoice) {
	const src = ac.createBufferSource();
	src.buffer = paNoise(ac);
	const bp = ac.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.setValueAtTime(420, when);
	bp.frequency.exponentialRampToValueAtTime(1600, when + 0.065);
	bp.Q.setValueAtTime(3.2, when);
	const g = ac.createGain();
	g.gain.setValueAtTime(0.0001, when);
	g.gain.linearRampToValueAtTime(0.07, when + 0.02);
	g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
	src.connect(bp);
	bp.connect(g);
	const pan = Math.max(-1, Math.min(1, ((emitter - 7) / 7) * width));
	g.connect(paPanner(ac, outBus, pan, pan, when, 0.07));
	src.start(when);
	src.stop(when + 0.075);
	registerVoice(g, when + 0.075, src);
}

// one-shot upward arpeggio across lit receiver tones on live transition into `won`
function paWinFlourish(ac, outBus, bed, when, registerVoice) {
	const count = Math.max(3, bed.chordN + 1);
	for (let i = 0; i < count; i++) {
		const midi = i < bed.chordN ? bed.chord[i] : Math.min(96, bed.rootMidi + 12 + (i - bed.chordN) * 7);
		const t0 = when + i * 0.075;
		const osc = ac.createOscillator();
		const g = ac.createGain();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(paHz(midi), t0);
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.linearRampToValueAtTime(0.18, t0 + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
		osc.connect(g);
		g.connect(outBus);
		osc.start(t0);
		osc.stop(t0 + 0.58);
		registerVoice(g, t0 + 0.58, osc);
	}
}

const PATCH_LIST = [
	{
		id: 'glass',
		label: 'Glass Harp',
		params: [
			{ key: 'decay', label: 'Bell decay', min: 0.3, max: 2.8, step: 0.1, def: 1.2 },
			{ key: 'bright', label: 'Brightness', min: 0.2, max: 1.5, step: 0.05, def: 0.85 },
			{ key: 'tick', label: 'Tick level', min: 0, max: 1, step: 0.05, def: 0.45 },
			{ key: 'reverb', label: 'Reverb send', min: 0, max: 1, step: 0.05, def: 0.55 }
		],
		note: paGlassNote,
		bed: paBed
	},
	{
		id: 'prism',
		label: 'Prism Pad',
		params: [
			{ key: 'glide', label: 'Glide', min: 0.02, max: 0.4, step: 0.01, def: 0.12 },
			{ key: 'cutoff', label: 'Cutoff', min: 300, max: 3600, step: 50, def: 1300 },
			{ key: 'reso', label: 'Resonance', min: 0.5, max: 10, step: 0.5, def: 3.5 },
			{ key: 'detune', label: 'Detune', min: 2, max: 24, step: 1, def: 8 }
		],
		note(ac, bus, n, p, when, wave) { const m = paFlow(); (m ? m.pfPrismNote : pfPrismNote)(ac, bus, n, p, when, wave); },
		bed: paBed
	},
	{
		id: 'comet',
		label: 'Comet',
		params: [
			{ key: 'doppler', label: 'Doppler', min: 0, max: 1, step: 0.05, def: 0.55 },
			{ key: 'feedback', label: 'Delay feedback', min: 0, max: 0.75, step: 0.05, def: 0.4 },
			{ key: 'air', label: 'Air mix', min: 0, max: 1, step: 0.05, def: 0.5 }
		],
		note(ac, bus, n, p, when, wave) { const m = paFlow(); (m ? m.pfCometNote : pfCometNote)(ac, bus, n, p, when, wave); },
		bed: paBed
	},
	{
		id: 'pulse',
		label: 'Pulse',
		params: [
			{ key: 'swing', label: 'Swing', min: 0, max: 0.6, step: 0.05, def: 0.2 },
			{ key: 'tone', label: 'Drum tone', min: 0.3, max: 1.6, step: 0.05, def: 1.0 },
			{ key: 'bass', label: 'Bass level', min: 0, max: 1, step: 0.05, def: 0.75 }
		],
		note: paPulseNote,
		bed: paBed
	},
	{
		id: 'grains',
		label: 'Crystal Grains',
		params: [
			{ key: 'density', label: 'Density', min: 0.3, max: 1.5, step: 0.1, def: 0.85 },
			{ key: 'size', label: 'Grain size', min: 0.02, max: 0.06, step: 0.005, def: 0.038 },
			{ key: 'scatter', label: 'Scatter', min: 0.01, max: 0.08, step: 0.005, def: 0.04 },
			{ key: 'feedback', label: 'Delay feedback', min: 0, max: 0.75, step: 0.05, def: 0.45 }
		],
		note(ac, bus, n, p, when, wave) { const m = paFlow(); (m ? m.pfGrainsNote : pfGrainsNote)(ac, bus, n, p, when, wave); },
		bed: paBed
	},
	{
		id: 'spectrum',
		label: 'Spectral Field',
		params: [
			{ key: 'drift', label: 'Drift ↔ position', min: 0, max: 1, step: 0.05, def: 0.75 },
			{ key: 'driftStep', label: 'Drift speed', min: 0.05, max: 0.5, step: 0.01, def: 0.16 },
			{ key: 'reso', label: 'Band split', min: 0.5, max: 6, step: 0.1, def: 1.6 },
			{ key: 'bright', label: 'Brightness', min: 0.3, max: 1.5, step: 0.05, def: 1.0 }
		],
		note(ac, bus, n, p, when, wave) { const m = paFlow(); (m ? m.pfSpectrumNote : pfSpectrumNote)(ac, bus, n, p, when, wave); },
		bed: paBed
	}
];

function patchById(id) {
	for (let i = 0; i < PATCH_LIST.length; i++) if (PATCH_LIST[i].id === id) return PATCH_LIST[i];
	return PATCH_LIST[0];
}

if (typeof module !== 'undefined') module.exports = { PATCH_LIST, patchById, paHz, paBreath, paWinFlourish };
