input controls
changed: input.js (fix: bounded wheel steps and burst cooldown; feature: per-square buttons and shortcuts)
changed: index.html (feature: two-column rotation controls and separate emitter controls)
changed: experiments/dom_smoke.js (coverage: wheel timing, magnitudes, targets, buttons and shortcuts)
validation: node --check on input.js and experiments/dom_smoke.js; move=110 trace=60 contract=84 generate=4828 dom=97, all pass
review: prior 0.7 work was a design-only sound plan; no input-related issue required a fix.
decisions: wheel delta magnitude is OS-dependent, so each accepted event is one step; 60ms coalesces bursts while direction or target changes act immediately. Browser wheel events cannot reliably identify physical detents on every device.
next: manually check wheel feel on mouse and trackpad, and controls on a narrow screen.
