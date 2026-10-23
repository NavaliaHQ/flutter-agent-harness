# Agent guide

Find the nearest file that already does what you are about to do, and follow it. A sibling page, a sibling cubit, a sibling usecase, the test next to it. The architecture, the error handling, the layer layout and the naming are all visible there, and the analyzer enforces the rest.

No stack is named in this file. A neighbour shows it better and stays current. What the code cannot show you is in `.agents/facts.md`, and what this repo runs is in `.agents/project.md`. Read both before designing anything.

## A human approves every line

AI writes code here, and AI reviews it. Neither of those is the gate. A human reads the change and approves it, and that human is not the author and did not watch it being written.

Everything you produce is addressed to that person: the code, the commit, the MR description, the review reply. If it is long enough that they skim, the review did not happen, and a rubber stamp is worse than no review because it looks like one.

So:

- Write so it can be read line by line. Length is the enemy, not difficulty.
- Use plain words. Prefer the short word to the impressive one, the direct sentence to the qualified one.
- Say the thing once. No restating the subject in the body, no summarising the diff in prose, no design essay defending a choice.
- Leave the reviewer able to disagree. State what changed and what stayed the same.

The same applies to the code. An abstraction with one implementation, a wrapper that only forwards, a parameter nobody passes, a layer added for a case that does not exist yet: each one is another thing the reviewer has to hold in their head. Build what the task needs and nothing beyond it.

Write names out in full. `button`, not `btn`. `repository`, not `repo`. `response`, not `res`. The abbreviation saves whoever types it four characters and costs every later reader a guess, and the ones that feel obvious while you are writing them are the domain ones a new reviewer has never seen.

Prefer the obvious construct to the clever one: the early return over the nested condition, the named variable over an expression inlined three levels deep, the plain loop over the chain that has to be unpicked to be read.

**Do not add comments.** Not to explain what a line does, and not to explain why it is written that way. Count the prose comments already in this codebase before you argue with that: the number is near zero, and it is not an accident. A line that needs a comment to be understood needs a better name, a smaller function, or a test whose name says it. When the reason is real and cannot live in the code, it goes in the commit body and the MR, where the reviewer reads it once and git keeps it forever, instead of in a line that drifts out of date with the code under it and misleads the next person. And when it is bigger than this change, something later work has to stay in step with, it goes in `.agents/facts.md` as well, dated. The commit body is read by whoever reviews this diff; `.agents/facts.md` is read by whoever designs the next one.

Never paste raw AI output into an MR, a review reply, a ticket, or a team conversation. Read it first, cut it, and make it yours.

## Verification and evidence

Nothing is done because it looks done. Every claim you hand back is backed by a command that ran in this worktree, or it is named as unchecked.

What each tool proves, and what it does not:

| | proves | does not prove |
|---|---|---|
| analyzer | it compiles and passes the lint rules | that it does the right thing |
| unit test | one unit behaves as specified, in isolation | that it is reachable from the app |
| widget test | the widget renders and reacts, with mocked dependencies | that the real screen ever reaches that state |
| integration flow | the real app, on a real device, through the real screens | anything the flow does not touch |
| simulator session | what is on screen right now | that it survives your next change |

A mocked dependency proves nothing about the dependency.

Write or run an integration flow when:

- the change adds a user journey that has no flow yet. Write it.
- you fixed a bug in an edge case. Add the flow that fails against the old code, so it cannot come back.
- a flow already covers a screen you changed. Run it.

Otherwise run the unit and widget tests, and say which flows you did not run.

A flow is also the best place to reproduce a bug, not only to guard it afterwards. The mock backend is the part that makes it worth the minutes: you can force the exact response that triggers the failure, hold the state still, and replay it as many times as you need, none of which a device in your hand gives you. When you have the flow, prove it twice: it fails with your change reverted, and passes with it in. That pair, both runs quoted, is worth more than any argument in the handback.

Most bugs are reachable that way. Some are not: a race, a rendering that only one device gets wrong, a state only the real backend produces. When yours is one of those, say which and fall back to the simulator or a unit test, rather than bending a flow until it proves something adjacent to the bug.

The `maestro` skill carries the flow conventions and what the runner hands back. The `simulator` skill drives the running app, so you can read the real accessibility identifier off the screen instead of guessing it from the Dart source. Load them before writing a flow or inventing a selector, not after the run fails.

Run the checks cheapest first: format, lint, the tests for the files you touched, the full suite, then the flow. **Stop at the first red and report it.** Eight minutes of suite with the analyzer red costs the engineer time to tell them what they already knew. Do not quietly fix what you find on the way, unless fixing it was the task: a failure you repair in silence is a failure nobody knows happened.

**Never `sleep` to wait for a command.** A command you put in the background tells you when it exits, and that notification is the only thing you wait on. There is no case where a timer beats it: guess short and you poll an unfinished run, guess long and you sit idle past the end. A session that spends a third of its minutes sleeping did not run a slow suite, it ran a fast one badly.

So: launch it in the background, then do the next useful thing with the time, reading the files you will need next or preparing the follow-up command. When nothing else can move until that result lands, say so in one line and stop. The notification will wake you.

Every handback ends with this block, in this shape:

```
## Evidence
- `<lint>` -> 0 issues
- `<test> test/features/order/add_item_test.dart` -> 12 passed
- `<integration> --flow integration_test/order/add_item.yaml` -> passed, artifacts in build/.integration/20261016-1130/
- not checked: Android, the flag-off path
```

A line you did not run does not go in the block. "not checked" is a sentence of the report, not an apology.

## Check what you claim

Run the check that would fail if the claim were false, and run it before you write the sentence, not at the end.

- "This is unused" means you grepped for it.
- "These two do the same thing" means you diffed their output.
- "This fixes it" means you reproduced the failure first, then showed it gone.
- "This change is safe" means you ran it and then read `git status` and the diff.

Then say where it came from, so the reader can redo the check without taking your word for it: the `file:line`, the command and what it printed, the URL. "The docs say" with nothing behind it is a guess in a confident voice, and the cost of one landing is not the wrong answer, it is that nobody trusts the right ones afterwards.

Your own memory is not a source, including something you read earlier in the same session. Re-read the file and re-run the command. The details that decay first are the numbers, and those are usually the ones that decide.

When you could not check something, name the unchecked claim instead of softening the words around it. A hedge reads like a weak fact. "I did not run this" reads like what it is.

## Working

1. `git status --short --branch` first. Do not touch pre-existing changes without permission.
2. Ask when the answer would change what you build, and skip it when it would not. A small, direct task with an obvious shape needs no interview, and asking anyway is a toll on someone who already told you enough. A bug is usually not that task: the steps tell you what to press and nothing about what should have happened instead, so a ticket with repro steps is not the same as a ticket with enough. Before the first edit, say what you are assuming and ask for the one or two things that would most reduce the risk of fixing the wrong thing: the screenshot or the video of it happening, the stacktrace, the log line, the device and build, the account. A feature has the mock, the copy, and the state nobody drew. When you truly need nothing, say so in one line along with the assumption you are making, then start on the part that does not depend on an answer rather than waiting for one. When a ticket is involved, read its attachments before its description: the preconditions are usually in the screenshots, not the prose.
3. Reproduce a bug before you fix it, and keep what it looked like. The failing test, the log line, the screenshot of the wrong screen: that is the first half of the evidence, and the fix is only worth as much as the failure you can show next to it. When you cannot reproduce it, say so and name what stops you, specifically: the account you do not have, the backend state nobody can set locally, the device nobody has. Then say what you changed and why you believe it, so the reviewer knows they are the one testing it.
4. Read the full affected files and their callers, then fix it at the deepest layer that owns the problem, not the first one where the symptom disappears. Keep going down while the answer to "would this still be wrong if the layer above were correct?" is yes. A guard in the screen that renders stale data is a band-aid when the data was never cleared; a guard in every caller is a band-aid when one shared function could carry it. Say in the handback which layer you fixed at and what you ruled out below it, so the reviewer can disagree with the depth and not just the diff.
5. Search before you write anything. Something here probably already does it, or does most of it: a helper, an extension, a base class, the same problem solved one directory over. Grep for it rather than assuming it does not exist. Then ask whether the simpler thing already in the codebase would do, before reaching for a new abstraction or a new dependency. Code you did not write is code nobody has to review, break, or maintain.
6. Every non-trivial behavior change needs the smallest test that would fail if the real code regressed, including the flag-off path when a flag is involved. Test it through the public API.
7. Do not reshape production code to serve a test or a debug screen. Debug freely while you work; what ships has to stand on its own. No member widened so a test can reach it, no parameter that exists for a tool, no second code path taken only by the test build, no method added to a production service so a debug screen can display something. A test that is hard to write is telling you about the design: fix the design, or drive it from the public method that already calls it. When a debug screen needs what production does not expose, that is missing observability: add the log or the metric, which everyone gets, rather than a side door one screen uses. The exception is the obvious one, when the test found a real bug: fix the bug.
8. Stop after three failed attempts. Name the assumption that was wrong and collect one diagnostic instead of guessing again.

Before handing back, run the format, lint and test commands in `.agents/project.md`, or say plainly which you skipped. Never claim a check passed unless its command completed in this worktree.

## Never without being asked

Create or switch branches, stage, commit, push, open or update an MR, post a comment, approve, or create a ticket.

Never expose tokens, credentials, or private customer data outside approved systems.

Never hand-edit generated files or lockfiles. Change the source and regenerate.

## This project

- `.agents/project.md` — the commands, the flavors, how this repo points at its mock server. Read it before you run anything.
- `.agents/facts.md` — what the code cannot tell you: what is being replaced, what is half migrated. Read it before you design anything.
- `.agents/review-misses.md` — what a human caught that an AI review walked past. Read it before reviewing, and add to it when it happens again.

This file belongs to the harness and is overwritten when it updates. Those three belong to the team and are never touched.
