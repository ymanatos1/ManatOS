/** Reusable Surface action definitions. Hosts decide how navigation or dismissal occurs. */
export interface UiSurfaceActionDefinition {
  readonly id: 'close' | 'cancel' | 'save' | 'save-stay' | 'select';
  readonly label: Readonly<{ EN: string; EL: string }>;
  readonly icon: string;
  readonly primary?: boolean;
  readonly implemented: boolean;
}

const ENTRY_SAVE: readonly UiSurfaceActionDefinition[] = [
  {
    id: 'save',
    label: { EN: 'Save', EL: 'Αποθήκευση' },
    icon: 'bi-check2',
    primary: true,
    implemented: true,
  },
  {
    id: 'save-stay',
    label: { EN: 'Save and stay', EL: 'Αποθήκευση και παραμονή' },
    icon: 'bi-check2-square',
    implemented: false,
  },
];

export function uiSurfaceActions(
  kind: 'entry' | 'list',
  host: 'page' | 'popup',
): readonly UiSurfaceActionDefinition[] {
  if (kind === 'list' && host === 'page') return [];
  const exit: UiSurfaceActionDefinition =
    host === 'page'
      ? { id: 'close', label: { EN: 'Close', EL: 'Κλείσιμο' }, icon: 'bi-x-lg', implemented: true }
      : {
          id: 'cancel',
          label: { EN: 'Cancel', EL: 'Άκυρον' },
          icon: 'bi-x-lg',
          implemented: host === 'popup',
        };
  if (kind === 'entry') return [exit, ...ENTRY_SAVE];
  return [
    exit,
    {
      id: 'select',
      label: { EN: 'Select', EL: 'Επιλογή' },
      icon: 'bi-check2',
      primary: true,
      implemented: true,
    },
  ];
}
