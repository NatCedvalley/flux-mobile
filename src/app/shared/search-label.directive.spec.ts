import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SearchLabelDirective } from './search-label.directive';

@Component({
  template: `<ion-searchbar appSearchLabel="Search labels"></ion-searchbar>`,
  imports: [SearchLabelDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
class HostComponent {}

describe('SearchLabelDirective', () => {
  it("names the searchbar's input instead of Ionic's “search text”", async () => {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'search text');
    const fixture = TestBed.createComponent(HostComponent);
    const searchbar = (fixture.nativeElement as HTMLElement).querySelector(
      'ion-searchbar'
    ) as unknown as { getInputElement: () => Promise<HTMLInputElement> };
    searchbar.getInputElement = () => Promise.resolve(input);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(input.getAttribute('aria-label')).toBe('Search labels');
  });
});
