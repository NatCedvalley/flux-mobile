import { ApiError } from '../auth/api-error';
import {
  attachmentIcon,
  fileSize,
  uploadErrorMessage,
  uploaderName,
} from './attachments';

describe('fileSize', () => {
  it('shows bytes, then KB, MB and GB', () => {
    expect(fileSize(820)).toBe('820 B');
    expect(fileSize(14 * 1024)).toBe('14 KB');
    expect(fileSize(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(fileSize(3 * 1024 * 1024)).toBe('3 MB');
    expect(fileSize(250 * 1024 * 1024)).toBe('250 MB');
    expect(fileSize(5 * 1024 ** 3)).toBe('5 GB');
  });

  it('is empty when the size is missing', () => {
    expect(fileSize(undefined)).toBe('');
  });
});

describe('attachmentIcon', () => {
  it('uses the image icon for images and the file icon otherwise', () => {
    expect(attachmentIcon('image/png')).toBe('image');
    expect(attachmentIcon('application/pdf')).toBe('file-text');
    expect(attachmentIcon(undefined)).toBe('file-text');
  });
});

describe('uploaderName', () => {
  const members = [{ accountId: 'a2', firstName: 'Ben', lastName: 'Tan' }];

  it('names the caller, a member, or a former member', () => {
    expect(uploaderName('a1', members, 'a1')).toBe('You');
    expect(uploaderName('a2', members, 'a1')).toBe('Ben Tan');
    expect(uploaderName('a9', members, 'a1')).toBe('Former member');
    expect(uploaderName(undefined, members, undefined)).toBe('Former member');
  });
});

describe('uploadErrorMessage', () => {
  it("uses the server's message", () => {
    const error = new ApiError(422, {
      code: 'UPLOAD_DISABLED',
      message: 'File uploads are turned off for this project.',
    });
    expect(uploadErrorMessage(error, 'a.png')).toBe(
      'File uploads are turned off for this project.'
    );
  });

  it('explains a 413 and a lost connection', () => {
    expect(uploadErrorMessage(new ApiError(413), 'a.png')).toBe(
      'This file is too large to upload.'
    );
    expect(uploadErrorMessage(new ApiError(0), 'a.png')).toContain(
      'Couldn’t reach Flux'
    );
  });

  it('falls back to naming the file', () => {
    expect(uploadErrorMessage(new ApiError(500), 'a.png')).toBe(
      'Couldn’t upload a.png.'
    );
    expect(uploadErrorMessage(new Error('x'), 'a.png')).toBe(
      'Couldn’t upload a.png.'
    );
  });
});
