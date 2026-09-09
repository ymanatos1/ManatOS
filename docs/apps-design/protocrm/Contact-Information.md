# Contact Information

Email addresses, telephone numbers and postal addresses are modeled as canonical reusable value entities plus Principal link relationships. This avoids storing the same normalized value repeatedly when it is associated with multiple owners and gives relationship semantics an explicit home.

## Email addresses

Email identity is normalized case-insensitively for canonical matching while retaining a presentation form suitable for display. If an address already exists, an owning Principal can link to that canonical value instead of creating a duplicate value row.

## Telephone numbers

Telephone values use an international canonical form (`+<digits>`) for identity/comparison. Presentation components can format them for users without changing the stored canonical identity.

## Postal addresses

Postal addresses remain structured: address lines, locality/city, region, postal code and country are separate semantic fields. A calculated/display representation can summarize the structured value in lists and references without replacing those fields with one opaque string.

## Collection editing

Owning entities manipulate contact relationships through compound collection editors. The child editor owns its draft lifecycle; the parent entry owns aggregate form state and cannot treat a dirty child draft as already committed scalar field data.

This model is designed to support reuse and relationship metadata consistently across people, organizations and future CRM entities.
