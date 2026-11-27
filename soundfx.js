// owns: movement sound dispatch, drum mechanism and s2 synthesis; noise1/noise2 route to soundfxNatural.js
// edit for: dispatch order, drum mechanism and s2 timbres, ring mass scaling and laser x-slide acoustics

const FX_RING_HZ = [54, 67, 83, 102];
const FX_RING_RUMBLE = [135, 165, 205, 250];
const FX_RING_Q_DUR = [0.15, 0.13, 0.11, 0.075];
const FX_RING_S_DUR = [0.085, 0.078, 0.07, 0.068];
const FX_RING_PAN = [0.22, 0.15, 0.09, 0];
const FX_BEAR_Q_DUR = [0.58, 0.52, 0.46, 0.36];
const FX_BEAR_S_DUR = [0.38, 0.36, 0.34, 0.34];
const FX_BEAR_SLOTS = [6, 4, 2, 1];

let fxBufCtx = null;
let fxBuf = null;
let fxSeed = 0x3c6ef372;
let fxLastRotAt = -1;
let fxLastLaserAt = -1;

function fxClampPan(v) {
	return v < -1 ? -1 : (v > 1 ? 1 : v);
}

function fxNextOffset() {
	fxSeed = (Math.imul(fxSeed, 1664525) + 1013904223) >>> 0;
	return (fxSeed / 4294967296) * 0.35;
}

// DC-blocked brown friction + sparse grain impulses so filtered glides sound mechanical, not white-hissy
function fxBuffer(ac) {
	if (fxBufCtx === ac && fxBuf) return fxBuf;
	const len = Math.max(4096, Math.floor(ac.sampleRate * 0.65));
	const buf = ac.createBuffer(1, len, ac.sampleRate);
	const data = buf.getChannelData(0);
	let s = 0x51f3a9c7;
	let lp = 0;
	let hp = 0;
	for (let i = 0; i < len; i++) {
		s = (Math.imul(s, 1664525) + 1013904223) | 0;
		const w = s / 0x80000000;
		lp += 0.085 * (w - lp);
		hp += 0.004 * (lp - hp);
		const grain = (s & 63) === 0 ? w * 0.42 : 0;
		const v = (lp - hp) * 3.2 + grain;
		data[i] = v < -1 ? -1 : (v > 1 ? 1 : v);
	}
	fxBufCtx = ac;
	fxBuf = buf;
	return buf;
}

function fxPanner(ac, dest, pan0, pan1, when, dur) {
	if (!ac.createStereoPanner) return dest;
	const p = ac.createStereoPanner();
	p.pan.setValueAtTime(pan0, when);
	if (pan1 !== pan0) p.pan.linearRampToValueAtTime(pan1, when + Math.max(0.02, dur));
	p.connect(dest);
	return p;
}

function fxNaturalDispatch(ac, bus, ring, dir, mode, width, fromCol, toCol, registerVoice, flow) {
	const mod = typeof module !== 'undefined' && module.exports ? require('./soundfxNatural.js') : null;
	const play = flow ? (mod ? mod.fxFlowMove : fxFlowMove) : (mod ? mod.fxNaturalMove : fxNaturalMove);
	return play(ac, bus, ring, dir, mode, width, fromCol, toCol, registerVoice);
}

// Inharmonic frame mode avoids musical-octave pitchiness while keeping a heavy body.
function fxRotate(ac, bus, ring, dir, mode, width, moveSound, registerVoice) {
	if (moveSound === 'natural') return fxNaturalDispatch(ac, bus, ring, dir, mode, width, 0, 0, registerVoice, false);
	if (moveSound === 'noise1') return fxNaturalDispatch(ac, bus, ring, dir, mode, width, 0, 0, registerVoice, true);
	if (moveSound === 'bearing') return fxRotateBearing(ac, bus, ring, dir, mode, width, registerVoice);
	const r = ring >= 0 && ring <= 3 ? ring : 0;
	const sgn = dir < 0 ? -1 : 1;
	const quarter = mode === 0 && r < 3;
	const when = ac.currentTime + 0.003;
	const dt = fxLastRotAt >= 0 ? when - fxLastRotAt : 1;
	fxLastRotAt = when;
	const vel = dt < 0.04 ? 0.62 : (dt < 0.085 ? 0.8 : 1);
	const dur = quarter ? FX_RING_Q_DUR[r] : FX_RING_S_DUR[r];
	const baseHz = FX_RING_HZ[r];
	const rumbleHz = FX_RING_RUMBLE[r];
	const w = Number.isFinite(width) ? Math.max(0, Math.min(1, width)) : 0.85;
	const panSpan = FX_RING_PAN[r] * sgn * w;

	const out = ac.createGain();
	out.gain.setValueAtTime(1, when);
	out.connect(fxPanner(ac, bus, -panSpan, panSpan, when, dur));

	const bodyLp = ac.createBiquadFilter();
	bodyLp.type = 'lowpass';
	bodyLp.frequency.setValueAtTime(240 + r * 35, when);
	bodyLp.Q.setValueAtTime(1.35, when);
	bodyLp.connect(out);

	const bodyOsc = ac.createOscillator();
	const bodyG = ac.createGain();
	bodyOsc.type = 'triangle';
	bodyOsc.frequency.setValueAtTime(baseHz * (sgn > 0 ? 0.94 : 1.07), when);
	bodyOsc.frequency.exponentialRampToValueAtTime(baseHz * (sgn > 0 ? 1.05 : 0.91), when + dur * 0.65);
	bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(28, baseHz * 0.74), when + dur + 0.045);
	bodyG.gain.setValueAtTime(0.0001, when);
	bodyG.gain.linearRampToValueAtTime(0.26 * vel, when + 0.01);
	bodyG.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.05);
	bodyOsc.connect(bodyG);
	bodyG.connect(bodyLp);
	bodyOsc.start(when);
	bodyOsc.stop(when + dur + 0.055);

	const modeOsc = ac.createOscillator();
	const modeG = ac.createGain();
	modeOsc.type = 'sine';
	modeOsc.frequency.setValueAtTime(baseHz * 1.92, when);
	modeOsc.frequency.exponentialRampToValueAtTime(baseHz * 1.68, when + dur * 0.85);
	modeG.gain.setValueAtTime(0.0001, when);
	modeG.gain.linearRampToValueAtTime(0.11 * vel, when + 0.006);
	modeG.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.9);
	modeOsc.connect(modeG);
	modeG.connect(bodyLp);
	modeOsc.start(when);
	modeOsc.stop(when + dur * 0.92);

	const fricSrc = ac.createBufferSource();
	fricSrc.buffer = fxBuffer(ac);
	fricSrc.loop = true;
	const fricBp = ac.createBiquadFilter();
	fricBp.type = 'bandpass';
	fricBp.frequency.setValueAtTime(rumbleHz * 0.85, when);
	fricBp.frequency.exponentialRampToValueAtTime(rumbleHz * 1.28, when + dur * 0.45);
	fricBp.frequency.exponentialRampToValueAtTime(rumbleHz * 0.76, when + dur + 0.01);
	fricBp.Q.setValueAtTime(2.6, when);
	const fricG = ac.createGain();
	fricG.gain.setValueAtTime(0.0001, when);
	fricG.gain.linearRampToValueAtTime((quarter ? 0.22 : 0.15) * vel, when + dur * 0.28);
	fricG.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.015);
	fricSrc.connect(fricBp);
	fricBp.connect(fricG);
	fricG.connect(out);
	fricSrc.start(when, fxNextOffset());
	fricSrc.stop(when + dur + 0.02);

	if (quarter && vel > 0.75) {
		const tPawl = when + dur * 0.42;
		const pawl = ac.createOscillator();
		const pawlG = ac.createGain();
		pawl.type = 'triangle';
		pawl.frequency.setValueAtTime(rumbleHz * 1.45, tPawl);
		pawl.frequency.exponentialRampToValueAtTime(rumbleHz * 0.75, tPawl + 0.018);
		pawlG.gain.setValueAtTime(0.0001, tPawl);
		pawlG.gain.linearRampToValueAtTime(0.07 * vel, tPawl + 0.002);
		pawlG.gain.exponentialRampToValueAtTime(0.0001, tPawl + 0.02);
		pawl.connect(pawlG);
		pawlG.connect(bodyLp);
		pawl.start(tPawl);
		pawl.stop(tPawl + 0.024);
	}

	const tLock = when + dur * (quarter ? 0.74 : 0.46);
	const lockOsc = ac.createOscillator();
	const lockG = ac.createGain();
	lockOsc.type = 'triangle';
	lockOsc.frequency.setValueAtTime(baseHz * 2.35, tLock);
	lockOsc.frequency.exponentialRampToValueAtTime(Math.max(30, baseHz * 0.68), tLock + 0.042);
	lockG.gain.setValueAtTime(0.0001, tLock);
	lockG.gain.linearRampToValueAtTime(0.19 * vel, tLock + 0.0025);
	lockG.gain.exponentialRampToValueAtTime(0.0001, tLock + 0.046);
	lockOsc.connect(lockG);
	lockG.connect(bodyLp);
	lockOsc.start(tLock);
	lockOsc.stop(tLock + 0.05);

	registerVoice(out, when + dur + 0.06, bodyOsc);
}

// emitter columns 1..13 map directly to stereo pan and linear rail resonance so x-travel is audible
function fxLaser(ac, bus, fromCol, toCol, width, moveSound, registerVoice) {
	if (moveSound === 'natural') return fxNaturalDispatch(ac, bus, -1, 1, 0, width, fromCol, toCol, registerVoice, false);
	if (moveSound === 'noise1') return fxNaturalDispatch(ac, bus, -1, 1, 0, width, fromCol, toCol, registerVoice, true);
	if (moveSound === 'bearing' && fromCol !== toCol) return fxLaserBearing(ac, bus, fromCol, toCol, width, registerVoice);
	const when = ac.currentTime + 0.003;
	const w = Number.isFinite(width) ? Math.max(0, Math.min(1, width)) : 0.85;
	const pan0 = fxClampPan((fromCol - 7) / 6) * w;
	const pan1 = fxClampPan((toCol - 7) / 6) * w;

	if (fromCol === toCol) {
		const stopOsc = ac.createOscillator();
		const stopG = ac.createGain();
		stopOsc.type = 'sine';
		stopOsc.frequency.setValueAtTime(92, when);
		stopOsc.frequency.exponentialRampToValueAtTime(46, when + 0.038);
		stopG.gain.setValueAtTime(0.0001, when);
		stopG.gain.linearRampToValueAtTime(0.13, when + 0.003);
		stopG.gain.exponentialRampToValueAtTime(0.0001, when + 0.042);
		stopOsc.connect(stopG);
		stopG.connect(fxPanner(ac, bus, pan1, pan1, when, 0.04));
		stopOsc.start(when);
		stopOsc.stop(when + 0.046);
		registerVoice(stopG, when + 0.046, stopOsc);
		return;
	}

	const dt = fxLastLaserAt >= 0 ? when - fxLastLaserAt : 1;
	fxLastLaserAt = when;
	const vel = dt < 0.035 ? 0.65 : (dt < 0.075 ? 0.82 : 1);
	const steps = Math.min(6, Math.abs(toCol - fromCol));
	const dur = 0.058 + 0.009 * steps;
	const u0 = Math.max(0, Math.min(1, (fromCol - 1) / 12));
	const u1 = Math.max(0, Math.min(1, (toCol - 1) / 12));

	const out = ac.createGain();
	out.gain.setValueAtTime(1, when);
	out.connect(fxPanner(ac, bus, pan0, pan1, when, dur));

	const railSrc = ac.createBufferSource();
	railSrc.buffer = fxBuffer(ac);
	railSrc.loop = true;
	const railBp = ac.createBiquadFilter();
	railBp.type = 'bandpass';
	railBp.frequency.setValueAtTime(340 + 320 * u0, when);
	railBp.frequency.exponentialRampToValueAtTime(340 + 320 * u1, when + dur);
	railBp.Q.setValueAtTime(4.2, when);
	const railG = ac.createGain();
	railG.gain.setValueAtTime(0.0001, when);
	railG.gain.linearRampToValueAtTime(0.18 * vel, when + 0.008);
	railG.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.015);
	railSrc.connect(railBp);
	railBp.connect(railG);
	railG.connect(out);
	railSrc.start(when, fxNextOffset());
	railSrc.stop(when + dur + 0.02);

	const sledLp = ac.createBiquadFilter();
	sledLp.type = 'lowpass';
	sledLp.frequency.setValueAtTime(460, when);
	sledLp.connect(out);

	const sledOsc = ac.createOscillator();
	const sledG = ac.createGain();
	sledOsc.type = 'triangle';
	sledOsc.frequency.setValueAtTime(128 + 64 * u0, when);
	sledOsc.frequency.exponentialRampToValueAtTime(128 + 64 * u1, when + dur * 0.8);
	sledOsc.frequency.exponentialRampToValueAtTime(112 + 56 * u1, when + dur + 0.02);
	sledG.gain.setValueAtTime(0.0001, when);
	sledG.gain.linearRampToValueAtTime(0.15 * vel, when + 0.006);
	sledG.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.024);
	sledOsc.connect(sledG);
	sledG.connect(sledLp);
	sledOsc.start(when);
	sledOsc.stop(when + dur + 0.03);

	const tDet = when + dur * 0.72;
	const detOsc = ac.createOscillator();
	const detG = ac.createGain();
	detOsc.type = 'sine';
	detOsc.frequency.setValueAtTime(460 + 180 * u1, tDet);
	detOsc.frequency.exponentialRampToValueAtTime(165, tDet + 0.022);
	detG.gain.setValueAtTime(0.0001, tDet);
	detG.gain.linearRampToValueAtTime(0.11 * vel, tDet + 0.002);
	detG.gain.exponentialRampToValueAtTime(0.0001, tDet + 0.024);
	detOsc.connect(detG);
	detG.connect(out);
	detOsc.start(tDet);
	detOsc.stop(tDet + 0.028);

	registerVoice(out, when + dur + 0.035, sledOsc);
}

// ball-pass flutter on a gain param so prolonged rolls wobble like bearings, not flat noise
function fxFlutter(ac, param, when, dur, depth, rate) {
	const lfo = ac.createOscillator();
	const g = ac.createGain();
	lfo.type = 'sine';
	lfo.frequency.setValueAtTime(rate, when);
	g.gain.setValueAtTime(depth, when);
	lfo.connect(g);
	g.connect(param);
	lfo.start(when);
	lfo.stop(when + dur + 0.02);
}

function fxRollNoise(ac, dest, when, dur, freq0, freq1, q, peak, rate, depth) {
	const src = ac.createBufferSource();
	src.buffer = fxBuffer(ac);
	src.loop = true;
	const bp = ac.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.setValueAtTime(freq0, when);
	bp.frequency.exponentialRampToValueAtTime(Math.max(40, freq1), when + dur);
	bp.Q.setValueAtTime(q, when);
	const g = ac.createGain();
	g.gain.setValueAtTime(0.0001, when);
	g.gain.linearRampToValueAtTime(peak, when + dur * 0.25);
	g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.02);
	src.connect(bp);
	bp.connect(g);
	g.connect(dest);
	src.start(when, fxNextOffset());
	src.stop(when + dur + 0.025);
	fxFlutter(ac, g.gain, when, dur, depth, rate);
}

// metallic slot ping: sine fundamental with a faint inharmonic partial; the landing ping drops an octave
function fxAccent(ac, dest, hz, when, peak, last) {
	const osc = ac.createOscillator();
	const g = ac.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(hz, when);
	osc.frequency.exponentialRampToValueAtTime(Math.max(30, hz * (last ? 0.5 : 0.97)), when + (last ? 0.06 : 0.07));
	g.gain.setValueAtTime(0.0001, when);
	g.gain.linearRampToValueAtTime(peak, when + 0.004);
	g.gain.exponentialRampToValueAtTime(0.0001, when + (last ? 0.16 : 0.12));
	osc.connect(g);
	g.connect(dest);
	osc.start(when);
	osc.stop(when + (last ? 0.165 : 0.125));
	const ring = ac.createOscillator();
	const ringG = ac.createGain();
	ring.type = 'sine';
	ring.frequency.setValueAtTime(hz * 2.76, when);
	ringG.gain.setValueAtTime(0.0001, when);
	ringG.gain.linearRampToValueAtTime(peak * 0.3, when + 0.003);
	ringG.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
	ring.connect(ringG);
	ringG.connect(dest);
	ring.start(when);
	ring.stop(when + 0.065);
}

function fxGrain(ac, dest, when, peak) {
	const src = ac.createBufferSource();
	src.buffer = fxBuffer(ac);
	const bp = ac.createBiquadFilter();
	bp.type = 'bandpass';
	bp.frequency.setValueAtTime(1800, when);
	bp.Q.setValueAtTime(4, when);
	const g = ac.createGain();
	g.gain.setValueAtTime(0.0001, when);
	g.gain.linearRampToValueAtTime(peak, when + 0.002);
	g.gain.exponentialRampToValueAtTime(0.0001, when + 0.018);
	src.connect(bp);
	bp.connect(g);
	g.connect(dest);
	src.start(when, fxNextOffset());
	src.stop(when + 0.02);
}

function fxRotateBearing(ac, bus, ring, dir, mode, width, registerVoice) {
	const r = ring >= 0 && ring <= 3 ? ring : 0;
	const sgn = dir < 0 ? -1 : 1;
	const quarter = mode === 0 && r < 3;
	const when = ac.currentTime + 0.003;
	const dt = fxLastRotAt >= 0 ? when - fxLastRotAt : 1;
	fxLastRotAt = when;
	const vel = dt < 0.04 ? 0.62 : (dt < 0.085 ? 0.8 : 1);
	const baseDur = quarter ? FX_BEAR_Q_DUR[r] : FX_BEAR_S_DUR[r];
	const dur = baseDur * (vel < 0.75 ? 0.75 : 1);
	const baseHz = FX_RING_HZ[r];
	const rumbleHz = FX_RING_RUMBLE[r];
	const w = Number.isFinite(width) ? Math.max(0, Math.min(1, width)) : 0.85;
	const panSpan = FX_RING_PAN[r] * sgn * w;

	const out = ac.createGain();
	out.gain.setValueAtTime(1, when);
	out.connect(fxPanner(ac, bus, -panSpan, panSpan, when, dur));

	const bodyLp = ac.createBiquadFilter();
	bodyLp.type = 'lowpass';
	bodyLp.frequency.setValueAtTime(300 + r * 30, when);
	bodyLp.connect(out);

	const rumbleOsc = ac.createOscillator();
	const rumbleG = ac.createGain();
	rumbleOsc.type = 'triangle';
	rumbleOsc.frequency.setValueAtTime(baseHz * (sgn > 0 ? 0.98 : 1.02), when);
	rumbleOsc.frequency.exponentialRampToValueAtTime(Math.max(28, baseHz * 0.85), when + dur + 0.06);
	rumbleG.gain.setValueAtTime(0.0001, when);
	rumbleG.gain.linearRampToValueAtTime(0.2 * vel, when + dur * 0.22);
	rumbleG.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.08);
	rumbleOsc.connect(rumbleG);
	rumbleG.connect(bodyLp);
	rumbleOsc.start(when);
	rumbleOsc.stop(when + dur + 0.085);

	fxRollNoise(ac, out, when, dur, rumbleHz * 0.85, rumbleHz * 1.15, 1.8, 0.17 * vel, 6 + r * 0.7, 0.055 * vel);
	fxRollNoise(ac, out, when, dur, 1100, 1150, 3, 0.035 * vel, 2.3, 0.015 * vel);
	for (let i = 0; i < 3; i++) fxGrain(ac, out, when + dur * (0.22 + fxNextOffset() * 0.6), 0.05 * vel);

	const nSlots = quarter ? FX_BEAR_SLOTS[r] : 1;
	for (let i = 0; i < nSlots; i++) {
		const t = nSlots === 1 ? when + dur * 0.62 : when + dur * (0.16 + 0.68 * i / (nSlots - 1));
		const stepIdx = sgn > 0 ? i : (nSlots - 1 - i);
		const hz = baseHz * 4 * Math.pow(2, stepIdx * 2 / 12);
		const last = i === nSlots - 1;
		fxAccent(ac, out, hz, t, (last ? 0.16 : 0.1) * vel, last);
	}

	registerVoice(out, when + dur + 0.17, rumbleOsc);
}

function fxLaserBearing(ac, bus, fromCol, toCol, width, registerVoice) {
	const when = ac.currentTime + 0.003;
	const w = Number.isFinite(width) ? Math.max(0, Math.min(1, width)) : 0.85;
	const pan0 = fxClampPan((fromCol - 7) / 6) * w;
	const pan1 = fxClampPan((toCol - 7) / 6) * w;
	const dt = fxLastLaserAt >= 0 ? when - fxLastLaserAt : 1;
	fxLastLaserAt = when;
	const vel = dt < 0.035 ? 0.65 : (dt < 0.075 ? 0.82 : 1);
	const steps = Math.min(6, Math.abs(toCol - fromCol));
	const dur = (0.3 + 0.045 * steps) * (vel < 0.75 ? 0.8 : 1);
	const u0 = Math.max(0, Math.min(1, (fromCol - 1) / 12));
	const u1 = Math.max(0, Math.min(1, (toCol - 1) / 12));

	const out = ac.createGain();
	out.gain.setValueAtTime(1, when);
	out.connect(fxPanner(ac, bus, pan0, pan1, when, dur));

	const sledLp = ac.createBiquadFilter();
	sledLp.type = 'lowpass';
	sledLp.frequency.setValueAtTime(460, when);
	sledLp.connect(out);

	const sledOsc = ac.createOscillator();
	const sledG = ac.createGain();
	sledOsc.type = 'triangle';
	sledOsc.frequency.setValueAtTime(128 + 64 * u0, when);
	sledOsc.frequency.exponentialRampToValueAtTime(128 + 64 * u1, when + dur * 0.8);
	sledOsc.frequency.exponentialRampToValueAtTime(112 + 56 * u1, when + dur + 0.03);
	sledG.gain.setValueAtTime(0.0001, when);
	sledG.gain.linearRampToValueAtTime(0.13 * vel, when + dur * 0.2);
	sledG.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.04);
	sledOsc.connect(sledG);
	sledG.connect(sledLp);
	sledOsc.start(when);
	sledOsc.stop(when + dur + 0.045);

	fxRollNoise(ac, out, when, dur, 340 + 320 * u0, 340 + 320 * u1, 2.2, 0.17 * vel, 8, 0.05 * vel);

	const sgn = toCol > fromCol ? 1 : -1;
	for (let i = 0; i < steps; i++) {
		const col = fromCol + sgn * (i + 1);
		const t = steps === 1 ? when + dur * 0.62 : when + dur * (0.18 + 0.64 * i / (steps - 1));
		const last = i === steps - 1;
		fxAccent(ac, out, 300 + 28 * (col - 1), t, (last ? 0.15 : 0.09) * vel, last);
	}

	registerVoice(out, when + dur + 0.17, sledOsc);
}

if (typeof module !== 'undefined') module.exports = { fxRotate, fxLaser };
