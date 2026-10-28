# UI Preferences, Windows and Presentation Scope

UIS distinguishes **application semantics** from **presentation preferences**. A selected language, font scale, debugger arrangement or detached window size does not change what a business entity means. Nevertheless, these are real interactive requirements: they must be owned, persisted where appropriate, and applied consistently across surfaces and adapters.

## Preference boundaries

`shared.UI/src/preferences/ui-preferences.ts`, `shared.UI/src/state/` and the browser host utilities define the TypeScript preference/state infrastructure. A preference may be global to the current UI surface, scoped to a detachable popup, or specific to diagnostics; its scope should be explicit instead of emerging accidentally from a CSS selector.

Font scaling belongs to presentation. Its effective scale must reach component text and controls that belong to the affected UI surface. Debugger text can deliberately remain independent of ordinary UI font scaling. Language selection is likewise a presentation projection and must not rewrite canonical CTX domain data.

## Detachable windows and documentation

The browser host controls actual popup-window operations, geometry and focus. UIS retains the semantic identity of the document or surface being displayed; detaching its visual presentation must not create a second authoritative copy of its business state. Reattaching and closing popups need explicit lifecycle rules so that window chrome events do not unexpectedly destroy parent UI state.

Window position/size preferences, remembered documentation pages and font-scale preferences are different kinds of persistence. One shared preference record should not silently conflate them.

## Focus and modal behavior

The renderer owns focus, keyboard behavior, tab order and modal accessibility. Nested surface ownership determines which popup should be interactive and which close action is valid. A field action cannot substitute for an application-level focus manager merely by calling `.focus()` on an incidental DOM element.

## Verification

Test language and font preferences across List, Entry and popup presentations; verify restoration after detach/reattach, keyboard focus after a modal closes, no orphaned windows on main-host shutdown, and meaningful failure behavior when browser popup policies prevent detachment.

See [UIS Architecture](UIS-Architecture.md), [Documentation Browser](../system/Documentation-Browser.md) and [Multilingual Infrastructure](../multilingual/Multilingual-Infrastructure.md).
