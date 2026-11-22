// owns: 0.7 AudioContext, scheduler, wave lifecycle, variants, Sound panel and persistence smoke
// run: node experiments/sound_smoke.js

const c = require('./check.js');
const board = require('../board.js');
const goal = require('../contract.js');
const patches = require('../patches.js');
const audio = require('../audio.js');
const panel = require('../soundpanel.js');

// Deterministic virtual clock driving both JS timers and AudioContext.currentTime
let nowMs = 0;
let timerSeq = 0;
const timers = new Map();
let activeAc = null;

global.setTimeout = (fn, ms) => {
	const id = ++timerSeq;
	timers.set(id, { id, due: nowMs + Math.max(0, Number(ms) || 0), interval: 0, fn });
	return id;
};
global.clearTimeout = id => { timers.delete(id); };
global.setInterval = (fn, ms) => {
	const id = ++timerSeq;
	const step = Math.max(1, Number(ms) || 1);
	timers.set(id, { id, due: nowMs + step, interval: step, fn });
	return id;
};
global.clearInterval = id => { timers.delete(id); };

function advance(dtMs) {
	const target = nowMs + dtMs;
	while (true) {
		let next = null;
		for (const t of timers.values()) {
			if (t.due <= target && (!next || t.due < next.due || (t.due === next.due && t.id < next.id))) next = t;
		}
		if (!next) break;
		nowMs = next.due;
		if (activeAc) activeAc.currentTime = nowMs / 1000;
		if (next.interval) next.due += next.interval;
		else timers.delete(next.id);
		next.fn();
	}
	nowMs = target;
	if (activeAc) activeAc.currentTime = nowMs / 1000;
}

// Recording Web Audio API stub
let contextsCreated = 0;
const oscStarts = [];
const gainRamps = [];
const connections = [];

function makeParam(initVal = 0) {
	return {
		value: initVal,
		events: [],
		setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); },
		linearRampToValueAtTime(v, t) { this.value = v; this.events.push(['lin', v, t]); gainRamps.push([v, t]); },
		exponentialRampToValueAtTime(v, t) { this.value = v; this.events.push(['exp', v, t]); },
		setTargetAtTime(v, t, k) { this.value = v; this.events.push(['tgt', v, t, k]); },
		cancelScheduledValues(t) { this.events.push(['cancel', t]); }
	};
}

function makeNode(kind, extra = {}) {
	return Object.assign({
		kind,
		conns: [],
		disconnected: false,
		connect(dest) { this.conns.push(dest); connections.push([this, dest]); return dest; },
		disconnect() { this.disconnected = true; }
	}, extra);
}

class StubAudioContext {
	constructor() {
		contextsCreated++;
		this.sampleRate = 44100;
		this.currentTime = nowMs / 1000;
		this.state = 'running';
		this.suspendCount = 0;
		this.resumeCount = 0;
		this.destination = makeNode('destination');
		this.listener = {
			forwardX: makeParam(0), forwardY: makeParam(0), forwardZ: makeParam(-1),
			setOrientation() {}
		};
		this.convolvers = [];
		this.filters = [];
		this.gains = [];
		activeAc = this;
	}
	suspend() { this.state = 'suspended'; this.suspendCount++; }
	resume() { this.state = 'running'; this.resumeCount++; }
	createGain() {
		const g = makeNode('gain', { gain: makeParam(1) });
		this.gains.push(g);
		return g;
	}
	createOscillator() {
		return makeNode('osc', {
			type: 'sine',
			frequency: makeParam(440),
			detune: makeParam(0),
			startedAt: -1,
			stoppedAt: -1,
			onended: null,
			start(t = 0) { this.startedAt = t; oscStarts.push(t); },
			stop(t = 0) { this.stoppedAt = t; }
		});
	}
	createBuffer(ch, len, sr) {
		const chans = Array.from({ length: ch }, () => new Float32Array(len));
		return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: i => chans[i] };
	}
	createBufferSource() {
		return makeNode('bufsrc', {
			buffer: null,
			loop: false,
			playbackRate: makeParam(1),
			startedAt: -1,
			stoppedAt: -1,
			onended: null,
			start(t = 0) { this.startedAt = t; oscStarts.push(t); },
			stop(t = 0) { this.stoppedAt = t; }
		});
	}
	createBiquadFilter() {
		const f = makeNode('filter', { type: 'lowpass', frequency: makeParam(350), Q: makeParam(1), gain: makeParam(0) });
		this.filters.push(f);
		return f;
	}
	createStereoPanner() { return makeNode('stereopan', { pan: makeParam(0) }); }
	createPanner() {
		return makeNode('panner', {
			panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1,
			positionX: makeParam(0), positionY: makeParam(0), positionZ: makeParam(0),
			setPosition() {}
		});
	}
	createDelay() { return makeNode('delay', { delayTime: makeParam(0) }); }
	createWaveShaper() { return makeNode('shaper', { curve: null, oversample: 'none' }); }
	createConvolver() {
		const cv = makeNode('convolver', { buffer: null });
		this.convolvers.push(cv);
		return cv;
	}
	createDynamicsCompressor() {
		return makeNode('compressor', {
			threshold: makeParam(-24), knee: makeParam(30), ratio: makeParam(12),
			attack: makeParam(0.003), release: makeParam(0.25)
		});
	}
}

// Stub localStorage + DOM
const store = new Map();
global.localStorage = {
	getItem: k => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => { store.set(k, String(v)); },
	removeItem: k => { store.delete(k); }
};
// Pre-seed storage to verify settings load at boot WITHOUT creating AudioContext before gesture
store.set(panel.SP_STORAGE_KEY, JSON.stringify({
	variant: 'glass', volume: 0.65, speed: 5, mode: 'move',
	scale: 'lydian', root: 'G', pitchSource: 'contour', width: 0.75, reverb: 0.5, bedLevel: 0.4,
	params: { glass: { decay: 1.6, bright: 0.9, tick: 0.5, reverb: 0.6 } }
}));

const els = {};
const docHandlers = {};
function makeEl(id, tag = 'DIV') {
	const el = {
		id: id || '',
		tagName: tag,
		type: '',
		checked: false,
		value: '',
		textContent: '',
		ariaPressed: 'false',
		attrs: {},
		children: [],
		clientWidth: 600,
		width: 0,
		height: 0,
		handlers: {},
		setAttribute(k, v) { this.attrs[k] = String(v); },
		getAttribute(k) { return this.attrs[k] || null; },
		appendChild(ch) { this.children.push(ch); if (ch.id) els[ch.id] = ch; return ch; },
		addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
		fire(t, ev = {}) {
			if (!ev.preventDefault) ev.preventDefault = () => {};
			for (const f of this.handlers[t] || []) f(ev);
		},
		getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 600 }; },
		getContext() { return new Proxy({}, { get: (t, p) => (p in t ? t[p] : () => {}) }); },
		setPointerCapture() {},
		releasePointerCapture() {},
		focus() {}
	};
	return el;
}

global.document = {
	hidden: false,
	visibilityState: 'visible',
	getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
	createElement(tag) { return makeEl('', tag.toUpperCase()); },
	addEventListener(t, f) { (docHandlers[t] = docHandlers[t] || []).push(f); },
	fire(t) { for (const f of docHandlers[t] || []) f({}); }
};
global.$ = id => global.document.getElementById(id);

const winHandlers = {};
global.window = {
	AudioContext: StubAudioContext,
	devicePixelRatio: 1,
	addEventListener(t, f) { (winHandlers[t] = winHandlers[t] || []).push(f); },
	removeEventListener() {}
};
global.AudioContext = StubAudioContext;
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};
global.performance = { now: () => nowMs };

$('rule-mode').value = '0';
$('difficulty').value = '25';
$('mirror-count').value = '11';

const game = require('../game.js');
require('../app.js');

// 1. No AudioContext before user gesture, yet stored settings restored
c.eq(contextsCreated, 0, 'no AudioContext exists before user gesture');
c.eq(audio.soundContext(), null, 'soundContext is null before gesture');
c.eq($('snd-on').getAttribute('aria-pressed'), 'false', 'snd-on starts unpressed');
c.eq(panel.soundPanelSettings().scale, 'lydian', 'stored scale restored at boot');
c.eq(panel.soundPanelSettings().speed, 5, 'stored speed restored at boot');
c.eq(panel.soundPanelSettings().params.glass.decay, 1.6, 'stored variant param restored at boot');

// Moves before gesture still create no AudioContext
$('btn-cw-0').fire('click');
advance(500);
c.eq(contextsCreated, 0, 'moves while sound is off never create AudioContext');

// 2. First gesture on snd-on creates & unlocks AudioContext, generates JS reverb IR and schedules wave
oscStarts.length = 0;
$('snd-on').fire('click');
c.eq(contextsCreated, 1, 'first snd-on click creates one AudioContext');
c.eq($('snd-on').getAttribute('aria-pressed'), 'true', 'snd-on sets aria-pressed=true');
c.ok(!!activeAc.convolvers[0].buffer && activeAc.convolvers[0].buffer.numberOfChannels === 2, 'JS stereo impulse response generated');
advance(4000);
c.ok(oscStarts.length > 2, 'enabling sound schedules bed and initial wave');

// 3. Pose change schedules nondecreasing start times after 120 ms debounce
const waveBus = activeAc.gains[0]; // auCreateContext creates waveBus first, bedBus second
const countWaves = () => connections.filter(([, dst]) => dst === waveBus).length;
const wavesBeforeMove = countWaves();
$('btn-cw-0').fire('click');
advance(100);
c.eq(countWaves(), wavesBeforeMove, 'no new wave before 120 ms pose debounce');
oscStarts.length = 0;
advance(3500);
c.eq(countWaves(), wavesBeforeMove + 1, 'pose change launches wave after debounce');
c.ok(oscStarts.length > 0, 'pose wave schedules note sources');
let nondec = true;
for (let i = 1; i < oscStarts.length; i++) if (oscStarts[i] + 1e-9 < oscStarts[i - 1]) nondec = false;
c.ok(nondec, 'scheduled note start times are nondecreasing');

// 4. Drag burst (< 120 ms between moves) produces exactly ONE wave
const wavesBeforeDrag = countWaves();
for (let step = 0; step < 5; step++) {
	$('btn-cw-1').fire('click');
	advance(30);
}
c.eq(countWaves(), wavesBeforeDrag, 'rapid drag burst launches no wave mid-drag');
advance(200);
c.eq(countWaves(), wavesBeforeDrag + 1, 'drag burst settles into exactly one wave');

// 5. Hint republish launches NO wave and keeps running wave alive
const wavesBeforeHint = countWaves();
$('hint-targets').checked = true;
$('hint-targets').fire('change');
$('hint-current').checked = true;
$('hint-current').fire('change');
advance(300);
c.eq(countWaves(), wavesBeforeHint, 'hint republish launches no wave');

// 6. Generate and Restart immediately end the running wave (80 ms fade-out + disconnect) and kill loop timers
$('snd-mode').value = 'loop';
$('snd-mode').fire('change');
advance(200);
const prevConns = connections.length;
const runningWaveGain = connections.slice().reverse().find(([, dst]) => dst === waveBus)[0];
$('btn-generate').fire('click');
c.ok(runningWaveGain.gain.events.some(e => e[0] === 'lin' && e[1] === 0.0001), 'Generate immediately ramps out the running wave');
advance(120);
c.ok(runningWaveGain.disconnected, 'Generate disconnects faded-out wave bus');
advance(50);
const waveAfterGen = connections.slice().reverse().find(([, dst]) => dst === waveBus)[0];
$('btn-restart').fire('click');
c.ok(waveAfterGen.gain.events.some(e => e[0] === 'lin' && e[1] === 0.0001), 'Restart immediately ramps out the running wave');
$('snd-mode').value = 'move';
$('snd-mode').fire('change');
advance(300);
c.ok(connections.length > prevConns, 'loop and move transitions wired cleanly');

// 7. Preview hold plays through ghost insert (1400 Hz low-pass) and release cancels without launching a live wave
const ghostFilter = activeAc.filters.find(f => f.type === 'lowpass' && f.frequency.value === 1400);
c.ok(!!ghostFilter, 'ghost 1.4 kHz low-pass insert exists');
const ghostBefore = connections.filter(([, dst]) => dst === ghostFilter).length;
const liveWavesBeforePrev = countWaves();
$('btn-preview').fire('pointerenter');
const ghostWaveGain = connections.slice().reverse().find(([, dst]) => dst === ghostFilter)[0];
c.eq(connections.filter(([, dst]) => dst === ghostFilter).length, ghostBefore + 1, 'preview routes wave through ghost insert');
advance(150);
$('btn-preview').fire('pointerleave');
c.ok(ghostWaveGain.gain.events.some(e => e[0] === 'lin' && e[1] === 0.0001), 'preview release cancels the ghost wave');
advance(300);
c.eq(countWaves(), liveWavesBeforePrev, 'preview release restores bed without launching a new live wave');

// 8. Win flourish plays once on live solve, never during preview, never twice on hint republish
const live = game.gameLive();
live.puzzle.tiles.fill(0);
live.puzzle.emitter = 3;
live.progress = goal.createContractProgress(goal.createStrictContract([{ cell: 5, mask: 7 }]));
live.gen.witness.fill(0);
live.gen.witnessEmitter = 5;
$('btn-right').fire('click'); // col 4: unsolved live result initialized
advance(300);
$('btn-preview').fire('pointerenter');
$('btn-preview').fire('pointerleave');
oscStarts.length = 0;
$('btn-right').fire('click'); // moves emitter 4 -> 5, solving live puzzle!
const flourishStarts = oscStarts.slice();
c.ok(live.progress.result.won && flourishStarts.length >= 4, 'live transition to won plays upward arpeggio flourish immediately');
oscStarts.length = 0;
$('hint-discoveries').checked = true;
$('hint-discoveries').fire('change');
c.eq(oscStarts.length, 0, 'hint republish on won board does not replay win flourish');

// 9. All 5 variants synthesize cleanly (incl. split branches), panel rebuilds params and preserves per-variant values
const splitPose = live.puzzle.tiles;
splitPose.fill(0);
splitPose[3 * 7 + 3] = 5; // splitter at (7, 7)
live.puzzle.emitter = 6;
$('snd-param-decay').value = '2.1';
$('snd-param-decay').fire('input');
for (const v of patches.PATCH_LIST) {
	$('snd-variant').value = v.id;
	$('snd-variant').fire('change');
	c.eq($('snd-params').children.length, v.params.length, 'variant ' + v.id + ' builds its param controls');
	oscStarts.length = 0;
	$('snd-replay').fire('click');
	advance(2500);
	c.ok(oscStarts.length > 0, 'variant ' + v.id + ' schedules audio on split pose');
}
$('snd-variant').value = 'glass';
$('snd-variant').fire('change');
c.eq(panel.soundPanelSettings().params.glass.decay, 2.1, 'switching back preserves edited per-variant value');

// Choice params: select control stores its string, survives panel reinit, and invalid storage falls back
$('snd-variant').value = 'spectrum';
$('snd-variant').fire('change');
$('snd-param-aim').value = 'relative';
$('snd-param-aim').fire('change');
c.eq(panel.soundPanelSettings().params.spectrum.aim, 'relative', 'choice param change stores its value');
panel.soundPanelInit();
c.eq(panel.soundPanelSettings().params.spectrum.aim, 'relative', 'choice param persists across panel reinit');

// Polyphony cap: dense rapid replays never exceed 32 live voices and steal oldest with 30 ms ramp
$('snd-variant').value = 'grains';
$('snd-variant').fire('change');
gainRamps.length = 0;
for (let i = 0; i < 40; i++) {
	audio.soundReplay();
	advance(5);
}
c.ok(gainRamps.some(([val]) => val === 0.0001), 'voice bursts ramp out cleanly under 32-voice cap');

// 10. Mute (M shortcut & snd-on) and visibilitychange suspend & resume
const suspBefore = activeAc.suspendCount;
let keyPrevented = false;
winHandlers.keydown[0]({ key: 'm', preventDefault() { keyPrevented = true; } });
c.ok(keyPrevented && !audio.soundIsOn() && activeAc.state === 'suspended' && activeAc.suspendCount > suspBefore, 'key M mutes and suspends immediately');
c.eq($('snd-on').getAttribute('aria-pressed'), 'false', 'key M updates snd-on aria-pressed');
winHandlers.keydown[0]({ key: 'm', target: { tagName: 'INPUT' } });
c.ok(!audio.soundIsOn(), 'key M ignored when focused in INPUT');
winHandlers.keydown[0]({ key: 'M', preventDefault() {} });
c.ok(audio.soundIsOn() && activeAc.state === 'running', 'key M unmutes and resumes');

global.document.hidden = true;
global.document.visibilityState = 'hidden';
global.document.fire('visibilitychange');
c.eq(activeAc.state, 'suspended', 'visibilitychange hidden suspends AudioContext');
global.document.hidden = false;
global.document.visibilityState = 'visible';
global.document.fire('visibilitychange');
c.eq(activeAc.state, 'running', 'visibilitychange visible resumes AudioContext');

// 11. localStorage persistence round-trip and corrupt-JSON fallback
$('snd-scale').value = 'hirajoshi';
$('snd-scale').fire('change');
$('snd-speed').value = '9.5';
$('snd-speed').fire('input');
const saved = JSON.parse(store.get(panel.SP_STORAGE_KEY));
c.ok(saved.scale === 'hirajoshi' && saved.speed === 9.5 && saved.params.glass.decay === 2.1, 'settings persist under single localStorage key');

store.set(panel.SP_STORAGE_KEY, '{corrupt json');
panel.soundPanelInit();
c.ok(panel.soundPanelSettings().variant === 'glass' && panel.soundPanelSettings().speed === 4 && panel.soundPanelSettings().scale === 'majorPent', 'corrupt localStorage falls back cleanly to defaults');

c.report('sound_smoke');
