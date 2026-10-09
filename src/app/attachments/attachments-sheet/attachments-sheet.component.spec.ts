import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Attachment } from '@core/api';
import { ApiError } from '@core/auth';
import type { FileSource } from '../file-source.service';
import { AttachmentsSheetComponent } from './attachments-sheet.component';

const NOW = new Date('2026-10-09T12:00:00');

const FILES: Attachment[] = [
  {
    id: 'f1',
    fileName: 'login-redirect.png',
    fileSize: 248_000,
    contentType: 'image/png',
    thumbnailUrl: 'https://files.test/f1?thumb',
    uploadedBy: 'a1',
    createdAt: '2026-10-09T09:00:00',
  },
  {
    id: 'f2',
    fileName: 'safari-trace.pdf',
    fileSize: 1_830_000,
    contentType: 'application/pdf',
    uploadedBy: 'a2',
    createdAt: '2026-10-07T16:12:00',
  },
];

describe('AttachmentsSheetComponent', () => {
  let fixture: ComponentFixture<AttachmentsSheetComponent>;

  function create(inputs: Record<string, unknown> = {}) {
    fixture = TestBed.createComponent(AttachmentsSheetComponent);
    fixture.componentRef.setInput('now', NOW);
    fixture.componentRef.setInput('myId', 'a1');
    fixture.componentRef.setInput('members', [
      { accountId: 'a2', firstName: 'Ben', lastName: 'Tan' },
    ]);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const texts = (selector: string) =>
    Array.from(element().querySelectorAll(selector)).map((e) =>
      e.textContent?.replace(/\s+/g, ' ').trim()
    );

  it('lists each file with its size, uploader and age', () => {
    create({ attachments: FILES });
    expect(texts('.attachment h3')).toEqual([
      'login-redirect.png',
      'safari-trace.pdf',
    ]);
    expect(texts('.attachment p')).toEqual([
      '242 KB · You · 3h',
      '1.7 MB · Ben Tan · 1d',
    ]);
  });

  it('shows an image’s thumbnail, and the type icon otherwise', () => {
    create({ attachments: FILES });
    const [image, pdf] = Array.from(
      element().querySelectorAll('.attachment .thumb')
    );
    expect(image.querySelector('img')?.getAttribute('src')).toBe(
      'https://files.test/f1?thumb'
    );
    expect(pdf.querySelector<HTMLIonIconElement>('ion-icon')?.name).toBe(
      'file-text'
    );
  });

  it('asks the page to open the file tapped', () => {
    create({ attachments: FILES });
    const opened: Attachment[] = [];
    fixture.componentInstance.opened.subscribe((a) => opened.push(a));
    element().querySelectorAll<HTMLElement>('.attachment')[1].click();
    expect(opened.map((a) => a.id)).toEqual(['f2']);
  });

  it('says when there are none, and when they failed', () => {
    create({ attachments: [] });
    expect(texts('app-empty-state p')).toEqual(['No attachments yet']);

    create({ error: new ApiError(500) });
    expect(element().querySelector('app-error-state')).not.toBeNull();
    expect(element().querySelector('.attachment')).toBeNull();
  });

  it('offers the sources only when the caller may attach', () => {
    create({ attachments: FILES, sources: ['camera', 'files'] });
    expect(element().querySelector('app-attach-sources')).toBeNull();

    create({
      attachments: FILES,
      sources: ['camera', 'files'],
      canAttach: true,
    });
    const picked: FileSource[] = [];
    fixture.componentInstance.attach.subscribe((s) => picked.push(s));
    // Ionic patches an ion-label's textContent, so read its markup.
    const labels = Array.from(
      element().querySelectorAll('app-attach-sources ion-label')
    ).map((e) => e.innerHTML.replace(/<!--.*?-->/g, '').trim());
    expect(labels).toEqual(['Take photo', 'Choose file']);
    element().querySelector<HTMLElement>('[data-source=files]')!.click();
    expect(picked).toEqual(['files']);
  });

  it('shows the file uploading at the top, and holds the sources', () => {
    create({
      attachments: [],
      sources: ['files'],
      canAttach: true,
      uploading: 'photo-1.jpg',
    });
    expect(texts('.uploading h3')).toEqual(['photo-1.jpg']);
    expect(element().querySelector('app-empty-state')).toBeNull();
    expect(
      element().querySelector<HTMLIonItemElement>('[data-source=files]')!
        .disabled
    ).toBe(true);
  });
});
