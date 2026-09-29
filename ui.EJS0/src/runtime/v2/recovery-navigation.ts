/**
 * Submit one recovery navigation whose canonical reconstruction contract is POST-based.
 * Recovery providers own semantic fields; this helper owns only transport mechanics.
 */
export function submitRecoveryPost(target: string, fields: Readonly<Record<string, string>>): void {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = target;
  form.hidden = true;
  form.dataset.allowDirtyPageExit = 'true';
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.requestSubmit();
}
