# Purpose and Scope

protoCRM is the current CRM-oriented platform built on the common ManatOS application foundation. Its platform-owned implemented scope currently centers on Applications and Apps Playground, while future CRM-oriented tools and application-defined entities will reuse the same generic metadata, entity, CTX, expression, security, UI and storage contracts.

## Company versus platform ownership

Users/Account, Principals, Licenses, External Authentication Providers, organization hierarchy and Principal contact information are company-level ManatOS concerns. They remain available to protoCRM where needed, but consuming a company entity does not transfer ownership to the platform.

## Platform direction

The broader platform catalog identifies CRM-oriented directions such as customer views, opportunities, activities, communications, documents and analytics. These are design directions, not claims that every module is already implemented.

Future entities defined by Application entries are expected to use the generic entity infrastructure without becoming `SysBO` objects merely because system entities use that prefix today.
