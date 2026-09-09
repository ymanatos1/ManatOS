# Business Rules

Representative rules currently expressed by the model include: User↔Person-Principal relationship integrity; Person full-name calculation; parent/root Principal traversal; normalized reusable contact values; platform/application/license relationships; server-authoritative role/capability policy; and metadata-driven eligibility/exception predicates for selectors and lists.

Rules that are pure functions of observable CTX are candidates for expressions. Rules that require authorization, persistence mutation, secret handling or transactional side effects remain server/domain operations.
