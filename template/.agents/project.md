# This repo

Fill this in once. The harness never overwrites it.

## Commands

Six capabilities. Every one of them needs a command here, or the agent will invent one.

| capability | command |
|---|---|
| format | `TODO` |
| lint | `TODO` |
| test | `TODO` |
| test one file | `TODO` |
| integration | `TODO` |
| codegen | `TODO` |

Never run a bare formatter or a hand-built `flutter run`. If a command above wraps flags that matter (line length, flavor, env files, coverage exclusions), that wrapper is the command, not the raw tool.

## Running the app

How to launch it, which flavor, which env files, and the bundle id. One block, copy-pasteable:

```bash
TODO
```

## Integration tests

- Runner: `TODO` (the script that builds, installs, starts the mock and runs the flows)
- Mock server: `TODO` (how it starts, which port, where the config and the response bodies live)
- How the app points at the mock: `TODO` (a `--dart-define`, or a debug screen the flow taps)
- Widget id convention: `TODO` (the format the flows match against `Semantics(identifier:)`)
- Artifacts land in: `TODO`

## Anything the agent gets wrong twice

Short entries. If you wrote the same correction in two reviews, it belongs here.
