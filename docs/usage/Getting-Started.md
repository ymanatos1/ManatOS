# Getting Started

This guide describes the running system from the browser user's perspective. Development setup and repository commands are documented separately under [Development](../development/README.md).

## Entering the system

After the UI and API are running, open the UI host and authenticate using an available local or configured external-provider flow. The shell then composes company/platform navigation from the current session and safe capability facts returned for the authenticated user.

## Common interaction model

Most administrative business data follows a consistent sequence:

```text
Navigation
   |
   v
Entity list -- filter/search/page --> matching records
   |
   +-- Add --------------------------+
   |                                 |
   +-- open existing ----------------+--> Entry
                                         |
                                         +--> edit fields/tabs
                                         +--> selectors/related editors
                                         +--> Save / Save and Close / Delete
```

Lists and entries are metadata-driven, so different entities can have different fields, actions and tabs while retaining the same interaction model. Record-specific policy can make an action unavailable even when the action exists for the entity generally.

## Developer diagnostics

When developer mode is enabled, Developer Tools can expose CTX and API Traffic inspection. These facilities are diagnostic: they do not grant additional application authorization.

See [Working with Entities](Working-with-Entities.md), [Selectors and Popups](Selectors-and-Popups.md), and [Navigation](Navigation.md) for the main interaction patterns.
