// owns: physical board mechanism synthesis for square rotations and emitter rail movement
// edit for: low mechanism chassis/detent timbre, ring mass scaling and laser x-slide acoustics

const FX_RING_HZ = [54, 67, 83, 102];
const FX_RING_RUMBLE = [135, 165, 205, 250];
const FX_RING_Q_DUR = [0.15, 0.13, 0.11, 0.075];
const FX_RING_S_DUR = [0.085, 0.078, 0.07, 0.068];
const FX_RING_PAN = [0.22, 0.15, 0.09, 0];

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

// inharmonic 1.87x rigid-frame mode avoids musical-octave pitchiness while keeping heavy metal/stone body
function fxRotate(ac, bus, ring, dir, mode, width, registerVoice) {
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
function fxLaser(ac, bus, fromCol, toCol, width, registerVoice) {
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

if (typeof module !== 'undefined') module.exports = { fxRotate, fxLaser };
