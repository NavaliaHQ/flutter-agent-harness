---
name: maestro
description: Write and run Maestro integration flows against the real app with a mocked backend. Use when adding a flow for a new user journey, guarding a fixed bug with a flow, running the integration suite, or debugging a failing flow.
---

# Maestro flows

A flow is the only check that proves the real app, on a real device, through the real screens. It is also the slowest, so it earns its place: a new journey, or an edge case that was broken once.

## 1. Discover, before writing anything

Never write a flow from this file alone. The three things that decide whether it runs are per repo:

- Read `.agents/project.md`: the runner command, how the app points at the mock, the widget id convention, where artifacts land.
- Read `.agents/skills/app-navigation/SKILL.md` if it exists: the recipes and selectors somebody already worked out at the simulator are the same ones your flow needs.
- Read one existing flow end to end, and every `runFlow` it includes. The entry flow that launches the app and signs in already exists. Reuse it, do not re-derive it.
- Read the mock config. If your journey hits an endpoint nobody mocked yet, the flow fails on the first screen and the failure looks like a UI bug.

If a widget you need to tap has no accessibility identifier, add one to the widget first. A flow that matches visible text instead breaks on the next copy change, and it will not be your MR that gets blamed.

## 2. Write

- One journey per file. A file that covers two is a file nobody can read a failure from.
- `label:` on every step, describing the action. No `#` comments.
- Shared steps live in the shared directory and arrive through `runFlow`, with parameters in `env:`. Env does not inherit downward, so thread it at every level.
- Prefer waiting on a state over waiting on a duration. A fixed sleep is either flaky or slow, and usually both.
- Assert on identifiers, not on copy.

## 3. Run and hand back

Run through the runner in `project.md`, never a bare `maestro test`: the runner is what builds, installs, starts the mock and cleans up.

What comes back as evidence, best first:

- the JUnit XML, when the runner emits it: a pass or fail per flow, not a log to interpret
- the mock server transaction log: proof of which endpoints the app actually hit
- the artifact directory, for the failure screenshots Maestro writes automatically

Put the flow path and the artifact directory in the evidence block.

## Adding a mock response

Usually needed for a new flow. Two edits: drop the body as its own JSON file next to the other response bodies, then add the route to the mock environment pointing at that file. Branch on a query parameter with a rule rather than inventing a second route.

Keep bodies trimmed to what the flow touches. A multi-megabyte captured payload makes every later change to that file unreviewable.

## When a flow fails

Read the failure screenshot before concluding there is a regression. The common case is that navigation worked and the assertion target moved: an identifier was renamed, or the assertion matched copy that changed. Confirm against the running app with the `simulator` skill, then fix the flow or the widget, whichever is actually wrong.

If the run never reached the app, look at the mock transaction log before anything else. A mock that returned nothing looks exactly like a broken screen.
