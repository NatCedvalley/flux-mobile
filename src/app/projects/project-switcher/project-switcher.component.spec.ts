import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { MyProject } from '@core/api';
import { ProjectSwitcherComponent } from './project-switcher.component';

/** An ion-icon's `name`, which Angular sets as a property, not an attribute. */
function iconName(icon: Element | null | undefined): string | undefined {
  return (icon as { name?: string } | null | undefined)?.name;
}

const PROJECTS: MyProject[] = [
  {
    project: { id: 'p1', projectKey: 'BIL', name: 'Billing' },
    role: 'LEAD',
    openCount: 16,
    overdueCount: 0,
  },
  {
    project: { id: 'p2', projectKey: 'CHK', name: 'Checkout' },
    role: 'EDITOR',
    openCount: 24,
    overdueCount: 2,
  },
  {
    project: { id: 'p3', projectKey: 'MKT', name: 'Marketing' },
    role: 'VIEWER',
    openCount: 8,
  },
];

describe('ProjectSwitcherComponent', () => {
  let fixture: ComponentFixture<ProjectSwitcherComponent>;

  function render(pinnedIds: string[] = [], currentId = 'p2'): HTMLElement {
    fixture = TestBed.createComponent(ProjectSwitcherComponent);
    fixture.componentRef.setInput('projects', PROJECTS);
    fixture.componentRef.setInput('pinnedIds', pinnedIds);
    fixture.componentRef.setInput('currentId', currentId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function texts(el: HTMLElement, selector: string): string[] {
    return Array.from(el.querySelectorAll(selector)).map(
      (e) => e.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
  }

  it('lists pinned projects first, then the rest', () => {
    const el = render(['p2']);

    expect(texts(el, 'ion-item-divider')).toEqual(['Pinned', 'All projects']);
    expect(texts(el, '.pinned .name')).toEqual(['Checkout']);
    expect(texts(el, '.others .name')).toEqual(['Billing', 'Marketing']);
  });

  it('shows the role and counts, the current project and read-only ones', () => {
    const el = render();

    expect(texts(el, '.subline')).toEqual([
      'Lead · 16 open',
      'Editor · 24 open · 2 overdue',
      'Viewer · read-only',
    ]);
    expect(texts(el, '.swatch')).toEqual(['BI', 'CH', 'MK']);
    const current = el.querySelector('ion-item.current');
    expect(current?.querySelector('.name')?.textContent).toBe('Checkout');
    expect(iconName(current?.querySelector('.current-mark'))).toBe(
      'circle-check'
    );
    expect(el.querySelectorAll('.lock')).toHaveLength(1);
    expect(el.querySelector('.swatch.read-only')?.textContent?.trim()).toBe(
      'MK'
    );
  });

  it('says how many projects the search covers', () => {
    const el = render();
    const searchbar = el.querySelector('ion-searchbar') as {
      placeholder?: string;
    } | null;
    expect(searchbar?.placeholder).toBe('Search 3 projects');
  });

  it('filters by name or key as you type', () => {
    const el = render(['p2']);
    const searchbar = el.querySelector('ion-searchbar')!;

    searchbar.dispatchEvent(
      new CustomEvent('ionInput', { detail: { value: 'bil' } })
    );
    fixture.detectChanges();
    expect(texts(el, '.name')).toEqual(['Billing']);
    expect(texts(el, 'ion-item-divider')).toEqual(['All projects']);

    searchbar.dispatchEvent(
      new CustomEvent('ionInput', { detail: { value: 'nothing' } })
    );
    fixture.detectChanges();
    expect(texts(el, '.no-match')).toEqual(['No projects match']);
  });

  it('emits the project tapped', () => {
    const el = render();
    const selected = vi.fn();
    fixture.componentInstance.selected.subscribe(selected);

    el.querySelectorAll<HTMLElement>('ion-item')[0].click();

    expect(selected).toHaveBeenCalledWith(PROJECTS[0]);
  });

  it('offers Pin, or Unpin for a pinned project, behind a swipe', () => {
    const el = render(['p2']);
    const toggled = vi.fn();
    fixture.componentInstance.pinToggled.subscribe(toggled);

    expect(texts(el, '.pinned ion-item-option')).toEqual(['Unpin']);
    expect(texts(el, '.others ion-item-option')).toEqual(['Pin', 'Pin']);

    el.querySelector<HTMLElement>('.others ion-item-option')!.click();

    expect(toggled).toHaveBeenCalledWith('p1');
  });

  it('emits done from the Done button', () => {
    const el = render();
    const done = vi.fn();
    fixture.componentInstance.done.subscribe(done);

    el.querySelector<HTMLElement>('ion-button.done')!.click();

    expect(done).toHaveBeenCalledTimes(1);
  });
});
