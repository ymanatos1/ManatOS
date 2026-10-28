/** ManatOS metadata text catalogue. Source-owned, shared by API and UI builds. */
export const SS_TEXT = {
  'manatos.auth.label.ExternalAuthenticationProviderType': {
    EN: 'External authentication provider type',
    EL: 'Τύπος εξωτερικού παρόχου ταυτοποίησης',
  },
  'manatos.auth.label.Microsoft': { EN: 'Microsoft', EL: 'Microsoft' },
  'manatos.auth.label.Google': { EN: 'Google', EL: 'Google' },
  'manatos.auth.label.Facebook': { EN: 'Facebook', EL: 'Facebook' },
  'manatos.auth.label.GitHub': { EN: 'GitHub', EL: 'GitHub' },
  'manatos.auth.label.UserRole': { EN: 'User role', EL: 'Ρόλος χρήστη' },
  'manatos.auth.label.Admin': { EN: 'Admin', EL: 'Διαχειριστής' },
  'manatos.auth.label.Superuser': { EN: 'Superuser', EL: 'Υπερχρήστης' },
  'manatos.auth.label.User': { EN: 'User', EL: 'Χρήστης' },
  'manatos.auth.label.Guest': { EN: 'Guest', EL: 'Επισκέπτης' },
  'manatos.auth.label.Auth': { EN: 'Auth', EL: 'Ταυτοποίηση' },
  'manatos.auth.description.AuthenticationUsersInvitationsAndExternalIdentitiesproviders': {
    EN: 'Authentication, users, invitations and external identities/providers.',
    EL: 'Ταυτοποίηση, χρήστες, προσκλήσεις και εξωτερικές ταυτότητες/πάροχοι.',
  },
  'manatos.configuration.label.Platform': { EN: 'Platform', EL: 'Πλατφόρμα' },
  'manatos.configuration.label.Configuration': { EN: 'Configuration', EL: 'Παραμετροποίηση' },
  'manatos.configuration.description.RuntimeApplicationConfigurationAndSystemConfiguration': {
    EN: 'Runtime application configuration and system configuration entities.',
    EL: 'Οντότητες παραμετροποίησης εφαρμογής κατά την εκτέλεση και παραμετροποίησης συστήματος.',
  },
  'manatos.contacts.label.Contacts': { EN: 'Contacts', EL: 'Επαφές' },
  'manatos.contacts.description.ReusableEmailaddressTelephonenumberAndPostaladdressEntities': {
    EN: 'Reusable email-address, telephone-number and postal-address entities.',
    EL: 'Επαναχρησιμοποιήσιμες οντότητες διευθύνσεων Email, τηλεφωνικών αριθμών και ταχυδρομικών διευθύνσεων.',
  },
  'manatos.licensing.label.LicenseStatus': { EN: 'License status', EL: 'Κατάσταση άδειας' },
  'manatos.licensing.label.Active': { EN: 'Active', EL: 'Ενεργό' },
  'manatos.licensing.label.Suspended': { EN: 'Suspended', EL: 'Σε αναστολή' },
  'manatos.licensing.label.Expired': { EN: 'Expired', EL: 'Έληξε' },
  'manatos.licensing.label.Cancelled': { EN: 'Cancelled', EL: 'Ακυρωμένη' },
  'manatos.licensing.label.Licensing': { EN: 'Licensing', EL: 'Αδειοδότηση' },
  'manatos.licensing.description.LicensesAndLicensingRulescapabilities': {
    EN: 'Licenses and licensing rules/capabilities.',
    EL: 'Άδειες χρήσης και κανόνες/δυνατότητες αδειοδότησης.',
  },
  'manatos.principals.label.PrincipalType': { EN: 'Principal type', EL: 'Τύπος κύριας οντότητας' },
  'manatos.principals.label.Person': { EN: 'Person', EL: 'Φυσικό πρόσωπο' },
  'manatos.principals.label.Company': { EN: 'Company', EL: 'Εταιρεία' },
  'manatos.principals.label.Group': { EN: 'Group', EL: 'Ομάδα' },
  'manatos.principals.label.System': { EN: 'System', EL: 'Σύστημα' },
  'manatos.principals.label.Principals': { EN: 'Principals', EL: 'Κύριες οντότητες' },
  'manatos.principals.description.ReusablePeopleOrganizationsGroupsAndOther': {
    EN: 'Reusable people, organizations, groups and other business/security principals.',
    EL: 'Επαναχρησιμοποιήσιμα πρόσωπα, οργανισμοί, ομάδες και άλλες κύριες επιχειρησιακές οντότητες/ασφάλειας.',
  },
  'platforms.panoptes.surveillance.label.Surveillance': {
    EN: 'Surveillance',
    EL: 'Επιτήρηση',
  },
  'platforms.panoptes.surveillance.description.SurveillanceOperations': {
    EN: 'Panoptes surveillance operations and their guard, project and post entities.',
    EL: 'Επιχειρήσεις επιτήρησης Panoptes και οι οντότητες φυλάκων, έργων και θέσεων.',
  },
  'platforms.protocrm.applications.label.Applications': { EN: 'Applications', EL: 'Εφαρμογές' },
  'platforms.protocrm.applications.description.ProtoCRMApplicationDefinitionsAndApplicationdesignCapabilities':
    {
      EN: 'protoCRM application definitions and application-design capabilities.',
      EL: 'Ορισμοί εφαρμογών protoCRM και δυνατότητες σχεδιασμού εφαρμογών.',
    },
} as const;
