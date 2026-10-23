# Working on this repo

This is the harness itself, not a project using it. What ships to other repos lives under `template/`; `README.md` and `install.sh` are how it gets there.

The `template/AGENTS.md` in here is the file every installed project reads on every task. It is the most expensive file in the repo to get wrong, and the cheapest to make too long. Add a rule only when you have watched an agent get it wrong without it, and say what the failure was.

## The diagrams are part of the structure

`README.md` carries one Mermaid diagram in three bands: the cycle, the files the agent reads coloured by who owns them after an install, and the skills. It is the first thing a reader sees and the only picture of the repo that exists.

**Change the structure or the tooling, change the diagram in the same commit.** A skill added, renamed or removed; a file that moves between harness-owned and team-owned; a step added to the cycle. A diagram that disagrees with the code is worse than no diagram, because people stop reading the code and believe the picture.

It is Mermaid rather than an exported image on purpose: a diff shows the change, nobody needs a drawing tool to fix a word, and the agents that read this repo can read it too. Keep it that way.

## No counts in prose

Never write "four skills", "the six commands", "three rules". The number is right on the day it is written and wrong the first time anyone adds one, and nothing fails when it goes stale: the reader simply believes it. Name the thing, not how many there are, and let the list, the table or the directory be the count.

This is not hypothetical here. A change that added a command to `ma` updated "five commands" in one file and missed the identical sentence in the skill beside it.

## Before handing back

Run the installer into a throwaway directory and check what it produced, rather than reasoning about the script:

```bash
./install.sh /tmp/harness-check && find /tmp/harness-check -not -path "*/.git/*" | sort
```

The script's `echo` is not evidence that a file was written. Read the file.

Every Mermaid block has to render. The extractor below is the check, and a broken diagram fails it:

```bash
npx -y @mermaid-js/mermaid-cli@latest -i diagram.mmd -o /tmp/out.png
```

Tooling in `template/.agents/skills/` does not follow the code rules that `template/AGENTS.md` sets for a project. Comments that record observed behaviour of a third-party binary belong in `ma.mjs` and stay there.

Nothing in this repo may name a client, a person, an internal host, a ticket key, or an account. It is public.
