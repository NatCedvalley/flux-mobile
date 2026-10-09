import type { ProjectMember } from '../api';
import { ApiError } from '../auth/api-error';

/** `820 B`, `14 KB`, `2.4 MB`: binary units, one decimal below 10. */
export function fileSize(bytes: number | undefined): string {
  if (bytes === undefined) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const shown =
    value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value);
  return `${shown} ${units[unit]}`;
}

/** The registered icon for a file's type. */
export function attachmentIcon(contentType: string | undefined): string {
  return contentType?.startsWith('image/') ? 'image' : 'file-text';
}

/**
 * Who uploaded a file: `You`, a member's name, or `Former member` for an
 * account no longer in the project (or a sysadmin, whom the member list
 * leaves out).
 */
export function uploaderName(
  accountId: string | undefined,
  members: readonly ProjectMember[],
  selfId: string | undefined
): string {
  if (accountId && accountId === selfId) {
    return 'You';
  }
  const member = members.find((m) => m.accountId === accountId);
  const name = [member?.firstName, member?.lastName].filter(Boolean).join(' ');
  return name || 'Former member';
}

/**
 * What to say when an upload fails. A 422 carries the server's own words
 * (size, extension, count, uploads off). A 413 has none: Spring answers a
 * body over its multipart limit with a ProblemDetail, and production nginx
 * with an HTML page.
 */
export function uploadErrorMessage(error: unknown, fileName: string): string {
  if (error instanceof ApiError) {
    if (error.body.message) {
      return error.body.message;
    }
    if (error.status === 413) {
      return 'This file is too large to upload.';
    }
    if (error.status === 0) {
      return 'Couldn’t reach Flux. Check your connection and try again.';
    }
  }
  return `Couldn’t upload ${fileName}.`;
}
