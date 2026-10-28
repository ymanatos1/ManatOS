export const workspaceFamilies = Object.freeze({
  api: Object.freeze(['shared', 'api']),
  uis: Object.freeze([
    'shared',
    'shared.UI',
    'shared.UI.NG',
    'shared.UI.EJS',
    'ui.EJS0',
    'ui.NG1',
    'ui.EJS1',
  ]),
});

export function parseWorkspaceFamily(args = process.argv.slice(2)) {
  const familyIndex = args.indexOf('--family');

  if (familyIndex < 0) return null;

  const family = args[familyIndex + 1];
  if (!family || !(family in workspaceFamilies)) {
    throw new Error(
      `Unknown workspace family '${family ?? ''}'. Expected one of: ${Object.keys(workspaceFamilies).join(', ')}.`,
    );
  }

  return family;
}

export function workspaceBelongsToFamily(workspace, family) {
  return family === null || workspaceFamilies[family].includes(workspace);
}
