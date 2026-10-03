import { TestBed } from '@angular/core/testing';
import { SkeletonRowsComponent } from './skeleton-rows.component';

describe('SkeletonRowsComponent', () => {
  it('draws six placeholder rows by default', () => {
    const fixture = TestBed.createComponent(SkeletonRowsComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('ion-item')).toHaveLength(6);
    expect(el.getAttribute('aria-busy')).toBe('true');
  });

  it('draws the requested number of rows', () => {
    const fixture = TestBed.createComponent(SkeletonRowsComponent);
    fixture.componentRef.setInput('count', 2);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('ion-item')
    ).toHaveLength(2);
  });
});
