# Purpose and Scope

protoCRM is the current CRM-oriented platform built on the common application foundation. Its purpose is both practical and architectural: it provides customer/organization-oriented business capabilities while exercising the same entity, metadata, context, expression, security and UI contracts intended for other platforms.

## Current implemented foundation

The present domain centers on Principals, Users, Applications, Licenses and normalized contact information. Organization relationships use Principal hierarchy semantics; Users connect authentication identity to Person Principals; Applications and Licenses provide the first platform/application commercial relationship; email, telephone and postal data are modeled as reusable normalized entities rather than repeated strings.

## Platform direction

The broader platform catalog identifies CRM-oriented directions such as customer views, opportunities, activities, communications, documents and analytics. These are design directions, not claims that every module is already implemented. Documentation should always distinguish implemented behavior from intended extension points.

## Why the platform matters to the foundation

Each concrete capability is expected to prove or refine a reusable contract rather than create a one-off implementation. For example, organization editing exercises aggregate workspace state, Licenses exercise restricted references and assisted calculation, and contact information exercises related collection editors and normalized reusable value entities.

See [Domain Model](Domain-Model.md) for the entity relationships and the remaining documents in this folder for each major business area.
