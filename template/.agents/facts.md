# Context that is not in the code

The code shows how things are built. It does not show what is being replaced, what is half migrated, or what a change has to keep in step with. That is what this file is for.

Each entry carries the date it was last checked. Re-check before relying on an old one, and update the date. Add an entry when something costs you real time and the code could not have told you.

An entry is useful when it answers: what is in flight, what does a change have to do to stay in step with it, and where is the reference implementation.

<!-- Example, delete it:

## order_v2 will replace order

`lib/features/order/pages/order_v2/` is the replacement for `.../pages/order/`, behind the `order-v2` flag. Both ship today.

**Anything that works in `order` has to work in `order_v2`.** When you add a feature or fix a bug in one and it obviously applies to the other, change both in the same MR. Leaving one behind is how the replacement arrives already broken.

Verified 2026-10-01.

-->
