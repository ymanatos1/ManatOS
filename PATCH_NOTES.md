# ManatOS Donate visibility patch

## Changes
- Adds `DONATIONS_SHOW` as a persisted `SysConfiguration` boolean under the **Donations** group.
- Defaults `DONATIONS_SHOW` to `false`; an existing environment value can seed it on first creation.
- Publishes the safe boolean through the anonymous UI bootstrap contract so the common shell can react to runtime configuration.
- Shows a bold global **Donate** button in the top ManatOS product bar only when `DONATIONS_SHOW=true`.
- Keeps the Donate button intentionally disabled for now, with the tooltip **“Donations will be available soon.”**
- Adds API/UI tests for the configuration projection and header visibility behavior.

## Files to delete
None.

## Manual `.env` changes
None required. The setting is seeded automatically with `false` and can be changed from **Configuration > Configuration** by an Admin.

## Database
No manual migration. Missing `DONATIONS_SHOW` is seeded automatically on API startup using the existing SysConfiguration mechanism.
