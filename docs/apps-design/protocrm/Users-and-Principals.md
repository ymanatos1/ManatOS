# Users and Principals

A User is an account/authentication identity. A Principal is the generalized business identity used for people and organizations. A User can reference a Person Principal; the inverse relationship is represented canonically rather than duplicated as unrelated fields.

Principal presentation demonstrates conditional metadata: Person principals expose first/last name and derive the canonical full name; organization/company forms use the canonical name directly. Parent/root relationships drive organization hierarchy. User administration combines generic entity fields with authentication/external-identity presentation without turning credentials into ordinary entity fields.
