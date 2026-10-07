// Public surface of the project task list rules. Import from
// '@core/project-list'.
export {
  initialProject,
  isReadOnly,
  priorityFact,
  projectInitials,
  projectDue,
  projectSubline,
  switcherGroups,
  type PriorityFact,
} from './display';
export {
  DEFAULT_SORT,
  GroupedTaskPager,
  PROJECT_PAGE_SIZE,
  type LoadedGroup,
  type PagerState,
} from './grouped-task-pager';
export {
  statusHue,
  taskGroupKey,
  taskGroups,
  type GroupHue,
  type TaskGroup,
} from './groups';
export {
  AI_CANDIDATE_LABEL,
  GROUP_BY_VALUES,
  aiFilterQuery,
  resolveGroupBy,
  type AiTaskFilter,
  type GroupBy,
} from './view-settings';
