---
name: grill-me
description: Interrogate a plan, a design or an idea until the open decisions are settled, including the ones nobody raised: flags, rollback, how success gets measured, what failure looks like. Use before implementing anything non-trivial, or when the user asks to stress test their thinking, grill them, or poke holes in a plan.
---

# Grill me

Interview the user until you reach a shared understanding. Map the work as a design tree: every decision branches into the decisions that hang off it.

Work in rounds. The frontier is every decision whose prerequisites are already settled: the questions you can ask now without guessing at answers you have not heard yet. Ask the whole frontier in one round, numbered, each with your recommended answer. Then wait.

Format a round like this:

```
Q1 - <title>: <question, including the options>

-> <your recommended answer>

Q2 - <title>: <question>

-> <your recommended answer>
```

Word every question so that "yes" accepts your recommendation. A user who only ever answers "yes" must still end up with a coherent design.

## Three rounds, then commit

**Hard cap: three rounds.** By the fourth, attention is gone and the answers turn into rubber stamps, which is worse than an assumption because it looks like a decision.

Whatever is still open after round three becomes a stated default. Write the remaining choices as a short list of what you are going to assume, and ask for one "go" or corrections. Do not ask them one at a time.

Spend the three rounds widest first. The question that invalidates the other ten belongs in round one.

## Ask what they have not thought about

The user brings the decisions they already know are open. The expensive ones are the ones nobody raised, and on mobile they surface after the release, when the fix is days away.

So check these against the work. Ask only the ones where the answer would change what gets built, and never more than two in a round:

- **Flag.** Does this ship behind one? What does it read when the flag service is unreachable, and does the off path still behave the way it does today?
- **Rollback.** If this is wrong in production, can it be turned off without shipping a new build?
- **Success.** How will anyone know it worked? Name the event, the metric or the screen someone will look at, or say plainly that nothing will tell us.
- **Failure.** What does the user see when it fails: an error, a retry, a silent nothing? And is there a log with enough in it to find the cause a week later?
- **Edges.** Offline, logged out, first launch, slow network. Which of these does this feature actually meet?

Each one carries a recommended answer like every other question. "Behind a flag, defaulting off, and the existing checkout event already covers success" is a sentence they accept or correct in two seconds. Five bare open questions is what makes people stop reading.

## Facts are your job, decisions are theirs

When a question needs a fact from the environment, go find it: read the file, run the command, check the current docs. Never ask the user something you could look up.

Do not block on it either. A running lookup is an unsettled prerequisite, so only the questions downstream of it wait. Ask the rest of the frontier now, and report what came back in one or two lines when it lands, flagging anything that changes a recommendation you already gave.

A recommendation you cannot back is noise. If you are guessing, say which part is a guess.

## Done

The session ends when the frontier is empty or the third round is answered, whichever comes first. Restate what was settled in a short table, then ask once whether to start. Do not begin implementing until they say so.
