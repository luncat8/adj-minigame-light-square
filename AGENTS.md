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
	board.js — owns geometry, ring strides, player moves, emitter. edit for stride table, corner rule, center flip, emitter range.
	trace.js — owns light transport trace and buffers. edit for propagation rules, mirror splits.
	contract.js — owns secret contracts, scoring, allocation-free win predicate and discovery history. edit for quotas, colors and feedback.
	difficulty.js — owns fixed-budget walk score and bounded shortest-solve BFS diagnostics. edit for walk budget, action graph, BFS cap and turn tables.
	hints.js — owns hint checkbox state and renderer-facing overlay selection. edit for visibility and preview suppression.
	presets.js — owns compact count-preserving fallback templates and their decoding. edit for template codec; data is rebuilt by experiments/build_presets.js.
	generate.js — owns solvable generation, dial profile, exact-count sampling, replay-verified witnesses and preset candidates. edit for sampling, profile anchors, scramble policy, fallback assembly.
	rim.js — owns out-of-border rim items (boiler, lamp, billboard, crystal, detector, rail). edit for rim visuals and state animations.
	render.js — owns canvas painting of pose, animated beams, receivers, overlays and sizing. edit for board visuals, dash motion, overlay shapes.
	game.js — owns live puzzle/progress state, preview switching and readouts. edit for game flow, band labels, wording.
	input.js — owns pointer, wheel, drag gestures, ring keys and button bindings. edit for bindings, drag tuning, hit rules.
	app.js — composer: root, $ and boot wiring only. implements nothing.
	experiments/check.js — owns fixture assertion counters. edit for assertion helpers.
	experiments/move_fixtures.js — owns 0.1 move invariant fixtures. edit for stride, corner, center, emitter cases.
	experiments/trace_fixtures.js — owns 0.2 transport fixtures. edit for propagation cases.
	experiments/contract_fixtures.js — owns 0.3 scoring, discovery, contractState, hint and script-order fixtures. edit for contract cases.
	experiments/generate_fixtures.js — owns 0.4/0.8 generation acceptance. edit for count, profile, scramble, catalog and fallback cases.
	experiments/difficulty_fixtures.js — owns 0.8 predicate agreement, walk, BFS and isolation acceptance. edit for metric and search cases.
	experiments/build_presets.js — owns deterministic preset catalog construction. run to rewrite PRESET_CODES in presets.js.
	experiments/dom_smoke.js — owns 0.5–0.6 integration and classic-scope smoke under a stub DOM. edit for boot, handler and rim-item coverage.
- new code goes to its owner, never appended "because the file is already there". no owner exists -> new file + header + map entry.
- file > ~500 lines = defect. split by feature within the same plan.
- moves are pure moves: contiguous ranges, snap to enclosing declarations, no behavior change.
- refactor or dedup mixed into a move = defect. separate plan, record the idea as a finding.

- findings-pitfalls-skills.md — notes and pitfalls for LLM agents. write here if found a good way to do something.
- archive/ — implemented plans, worklogs.

## plans

- plan*.md is NOT the implementation log. final plan = standalone design artifact, written as if implemented today: no references to chat, to what was tried, or to what was done. usable for a fork or reimplementation.
- plan numbers (0.1, gui.1) identify subjects, not version or execution order. ok to continue old numbers by subject and implement in any useful order.
- drafts (0.1.x-draft.md) — human thoughts about goals and design. user prompts may be stored as drafts to keep a reference of the global task.

## worklogs

- worklog = index + evidence, not a diary. it has two future readers: the agent bisecting a regression into this change, and whoever forks or reimplements.
- worklog is named after its plan: archive/0.1.0-plan.md -> archive/0.1.0-worklog.md.
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

0.1–0.6 implemented. Play surface animates short directed beam dashes from emitter to receiver and paints reactive rim items in `RIM_PAD` margin (`render.js`), driven by `contractState(result)` without touching trace or scoring. `dom_smoke.js` covers handlers, rim states and shared classic-script scope; L2 = all five experiment scripts whenever `index.html` or load order changes.
0.8 step 1 done: `generate(seed, mode, corner, difficulty, mirrorCount = 11)` samples exact counts via `profile()`; fallback is the verified per-count catalog in `presets.js`; the 3-stop band control maps to dials 0, 1/3, 1 until the 0.8 controls land.
0.8 step 2 done: `contractWon` (contract.js), `measureWalks` and `shortestSolve` (difficulty.js, loaded but not yet called by generation).
next: 0.8 step 3 (`0.8.0-plan.md`): 8-candidate selection by walk score with per-candidate measurement RNG streams and metadata. pending: 0.7 sound (`0.7.0-plan.md`). deferred: emitter width (`0.1.0-plan.md`), ring rotation transition polish.

## housekeeping

- this file is editable law: a rule that produced a bad outcome gets fixed in place, never worked around.
- prune dead rules when a plan closes. target < 150 lines — the "don't waste context" rule applies to this file itself.
