import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { InMemoryFluxApi } from '@core/mock/in-memory-flux-api';
import { FLUX_API } from '../../providers/flux-api.token';
import { TaskListPage } from './task-list.page';

describe('TaskListPage', () => {
  let component: TaskListPage;
  let fixture: ComponentFixture<TaskListPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskListPage],
      providers: [
        provideRouter([]),
        { provide: FLUX_API, useClass: InMemoryFluxApi },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TaskListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders every open assigned task title', async () => {
    const page = await new InMemoryFluxApi().listMyTasks({
      scope: 'assigned',
      openOnly: true,
    });
    const tasks = page.content ?? [];
    expect(tasks.length).toBeGreaterThan(0);

    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    for (const task of tasks) {
      expect(text).toContain(task.title);
    }
  });
});
