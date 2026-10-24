# ManatOS.DevOps — Local CMD & GitHub CI Setup

## Local Windows CI/CD — `devops/local/` (current development interface)

Use an ordinary **Windows Command Prompt (`cmd.exe`)**, not PowerShell. Install Node.js and npm normally; GitHub CLI is **not needed** for local CI. All commands below are run from the ManatOS `src` folder containing the latest API, shared/UI, EJS1 and NG1 projects. No application commits or GitHub branch selection are required.

```cmd
node devops\local\cli.mjs help
node devops\local\cli.mjs self-test
node devops\local\cli.mjs status
node devops\local\cli.mjs ci --scope all --preflight
node devops\local\cli.mjs ci --scope all --operation verify --plan
node devops\local\cli.mjs ci --scope all --operation verify
node devops\local\cli.mjs package
node devops\local\cli.mjs cd --plan
node devops\local\cli.mjs cd --simulate
```

- Local CI uses the same shared `devops/scripts/devops-ci.mjs` engine as GitHub: **lint, builds and tests**. It does **not** run Prettier or the long-running `verify-run`, and **never includes EJS0**. `--scope` also supports `api`, `uis`, `ng1`, `ejs1`; `--operation` supports `verify`, `quality`, `lint`, `build`, `test`. Install project dependencies locally before real CI (using your normal npm workflow); neither `--plan` nor `--preflight` installs anything.
- The CLI records a SHA-256 fingerprint of the local source (including uncommitted changes), along with the Git HEAD if available. It excludes `.env` values, build products and other private/generated files. Reports and compiled candidates are stored outside the source under `..\manatos-devops-local\`.
- The packaging command accepts **only** a locally successful `all / verify` report and rechecks the source fingerprint; if a source file changed after verification, it refuses. To specify an older run: `node devops\local\cli.mjs package --run RUN_ID`. For archive integrity verification: `node devops\local\cli.mjs package --verify FULL_ARCHIVE_PATH`.
- Local CI reads the existing local application `.env` files in place; it does **not** synchronize them to GitHub. Recognized secret values are masked in captured diagnostics. Review logs before sharing them externally. No `.env` files are added to candidate archives.
- The packager is now portable Node.js USTAR/gzip, without depending on GNU `tar`, `gzip` or PowerShell. Candidate archives are always **NON-DEPLOYABLE**; no npm runtime closure, Passenger startup or production smoke test is asserted.
- `cd --plan`, `cd --simulate` and `cd --self-test` use the **same CD simulator** as GitHub. No real staging, Passenger restart or remote rollback is permitted. Optional read-only SSH inspection (`node devops\local\cli.mjs ssh --inspect --allow-readonly`) requires separately configured `STABLEPOINT_SSH_*` environment variables and strict pinned-host verification; it never writes to the server.
- `self-test` exercises the CI redactor, environment synchronization parser, deterministic packaging, CD recovery simulations and SSH security fixtures without deploying anything. Windows CMD execution of real application CI must still be tested on your development PC.

**Safety:** This first local tool does not provide any `deploy` or `rollback` command targeting Stablepoint. We will introduce live operations only after separately verifying runtime-complete artifacts, host paths and rollback on staging.

## Repository layout

DevOps is part of the **existing `ManatOS` GitHub repository**; no separate repository, access token, or Stablepoint configuration is needed.

```text
.github/workflows/manatos-ci.yml
.github/workflows/devops-self-test.yml
devops/scripts/devops-ci.mjs
devops/scripts/env-sync.mjs
devops/config/env-policy.json
devops/config/release-policy.json
devops/scripts/release-package.mjs
devops/SETUP.md
```

GitHub executes workflows only from the repository-root `.github/workflows/` directory. The `devops/` folder contains the CI implementation and these instructions. Do not move the workflow YAML files into `devops/`.

## Install and enable manual execution

1. Commit the DevOps files above on a dedicated branch (currently `devops-phase1`), preferably through a Pull Request into `main`.
2. Review the PR to ensure it contains **only the intended DevOps files**. The existing application's uncommitted local work is not affected.
3. Merge the PR when ready. GitHub's **Run workflow** control requires the workflow to exist on the default branch (`main`); after merging, you can select a branch for its manual run.
4. Go to **Actions → DevOps Configuration Self-test → Run workflow**, select `main`, and run it. The expected result is **25 scope/operation plans and build-candidate fixture tests passed**; this test does *not* verify the application.
5. Then go to **Actions → ManatOS CI → Run workflow**. Select `scope: all`, `operation: verify`, and the intended branch. This runs **ESLint + the existing build scripts + the existing test scripts**, with **no Prettier**. `verify-run` is not used because it starts long-running development servers.

The first actual CI run tests the version **committed to GitHub**, not unpublished files on your computer.

## Manual CI choices

| Input | Available choices |
|---|---|
| Scope | `all`, `api`, `uis`, `ng1`, `ejs1` |
| Operation | `verify`, `quality`, `lint`, `build`, `test` |

`all + verify` runs ESLint, builds, and tests for the production workspaces (API, EJS1, NG1, and their shared dependencies), in order. The root build/test commands are deliberately bypassed because they include legacy EJS0. Dependency installation explicitly selects the seven production workspaces (plus root tooling), excluding the legacy EJS0 workspace; EJS0 is never linted, built, tested, configured or deployed by DevOps. Family/client selections use their relevant workspace builds/tests. `quality` is lint-only. **EJS0 is excluded from all GitHub CI/CD and environment synchronization scopes**, although its application code and local `.env` remain untouched. **Prettier is excluded from all CI operations.** Phase 1 never produces a **production-deployable artifact**. Optional compiled build candidates are described below; they explicitly cannot be deployed.

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
| `AUTO_PACKAGE_ENABLED` | `false` | When automatic full CI passes, create NON-DEPLOYABLE compiled candidates |

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

**Source of truth:** `api/.env`, `ui.EJS1/.env`, and `ui.NG1/.env` on **your computer**. The `.env.example` files are **never read** by this synchronization tool. Do not upload or commit real `.env` files.

**Install once on your Windows computer:** Node.js (as used by ManatOS), and [GitHub CLI](https://cli.github.com/). Run `gh auth login` and authorize repository Actions-secret write access. Run commands from the local ManatOS repository after adding the DevOps files.

```powershell
# Preview; three local .env files must be present. No GitHub changes.
node devops/scripts/env-sync.mjs --repo ymanatos1/ManatOS

# After inspecting variable names and changes, explicitly apply.
node devops/scripts/env-sync.mjs --repo ymanatos1/ManatOS --apply

# On subsequent runs, if a previously synchronized key was removed:
node devops/scripts/env-sync.mjs --repo ymanatos1/ManatOS --apply --allow-removals

# Refresh GitHub even when the last local sync snapshot is unchanged:
node devops/scripts/env-sync.mjs --repo ymanatos1/ManatOS --apply --force
```

Use `--app api`, `--app ejs1`, or `--app ng1` to sync one application. The tool reports **key names** added, updated or removed; it never prints values. It creates encrypted GitHub secrets and non-sensitive key-name indexes, automatically and without manual GitHub entry. Its local synchronization state is stored under your home directory outside the repository; GitHub does not allow reading secret values back. If someone manually changes a GitHub secret, run `--force` to restore it from local `.env`.

**Implementation:** Three encrypted GitHub **Actions Secrets** (one complete `.env` snapshot per application) plus three GitHub **Actions Variables** containing only the synchronized key-name lists. The metadata variables enable removal detection on a second computer without revealing any values:

| Application file | GitHub Actions Secret |
|---|---|
| `api/.env` | `MANATOS_CI_API_DOTENV` |
| `ui.EJS1/.env` | `MANATOS_CI_EJS1_DOTENV` |
| `ui.NG1/.env` | `MANATOS_CI_NG1_DOTENV` |

The metadata variables are named `MANATOS_CI_API_DOTENV_KEYS`, `MANATOS_CI_EJS1_DOTENV_KEYS`, and `MANATOS_CI_NG1_DOTENV_KEYS`. They are created automatically by the script; do not enter them manually.

Separate bundles prevent duplicate key names (for example `INTERNAL_API_KEY` and `UI_PORT`) from overwriting one another. On `verify` / `test` runs, GitHub reconstructs the needed private `.env` files on its temporary runner, runs existing tests, and removes the files **before uploading diagnostic artifacts**. Build-only or lint-only operations do not require these secrets. Each bundle must be smaller than GitHub's 48 KiB secret limit.

**Security:** Your local `.env` files may contain real API keys, service URLs, or passwords. Uploading them gives CI jobs access to those values. Prefer development/test-only values, not production credentials. Settings that explicitly look like production are rejected unless `--allow-production-values` is supplied; use that override only when you fully understand the risk. Do not execute secret-consuming workflows from untrusted branches or contributions. CI additionally redacts recognized sensitive values before writing diagnostic logs, summaries and downloadable artifacts; nevertheless avoid executing tests that deliberately disclose credentials. This is **not** production/Stablepoint configuration; only GitHub CI is affected.

**Removal safety:** If a key disappears from local `.env`, a preview shows the removal and `--allow-removals` is required before the bundle is replaced. No other GitHub Secrets are deleted. `.env.example` is never used to fill missing values.

**First test:** Run **DevOps Configuration Self-test**, then **ManatOS CI → all → verify** after synchronizing the three local files. If a secret is missing, CI stops with the exact secret name instead of an opaque `INTERNAL_API_KEY` application exception.

## Compiled build-candidate packaging (optional, initially OFF)

**No application CI until the new API / UIS structure is committed to GitHub.** Until then, only the standalone **DevOps Configuration Self-test** should run. There is no compatibility/fallback mode for the outdated GitHub code.

After the future application source is committed, choose **Actions → ManatOS CI → Run workflow → Scope `all` → Operation `verify` → Package candidate `true`**. Packaging is refused for other scopes or operations and whenever lint/build/tests fail. Automatic packaging is separately disabled unless both automatic CI and `AUTO_PACKAGE_ENABLED=true` are explicitly enabled.

The release packager builds three deterministic `tar.gz` files, for **API, EJS1, NG1**, with accompanying SHA-256 sidecars, file manifests, and a `release-set.json`. It includes compiled output, static resources, shared compiled workspaces and required workspace manifests. The source lockfile is represented by its SHA-256 digest in the release manifest; the root lockfile itself is not copied because it includes legacy EJS0 metadata. EJS0, `.env`, logs, certificates and other secret-looking files are forbidden. Results appear as a downloadable `manatos-build-candidates-*` workflow artifact only after complete `all / verify` passes; every archive is immediately reverified.

**CRITICAL:** These are **BUILD_CANDIDATE_NOT_DEPLOYABLE** archives. They deliberately do **not** contain production `node_modules` or guarantee Stablepoint-compatible startup. The Git SHA identifies source, but the cryptographic checksum identifies the exact build output. Production runtime dependency bundling, working-directory/path reconciliation, Passenger adapter validation, functional smoke tests and CD/recovery remain separate mandatory phases. Do not upload or activate these archives on Stablepoint.

The GitHub **DevOps Configuration Self-test** exercises packaging with synthetic fixture workspaces: refusal on failed verification, missing output, checksum mismatch, file manifests, deterministic rebuild, `.env` exclusion and EJS0 exclusion. It never uses production application files or secrets. Only CI is automated by this patch; no deployment is possible.

## Phase 1 limits

- **No CD, Stablepoint connection, production release or rollback** is enabled.
- **No separate DevOps repository** and **no source-read token** are needed.
- The workflows are modular; **deployable** production runtime packaging, deployment, approvals and rollback belong to later DevOps phases.

## Legacy EJS0 retirement from DevOps

EJS0 is excluded because it is not part of the Stablepoint production-hosting plan. The previously synchronized `MANATOS_CI_EJS0_DOTENV` secret and `MANATOS_CI_EJS0_DOTENV_KEYS` variable are unused and may be deleted manually from GitHub Actions settings once this change is accepted; the sync tool never deletes unrelated remote settings.

**Source compatibility:** CI checks that the selected production workspaces exist in the GitHub checkout before running npm. An older GitHub baseline with only `shared`, `api`, and `ui` cannot pass `all`, `uis`, `ng1`, or `ejs1` verification until the newer application source is committed. This failure is intentional, not a reason to skip NG1/EJS1.

## Stablepoint CD preparation — OFFLINE / READ-ONLY (current phase)

The same `devops-phase1` branch may now run **Actions → ManatOS Stablepoint CD - Preparation (NO DEPLOY)**. Its manual operations are:

| Operation | What actually happens |
|---|---|
| `self-test` | Run CD failure-injection and SSH-security tests on synthetic local fixtures; no network access |
| `plan` | Show the anticipated deployment phases and reasons production activation is blocked |
| `simulate` | Exercise isolated release staging, atomic current-link switching, mock Passenger restart markers, health gates and rollback; no Stablepoint connection |
| `inspect-readonly` | Optionally inspect Stablepoint's SSH identity and basic CLI/disk capabilities without changing anything; **disabled by default** |

**Mandatory safety:** `devops/config/stablepoint-policy.json` explicitly disables real deployment, production restarts, migrations, database recovery and live health-check acceptance. Build candidates created by the current CI are **not deployable** and are rejected by the CD engine. There is no `deploy`, `activate`, `--apply`, remote staging or remote rollback operation in these tools. Only API/EJS1/NG1 are in scope. The dedicated CD workflow has no push trigger; application CI is unaffected. No production changes or Stablepoint credentials are needed to run the first three operations. Run the existing **DevOps Configuration Self-test** first, then the new workflow `self-test`, `plan` and `simulate` on `devops-phase1`.

**Optional live SSH inspection (only after explicit approval):** It is unavailable on `devops-phase1`: the workflow requires `main` plus `STABLEPOINT_INSPECTION_ENABLED=true`. On GitHub create and protect the `stablepoint-inspection` Environment (allow only `main`, require reviewer approval where available). Add repository **Variables** `STABLEPOINT_SSH_HOST`, `STABLEPOINT_SSH_USER`, `STABLEPOINT_SSH_PORT` (default `22` if unset). Add environment **Secrets** `STABLEPOINT_SSH_PRIVATE_KEY` and `STABLEPOINT_SSH_KNOWN_HOSTS` (a **verified, pinned** SSH known-host entry). The workflow does not fetch and blindly trust a host key. Obtain the fingerprint using a trusted provider channel first. Use a dedicated read-only SSH account/key with the least privilege available. If environment secrets are configured, ensure the workflow resolves them inside that environment. Finally set repository variable `STABLEPOINT_INSPECTION_ENABLED=true`. The inspection operation validates exact username, basic command availability, home disk headroom and presence/absence of the application root; it performs no UAPI or CloudLinux changes. Do not enter production application `.env` credentials.

**Before an actual CD implementation can be enabled:** produce **DEPLOYABLE_VERIFIED** artifacts with production runtime dependency closure, verify actual Passenger application roots and startup contracts, complete smoke/readiness checks, settle session/data migrations, validate host-side locking and recoverable activation, configure approval controls, and test rollback on staging. The current CD engine simulates these transitions only. GitHub's displayed GREEN self-test is *not* authorization to deploy any current build candidate.
