import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsPage } from './settings.page';
import { environment } from '../../../environments/environment';
import { buildInfo } from '../../../environments/build-info';

describe('SettingsPage', () => {
  let component: SettingsPage;
  let fixture: ComponentFixture<SettingsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the active environment and build version', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain(environment.name);
    expect(text).toContain(buildInfo.version);
  });
});
