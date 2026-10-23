# What the review missed

Things a human caught in review that the AI review did not. Read before reviewing, so the same class of bug is not missed twice.

This file only grows from real misses. Never add a rule here because it sounds good: a checklist of hypotheticals is how a review turns into forty style nits with the one bug buried in the middle.

An entry is three lines. What was wrong, why the review walked past it, and what to check instead.

<!-- Example, delete it:

## A write that was never awaited

2026-10-14. The review read the method top to bottom and said the failure path was handled.

**Why it was missed:** the defect is what is not there. An unawaited future reads exactly like an awaited one unless you are looking for the keyword.

**Check instead:** in any method that reports success or failure, find every call that can fail and confirm the reported result depends on it. "It compiles and the test passes" does not cover a future nobody awaited.

-->
