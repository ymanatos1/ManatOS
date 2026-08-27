# UI Architecture

**Status:** Under Development / Under Testing

This document describes the current ManatOS website UI architecture implemented by the `ui/` workspace. It is intended to be the primary technical reference for UI layout, rendering, navigation, reusable popup infrastructure, browser-side behavior and UI testing. As additional UI architectures are introduced, they should be documented here rather than being left implicit in individual pages.

## 1. Technology and responsibilities

The UI is an independently runnable **Express 5 + TypeScript** application using **EJS** for server-side rendering, **Bootstrap 5** and **Bootstrap Icons** for the presentation foundation, and small browser-side JavaScript modules for shell behavior, forms, lists, busy states and preferences.

The UI is deliberately separate from the API. It owns website presentation and browser-session state, while business/security operations are delegated to the API through `src/api-client.ts`. SMTP configuration and mail delivery remain API responsibilities; the UI-side `IEmailService` is only a gateway to trusted internal API email endpoints.

Main areas:

```text
ui/
├── src/                     Express/TypeScript UI server
│   ├── auth/                browser/API-session and external-auth integration
│   ├── middleware/          auth, CSRF, request/page context
│   ├── routes/              page, authentication and SysBO routes
│   ├── sysbo/               UI definitions for generic business-object pages
│   ├── security/            transient UI-side security-token handling
│   └── email/               API-backed mail gateway
├── views/
│   ├── layout/              outer application shell
│   ├── pages/               page-specific EJS views
│   ├── partials/            reusable non-popup page/shell fragments
│   ├── popups/              popup/modal architecture
│   └── errors/              HTTP error presentation
├── public/
│   ├── css/                 CSS architecture
│   ├── js/                  browser behavior modules
│   └── assets/              logos, flags, illustrations and images
└── test/                    Vitest UI/unit/presentation/integration tests
```

## 2. Rendering model

Normal pages are rendered in two stages by `src/render.ts`:

1. the requested page view is rendered with `res.locals` plus its page model;
2. that rendered body is injected into `views/layout/shell.ejs`.

This keeps the global chrome in one place while page views concentrate on page-specific content.

```mermaid
flowchart LR
    B[Browser] --> U[Express UI]
    U --> M[Middleware\nauth / CSRF / context]
    M --> R[UI routes]
    R --> C[API client]
    C --> A[REST API]
    R --> P[Page EJS]
    P --> S[layout/shell.ejs]
    S --> B
```

Every page receives a read-only application context through `res.locals.app`:

```text
app
├── version
├── scopes
│   ├── session
│   ├── user
│   ├── request
│   └── workspace
│       └── application      when a SysApplication is active
├── sysBO
└── navigation
```

The separation is intentional: route/middleware code constructs context, while templates consume it rather than independently rediscovering application state.

## 3. Application shell

`views/layout/shell.ejs` owns the adaptive website frame. The shell can render four principal workspace states:

```text
workspace only
left navigation + workspace
workspace + details
left navigation + workspace + details
```

The side areas consume no layout width when they are hidden.

### 3.1 Basic layout illustration

```mermaid
flowchart TB
    H[Top header\nBrand · version · auth/account actions · notifications]
    N[Horizontal navigation\nMain menu · signed-in identity · language]
    subgraph AS[Adaptive application shell]
      direction LR
      L[Left navigation\nAuthenticated workspace menu]
      W[Workspace\nBreadcrumb + actions\nPage title\nPage content]
      D[Optional Details panel\nContextual information]
    end
    F[Footer]
    G[Global popup layer + busy overlay]

    H --> N
    N --> AS
    AS --> F
    G -. overlays .-> AS
```

A simplified visual representation is:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Top header: logo/version                         notifications/account│
├──────────────────────────────────────────────────────────────────────┤
│ Horizontal navigation        signed-in identity      language/flag   │
├───────────────┬──────────────────────────────────┬───────────────────┤
│               │ breadcrumb                 action│                   │
│ Left          ├──────────────────────────────────┤ Right Details     │
│ navigation    │ Page title                       │ panel (optional)  │
│ (signed-in)   ├──────────────────────────────────┤                   │
│               │                                  │                   │
│               │ Main workspace/page content      │                   │
│               │                                  │                   │
├───────────────┴──────────────────────────────────┴───────────────────┤
│ Footer                                                               │
└──────────────────────────────────────────────────────────────────────┘

       Popups/modals and the busy overlay float above the shell.
```

### 3.2 Top header

`views/partials/header.ejs` provides:

- theme-aware clickable brand logo;
- application version;
- anonymous **Sign in** / **Sign up** actions;
- authenticated notifications entry point;
- authenticated Account dropdown with account details, personal details, password management and logout.

The Account dropdown contains the detailed account controls; it is distinct from the compact signed-in identity displayed in the horizontal navigation.

### 3.3 Horizontal navigation

`views/partials/horizontal-nav.ejs` renders metadata/configuration-driven items from `src/navigation.ts` and supports nested menus.

For authenticated users, the right side contains a compact signed-in identity immediately before the language selector. This keeps global session identity out of page-specific content such as the Home hero.

The language control currently persists `en` / `el` browser preference and updates `document.lang`. Full literal/content translation is a separate i18n phase.

### 3.4 Left navigation

The authenticated left navigation is generated from `app.navigation.vertical`. It supports nested entries, separators, docked lower actions, authorization filtering and UI actions such as opening Preferences.

It can be collapsed independently. The restore control is intentionally outside the hidden navigation element so it remains available after collapse.

### 3.5 Workspace

The workspace consists of:

- breadcrumb/context row;
- optional workspace actions such as **Details**;
- common page-title surface;
- page content.

Generic SysBO list/edit pages use this workspace rather than implementing independent page shells.

### 3.6 Details panel

The optional right-side Details panel carries contextual page/workspace information. The shell adds or removes the `has-details` state, allowing the central workspace to expand when the panel is closed.

## 4. Navigation architecture

Navigation definitions live in `src/navigation.ts`, not in individual EJS pages. `AppNavMenuItem` currently supports:

- stable `id`;
- visible text and Bootstrap icon;
- URL or child items;
- separators;
- authentication requirements;
- role restrictions;
- client-side UI actions;
- bottom docking in the vertical navigation.

`navigationFor(role, auth)` recursively filters the navigation tree before rendering it. Presentation templates therefore receive only the menu entries applicable to the current session.

## 5. Generic SysBO UI

The UI defines website-specific metadata for business-object presentation separately from the shared BO metadata. Current UI model concepts include:

- `ListViewModel`;
- `EditViewModel`;
- `GridConfiguration`;
- `FilterDefinition`;
- `PaginationConfiguration`;
- icons and UI actions.

Generic SysBO pages provide sorting, filtering, pagination, create/edit/delete behavior and authorization-aware actions. This separation allows another client, such as a future mobile application, to reuse BO contracts while defining different UI metadata.

## 6. CSS architecture

The CSS is intentionally split by concern:

| File | Primary responsibility |
| --- | --- |
| `base.css` | baseline/global element rules |
| `layout.css` | application shell, navigation, workspace, details and major responsive geometry |
| `ui.css` | reusable UI components, authentication/modal structures and controls |
| `theme.css` | theme-dependent appearance, user preference presentation and selected shell refinements |
| `pages.css` | page-specific presentation |

New reusable component styles should normally go to `ui.css`; shell geometry belongs in `layout.css`; genuinely page-specific rules belong in `pages.css`. Avoid putting page-specific fixes into global component rules merely because they happen to use the same Bootstrap primitive.

## 7. Browser-side JavaScript architecture

The shell loads focused browser modules rather than one large page script:

| File | Responsibility |
| --- | --- |
| `shell.js` | shell state, left navigation, Details panel and general modal/shell behavior |
| `forms.js` | form behavior, password controls, validation hooks and unsaved changes |
| `lists.js` | list/grid interaction |
| `busy.js` | full-screen busy/locked state during operations |
| `prefs.js` | browser-local UI preferences such as theme and language |

The server remains responsible for authoritative validation/security. Browser validation is primarily usability protection and must not be treated as the security boundary.

# 8. Popup/modal architecture

Popups are a first-class UI architecture. Their reusable implementation is centralized under `views/popups/` so visual spacing, accessibility, action placement and future localization do not drift between unrelated screens.

## 8.1 Terminology

Rich-content popups distinguish two title levels deliberately:

- **Modal title** (`modalTitle`) — the primary title in the popup header, for example **Sign in**.
- **Content title** (`contentTitle`) — the secondary title in the hero/intro content, for example **Welcome back**.

Other semantic fields include:

- `modalSubtitle` — concise subtitle directly beneath the modal title;
- `contentParagraphs[]` — one or more explanatory paragraphs in the rich hero area;
- `illustration` — optional static or parameterized visual;
- content panels — information, choices, fields and guidance specific to the popup;
- left footer actions — normally a **Back** path when the popup belongs to a flow;
- right footer actions — Cancel/Continue/Save/Sign in/etc.

The names are semantic rather than CSS-oriented so they can later map naturally to localized literals. Stable rich-popup copy is centralized in `src/presentation/popup-content.ts` and supplied to views through the common render model. The current object is intentionally a hardcoded English content source, not an i18n engine; it provides the seam that a future language resolver can replace without restructuring EJS templates. Runtime-dependent text, such as an account name validated from a reset token, remains page-model data and is composed with the static content parameters.

## 8.2 Common popup frame conventions

All popup families share common conventions even when their body structures differ:

```text
Popup
├── Header
│   ├── icon
│   ├── modalTitle
│   ├── optional modalSubtitle
│   └── close action, when allowed
├── Body
│   └── family-specific content
└── Footer
    ├── left actions     Back when applicable
    └── right actions    primary/secondary operation actions
```

Reusable primitives currently implemented are:

- `popups/partials/popup-header.ejs`;
- `popups/partials/popup-footer.ejs`;
- `popups/partials/popup-action.ejs`;
- `popups/partials/rich-popup-hero.ejs`;
- `popups/layouts/message-popup.ejs`.

Not every popup is forced through a single universal body template. Reuse is applied at the level where semantics and visual behavior are genuinely shared.

### Central popup presentation tokens

Recurring popup distances are also architecture-level parameters rather than per-popup margins. `public/css/ui.css` defines semantic CSS custom properties on the rich-popup family, including header/body/footer padding, illustration-to-copy spacing, hero-to-content spacing, the **content title → first paragraph** gap and the subsequent paragraph gap.

Individual popup templates should not pass arbitrary pixel/rem values for these recurring distances. They consume the shared defaults; future density/theme variants may override semantic tokens centrally when a real use case requires it. This is the presentation counterpart to the semantic content model above: copy and spacing both have stable, named contracts.

In particular:

- `--popup-content-title-to-first-paragraph-gap` controls the deliberately larger separation between `contentTitle` and the first item in `contentParagraphs[]`;
- `--popup-content-paragraph-gap` controls the tighter rhythm between subsequent paragraphs;
- `--popup-hero-columns-gap` controls illustration-to-copy spacing;
- `--popup-hero-to-content-gap` controls the distance/separator region before panels or form content.

`rich-popup-hero.ejs` emits semantic `popup-content-title` and `popup-content-paragraph` classes, so all rich popups inherit these rules consistently.

## 8.3 Popup families

### Rich-content popups

Rich popups normally contain:

```text
Header
Hero
├── illustration
└── intro copy
    ├── contentTitle
    └── contentParagraphs[]
Content panels / fields / guidance
Footer
```

Authentication flows are the main current users. Their body structures can differ substantially — provider choices, credentials, password rules, account summaries — while still sharing header, hero and footer infrastructure.

### Message and confirmation popups

Simple result/error/confirmation dialogs do not need an auth-style hero. They use compact content and the same action/footer conventions. `popups/layouts/message-popup.ejs` handles the reusable information/warning/error case, including optional expandable operation traces.

Delete and unsaved-change confirmations are grouped under the message family because they share the same compact interaction model even though their content is specialized.

### Other/form popups

Independent UI dialogs that are neither authentication flows nor generic message dialogs live under `popups/other/`. **Website user preferences** is the current example. It shares popup header/footer primitives while owning its settings/form body.

This category is intentionally extensible for future independent dialogs.

## 8.4 Popup folder organization

Current canonical structure:

```text
views/popups/
├── auth/
│   └── auth-modals.ejs
├── messages/
│   ├── message-modals.ejs
│   └── bo-edit-confirmations.ejs
├── other/
│   └── preferences-modal.ejs
├── layouts/
│   └── message-popup.ejs
├── partials/
│   ├── popup-header.ejs
│   ├── popup-footer.ejs
│   ├── popup-action.ejs
│   ├── rich-popup-hero.ejs
│   └── external-provider-buttons.ejs
└── illustrations/
    ├── auth-entry-illustration.ejs
    └── external-link-illustration.ejs
```

Page-specific rich popups that require their own route/page model currently remain in `views/pages/` but consume the reusable popup primitives. Examples include password reset/change and external-account linking. They can migrate further under `views/popups/` later if doing so improves ownership without making route-to-view mapping obscure.

## 8.5 Illustrations

Illustrations are reusable semantic components, not duplicated markup.

`rich-popup-hero.ejs` currently recognizes two illustration kinds:

```text
static
  -> auth-entry-illustration.ejs
  -> semantic modes such as register / signin / password

provider
  -> external-link-illustration.ejs
  -> provider/context-dependent rendering
```

Provider illustrations are intentionally dynamic. Microsoft, Google, Facebook and GitHub use common provider metadata (`key`, label, icon, configured state) so a popup can render the correct provider-specific visual without duplicating an entire popup template.

Future illustrations may add other parameterized contexts; callers should pass semantic illustration configuration rather than raw SVG/CSS markup whenever possible.

## 8.6 Current popup inventory

| Popup | Family | Modal title | Content title / body | Inputs or choices |
| --- | --- | --- | --- | --- |
| Account creation method | Rich/auth | Create your account | Welcome! | provider choices or Register with Email |
| Email registration | Rich/auth | Register with Email | Create your account | user name, email, password, confirmation |
| Sign in | Rich/auth | Sign in | Welcome back | provider choices or local identity/password |
| Password request | Rich/auth | Forgot or set password | Recover access to your account | email or user name |
| Password reset | Rich/auth | Set or reset password | Create a new password | new password + confirmation + rules |
| Password-link unavailable | Rich/auth informational | Password link unavailable | Request a new link | Back to sign in / Request a new link |
| Account password | Rich/auth | Change password / Set password | Secure your account / Create your password | current/new/confirm password as applicable |
| External account link | Rich/auth, provider-specific | Link external account | provider/account ownership explanation | provider/email summary, existing identity, password |
| Existing external account | Rich/auth, provider-specific | You already have an account | provider-specific welcome/explanation | continue sign-in or cancel |
| Website preferences | Other/form | Website user preferences | settings body | theme choices and Save |
| Information/success | Message | contextual | short message | OK or follow-up action |
| Warning | Message | contextual | short warning | OK or follow-up action |
| Operation failed | Message/error | Operation failed | safe error + optional operation trace | Cancel and optional Retry |
| Delete entry | Message/confirmation | Delete `<SysBO>` | destructive warning | Cancel / Delete |
| Unsaved changes | Message/confirmation | Unsaved changes | unsaved-state warning | Cancel / Discard / Save |

`external-registration.ejs` is currently a page/content-card flow rather than a modal; it is therefore not included as a popup despite belonging to the wider authentication UX.

## 8.7 Footer/action rules

Popup actions follow a consistent positional convention:

- **leftmost**: Back/navigation-to-previous-step when the operation is a multi-step flow;
- **rightmost**: secondary and primary operation actions;
- destructive primary actions use the destructive Bootstrap variant;
- forms that require valid input can render their submit action disabled until client-side usability checks pass;
- authoritative validation still occurs server/API-side.

`popup-action.ejs` supports button and link actions, icons, Bootstrap variants, dismiss/toggle/target behavior, disabled state, click handlers and data attributes.

## 8.8 Busy-state integration

Long-running form operations use `data-busy-submit` plus semantic busy title/message/icon attributes. `public/js/busy.js` presents a full-screen locked overlay while the request is in progress.

This avoids duplicate submissions and gives explicit feedback during operations such as registration, password reset/change and external-account linking.

## 8.9 Popup architecture extension rules

When adding a popup:

1. decide whether it belongs to `auth`, `messages` or `other`;
2. reuse `popup-header` and `popup-footer` unless there is a concrete UX reason not to;
3. use `rich-popup-hero` for illustration + `contentTitle` + `contentParagraphs[]` introductions and source stable auth copy from the centralized popup content model;
4. use shared semantic popup spacing tokens rather than adding flow-specific margins for recurring layout relationships;
5. reuse or extend semantic illustrations rather than copying illustration markup;
6. keep flow-specific content panels in the owning popup/page;
7. keep **Back** at the left and operation actions at the right;
8. add presentation tests for the shared contract and behavior-specific tests for the popup itself;
9. add new reusable abstractions only after at least two real consumers demonstrate the common structure.

This avoids both markup duplication and premature “universal component” abstractions full of nullable fields.

## 9. Authentication UI boundaries

Authentication presentation is split across server routes, provider metadata and popup/page templates. Current external provider choices are Microsoft, Google, Facebook and GitHub. Providers remain visible even when not configured; configured state determines whether the live Passport route is available.

Password recovery deliberately uses a privacy-neutral public confirmation so the UI does not disclose whether an entered identity exists. Password/reset links use transient one-time tokens; the detailed token/storage semantics are documented in `docs/authentication-flows.md`.

## 10. Preferences and themes

The Preferences popup currently controls the browser-local theme. Theme and selected language are persisted per website-user ID (or `anonymous`) in browser `localStorage` and restored early in `shell.ejs` before styles paint.

The supported theme values are currently `lighter` and `darker`. Theme-specific brand assets are selected before paint to avoid an incorrect-logo flash.

## 11. Error presentation

Navigation/HTTP failures use EJS error pages. Application errors can be projected into the reusable **Operation failed** popup.

The popup shows a safe user-facing message and can expose a collapsible semantic operation trace for power-user diagnostics when one is supplied. Sensitive values are sanitized upstream; presentation code should not attempt to reconstruct hidden secrets.

## 12. UI test architecture

The current UI test suite uses **Vitest** with several complementary styles:

### Unit/domain-adjacent UI tests

Examples:

- `api-session.test.ts` — API-session bridge helpers;
- `auth-middleware.test.ts` — browser authentication middleware;
- `external-providers.test.ts` — provider metadata;
- `microsoft-profile.test.ts` / `github-profile.test.ts` — provider normalization;
- `recovery-identity.test.ts` — recovery-input syntax;
- `security-token-store.test.ts` — transient token rules.

These tests should remain close to deterministic TypeScript behavior and avoid EJS rendering unless presentation is the actual subject.

### Presentation/component-contract tests

EJS is rendered directly and inspected with Cheerio. Examples:

- `auth-presentation.test.ts`;
- `account-password-presentation.test.ts`;
- `password-reset-presentation.test.ts`;
- `home-presentation.test.ts`;
- `message-modals-presentation.test.ts`;
- `popup-infrastructure-presentation.test.ts`.

These tests protect structure and semantic contracts that TypeScript compilation cannot see: modal wiring, shared partial usage outcomes, disabled actions, labels, identity placement, provider visuals and required data attributes.

The popup-refactor regression that produced `isOwnSysUser is not defined` is a good example: build/type-checking succeeded, while EJS rendering tests correctly detected the broken include dependency.

### UI route/integration tests

`ui.integration.test.ts` uses Supertest plus selected rendered views/API-client mocks to exercise UI-route authorization, CSRF behavior and SysUser delete flows.

### Current assessment

The suite has good **layer diversity** and is already useful. The principal structural weakness is that all test styles currently share a flat `test/` directory. That is acceptable at the present size, and there is no need to reorganize files merely for aesthetics.

When the suite grows, prefer a structure such as:

```text
test/
├── unit/
│   ├── auth/
│   └── security/
├── presentation/
│   ├── popups/
│   ├── pages/
│   └── shell/
└── integration/
    └── routes/
```

Do that as a deliberate test-architecture refactor, not piecemeal file movement.

### Future browser E2E layer

Vitest/EJS/Cheerio/Supertest do not replace a real browser. Playwright is the planned higher-level layer for behaviors such as:

- complete authentication and recovery flows;
- Bootstrap modal transitions/focus behavior;
- responsive shell states;
- side-navigation/details interactions;
- actual browser validation and password visibility controls;
- optional real SMTP/IMAP integration scenarios using dedicated test accounts.

The browser E2E layer should complement, not replace, the faster unit/presentation/integration suite.

## 13. Known UI evolution areas

Current or planned areas include:

- multilingual/i18n literal extraction and translation;
- richer role-aware UI for Guest/User/Superuser/Admin once role work is implemented;
- platform/multiplatform responsive behavior;
- notifications subsystem;
- broader centralized field-validation architecture;
- Playwright browser E2E tests;
- further popup families only when new real use cases justify them.

Keep this document updated when a new reusable UI architecture is introduced.
