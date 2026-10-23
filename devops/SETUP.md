# ManatOS.DevOps — Phase 1 GitHub CI Setup

## Repository layout

DevOps is part of the **existing `ManatOS` GitHub repository**; no separate repository, access token, or Stablepoint configuration is needed.

```text
.github/workflows/manatos-ci.yml
.github/workflows/devops-self-test.yml
devops/scripts/devops-ci.mjs
devops/scripts/env-sync.mjs
devops/config/env-policy.json
devops/SETUP.md
```

GitHub executes workflows only from the repository-root `.github/workflows/` directory. The `devops/` folder contains the CI implementation and these instructions. Do not move the workflow YAML files into `devops/`.

## Install and enable manual execution

1. Commit the six DevOps files above on a dedicated branch (currently `devops-phase1`), preferably through a Pull Request into `main`.
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

No automation-switch variables are required for **manual** runs. To run `verify` or `test`, the relevant environment secret bundles must first be synchronized as described below. Automatic CI is disabled when `AUTO_CI_ENABLED` is absent or `false`. When enabled, the workflow runs on pushes and chooses scopes whose variables are `true`. There is **no scheduled CI** in this same-repository Phase 1 workflow.

> A green GitHub workflow can mean the policy check passed while verification was deliberately skipped. Always read the run summary: **SKIPPED by policy is NOT a verification pass**.

## Results and troubleshooting

- **Actions → ManatOS CI → individual run**: progress, step logs and errors.
- **Summary**: selected scope, operation, application commit and pass/fail outcome.
- **Artifacts**: when a verification operation runs, download `manatos-ci-*` for `result.json`, `summary.md`, and captured step logs (retained 14 days).
- If **DevOps Configuration Self-test** fails on `Cannot find module`, verify that the workflow refers to `devops/scripts/devops-ci.mjs` and that the file exists at that exact path.
- A failed checkout, dependency install or verifier is not a production-ready result; inspect its first failing step. Rerun after correcting the source or workflow.

## Formatting policy

Prettier is a local-development concern and **never runs in CI**. Existing local `npm run verify` and `npm run verify-run` commands are unchanged and still perform their original formatting check. This patch changes GitHub CI only.

## Synchronize the actual local `.env` files into GitHub CI

**Source of truth:** `api/.env`, `ui.EJS0/.env`, `ui.EJS1/.env`, and `ui.NG1/.env` on **your computer**. The `.env.example` files are **never read** by this synchronization tool. Do not upload or commit real `.env` files.

**Install once on your Windows computer:** Node.js (as used by ManatOS), and [GitHub CLI](https://cli.github.com/). Run `gh auth login` and authorize repository Actions-secret write access. Run commands from the local ManatOS repository after adding the DevOps files.

```powershell
# Preview; four local .env files must be present. No GitHub changes.
node devops/scripts/env-sync.mjs --repo ymanatos1/ManatOS

# After inspecting variable names and changes, explicitly apply.
node devops/scripts/env-sync.mjs --repo ymanatos1/ManatOS --apply

# On subsequent runs, if a previously synchronized key was removed:
node devops/scripts/env-sync.mjs --repo ymanatos1/ManatOS --apply --allow-removals

# Refresh GitHub even when the last local sync snapshot is unchanged:
node devops/scripts/env-sync.mjs --repo ymanatos1/ManatOS --apply --force
```

Use `--app api` (or `ejs0`, `ejs1`, `ng1`) to sync one application. The tool reports **key names** added, updated or removed; it never prints values. It creates encrypted GitHub secrets and non-sensitive key-name indexes, automatically and without manual GitHub entry. Its local synchronization state is stored under your home directory outside the repository; GitHub does not allow reading secret values back. If someone manually changes a GitHub secret, run `--force` to restore it from local `.env`.

**Implementation:** Four encrypted GitHub **Actions Secrets** (one complete `.env` snapshot per application) plus four GitHub **Actions Variables** containing only the synchronized key-name lists. The metadata variables enable removal detection on a second computer without revealing any values:

| Application file | GitHub Actions Secret |
|---|---|
| `api/.env` | `MANATOS_CI_API_DOTENV` |
| `ui.EJS0/.env` | `MANATOS_CI_EJS0_DOTENV` |
| `ui.EJS1/.env` | `MANATOS_CI_EJS1_DOTENV` |
| `ui.NG1/.env` | `MANATOS_CI_NG1_DOTENV` |

The metadata variables are named `MANATOS_CI_API_DOTENV_KEYS`, `MANATOS_CI_EJS0_DOTENV_KEYS`, `MANATOS_CI_EJS1_DOTENV_KEYS`, and `MANATOS_CI_NG1_DOTENV_KEYS`. They are created automatically by the script; do not enter them manually.

Separate bundles prevent duplicate key names (for example `INTERNAL_API_KEY` and `UI_PORT`) from overwriting one another. On `verify` / `test` runs, GitHub reconstructs the needed private `.env` files on its temporary runner, runs existing tests, and removes the files **before uploading diagnostic artifacts**. Build-only or lint-only operations do not require these secrets. Each bundle must be smaller than GitHub's 48 KiB secret limit.

**Security:** Your local `.env` files may contain real API keys, service URLs, or passwords. Uploading them gives CI jobs access to those values. Prefer development/test-only values, not production credentials. Settings that explicitly look like production are rejected unless `--allow-production-values` is supplied; use that override only when you fully understand the risk. Do not execute secret-consuming workflows from untrusted branches or contributions. CI additionally redacts recognized sensitive values before writing diagnostic logs, summaries and downloadable artifacts; nevertheless avoid executing tests that deliberately disclose credentials. This is **not** production/Stablepoint configuration; only GitHub CI is affected.

**Removal safety:** If a key disappears from local `.env`, a preview shows the removal and `--allow-removals` is required before the bundle is replaced. No other GitHub Secrets are deleted. `.env.example` is never used to fill missing values.

**First test:** Run **DevOps Configuration Self-test**, then **ManatOS CI → all → verify** after synchronizing the four local files. If a secret is missing, CI stops with the exact secret name instead of an opaque `INTERNAL_API_KEY` application exception.

## Phase 1 limits

- **No CD, Stablepoint connection, production release or rollback** is enabled.
- **No separate DevOps repository** and **no source-read token** are needed.
- The workflows are deliberately modular; production packaging, deployment, approvals and rollback belong to later DevOps phases.
