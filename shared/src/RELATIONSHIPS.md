# ManatOS canonical relationship metadata

Relationships are registered on the referencing object: its `fields` contain the foreign-key value(s), while `references.objectKey` and `references.fields` identify the canonical target. The registry can therefore derive inverse one-to-many navigation and delete impacts without duplicating inverse metadata.

Delete behavior lives under the relationship's keyed `policies` collection. `policies.delete.action` describes referential integrity (`restrict`, `cascade`, `set-null`, `unlink`) independently from `policies.delete.confirmation` (`silent`, `confirm`, `inherit`). The server always recalculates a delete plan before execution; a client preview is advisory only.

Many-to-many data should normally use an explicit canonical junction object with two many-to-one relationships. A future semantic `many-to-many` relationship can expose convenient navigation/report/designer metadata through the junction while the junction remains the physical integrity source of truth.
