/**
 * Presentation-only translations for API-owned Storage metadata.
 * English API identifiers, option values and persisted settings are never altered.
 * Unknown metadata remains verbatim rather than producing a misleading translation.
 */
const greek: Readonly<Record<string, string>> = {
  Configuration: 'Διαμόρφωση',
  'Connection verified.': 'Η σύνδεση επαληθεύτηκε.',
  'Database catalogue loaded.': 'Η λίστα βάσεων φορτώθηκε.',
  'Database available.': 'Η βάση είναι διαθέσιμη.',
  'Database not found.': 'Η βάση δεν βρέθηκε.',
  'Schema ready.': 'Το σχήμα είναι έτοιμο.',
  'Schema changes required.': 'Απαιτούνται αλλαγές σχήματος.',
  Capabilities: 'Δυνατότητες',
  Files: 'Αρχεία',
  Connection: 'Σύνδεση',
  Database: 'Βάση δεδομένων',
  Schema: 'Σχήμα',
  Data: 'Δεδομένα',
  'Database file': 'Αρχείο βάσης δεδομένων',
  'In-memory / JSON file': 'Στη μνήμη / αρχείο JSON',
  'Keeps records in memory while the API is running and persists the datastore to a JSON file. Binary resources are stored in a filesystem folder.':
    'Διατηρεί τα δεδομένα στη μνήμη κατά τη λειτουργία του API και τα αποθηκεύει σε αρχείο JSON. Οι δυαδικοί πόροι αποθηκεύονται σε φάκελο.',
  'Database JSON file': 'Αρχείο JSON δεδομένων',
  'JSON file used to persist the datastore between API restarts.':
    'Αρχείο JSON για τη διατήρηση των δεδομένων μεταξύ επανεκκινήσεων του API.',
  'Binary resources folder': 'Φάκελος δυαδικών πόρων',
  'Root folder used for pictures and other filesystem-backed binary resources.':
    'Βασικός φάκελος για εικόνες και άλλους δυαδικούς πόρους.',
  'MariaDB relational storage. Configure and validate a target independently of the datastore currently serving ManatOS.':
    'Σχεσιακή αποθήκευση MariaDB. Διαμορφώστε και ελέγξτε τον στόχο ανεξάρτητα από την ενεργή βάση του ManatOS.',
  Host: 'Κεντρικός υπολογιστής',
  'MariaDB host name or network address.': 'Όνομα διακομιστή MariaDB ή διεύθυνση δικτύου.',
  Port: 'Θύρα',
  'TCP port. The normal MariaDB default is 3306.': 'Θύρα TCP. Προεπιλογή της MariaDB: 3306.',
  'Use SSL/TLS': 'Χρήση SSL/TLS',
  'Use TLS for the MariaDB connection.': 'Χρήση TLS για τη σύνδεση MariaDB.',
  'Microsoft SQL Server relational storage. Configure and validate a target independently of the datastore currently serving ManatOS.':
    'Σχεσιακή αποθήκευση SQL Server. Διαμορφώστε και ελέγξτε τον στόχο ανεξάρτητα από την ενεργή βάση του ManatOS.',
  Server: 'Διακομιστής',
  'SQL Server host name or network address.': 'Όνομα διακομιστή SQL Server ή διεύθυνση δικτύου.',
  Instance: 'Παρουσία διακομιστή',
  'Optional named SQL Server instance. Leave empty when connecting by port.':
    'Προαιρετικό όνομα παρουσίας SQL Server. Αφήστε κενό για σύνδεση μέσω θύρας.',
  'Optional TCP port. Leave empty to let the SQL Server driver use its normal connection resolution.':
    'Προαιρετική θύρα TCP. Αφήστε κενό για αυτόματη επιλογή από τον οδηγό SQL Server.',
  'Driver / transport': 'Οδηγός / μεταφορά',
  'SQL Server client transport. Native Windows / ODBC supports Windows integrated authentication; TDS / Tedious is cross-platform and uses SQL Server credentials.':
    'Μέθοδος σύνδεσης SQL Server. Το Windows / ODBC υποστηρίζει ενσωματωμένη ταυτοποίηση Windows, ενώ το TDS / Tedious χρησιμοποιεί διαπιστευτήρια SQL Server.',
  'Native Windows / ODBC (msnodesqlv8)': 'Εγγενές Windows / ODBC (msnodesqlv8)',
  'TDS / Tedious (cross-platform)': 'TDS / Tedious (πολλαπλών πλατφορμών)',
  'ODBC driver': 'Οδηγός ODBC',
  'Native Microsoft ODBC driver used for Windows integrated authentication. ODBC Driver 18 is recommended for current SQL Server versions.':
    'Οδηγός Microsoft ODBC για ενσωματωμένη ταυτοποίηση Windows. Συνιστάται ο ODBC Driver 18.',
  'ODBC Driver 18 for SQL Server': 'ODBC Driver 18 για SQL Server',
  'ODBC Driver 17 for SQL Server': 'ODBC Driver 17 για SQL Server',
  'SQL Server Native Client 11.0 (legacy)': 'SQL Server Native Client 11.0 (παλαιός)',
  Authentication: 'Ταυτοποίηση',
  'Authentication mechanism used by the SQL Server connection.':
    'Μέθοδος ταυτοποίησης σύνδεσης SQL Server.',
  'SQL Server user name / password': 'Όνομα χρήστη / κωδικός SQL Server',
  'Windows integrated authentication': 'Ενσωματωμένη ταυτοποίηση Windows',
  Encryption: 'Κρυπτογράφηση',
  'SQL Server connection encryption. Mandatory requests TLS; Optional allows an unencrypted connection when the server permits it.':
    'Κρυπτογράφηση σύνδεσης SQL Server. Η υποχρεωτική επιλογή απαιτεί TLS, ενώ η προαιρετική επιτρέπει σύνδεση χωρίς κρυπτογράφηση όπου υποστηρίζεται.',
  Optional: 'Προαιρετική',
  Mandatory: 'Υποχρεωτική',
  'Trust server certificate': 'Εμπιστοσύνη πιστοποιητικού διακομιστή',
  'Trust the SQL Server certificate without normal chain validation. Appropriate for a local development server using a self-signed certificate.':
    'Αποδοχή του πιστοποιητικού SQL Server χωρίς πλήρη έλεγχο αλυσίδας. Κατάλληλο για τοπική ανάπτυξη με αυτοϋπογεγραμμένο πιστοποιητικό.',
  'PostgreSQL relational storage. Configure and validate a target independently of the datastore currently serving ManatOS.':
    'Σχεσιακή αποθήκευση PostgreSQL. Διαμορφώστε και ελέγξτε τον στόχο ανεξάρτητα από την ενεργή βάση του ManatOS.',
  'PostgreSQL host name or network address.': 'Όνομα διακομιστή PostgreSQL ή διεύθυνση δικτύου.',
  'TCP port. The normal PostgreSQL default is 5432.': 'Θύρα TCP. Προεπιλογή της PostgreSQL: 5432.',
  'SSL mode': 'Λειτουργία SSL',
  'PostgreSQL TLS behavior for this connection.': 'Ρυθμίσεις TLS για τη σύνδεση PostgreSQL.',
  Disable: 'Απενεργοποίηση',
  Prefer: 'Προτίμηση',
  Require: 'Απαίτηση',
  'Verify full certificate': 'Πλήρης επαλήθευση πιστοποιητικού',
  'SQLite embedded relational storage. The database is one local file; no database server, host, port or credentials are required.':
    'Ενσωματωμένη σχεσιακή αποθήκευση SQLite σε τοπικό αρχείο, χωρίς διακομιστή ή διαπιστευτήρια.',
  'SQLite database file': 'Αρχείο βάσης SQLite',
  'Path of the SQLite database file. Testing the target opens the file and creates it when it does not yet exist.':
    'Διαδρομή αρχείου SQLite. Η δοκιμή ανοίγει το αρχείο και το δημιουργεί αν δεν υπάρχει.',
  'Data model': 'Μοντέλο δεδομένων',
  'Relational model': 'Σχεσιακό μοντέλο',
  'Native relational tables and relationships.': 'Εγγενείς σχεσιακοί πίνακες και συσχετίσεις.',
  'Document records': 'Εγγραφές εγγράφων',
  'Native document/file-oriented record persistence.':
    'Εγγενής αποθήκευση εγγραφών τύπου εγγράφου/αρχείου.',
  Transactions: 'Συναλλαγές',
  'Atomic transactions': 'Ατομικές συναλλαγές',
  'Native all-or-nothing transactional writes.': 'Εγγενείς ατομικές εγγραφές συναλλαγών.',
  Savepoints: 'Σημεία αποθήκευσης',
  'Native savepoints inside a transaction.': 'Εγγενή σημεία αποθήκευσης εντός συναλλαγής.',
  Tables: 'Πίνακες',
  'Native table/schema structures.': 'Εγγενείς δομές πινάκων και σχημάτων.',
  Indexes: 'Ευρετήρια',
  'Native indexes over stored data.': 'Εγγενή ευρετήρια στα αποθηκευμένα δεδομένα.',
  Integrity: 'Ακεραιότητα',
  'Primary keys': 'Πρωτεύοντα κλειδιά',
  'Native primary-key constraints.': 'Εγγενείς περιορισμοί πρωτευόντων κλειδιών.',
  'Unique constraints': 'Περιορισμοί μοναδικότητας',
  'Native uniqueness constraints.': 'Εγγενείς περιορισμοί μοναδικότητας.',
  'Foreign keys': 'Ξένα κλειδιά',
  'Native referential-integrity constraints.': 'Εγγενείς περιορισμοί αναφορικής ακεραιότητας.',
  'Check constraints': 'Περιορισμοί ελέγχου',
  'Native row/value check constraints.': 'Εγγενείς περιορισμοί ελέγχου γραμμών και τιμών.',
  'Calculated data': 'Υπολογιζόμενα δεδομένα',
  'Generated / computed columns': 'Παραγόμενες / υπολογιζόμενες στήλες',
  'Native generated or computed column expressions.':
    'Εγγενείς εκφράσεις παραγόμενων ή υπολογιζόμενων στηλών.',
  Triggers: 'Εναύσματα',
  'Native data-change triggers.': 'Εγγενή εναύσματα αλλαγών δεδομένων.',
  Programmability: 'Προγραμματισμός',
  Views: 'Προβολές',
  'Native persisted/queryable views.': 'Εγγενείς προβολές δεδομένων με δυνατότητα ερωτημάτων.',
  'Stored functions': 'Αποθηκευμένες συναρτήσεις',
  'Native database-side stored functions.': 'Εγγενείς αποθηκευμένες συναρτήσεις της βάσης.',
  'Stored procedures': 'Αποθηκευμένες διαδικασίες',
  'Native database-side stored procedures.': 'Εγγενείς αποθηκευμένες διαδικασίες της βάσης.',
  Administration: 'Διαχείριση',
  'Multiple databases / catalogs': 'Πολλαπλές βάσεις / κατάλογοι',
  'A server can host and select among multiple databases or catalogs.':
    'Ένας διακομιστής μπορεί να φιλοξενεί πολλαπλές βάσεις ή καταλόγους.',
  'Document / file': 'Έγγραφα / αρχεία',
  Relational: 'Σχεσιακή',
  'Server RDBMS': 'Σχεσιακή βάση διακομιστή',
  'Embedded RDBMS': 'Ενσωματωμένη σχεσιακή βάση',
  'Database/catalog ManatOS will use for its business data.':
    'Βάση ή κατάλογος όπου το ManatOS θα αποθηκεύει τα επιχειρησιακά δεδομένα.',
  'User name': 'Όνομα χρήστη',
  'Database login name used when the selected authentication mode requires one.':
    'Όνομα χρήστη για σύνδεση στη βάση, όταν απαιτείται.',
  Password: 'Κωδικός πρόσβασης',
  'Database password. It is encrypted before being stored in system-settings.json.':
    'Κωδικός βάσης δεδομένων. Κρυπτογραφείται πριν την αποθήκευση στο system-settings.json.',
  idle: 'σε αναμονή',
  verified: 'επαληθεύτηκε',
  ready: 'έτοιμο',
  incomplete: 'μη ολοκληρωμένο',
  complete: 'ολοκληρωμένο',
  error: 'σφάλμα',
  'changes-required': 'απαιτούνται αλλαγές',
  configuration: 'διαμόρφωση',
  connection: 'σύνδεση',
  database: 'βάση δεδομένων',
  schema: 'σχήμα',
  files: 'αρχεία',
  data: 'δεδομένα',
  capabilities: 'δυνατότητες',
  True: 'Αληθές',
  False: 'Ψευδές',
};

export function localizeStorage(value: string, language: 'EN' | 'EL'): string {
  return language === 'EL' ? (greek[value] ?? value) : value;
}
