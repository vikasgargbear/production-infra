# Frontend Dependency Security

The deployable frontend is the static React browser bundle built from
`frontend/package.json`. The retired `electron-app` manifest and binaries are
not part of the repository or any deployment target.

## Risk classes

| Class | Lockfile marker | Exposure | Required gate |
|---|---|---|---|
| Browser runtime | `dev` absent | Code can be included in the shipped static bundle | `npm audit --omit=dev --audit-level=high` |
| Build and test toolchain | `dev: true` | Runs in developer and CI build environments but is not served to browsers | `npm audit --audit-level=high` |

The classes are audited separately so a clean browser-runtime result cannot
hide a vulnerable build chain. Both high/critical gates are required by the
Render deployment job.

## Audit snapshot

GitHub's open-alert inventory was queried on 2026-08-20 and reconciled against
the lockfile rather than inferred from package names:

| Surface | Open alerts on `main` | Working-tree disposition |
|---|---:|---|
| Frontend browser runtime | 0 | No Dependabot runtime alert |
| Frontend build/test dependencies | 62 | 57 remain after the `fast-uri` update: 2 critical, 28 high, 22 moderate, 5 low |
| Retired Electron manifest | 32 | Manifest and desktop deployable removed; alerts become stale when the retirement reaches `main` |

All 62 frontend alerts are classified `DEVELOPMENT` by GitHub. The two critical
toolchain findings are in transitive `shell-quote` and `websocket-driver`.
Remaining high findings include Playwright and transitive Babel, brace/glob,
Forge, minimatch, PostCSS, Rollup, serialization, SVGO, WebSocket, and YAML
packages. Direct and compatible transitive updates should land through the
generated Dependabot pull requests before the build-system migration; they do
not justify weakening the full audit gate.

The current `fast-uri` advisory is toolchain-only. Its dependency path is the
root development dependency `ajv` (and CRA schema tooling) to `fast-uri`.
Dependabot PR #7 generated the `3.0.6` to `3.1.5` lock update, and GitHub's clean
Node 22 runner passed the frontend suite and runtime audit for that exact lock.
The update closes five high-severity `fast-uri` alerts once merged.

## Release blocker

Create React App 5 is unmaintained legacy build infrastructure and retains
transitive advisories that cannot all be resolved through compatible leaf
updates. Production promotion remains blocked until the full online audit below
passes on a clean Node 22 runner:

```bash
cd frontend
npm ci --ignore-scripts
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

The supported remediation is a tested migration from CRA/CRACO to a maintained
build system while preserving TypeScript, Jest, production-build, and
Playwright behavior. Do not use `npm audit fix --force`, invent lockfile
integrity values, or add incompatible transitive overrides to make the report
green.

Local `npm audit` results are not evidence when the advisory endpoint is
blocked. In particular, an offline zero result without cached advisory data is
invalid; the online GitHub job is the release authority.
