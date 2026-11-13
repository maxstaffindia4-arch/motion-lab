import { createPatch } from 'diff';

export function computeUnifiedDiff(filename: string, originalCode: string, modifiedCode: string): string {
  if (originalCode === modifiedCode) return '';
  return createPatch(filename, originalCode, modifiedCode, 'Last Generated', 'User Manual Edit');
}

