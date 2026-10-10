import { TestBed } from '@angular/core/testing';
import type { ViewMode } from '@core/project-list';
import { ViewSegmentComponent } from './view-segment.component';

describe('ViewSegmentComponent', () => {
  function create(view: ViewMode) {
    const fixture = TestBed.createComponent(ViewSegmentComponent);
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
    const changes: ViewMode[] = [];
    fixture.componentInstance.viewChange.subscribe((v) => changes.push(v));
    const segment = (fixture.nativeElement as HTMLElement).querySelector(
      'ion-segment'
    )!;
    const pick = (value: string) =>
      segment.dispatchEvent(
        new CustomEvent('ionChange', { detail: { value } })
      );
    return { segment, changes, pick };
  }

  it('shows the view and offers List and Board', () => {
    const { segment } = create('board');

    expect((segment as HTMLIonSegmentElement).value).toBe('board');
    expect(
      Array.from(segment.querySelectorAll('ion-segment-button')).map(
        (b) => (b as HTMLIonSegmentButtonElement).value
      )
    ).toEqual(['list', 'board']);
  });

  it('reports a different view only', () => {
    const { changes, pick } = create('list');

    pick('list');
    pick('board');

    expect(changes).toEqual(['board']);
  });
});
