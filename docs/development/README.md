# Development

This subject owns the practical repository/developer workflow that is intentionally kept out of the main project overview. Use it for environment preparation, repository structure, build/run commands, testing, coding principles, cross-cutting extension guidance and documentation standards.

## Start here

- [`Getting-Started.md`](Getting-Started.md) — prerequisites and initial development setup.
- [`Repository-Structure.md`](Repository-Structure.md) — source/workspace layout and ownership.
- [`Building-and-Running.md`](Building-and-Running.md) — running the API/client processes and build workflow.
- [`Testing.md`](Testing.md) — tests, verification and architectural/contract coverage.
- [`Coding-Principles.md`](Coding-Principles.md) — implementation principles and common conventions.
- [`Extension-Points.md`](Extension-Points.md) — cross-cutting extension map; subsystem-specific guides live with their subjects.
- [`Documentation-Standards.md`](Documentation-Standards.md) — permanent documentation conventions.

## Subject-specific development guides

Development instructions now live beside the subsystem they extend: entity/component guides under [`entities/`](../entities/README.md), expression extension under [`expressions/`](../expressions/README.md), API capability extension under [`api/`](../api/README.md), client implementation guidance under [`clients/`](../clients/README.md), security guidance under [`security/`](../security/README.md), storage adapters under [`storage/`](../storage/README.md) and developer diagnostic tools under [`diagnostics/`](../diagnostics/README.md).

The authoritative full-repository verification remains the repository workflow documented in [`Testing.md`](Testing.md).

Return to the [documentation map](../README.md) or [repository overview](../../README.md).

## Engineering and maintenance

- [Repository Structure](Repository-Structure.md) — workspace composition and dependency direction.
- [Building and Running](Building-and-Running.md) and [Testing](Testing.md) — supported execution and verification.
- [Extension Points](Extension-Points.md) — choosing canonical ownership for additions.
- [Documentation Standards](Documentation-Standards.md) — editorial/technical accuracy and viewer-compatible Markdown.

The documentation is a stable architecture reference, not an engineering progress record.
