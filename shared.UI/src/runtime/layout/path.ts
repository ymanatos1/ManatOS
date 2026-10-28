import { appendContextPathMember } from '@manatos/shared';
import { validateUiSemanticLayoutMember } from './node.js';

/**
 * Build a semantic layout CTX path from its owning root
 * and relative members.
 *
 * Reject unsafe members using the common layout validator.
 * The caller retains responsibility for surface ownership.
 */
export function appendUiSemanticLayoutPath(rootPath: string, members: readonly string[]): string {
  let path = rootPath;

  for (const member of members) {
    validateUiSemanticLayoutMember(member);
    path = appendContextPathMember(path, member);
  }

  return path;
}
