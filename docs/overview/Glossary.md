# Glossary

This glossary is the quick lookup for terminology used throughout ManatOS. It intentionally covers the whole system rather than only the client/entity runtime. [Concepts](Concepts.md) provides the explanatory introduction; the subject folders contain the canonical detail.

| Term | Meaning |
| --- | --- |
| API | Authoritative HTTP/service boundary that exposes ManatOS operations, metadata and server-derived capabilities to clients. |
| API CTX | Process-local server CTX whose `api.level-<request-id>` branches represent concurrent requests and nested server/subsystem work. |
| API Traffic | Client developer diagnostic view of outgoing API calls, including request/response data and request-id correlation to server logs and CTX snapshots. |
| Application | Platform-owned business capability composed on ManatOS. Applications may consume company capabilities without owning them. |
| Application Foundation | Reusable semantic/runtime foundation used to compose platforms and applications. |
| AST | Parsed Abstract Syntax Tree for an expression. ASTs are process-local execution artifacts cached independently by each evaluator host; expression source is the portable contract. |
| Authorization | Server-side decision about whether an authenticated subject may perform an operation on a collection, record or protected capability. |
| Baseline | Original/committed state against which editable working state is compared. |
| Behavior strategy | Storage implementation strategy that decides how a system behavioral guarantee is realized by an adapter, natively when possible and by a framework fallback otherwise. |
| Capability | Authoritative fact describing whether an operation or facility is available in the current context. Security-sensitive capabilities are derived on the server rather than reconstructed in the browser. |
| Client | Any interactive ManatOS consumer implementing the client contracts. The current Express/EJS web application is one client implementation; future clients can use other technologies. |
| Client CTX | CTX tree owned by an interactive client, containing client/runtime facts, metadata, authenticated-user projection and the active recursive UI-level chain. |
| Collection editor | Reusable component for editing a child/related collection as one draft contribution to an owning entry transaction. |
| Company | Top-level ManatOS product/catalog owner of company-wide identity, Principals, licensing, authentication-provider and shared capabilities. |
| Component | Reusable metadata/CTX-driven UI capability with explicit ownership, inputs, lifecycle and output contract. |
| Correlation ID / Request ID | Identifier propagated across client API traffic, API operation context, logs and CTX snapshots so one request can be diagnosed end-to-end. |
| CTX | System-wide observable semantic runtime context model. API and clients maintain independently owned CTX trees that share semantics where appropriate but are not synchronized copies. |
| Dependency | Observable input whose change can invalidate and recompute derived behavior. |
| Debugging | Interactive investigation of runtime state/execution using ManatOS developer tools such as CTX Viewer, expression inspection and API Traffic. |
| Diagnostics | Information and tools used to explain runtime behavior, including CTX inspection, expression diagnostics, API Traffic, correlated logs and snapshots. |
| Dirty | State indicating live/working data differs from its baseline, including aggregate/component contributions where applicable. |
| Entity | Generic metadata-driven business-object definition; may be system-owned or future application-defined. |
| Entry | Interactive representation of one entity record, normally with canonical baseline/live field state and aggregate component state. |
| Event | Typed runtime notification that reports a semantic change or lifecycle transition. Events drive observers and reactive work without making the event stream a second state authority. |
| Eventing | The publish/subscribe and runtime dispatch mechanisms used to propagate semantic state/lifecycle changes between owners. |
| Expression | Declarative, side-effect-free calculation or decision in the ManatOS expression language. |
| Expression function | Named operation registered in the canonical expression-function registry and callable from expression source, for example `CurrentDay()` or `TraverseEntity(...)`. |
| Fact | Observable runtime information that is not a persisted entity field. Facts are published by an appropriate owner rather than disguised as editable data. |
| Field component | UI implementation selected from a field's canonical type. It renders/edits a typed value while the entry runtime retains canonical value ownership. |
| Field state | Runtime state owned for one entry field, including live value, baseline, validation and derived presentation state. |
| Metadata | Structured description of domain or UI semantics consumed by generic infrastructure. Canonical entity metadata describes what an entity is; UI metadata describes presentation and interaction. |
| Observability | Ability to understand runtime execution from structured state, identifiers, logs, snapshots and diagnostic tools without changing application behavior. |
| Operation context | Server execution context associated with an API request/operation and propagated to nested server work for correlation and diagnostics. |
| Persisted calculation | Metadata-declared calculated field whose canonical result is materialized before commit so all storage adapters persist the same semantic value. |
| Platform | Coherent product/domain environment composed on the ManatOS foundation. `protoCRM` is the current concrete platform. |
| Popup | Child client UI level with explicit invocation, ownership and lifecycle semantics. |
| Principal | Company-level generalized business identity representing people, organizations and other supported principal types. It is distinct from an authentication User. |
| protoCRM | Current CRM-oriented ManatOS platform. It owns platform-specific capabilities such as Applications while consuming company-level Users, Principals and Licenses. |
| Reactive evaluation | Re-evaluation of derived expression-backed behavior after one of its observable dependencies changes. |
| Resource | Owner-managed runtime data exposed to component/surface behavior without pretending it is a persisted field. |
| Role | Coarse authenticated-user category used by server authorization policy. Current roles are Guest, User, Superuser and Admin. |
| Selector | List-like child surface that returns a semantic selection result to its caller. |
| Storage | Adapter-neutral persistence subsystem that exposes ManatOS data semantics while allowing different physical persistence technologies. |
| Storage adapter | Concrete implementation of the storage contract for a technology such as local JSON, SQLite, SQL Server, MariaDB or PostgreSQL. |
| Storage adapter family | Inheritance/category node that supplies shared native-capability declarations to related adapters, for example Relational, Server RDBMS or Embedded RDBMS. |
| Storage capability | Declared native feature of an adapter/family, such as transactions, constraints, generated columns or multiple databases. It is not itself a ManatOS behavioral guarantee. |
| Storage configuration | Persisted administrative definition of a potential storage target. The selected/next configuration is distinct from the configuration currently serving a running API process. |
| Surface | Internal client runtime object represented publicly through a UI level. |
| SysBO | Naming/category convention for systemic ManatOS/company and platform business objects. It is not a synonym for every entity using the generic infrastructure. |
| System behavioral guarantee | Adapter-independent behavior ManatOS promises regardless of physical storage technology, for example atomic writes, uniqueness or persisted calculation semantics. |
| UI level | One node in the recursive active client page/popup surface chain. |
| UI metadata | Metadata describing presentation and interaction independently of canonical entity semantics. |
| Validation | Determination that a candidate value/entry satisfies canonical/UI interaction rules before or during persistence. Validation state is observable but does not replace authoritative server validation. |
| Workspace | Owner-managed transactional working model for compound/aggregate editing, such as hierarchy editing, whose dirty/commit lifecycle contributes to the owning surface. |
