# Navigation

Platform navigation is contributed declaratively. The current platform contributes **Apps Playground** and Administration → **Applications** when the authenticated user's safe `platformAccess` capability is true.

Navigation visibility is presentation driven by a server-resolved capability; it is not the authorization boundary. Entity availability requirements are also part of the contribution so navigation does not advertise a feature whose required entity contracts are absent.
