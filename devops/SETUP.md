# ManatOS.DevOps — Phase 1 GitHub CI Setup

## Repository layout

DevOps is part of the **existing `ManatOS` GitHub repository**; no separate repository, access token, or Stablepoint configuration is needed.

```text
.github/workflows/manatos-ci.yml
.github/workflows/devops-self-test.yml
devops/scripts/devops-ci.mjs
devops/SETUP.md
```

GitHub executes workflows only from the repository-root `.github/workflows/` directory. The `devops/` folder contains the CI implementation and these instructions. Do not move the workflow YAML files into `devops/`.

## Install and enable manual execution

1. Commit the four files above on a dedicated branch (currently `devops-phase1`), preferably through a Pull Request into `main`.
2. Review the PR to ensure it contains **only the intended DevOps files**. The existing application's uncommitted local work is not affected.
3. Merge the PR when ready. GitHub's **Run workflow** control requires the workflow to exist on the default branch (`main`); after merging, you can select a branch for its manual run.
4. Go to **Actions → DevOps Configuration Self-test → Run workflow**, select `main`, and run it. The expected result is **25 scope/operation plans passed**; this test does *not* verify the application.
5. Then go to **Actions → ManatOS CI → Run workflow**. Select `scope: all`, `operation: verify`, and the intended branch. This runs **ESLint + the existing build scripts + the existing test scripts**, with **no Prettier**. `verify-run` is not used because it starts long-running development servers.

The first actual CI run tests the version **committed to GitHub**, not unpublished files on your computer.

## Manual CI choices

| Input | Available choices |
|---|---|
| Scope | `all`, `api`, `uis`, `ng1`, `ejs1` |
| Operation | `verify`, `quality`, `lint`, `build`, `test` |

`all + verify` runs root `npm run lint`, `npm run build`, and `npm run test`, in order. Family/client selections use ESLint and the relevant workspace builds/tests. `quality` is lint-only. **Prettier is excluded from all CI operations.** **Phase 1 never produces a production-deployable artifact**, even when every check passes.

## Automatic push-triggered CI (initially OFF)

In the same ManatOS repository, open **Settings → Secrets and variables → Actions → Variables**. Create these repository variables when you want to control automatic execution:

| Variable | Recommended initial value | Meaning |
|---|---|---|
| `AUTO_CI_ENABLED` | `false` | Master switch for push-triggered CI |
| `AUTO_CI_ALL` | `true` | Full CI when the master switch is enabled |
| `AUTO_CI_API` | `false` | Optional API-family run |
| `AUTO_CI_UIS` | `false` | Optional UI-family run |
| `AUTO_CI_NG1` | `false` | Optional NG1 diagnostic run |
| `AUTO_CI_EJS1` | `false` | Optional EJS1 diagnostic run |

No variables are required for **manual** runs. Automatic CI is disabled when `AUTO_CI_ENABLED` is absent or `false`. When enabled, the workflow runs on pushes and chooses scopes whose variables are `true`. There is **no scheduled CI** in this same-repository Phase 1 workflow.

> A green GitHub workflow can mean the policy check passed while verification was deliberately skipped. Always read the run summary: **SKIPPED by policy is NOT a verification pass**.

## Results and troubleshooting

- **Actions → ManatOS CI → individual run**: progress, step logs and errors.
- **Summary**: selected scope, operation, application commit and pass/fail outcome.
- **Artifacts**: when a verification operation runs, download `manatos-ci-*` for `result.json`, `summary.md`, and captured step logs (retained 14 days).
- If **DevOps Configuration Self-test** fails on `Cannot find module`, verify that the workflow refers to `devops/scripts/devops-ci.mjs` and that the file exists at that exact path.
- A failed checkout, dependency install or verifier is not a production-ready result; inspect its first failing step. Rerun after correcting the source or workflow.

## Formatting policy

Prettier is a local-development concern and **never runs in CI**. Existing local `npm run verify` and `npm run verify-run` commands are unchanged and still perform their original formatting check. This patch changes GitHub CI only.

## Phase 1 limits

- **No CD, Stablepoint connection, production release or rollback** is enabled.
- **No separate DevOps repository** and **no source-read token** are needed.
- The workflows are deliberately modular; production packaging, deployment, approvals and rollback belong to later DevOps phases.
