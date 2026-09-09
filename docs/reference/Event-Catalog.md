# Event Catalog

The public event model is semantic rather than DOM-centric.

| Event class                | Source                      | Consumers / effect                                    |
| -------------------------- | --------------------------- | ----------------------------------------------------- |
| CTX value change           | canonical CTX mutation      | debugger, dependency matching, reactive policy        |
| field value change         | field mutation boundary     | field state, dirty/validation, dependent calculations |
| baseline change            | baseline mutation boundary  | dirty recalculation/projections                       |
| surface lifecycle          | UI host/surface runtime     | create/attach/close/dispose child levels              |
| aggregate state change     | entry/compound workspace    | Save/action policy, dirty/valid presentation          |
| developer-tools visibility | shell developer-tools owner | shell/layout synchronization                          |

A logical change should not be independently emitted by multiple writers. Dependency matching understands relevant ancestor/descendant path overlap. Derived recalculation uses the authoritative mutation route for its result rather than directly editing arbitrary mirrors.

Browser custom-event names are implementation details unless explicitly promoted to a public integration contract; this catalog documents their semantic roles.
