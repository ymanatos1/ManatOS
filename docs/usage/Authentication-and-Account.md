# Authentication and Account

The system supports local account/session workflows and configured external identity providers. External provider availability depends on verified provider configuration; sensitive client secrets are not exposed through ordinary entity reads.

Account pages present the current user's identity/authentication information and available account actions. Administration → Users is a separate administrative entity experience and can expose broader capabilities according to authorization.

Password rules and verification flows are enforced by the appropriate trusted boundary; UI validation exists for usability, not as the sole security check.
