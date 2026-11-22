# adj-light-square-minigame

Open `index.html` in a browser (file://, no build, no network).

Two visuals share one backend; the renderer is a pluggable, optional skin:
- `index.html` + `render.js` — the current skin.
- `old-visual.html` + `skin-old.js` — the old-prototype visual style (see commit f286079).

Pick the skin by which HTML you open; both adopt the out-of-border rim items (plan 0.6).

Fixture checks:

	node experiments/move_fixtures.js
	node experiments/trace_fixtures.js
	node experiments/contract_fixtures.js
	node experiments/generate_fixtures.js
	node experiments/difficulty_fixtures.js
	node experiments/dom_smoke.js
