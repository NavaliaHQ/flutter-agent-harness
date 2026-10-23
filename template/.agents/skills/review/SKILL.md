---
name: review
description: Review a change for correctness, scope and regressions before a human approves it. Use when asked to review, audit, or explain a diff, a branch, or a merge request. Named `review` rather than `code-review` so it does not shadow the built-in of that name.
---

# Review

The human who approves is the gate. This review exists to make their read shorter, not to replace it. A review that lists forty style nits buries the one bug.

## Read the misses first

`.agents/review-misses.md` is what humans caught in this repo that an AI review walked past. Read it before the diff. It is short on purpose, and every entry is there because the review already failed once on that exact shape.

When the human who approves finds something you did not, that is an entry. Add it: what was wrong, why the review walked past it, what to check instead. Three lines, and only for a real miss.

## Ask first

The diff does not say what the change was supposed to do. Before reviewing, ask for whatever the user has not already given you:

- the diff, branch, or MR, and how to read it (the repo's own tooling, a range, a URL)
- the ticket: what was asked for, and the reproduction steps or screenshots if it is a bug
- anything already decided that the diff would otherwise look wrong against

Do not reach for a ticket tracker or a forge CLI yourself. Every project uses different ones, and a review that depends on your credentials is a review nobody else can reproduce.

## Scope

**Only lines the diff added or changed.** Read the surrounding file to understand how the change lands: the imports, the callers, the type it implements. Never report a finding on a line the author did not touch, however wrong that line is. Legacy cleanup is its own MR.

**Never suggest renaming an external contract.** Analytics event names and their parameter keys, API request and response fields, query parameter names, JSON keys, feature flag keys. These are agreed with somebody outside this repo, and a rename that looks like a style fix is an outage.

**Every suggestion must compile.** If you cannot be sure, say what you would check instead of asserting it.

## What to look for, in this order

1. Does it do what the ticket asked? A correct implementation of the wrong thing is the most expensive finding and the easiest to miss.
2. Does it break something it did not mean to touch? Check the other callers of everything it changed.
3. Is the behaviour change covered by a test that would fail against the old code? When a flag guards it, is the flag-off path still intact and still tested?
4. Is there anything here that does not need to exist? An abstraction with one implementation, a wrapper that forwards, a parameter nobody passes.
5. Only then, style the analyzer did not catch.

## How to run it

One pass over the whole diff. Above roughly ten changed files, split it: one subagent per file or per closely related group, each with the file's own diff and the scope rules above, then merge the findings and drop anything that landed on an untouched line.

Discard files with nothing to report. Silence is the correct output for a clean file.

## Output

Findings ordered: what breaks, then what is wrong but survivable, then suggestions. No finding without a diff.

```
`lib/features/order/presentation/order_cubit.dart:48`

Nothing checks whether the cubit is still open after the await, so leaving the screen mid request throws.

  final orderResult = await _repository.orderById(orderId);
+ if (isClosed) return;
  orderResult.when(...);

Breaks: open the order, go back before it loads, the app logs "Cannot emit new states after calling close".
Fixes: the guard every other cubit in this layer already puts after an await.
```

Two lines of why, not a paragraph. If a finding needs more than that, it is a conversation, not a review comment.

End with nothing. No summary, no count, no praise for the parts that were fine.
