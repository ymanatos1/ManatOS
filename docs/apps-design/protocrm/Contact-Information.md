# Contact Information

Email addresses, telephone numbers and postal addresses are modeled as canonical reusable value entities plus Principal link entities. This avoids duplicating the same normalized value when it is associated with more than one owner and gives relationships explicit semantics.

Email normalization lowercases/validates canonical identity form. Telephone normalization uses international `+<digits>` form. Postal addresses expose structured address lines/locality/region/postal/country fields and a calculated/display representation for list use.

Compound collection editors coordinate these related records while the owning entry tracks aggregate dirty state.
