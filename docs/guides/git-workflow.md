# Git workflow

Keep changes reviewable, ownership-separated, and recoverable.

## Start safely

```bash
git fetch origin
git worktree add -b codex/<task> /absolute/path/to/worktree origin/<reviewed-base>
cd /absolute/path/to/worktree
```

An isolated worktree prevents parallel terminals from overwriting each other.
Record the exact base SHA before editing. Do not switch, reset, stash, or clean a
shared worktree to make your branch convenient.

## Commit

```bash
git status --short
git diff --check
git add -p
git commit -m "Describe one coherent change"
```

Do not use `git add .` in a dirty shared tree. Preserve unrelated user changes.
Generated artifacts belong in the same commit as their source only when the
generator and hash/drift checks prove the relationship.

## Synchronize

Fetch and inspect upstream before final reporting. Rebase only the isolated
branch and only when doing so will not rewrite a branch another terminal is
using. Resolve overlaps by source ownership; never discard a side blindly.

Push the isolated branch when requested:

```bash
git push -u origin codex/<task>
```

Return the base SHA, head SHA, ordered commits, test results, and overlapping
paths. Do not merge or deploy unless the user explicitly requests those actions.

## Recovery

Prefer additive recovery—new commits, a new worktree, or `git revert` on an
owned published commit. Commands that discard a worktree or rewrite shared
history require explicit target verification and user authorization.
