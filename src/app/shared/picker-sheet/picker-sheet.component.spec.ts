import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type PickerItem,
  PickerSheetComponent,
} from './picker-sheet.component';

const ITEMS: PickerItem[] = [
  { id: 'l1', label: 'safari' },
  { id: 'l2', label: 'payments' },
  { id: 'e1', key: 'CHK-120', label: 'Migrate saved cards' },
];

describe('PickerSheetComponent', () => {
  let fixture: ComponentFixture<PickerSheetComponent>;

  function create(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [PickerSheetComponent] });
    fixture = TestBed.createComponent(PickerSheetComponent);
    fixture.componentRef.setInput('heading', 'Labels');
    fixture.componentRef.setInput('items', ITEMS);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const rows = () =>
    Array.from(element().querySelectorAll<HTMLElement>('ion-item'));
  const labels = () =>
    rows().map((r) => r.querySelector('.label')?.textContent?.trim());
  const search = (value: string) => {
    element()
      .querySelector('ion-searchbar')!
      .dispatchEvent(new CustomEvent('ionInput', { detail: { value } }));
    fixture.detectChanges();
  };

  it('lists the rows, marking the selected ones', () => {
    create({ selected: ['l2'] });
    expect(labels()).toEqual(['safari', 'payments', 'Migrate saved cards']);
    expect(rows().map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(rows()[0].getAttribute('role')).toBe('radio');
  });

  it('picks one row and says so', () => {
    create();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((id) => picked.push(id));
    rows()[1].click();
    expect(picked).toEqual(['l2']);
    expect(fixture.componentInstance.selected()).toEqual(['l2']);
  });

  it('toggles rows in a draft when several can be chosen', () => {
    create({ multiple: true, selected: ['l1'] });
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);

    rows()[0].click();
    rows()[2].click();

    expect(fixture.componentInstance.selected()).toEqual(['e1']);
    expect(picked).not.toHaveBeenCalled();
    expect(rows()[0].getAttribute('role')).toBe('checkbox');
  });

  it('filters by label and key as you type', () => {
    create();
    search('chk-1');
    expect(labels()).toEqual(['Migrate saved cards']);
    search('zzz');
    expect(element().querySelector('.empty')?.textContent?.trim()).toBe(
      'Nothing matches'
    );
  });

  it('leaves searching to the page with remoteSearch, once typing pauses', () => {
    vi.useFakeTimers();
    try {
      create({ remoteSearch: true });
      const sent: string[] = [];
      fixture.componentInstance.searched.subscribe((q) => sent.push(q));

      search('mig');
      expect(labels()).toHaveLength(3);
      vi.advanceTimersByTime(300);
      fixture.detectChanges();

      expect(sent.at(-1)).toBe('mig');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows skeletons while loading, and Retry on failure', () => {
    create({ items: undefined });
    expect(element().querySelector('ion-skeleton-text')).not.toBeNull();

    fixture.componentRef.setInput('failed', true);
    fixture.detectChanges();
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    element().querySelector<HTMLElement>('.note ion-button')!.click();
    expect(retry).toHaveBeenCalled();
  });

  it('hides the searchbar for short lists', () => {
    create({ searchable: false });
    expect(element().querySelector('ion-searchbar')).toBeNull();
  });
});
