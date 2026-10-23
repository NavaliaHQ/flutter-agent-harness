---
name: simulator
description: Drive a running app on an iOS simulator to see what is actually on screen. Use to confirm a change by hand, find the real accessibility identifier of a widget, reproduce a bug, or check a screen before writing a flow for it.
---

# Simulator

Maestro proves a journey. This proves what is on screen right now, in seconds, which is what you need while building and before writing the flow that will drive it.

Launch the app with the command in `.agents/project.md`. Everything after that is `ma`, which resolves the booted simulator on its own:

```bash
.agents/skills/simulator/scripts/ma.mjs help
```

Requires AXe 1.8.0 or newer (`brew install cameroncooke/axe/axe`). `ma` is five commands on top of it; for anything else call `axe` directly and read `axe help <subcommand>`.

## The loop

1. `ma describe-ui` to see what is there
2. act: `ma tap --id <identifier>`, `ma gesture --preset scroll-down`, `axe type --text ...`
3. `ma wait --changed` or `ma wait --id <identifier>` to confirm the screen moved

Never act on a screen you have not described. Coordinates read off a screenshot and identifiers remembered from the Dart source are both guesses, and both fail quietly.

Never `sleep`. A fixed sleep is either too short and flaky or too long and slow, usually both. `ma wait` returns the moment the condition holds and fails with the poll count when it does not.

## Spend as few turns as you can

Every command you run alone is a round trip, and every screen you print is context you do not get back. Three habits cover it:

- **Known path, one call.** Once you know the steps, `ma batch --step "tap --id a" --step "tap --id b" --describe-after`. Six taps and one screen beats six calls and six screens.
- **Let the action return the screen.** `--describe-after` on `tap` and `batch`, and `ma wait` already prints the UI it matched on. Do not follow an action with a separate describe.
- **Ask for less.** `ma describe-ui --point x,y` when you only need one element. `ma wait --id <x>` instead of describing repeatedly to see whether something arrived.

A describe you print "just to check" is a few thousand tokens that push out something you needed.

## What `ma` adds over `axe`

| | |
|---|---|
| `describe-ui` | the raw tree is around 500 KB and will not survive two calls in one context. Compacted to a few KB: `i` id, `l` label, `t` type, `e:0` disabled, `v` value, `p` center when the selector is ambiguous. Offscreen and zero-size nodes are dropped, so scroll and describe again |
| `wait` | polls until a selector appears, disappears, or the screen changes. `--scroll scroll-down` to reach a row that is not rendered yet, giving up when scrolling stops changing anything |
| `tap` | retries by center point when Flutter reports one widget as several accessibility nodes and AXe refuses the ambiguous selector |
| `batch` | many steps in one call, with the resulting screen. Never retried after a failure, since half of it already ran |
| `gesture` | explicit swipes computed from the real screen size. AXe's own scroll presets exit 0 and move nothing on iOS 26.5 |
| all of them | restart the accessibility bridge when it dies mid session, then retry. Only for commands that are safe to run twice |

## Use it to find real identifiers

This is the highest value use. Before writing a Maestro flow or asserting on an identifier, describe the screen and read the identifier that is actually there. One inferred from the Dart source is a guess that costs a two minute build to disprove.

Changing copy changes labels. Changing the widget tree changes what is addressable. The tree is the source of truth, not the code you just read.

## Write down what you learn

`ma` knows how to drive a simulator. It does not know this app: which screen the sign in lives on, what the bottom tabs are called, that one list needs a location picked before it renders. Working that out from scratch costs a session every time, and the second agent to need it pays again.

So keep it. `.agents/skills/app-navigation/SKILL.md` is this project's map, written by whoever learns something and read before the next session touches the simulator. Create it on first use:

```markdown
---
name: app-navigation
description: Drive this app on the simulator: launch, sign in, reach each area, and the gotchas that cost a session. Use with the simulator skill whenever interacting with the running app.
---
```

What goes in, each entry short enough to scan:

- **Recipes.** The exact commands for the paths you take often: launch and reach the home screen, sign in, reach each main area. A `ma batch` line that works is worth more than a description of the screens.
- **Selectors.** The identifiers that matter, grouped by screen. These rot, so note how to re-derive them: describe the screen.
- **Gotchas, with the cost.** What looked broken and was not. A screen that needs a precondition, a list that renders empty until something is selected, a permission dialog that only appears on first launch.

Add an entry when something cost you more than a minute and the code could not have told you. Keep it a map, not a manual: the moment it reads like documentation, nobody reads it. Fix entries that turn out wrong rather than appending a correction underneath.

## What it cannot prove

It shows the state you reached by hand, right now. It does not prove the app reaches that state on its own, or that it still will after your next change. When something matters enough to confirm this way, it matters enough for a test. The real check goes in the evidence block.

## Screenshots and video

`xcrun simctl io booted screenshot out.png` and `xcrun simctl io booted recordVideo out.mov`. Hardware encoded. AXe ships its own versions, ignore them.

Read the screenshot before concluding anything about a failure. The common case is that navigation worked and the assertion target moved.
