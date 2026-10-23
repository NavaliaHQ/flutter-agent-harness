# Stack

This file is read when a project is created or when something new is scaffolded, not on every task. Nothing links to it from `AGENTS.md` on purpose: an agent reading a Flutter repo deduces the stack from the nearest sibling file, and a stack list in the daily context is a list that goes stale while everyone keeps trusting it.

One choice per slot. No alternatives, because a document that says "cubit or riverpod" has decided nothing and reopens the argument in every project.

The split below matters. `AGENTS.md` says to build what the task needs and nothing beyond it, so a slot listed as conditional stays empty until its condition is true. Scaffolding `go_router` for a one screen app is not following this file, it is ignoring the other one.

## From the first commit, even when the app is tiny

| slot | choice | why |
|---|---|---|
| architecture | clean architecture, three layers | the layer boundary is what makes logic testable without a widget, and retrofitting it later means moving every file |
| state | cubit, via `flutter_bloc` | fewer moving parts than bloc events for what these apps do |
| error handling | a `Result<E, S>` type on every fallible call | makes the error path a compile time obligation instead of a `try` somebody forgot |
| DI | `get_it`, registration split by layer | the locator is reachable from dependency registration and route builders, nowhere else. Everything else takes constructor injection |
| unit mocks | `mocktail` | no codegen step on the test loop |
| scripts | `derry` | one alias file per repo, so the capabilities in `project.md` have stable names and CI and humans run the identical command |
| integration tests | `maestro` | black box flows against the shipped app, no test code inside the app |
| widget identifiers | `Semantics(identifier:)`, see below | retrofitting them into an existing app is a sweep through every widget file |

## When the condition is true, not before

| slot | choice | add it when |
|---|---|---|
| routing | `go_router`, routes declared centrally, typed extensions on `BuildContext` | there is a second screen, or anything outside the app links into it |
| side effects | `bloc_presentation` | something has to happen once rather than be rendered: a dialog, a snackbar, a navigation |
| http | `dio` with interceptors | the app talks to a backend. The interceptor is where logging, auth refresh and tracing live without touching call sites |
| mock backend | `mockoon` | there is a backend for a flow to hit. One JSON environment committed to the repo, response bodies as separate files |
| usecases | one class per action, with a `call` method | the action is more than a forward to the repository. A usecase that only forwards is a file the reviewer has to open to learn it does nothing |

## Setup that is easy to get wrong

`derry` does not find `derry.yaml` by itself. `pubspec.yaml` needs a `scripts:` key pointing at it, or every command fails with the alias not found:

```yaml
scripts: derry.yaml
```

## Rules that only exist to make the app testable

**Every interactive widget carries `Semantics(identifier:)`, formatted `<page>-<name>-<component>`.** Example: `menu-item-add-button`. Maestro matches `id:` against the accessibility identifier, so a widget without one cannot be driven, and a flow that falls back to visible text breaks on the next copy change. Keep it a convention, not a framework: a fluent builder class to produce a string with two hyphens is a class to maintain for nothing.

**The base URL comes from `--dart-define=BASE_URL=`.** The mock server is then a build argument, which CI and a developer can both set. The alternative, an in-app environment picker that the test flow taps, puts a debug screen on the critical path of every single run and makes the first assertion of every flow a UI tap.

## Testing

`test/` mirrors `lib/`. Mocks and fixtures are built inside each test case, never shared through `setUp` or a group level variable, because a shared mock makes a failure depend on the order the tests ran in.

Name the thing under test after itself: `orderRepository`, not `sut` or `repository`. Name the result after the call: `priceForResult`.

Test descriptions read `should <outcome> when <condition>`.

## Good and bad

Mistakes that keep happening, each with what it costs.

### Dependencies arrive through the constructor

```dart
// bad
class OrderCubit extends Cubit<OrderState> {
  OrderCubit() : super(const OrderLoading());

  final OrderRepository _repository = getIt<OrderRepository>();
}

// good
class OrderCubit extends Cubit<OrderState> {
  OrderCubit(this._repository) : super(const OrderLoading());

  final OrderRepository _repository;
}
```

The constructor is the only honest list of what a class needs. A locator call inside the body hides it, and a test that wants one cubit now has to register the whole object graph to build it. The locator belongs in dependency registration and route builders, nowhere else.

### A failed `Result` is handled, not defaulted away

```dart
// bad
final price = (await _repository.priceFor(menuItem)).successOrNull ?? 0;
emit(ItemAdded(price));

// good
final priceResult = await _repository.priceFor(menuItem);
priceResult.when(
  onSuccess: (price) => emit(ItemAdded(price)),
  onError: (failure) => emit(PricingUnavailable(failure)),
);
```

The first prices a failed lookup at zero. The customer sees a free item, the kitchen sees a real order, and nobody finds out until the totals stop adding up.

### The presentation layer never sees a payload

```dart
// bad
final response = await _api.fetchOrder(orderId);
emit(OrderLoaded(response));

// good
final orderResult = await _repository.orderById(orderId);
orderResult.when(
  onSuccess: (order) => emit(OrderLoaded(order)),
  onError: (failure) => emit(OrderUnavailable(failure)),
);
```

`response` is a data layer object shaped by whoever owns the endpoint. Emitting it puts their JSON keys in the widget tree, so the next rename on the server side is a UI change, and a widget test now has to know the wire format. The repository converts once, at the boundary.

### Side effects are events, not state

```dart
// bad
emit(state.copyWith(showPaymentDeclined: true));

// good
emitPresentation(const PaymentDeclinedEvent());
```

State is re-read on every rebuild, so a flag in state reopens the dialog each time the widget rebuilds, and clearing it needs a second emit that somebody will forget.

### Flows match identifiers, never copy

```yaml
# bad
- tapOn: "Add to order"

# good
- tapOn:
    id: "menu-item-add-button"
```

The first breaks the day marketing changes the wording, and the failure reads like a broken feature rather than a stale test.

### Every test builds its own mocks

```dart
// bad
late MockOrderRepository repository;
setUp(() => repository = MockOrderRepository());

// good
test('should emit PricingUnavailable when the price lookup fails', () async {
  final orderRepository = MockOrderRepository();
  ...
});
```

A shared mock carries its stubs and its recorded calls into the next test, so a failure starts depending on the order the tests ran in. With a random ordering seed that becomes a failure nobody can reproduce.

## CI

Out of scope for the harness, since the platform differs per project. The integration suite needs a scheduled job that shards across simulators, emits JUnit XML and archives the artifacts on failure. The per-flow pass or fail comes from that XML, not from reading a log.
