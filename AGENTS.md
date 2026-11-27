# AGENTS.md

## style

- use a single tab indentation. LF end.
const $ = id => document.getElementById(id);

- avoid deep nesting of braces { } and long if-else; flatten with early returns, helper functions, or flat data tables.
- avoid duplication of code.
- avoid allocations in the hot path (per-frame loop, sim, render): no new {}, [], object literals, closures, or string concat in the frame loop. Reuse preallocated buffers / typed arrays / scratch objects; allocate once at setup, mutate in place per frame. These are not strict rules, use best.
- comments say why and decisions only. what-code-does belongs in names.
- 0-2 comments per function is normal. 3+ usually means names or structure are wrong — rename or restructure, don't comment.
- no banners, no commented-out code, no TODOs in code — that goes to plan or findings instead.

good:
	// 2x step: halves samples, still >60fps (plan 0.3, log 11-02)
not good:
	// increment i
	// loop over items

- no legacy support, no old versions, no outdated browsers, no leftovers and no over protecting from unreal edge cases. we need clean architecture.

good:
obj.action(obj.data)
obj.data.action()

not good:
getObj().data().action()

## runtime

- file:// friendly, classic <script> tags, no modules, no build.
- guard module.exports so files also run under node.
- no internet links: vendor any lib as a local js file.

## architecture

- index.html defines script load order. plain top-level globals, no per-file IIFE, no modules.
- one composer file owns root, $, shared objects and the boot tail. it implements nothing.
- feature files own their state and DOM refs. never reach into another file's internals.
- shared code gets a named owner. no junk drawers: no state.js, utils.js, misc.js, common.js.
- no definition-time cross-file reads: other files' code is called from inside functions only.
- top-level names must not collide with index.html ids (window[id] binding). check before adding any global. on collision: rename the newer binding; collision patterns -> findings.

## files

- every source file starts with a 1-2 line header:
	// owns: input handling and rebinding
	// edit for: key maps, bind changes
- relevance is decided from head -12. never read a full file just to learn what it is.

- keep this map updated when ownership changes:
	index.html — owns canvas root, controls and script load order. edit for load order and markup.
	board.js — owns geometry, ring strides, cell relief glyph map, player moves, emitter. edit for stride table, corner rule, center flip, cell glyph table, emitter range.
	trace.js — owns light transport trace and buffers. edit for propagation rules, mirror splits.
	contract.js — owns secret contracts, scoring, allocation-free win predicate and discovery history. edit for quotas, colors and feedback.
	difficulty.js — owns fixed-budget walk score and bounded shortest-solve BFS diagnostics. edit for walk budget, action graph, BFS cap and turn tables.
	hints.js — owns hint checkbox state and renderer-facing overlay selection. edit for visibility and preview suppression.
	presets.js — owns compact count-preserving fallback templates and their decoding. edit for template codec; data is rebuilt by experiments/build_presets.js.
	generate.js — owns solvable generation, dial profile, walk-score selection and verified count-specific fallback. edit for sampling, profile anchors, scramble policy, candidate selection and metadata.
	rim.js — owns out-of-border rim items (boiler, lamp, billboard, crystal, detector, power cell, rail) and receiver-to-item wiring. edit for rim visuals, wiring and state animations.
	render.js — owns the glass render skin: canvas painting of pose, animated beams, receivers, overlays and sizing. edit for glass skin visuals, dash motion, overlay shapes.
	renderAlt.js — owns the prototype render skin: rounded glass, solid additive beams, diamond targets. edit for prototype skin visuals, beam glow, overlay shapes.
	skins.js — owns render skin selection, beam ray style and the page-facing render entry points. edit for adding or switching a skin or ray style; skins expose interface-named functions (glass*, renderAlt*).
	sonify.js — owns DOM-free trace-event to score mapping, musical scales, pitch sources, density caps and leak gating. edit for mappings, scales and caps.
	patchesFlow.js — owns continuous branch-following and granular synth variants (Prism Pad, Comet, Crystal Grains). edit for portamento, HRTF Doppler and grain clouds.
	patchesSpectrum.js — owns the Spectrum Drift noise-band variant: R/G/B bands as subtractive color, direction-driven per-band pan. edit for band crossovers, aim modes, drift and tilt rules.
	patches.js — owns synth variant table, param schemas (ranges and choice selects), struck/groove variants (Glass Harp, Pulse), harmonic bed, emitter breath and win flourish. edit for variant registry and struck/bed timbres.
	soundfx.js — owns physical board mechanism synthesis for concentric square rotations and emitter x-rail movement (drum mechanism for Spectrum Drift, prolonged rusty-bearing roll with per-slot tonal accents for other voices). edit for drum/bearing timbres, ring mass scaling and rail slide acoustics.
	audio.js — owns AudioContext lifecycle, master/sfx buses, reverb IR, lookahead scheduler, waves, bed crossfade and soundView/sfx sinks. edit for timing, mixing, ghost preview and polyphony cap.
	soundpanel.js — owns Sound panel DOM controls, Sound on checkbox + click-anywhere gesture unlock, movement sound selector with voice auto-switch (spectrum -> drum, else bearing), dynamic variant parameter block and localStorage persistence. edit for controls, defaults and storage schema.
	game.js — owns live puzzle/progress state, normalized generation settings, preview switching and active readouts. edit for game flow, settings normalization and wording.
	input.js — owns pointer, wheel, drag gestures, ring keys, bindings, setting labels and regenerate-on-change triggers. edit for bindings, labels, drag tuning and hit rules.
	app.js — composer: root, $ and boot wiring only. implements nothing.
	experiments/check.js — owns fixture assertion counters. edit for assertion helpers.
	experiments/move_fixtures.js — owns 0.1 move invariant fixtures. edit for stride, corner, center, emitter cases.
	experiments/trace_fixtures.js — owns 0.2 transport fixtures. edit for propagation cases.
	experiments/contract_fixtures.js — owns 0.3 scoring, discovery, contractState, hint and script-order fixtures. edit for contract cases.
	experiments/generate_fixtures.js — owns 0.4/0.8 generation acceptance. edit for count, profile, scramble, selection, catalog and fallback cases.
	experiments/difficulty_fixtures.js — owns 0.8 predicate agreement, walk, BFS and isolation acceptance. edit for metric and search cases.
	experiments/calibrate.js — owns 0.8 split-seed difficulty calibration, independent probes, BFS subset, timing and count-11 gate. run with split=train|heldout; high= sweeps the target anchor.
	experiments/compare.js — owns keyed diff of two fixed-key logs with abs/rel thresholds.
	experiments/build_presets.js — owns deterministic preset catalog construction. run to rewrite PRESET_CODES in presets.js.
	experiments/dom_smoke.js — owns integration and classic-scope smoke under a stub DOM. edit for boot, handlers, regenerate-on-change controls and rim-item coverage.
	experiments/skin_fixtures.js — owns render skin dispatch smoke. edit for skin switch, prototype paint and rim-item adoption.
	experiments/sonify_fixtures.js — owns 0.7 score mapping, scale membership, caps, leak rule and bed fixtures. edit for sonification cases.
	experiments/score_dump.js — owns 0.7 event-count, chord-density and duration measurement across generated puzzles.
	experiments/sound_smoke.js — owns 0.7 AudioContext, scheduler, wave lifecycle, variants, Sound panel and persistence smoke.
- new code goes to its owner, never appended "because the file is already there". no owner exists -> new file + header + map entry.
- file > ~500 lines = defect. split by feature within the same plan.
- moves are pure moves: contiguous ranges, snap to enclosing declarations, no behavior change.
- refactor or dedup mixed into a move = defect. separate plan, record the idea as a finding.

- findings-pitfalls-skills.md — notes and pitfalls for LLM agents. write here if found a good way to do something.
- archive/ — implemented plans, worklogs.

## plans

- plan*.md is NOT the implementation log. final plan = standalone design artifact, written as if implemented today: no references to chat, to what was tried, or to what was done. usable for a fork or reimplementation.
- plan files are `<number>-<topic>-plan.md` (e.g. `0.6-Out-of-border-items-plan.md`); numbers (0.1, gui.1) identify subjects, not version or execution order. ok to continue old numbers by subject and implement in any useful order.
- drafts (`<number>-<topic>-draft.md`) — human thoughts about goals and design. user prompts may be stored as drafts to keep a reference of the global task.

## worklogs

- worklog = index + evidence, not a diary. it has two future readers: the agent bisecting a regression into this change, and whoever forks or reimplements.
- worklog is named after its plan: archive/0.1-Board-and-player-moves-plan.md -> archive/0.1-Board-and-player-moves-worklog.md.
- entry <= 15 lines:
	plan id
	changed: file + nature (move/feature/fix), one line each
	validation: what ran, result, key numbers
	decisions and why — the only part anyone rereads
	pitfalls: one line here, full note in findings
	next step suggestion
- never record: plan restatement, attempt narrative, code walkthrough. git already has the diff.
- placement of process text:
	archive/ — how it was done
	findings — reusable lessons
	README — how to run only, <=10 lines, changes only when run instructions change
	in-game help / tooltips — written as if the product shipped today
- dev-process text anywhere else (README, in-game help, UI, tooltips) = defect.
- "we added a button to sum a and b" never exists outside archive/.

## experiments

- experiments/ — node measurement scripts, never loaded by the page.
- logs are machine format: fixed keys, fixed units, one line per metric.
	fps_pre=58 fps_post=61 step=2x plan=0.3
	a log a human must parse is a defect.
- comparison = a ~15-line node script: diff two logs by key, flag |delta| > 5%. conclusion (1 sentence + numbers) -> findings, raw stays in logs.
- keep only runs that produced a decision. prune the rest when the plan closes.

## validation

- scope = blast radius of the change. never "run everything to be safe".
	L0	node --check on touched files. every edit batch. seconds.
	L1	targeted smoke of the touched area (dom_smoke etc.). after a behavior change or a code move.
	L2	full suite + manual pass list. plan completion, handoff, or shared/boot files touched (index.html, load order, composer).
- leaf file touched -> L1 max. shared/boot touched -> L2.
- previous stage's validation stands until something it covers changes. no reruns to feel safe.
- batch checks at checkpoints, never per file inside one move. full tests after every work = CPU defect.
- manual pass list (what to verify by hand: look, sound, feel) lives in the plan.
- one file per commit (bisectable).

## workflow

- start work with review of the previous task: it was done by another agent and you can find a better way or real issues.
- same review polices compliance — comment budget, worklog format, placement. fix in place, one line in your own worklog. no test reruns: previous stage already validated it, rerun only what your fix itself touches.
- review the next step plan. improve it only with a concrete reason, then implement.
- record steps and validation in `archive/*-worklog.md` per `## worklogs`.
- end the job with a next step suggestion.

## sandbox

- git push returns "Invalid username or token" is ok, no need to investigate or report - i will apply manually

## current workstream

0.1–0.6 + 0.9 done: 15×15 board with 49 rotatable glass cells (`CELL_SHADE` + `CELL_GLYPHS`), RGB trace, secret contract + hints, two render skins (`render.js` glass, `renderAlt.js` prototype) behind `skins.js` with `ray` core selector, and reactive `RIM_PAD` items (`rim.js`).
0.8 automated steps done: exact-count generation (`1..49` mirrors, verified `presets.js` fallback), walk-score selection (`0.20 + 0.80·d` calibrated on held-out seeds, `difficulty.js` BFS diagnostics), and immediate regenerate-on-change controls.
0.7 automated steps done: `trace.js` logs depth-monotonic photon events (`EV_GLASS`/`FILTER`/`REFLECT`/`SPLIT`/`ABSORB`, branch + fork ids, cumulative bend/bounce, `|Δ gen_ms| <= 4.6%`); `sonify.js` snapshots leak-safe preallocated scores; `audio.js` + `patches.js` + `patchesFlow.js` + `soundpanel.js` drive lazy Web Audio waves, sustained receiver bed, ghost preview, win flourish, `M` mute and `localStorage` persistence (`sonify_fixtures`, `sound_smoke`, 21-script `dom_smoke`).
0.7.5 done: sixth synth variant `Spectrum Drift` (`patchesSpectrum.js`): per-branch noise voice whose R/G/B band filters are the spectrum, splits redirect bands subtractively (fork aliases the parent voice), per-band pan driven by travel direction with absolute|relative aim (first choice params: panel selects + audio resolver), doppler tilt for vertical travel, landing pings, 6-voice registry with slot recycle; notes carry `ref` reflect bits (`sonify_fixtures` +2).
0.7.6 done: `Sound on` checkbox (checked by default, persisted, `M` toggle) unlocks Web Audio on check and on any click while checked for Chromium autoplay; `soundfx.js` adds dry low-mechanism square rotation SFX (scaled by ring mass and quarter/single stride) and x-panned emitter rail slide + detent SFX (`sound_smoke` 62/62, `dom_smoke` 243/243).
0.7.7 done: movement sound selector (`#snd-move`, persisted `moveSound`) with voice auto-switch (`spectrum` -> drum mechanism, every other voice -> prolonged rusty-bearing roll with per-slot/per-column tonal accents); manual choice sticks until the next voice change, legacy storage derives from the voice (`sound_smoke` 91/91, `dom_smoke` 246/246).
next: 0.7 + 0.7.5 + 0.7.6 + 0.7.7 + 0.8 browser manual passes (listening pass in `0.7-Sound-photon-sonification-and-sound-panel-plan.md`, aim/drift/tilt pass in `0.7.5-Spectrum-drift-synth-plan.md`, mechanism/rail/unlock pass in `0.7.6-Sound-checkbox-and-mechanism-sfx-plan.md`, movement selector/bearing pass in `0.7.7-Movement-sound-selector-plan.md`, feel pass in `0.8-Sparse-mirrors-and-measured-difficulty-plan.md`). deferred: visible photon head (`0.7` optional step), emitter width (`0.1`), ring rotation transition polish.

## housekeeping

- this file is editable law: a rule that produced a bad outcome gets fixed in place, never worked around.
- prune dead rules when a plan closes. target < 150 lines — the "don't waste context" rule applies to this file itself.
