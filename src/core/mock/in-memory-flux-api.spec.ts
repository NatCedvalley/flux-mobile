import { ApiError } from '../auth/api-error';
import { InMemoryFluxApi } from './in-memory-flux-api';

const TODAY = new Date(2026, 9, 1);

describe('InMemoryFluxApi', () => {
  let api: InMemoryFluxApi;

  beforeEach(() => {
    api = new InMemoryFluxApi(TODAY);
  });

  it('lists open assigned tasks by priority, then due date', async () => {
    const page = await api.listMyTasks({ scope: 'assigned', openOnly: true });
    expect(page.content?.map((t) => t.taskKey)).toEqual([
      'CHK-142',
      'BIL-88',
      'CHK-150',
      'BIL-90',
      'CHK-131',
    ]);
    expect(page.totalElements).toBe(5);
  });

  it('applies the due window', async () => {
    const page = await api.listMyTasks({ dueDateTo: '2026-10-01' });
    expect(page.content?.map((t) => t.dueDate)).toEqual([
      '2026-09-30',
      '2026-10-01',
    ]);
  });

  it('lists watched tasks separately', async () => {
    const page = await api.listMyTasks({ scope: 'watching' });
    expect(page.content?.map((t) => t.taskKey)).toEqual(['BIL-75']);
  });

  it('includes done tasks when openOnly is false', async () => {
    const page = await api.listMyTasks({ openOnly: false });
    expect(page.content?.some((t) => t.statusCategory === 'DONE')).toBe(true);
  });

  it('pages results', async () => {
    const page = await api.listMyTasks({ page: 1, size: 2 });
    expect(page.content).toHaveLength(2);
    expect(page).toMatchObject({ page: 1, totalPages: 3, last: false });
  });

  it('gets a task by project and id', async () => {
    const task = await api.getTask('p1', '1');
    expect(task.id).toBe('1');
  });

  it('rejects for an unknown task id', async () => {
    await expect(api.getTask('p1', 'does-not-exist')).rejects.toThrow(
      'Task not found: p1/does-not-exist'
    );
  });

  it('rejects a task asked for under another project', async () => {
    await expect(api.getTask('p2', '1')).rejects.toThrow(
      'Task not found: p2/1'
    );
  });

  it("lists a project's tasks", async () => {
    const page = await api.listProjectTasks('p2');
    expect(page.content?.every((t) => t.projectId === 'p2')).toBe(true);
  });

  it("filters a project's tasks by status, priority, type and label", async () => {
    const keys = async (query: object) =>
      (await api.listProjectTasks('p1', query)).content?.map((t) => t.taskKey);

    expect(await keys({ status: 'todo' })).toEqual(['CHK-150', 'CHK-160']);
    expect(
      await keys({ status: 'todo', excludeLabel: 'ai:candidate' })
    ).toEqual(['CHK-150']);
    expect(await keys({ requireLabel: 'ai:candidate' })).toEqual(['CHK-160']);
    expect(await keys({ priority: 'CRITICAL' })).toEqual(['CHK-142']);
    expect(await keys({ type: 'EPIC' })).toEqual(['CHK-120']);
  });

  it("filters a project's tasks by comma lists, assignee and search", async () => {
    const keys = async (query: object) =>
      (await api.listProjectTasks('p1', query)).content?.map((t) => t.taskKey);

    expect(await keys({ status: 'backlog,done' })).toEqual([
      'CHK-131',
      'CHK-120',
    ]);
    expect(await keys({ priority: 'CRITICAL, LOW' })).toEqual([
      'CHK-142',
      'CHK-131',
    ]);
    expect(await keys({ assigneeId: 'a2' })).toEqual(['CHK-131']);
    expect(await keys({ assigneeId: 'a1,a2' })).toEqual([
      'CHK-142',
      'CHK-150',
      'CHK-131',
    ]);
    expect(await keys({ search: 'safari' })).toEqual(['CHK-142']);
    expect(await keys({ search: 'chk-15' })).toEqual(['CHK-150']);
  });

  it("sorts a project's tasks, missing values last", async () => {
    const keys = async (sort: string) =>
      (await api.listProjectTasks('p1', { sort })).content?.map(
        (t) => t.taskKey
      );

    expect(await keys('taskNumber,asc')).toEqual([
      'CHK-120',
      'CHK-131',
      'CHK-142',
      'CHK-150',
      'CHK-160',
    ]);
    expect(await keys('dueDate,asc')).toEqual([
      'CHK-120',
      'CHK-142',
      'CHK-150',
      'CHK-131',
      'CHK-160',
    ]);
    expect((await keys('priority,desc'))?.slice(0, 1)).toEqual(['CHK-142']);
  });

  it('filters my tasks by status, priority and search', async () => {
    const keys = async (query: object) =>
      (await api.listMyTasks(query)).content?.map((t) => t.taskKey);

    expect(await keys({ status: 'todo' })).toEqual([
      'BIL-88',
      'CHK-150',
      'BIL-90',
    ]);
    expect(await keys({ priority: 'CRITICAL,LOW' })).toEqual([
      'CHK-142',
      'CHK-131',
    ]);
    expect(await keys({ search: 'BIL', openOnly: false })).toEqual([
      'BIL-88',
      'BIL-90',
    ]);
    expect(await keys({ search: 'saved', openOnly: false })).toEqual([
      'CHK-120',
    ]);
  });

  it('lists assignable members', async () => {
    const members = await api.listAssignableMembers('p1');
    expect(members.map((m) => m.accountId)).toEqual(['a2', 'a1', 'a3']);
  });

  it('adds extra project tasks to page through, kept off My Work', async () => {
    api.addProjectTasks('p1', 30, 'in_progress');

    const page = await api.listProjectTasks('p1', {
      status: 'in_progress',
      size: 20,
    });
    expect(page.totalElements).toBe(31);
    expect((await api.listMyTasks({ scope: 'assigned' })).totalElements).toBe(
      5
    );
  });

  it('returns task view settings once set', async () => {
    expect(await api.getTaskViewSettings('p1')).toEqual({});
    api.setTaskViewSettings('p1', { groupBy: 'priority' });
    expect(await api.getTaskViewSettings('p1')).toEqual({
      groupBy: 'priority',
    });
  });

  it('updates task view settings, clearing a field with an empty string', async () => {
    api.setTaskViewSettings('p1', { groupBy: 'priority', aiTaskFilter: 'all' });

    await expect(
      api.updateTaskViewSettings('p1', { groupBy: 'type' })
    ).resolves.toEqual({ groupBy: 'type', aiTaskFilter: 'all' });
    await api.updateTaskViewSettings('p1', { groupBy: '' });
    expect((await api.getTaskViewSettings('p1')).groupBy).toBeUndefined();
  });

  it('lists projects and workflow statuses', async () => {
    expect((await api.listMyProjects()).content).toHaveLength(2);
    const statuses = await api.listWorkflowStatuses('p1');
    expect(statuses.map((s) => s.category)).toEqual([
      'PLANNING',
      'TODO',
      'IN_PROGRESS',
      'DONE',
    ]);
  });

  it("lists a task's children", async () => {
    const children = await api.listChildTasks('p1', '6');
    expect(children.map((t) => t.taskKey)).toEqual(['CHK-142', 'CHK-131']);
    expect(await api.listChildTasks('p1', '1')).toEqual([]);
  });

  it("pages a task's comments, replies nested under their parent", async () => {
    const page = await api.listTaskComments('p1', '1', { size: 1 });
    expect(page.content?.map((c) => c.id)).toEqual(['c1']);
    expect(page.content?.[0].replies?.map((c) => c.id)).toEqual(['c2']);
    expect(page.totalElements).toBe(2);
    expect(page.last).toBe(false);
    expect((await api.listTaskComments('p1', '2')).content).toEqual([]);
  });

  describe('comment writes', () => {
    const thread = async () =>
      (await api.listTaskComments('p1', '1')).content ?? [];
    const code = (promise: Promise<unknown>) =>
      promise.then(
        () => undefined,
        (e: ApiError) => e.body.code
      );

    it('posts a comment as Ada at the end, or a reply under its parent', async () => {
      const posted = await api.addTaskComment('p1', '1', { body: ' Hi ' });
      expect(posted).toMatchObject({
        body: 'Hi',
        bodyFormat: 'MARKDOWN',
        authorId: 'a1',
        authorFirstName: 'Ada',
        reactions: [],
      });
      expect((await thread()).map((c) => c.id)).toEqual([
        'c1',
        'c3',
        posted.id,
      ]);

      const reply = await api.addTaskComment('p1', '1', {
        body: 'Reply',
        parentCommentId: 'c3',
      });
      expect((await thread())[1].replies?.map((c) => c.id)).toEqual([reply.id]);
      expect(await code(api.addTaskComment('p1', '1', { body: '  ' }))).toBe(
        'VALIDATION_ERROR'
      );
    });

    it('edits only the caller’s own comment, answering without reactions', async () => {
      const edited = await api.updateTaskComment('p1', '1', 'c2', {
        body: 'Fixed',
        bodyFormat: 'MARKDOWN',
      });
      expect(edited).toMatchObject({ body: 'Fixed', edited: true });
      expect(edited.replies).toEqual([]);
      expect((await thread())[0].replies?.[0].body).toBe('Fixed');
      expect(
        await code(api.updateTaskComment('p1', '1', 'c1', { body: 'Mine' }))
      ).toBe('COMMENT_NOT_AUTHOR');
    });

    it('deletes the caller’s own comment unless it has replies', async () => {
      await api.addTaskComment('p1', '1', {
        body: 'Reply',
        parentCommentId: 'c3',
      });
      expect(await code(api.deleteTaskComment('p1', '1', 'c3'))).toBe(
        'COMMENT_HAS_REPLIES'
      );
      expect(await code(api.deleteTaskComment('p1', '1', 'c1'))).toBe(
        'COMMENT_NOT_AUTHOR'
      );

      await api.deleteTaskComment('p1', '1', 'c2');
      expect((await thread())[0].replies).toEqual([]);
    });

    it('toggles the caller’s reaction', async () => {
      const othersUp = { emoji: 'thumbs_up', count: 1, reactedByMe: false };
      expect(
        await api.toggleCommentReaction('p1', '1', 'c1', 'thumbs_up')
      ).toEqual([othersUp, { emoji: 'eyes', count: 1, reactedByMe: false }]);
      expect(await api.toggleCommentReaction('p1', '1', 'c1', 'eyes')).toEqual([
        othersUp,
        { emoji: 'eyes', count: 2, reactedByMe: true },
      ]);
      expect(await api.toggleCommentReaction('p1', '1', 'c2', 'heart')).toEqual(
        [{ emoji: 'heart', count: 1, reactedByMe: true }]
      );
      await api.toggleCommentReaction('p1', '1', 'c2', 'heart');
      const [c1] = await thread();
      expect(c1.reactions?.[1]).toEqual({
        emoji: 'eyes',
        count: 2,
        reactedByMe: true,
      });
      expect(c1.replies?.[0].reactions).toEqual([]);
    });
  });

  it("lists a task's activities newest first", async () => {
    const page = await api.listTaskActivities('p1', '1');
    expect(page.content?.map((e) => e.action)).toEqual([
      'COMMENT_ADDED',
      'STATUS_CHANGED',
      'FIELD_UPDATED',
      'ASSIGNED',
      'CREATED',
    ]);
  });

  it('subscribes and unsubscribes, starting from the watched tasks', async () => {
    expect(await api.getTaskSubscription('p2', '7')).toEqual({
      subscribed: true,
    });
    expect(await api.getTaskSubscription('p1', '1')).toEqual({
      subscribed: false,
    });
    await api.subscribeToTask('p1', '1');
    expect(await api.getTaskSubscription('p1', '1')).toEqual({
      subscribed: true,
    });
    await api.unsubscribeFromTask('p1', '1');
    expect(await api.getTaskSubscription('p1', '1')).toEqual({
      subscribed: false,
    });
  });

  describe('attachments', () => {
    it("lists CHK-142's newest first, and none elsewhere", async () => {
      const list = await api.listTaskAttachments('p1', '1');
      expect(list.map((a) => a.fileName)).toEqual([
        'login-redirect.png',
        'safari-trace.pdf',
      ]);
      expect(await api.listTaskAttachments('p1', '2')).toEqual([]);
    });

    it('uploads as Ada, at the top of the list', async () => {
      const blob = new Blob(['x'], { type: 'image/jpeg' });
      const added = await api.uploadTaskAttachment('p1', '1', blob, 'a.jpg');
      expect(added).toMatchObject({
        fileName: 'a.jpg',
        fileSize: 1,
        contentType: 'image/jpeg',
        uploadedBy: 'a1',
      });
      expect(added.thumbnailUrl).toBeDefined();
      const list = await api.listTaskAttachments('p1', '1');
      expect(list[0].id).toBe(added.id);
    });

    it('refuses files the backend refuses, with its 422s', async () => {
      const upload = (name: string, size = 1) =>
        api
          .uploadTaskAttachment('p1', '1', new Blob(['x'.repeat(size)]), name)
          .catch((e: unknown) => e);
      expect(await upload('photo.heic')).toMatchObject({
        status: 422,
        body: { code: 'DISALLOWED_FILE_EXTENSION' },
        message: expect.stringContaining("'heic' files are not allowed."),
      });
      expect(await upload('run.exe')).toMatchObject({
        body: { code: 'BLOCKED_FILE_EXTENSION' },
      });
      expect(await upload('README')).toMatchObject({
        body: { code: 'INVALID_FILE_EXTENSION' },
      });
    });
  });

  it('rejects task sub-resources of an unknown task', async () => {
    await expect(api.listTaskComments('p1', 'nope')).rejects.toThrow(
      'Task not found: p1/nope'
    );
    await expect(api.subscribeToTask('p2', '1')).rejects.toThrow();
  });

  it('lists resolutions', async () => {
    expect((await api.listResolutions('p1')).map((r) => r.slug)).toEqual([
      'done',
      'wont-do',
      'duplicate',
    ]);
  });

  it('lists notifications, optionally only unread ones', async () => {
    expect((await api.listNotifications()).content).toHaveLength(3);
    expect(
      (await api.listNotifications({ isRead: false })).content
    ).toHaveLength(2);
  });

  it('changes a status, answering without the joined fields', async () => {
    const before = await api.getTask('p1', '2');

    const response = await api.changeTaskStatus('p1', '2', {
      status: 'in_progress',
    });

    expect(response).toMatchObject({ status: 'in_progress', assignees: [] });
    expect(await api.getTask('p1', '2')).toMatchObject({
      status: 'in_progress',
      statusName: 'In Progress',
      statusCategory: 'IN_PROGRESS',
      isClosedStatus: false,
      assignees: [{ accountId: 'a1' }],
    });
    // A row handed out earlier doesn't change under its holder.
    expect(before.status).toBe('todo');
  });

  it('closes a task with a resolution, and reopening drops it', async () => {
    await api.changeTaskStatus('p1', '2', {
      status: 'done',
      resolution: 'wont-do',
    });
    expect(await api.getTask('p1', '2')).toMatchObject({
      isClosedStatus: true,
      resolution: 'wont-do',
      resolutionName: 'Won’t do',
    });

    await api.changeTaskStatus('p1', '2', { status: 'todo' });
    expect((await api.getTask('p1', '2')).resolution).toBeUndefined();
  });

  it('rejects status changes the backend rejects, with its codes', async () => {
    const code = (promise: Promise<unknown>) =>
      promise.catch((e: ApiError) => [e.status, e.body.code]);

    expect(
      await code(api.changeTaskStatus('p1', '2', { status: 'done' }))
    ).toEqual([400, 'RESOLUTION_REQUIRED']);
    expect(
      await code(
        api.changeTaskStatus('p1', '2', { status: 'todo', resolution: 'done' })
      )
    ).toEqual([400, 'RESOLUTION_NOT_ALLOWED_ON_OPEN_STATUS']);
    expect(
      await code(api.changeTaskStatus('p1', '2', { status: 'backlog' }))
    ).toEqual([400, 'LEAF_TASK_CANNOT_USE_PLANNING_STATUS']);
    expect(
      await code(api.changeTaskStatus('p1', '6', { status: 'todo' }))
    ).toEqual([400, 'CONTAINER_TASK_REQUIRES_PLANNING_OR_DONE']);
  });

  it('archives a done task and its subtree, off the lists until unarchived', async () => {
    await expect(api.archiveTask('p1', '6')).rejects.toMatchObject({
      body: { code: 'TASK_ARCHIVE_REQUIRES_DONE' },
    });
    await api.changeTaskStatus('p1', '1', {
      status: 'done',
      resolution: 'done',
    });
    await api.changeTaskStatus('p1', '4', {
      status: 'done',
      resolution: 'done',
    });

    await api.archiveTask('p1', '6');
    const ids = async () =>
      (await api.listProjectTasks('p1')).content?.map((t) => t.id);
    expect(await ids()).toEqual(['2', '8']);

    await api.unarchiveTask('p1', '6', { reason: 'Undone' });
    expect(await ids()).toEqual(['1', '2', '4', '6', '8']);
  });

  describe('create', () => {
    const code = (promise: Promise<unknown>) =>
      promise.catch((e: ApiError) => e.body.code);

    it('numbers a task after the project’s highest key, in its starting status', async () => {
      const task = await api.createTask('p1', {
        title: '  New  ',
        type: 'BUG',
      });
      expect(task).toMatchObject({
        taskKey: 'CHK-161',
        title: 'New',
        type: 'BUG',
        priority: 'MEDIUM',
        status: 'todo',
        reporterId: 'a1',
        assignees: [],
      });
      expect(await api.getTask('p1', task.id ?? '')).toBe(task);
      expect(await api.getTaskSubscription('p1', task.id ?? '')).toEqual({
        subscribed: true,
      });
    });

    it('starts a container in planning', async () => {
      const task = await api.createTask('p1', { title: 'Epic', type: 'EPIC' });
      expect(task.status).toBe('backlog');
    });

    it('lists the task on My Work only when it is assigned to the caller', async () => {
      const mine = await api.createTask('p1', {
        title: 'Mine',
        assigneeId: 'a1',
      });
      await api.createTask('p1', { title: 'Ben’s', assigneeId: 'a2' });
      const titles = (await api.listMyTasks()).content?.map((t) => t.title);
      expect(titles).toContain('Mine');
      expect(titles).not.toContain('Ben’s');
      expect(mine.assignees?.[0]?.firstName).toBe('Ada');
    });

    it('puts the task under a parent', async () => {
      const task = await api.createTask('p1', {
        title: 'Child',
        parentTaskId: '6',
      });
      expect(task.parentTask?.taskKey).toBe('CHK-120');
    });

    it('rejects what the backend rejects, with its codes', async () => {
      expect(await code(api.createTask('p1', { title: ' ' }))).toBe(
        'VALIDATION_ERROR'
      );
      expect(
        await code(api.createTask('p1', { title: 'x', assigneeId: 'zz' }))
      ).toBe('ASSIGNEE_NOT_PROJECT_MEMBER');
      expect(
        await code(api.createTask('p1', { title: 'x', parentTaskId: '1' }))
      ).toBe('INVALID_PARENT_TYPE');
      expect(
        await code(
          api.createTask('p1', {
            title: 'x',
            type: 'MASTER',
            parentTaskId: '6',
          })
        )
      ).toBe('INVALID_CHILD_TYPE');
    });
  });

  describe('edits', () => {
    const code = (promise: Promise<unknown>) =>
      promise.catch((e: ApiError) => e.body.code);

    it('keeps the title, type and priority a PUT leaves out, and clears the rest', async () => {
      await api.updateTask('p1', '1', { title: 'Renamed' });
      const task = await api.getTask('p1', '1');
      expect(task).toMatchObject({
        title: 'Renamed',
        type: 'BUG',
        priority: 'CRITICAL',
      });
      expect(task.description).toContain('expired sessions');
      expect(task.dueDate).toBeUndefined();
      expect(task.labels).toBeUndefined();
      expect(task.bugOccurredAt).toBeUndefined();
    });

    it('answers a PUT without assignees, like the server', async () => {
      const response = await api.updateTask('p1', '2', { priority: 'LOW' });
      expect(response.assignees).toEqual([]);
      expect((await api.getTask('p1', '2')).assignees).toHaveLength(1);
    });

    it('moves the status when the new type can’t use it', async () => {
      await api.updateTask('p1', '2', { type: 'EPIC' });
      expect(await api.getTask('p1', '2')).toMatchObject({
        type: 'EPIC',
        status: 'backlog',
        statusCategory: 'PLANNING',
      });
    });

    it('refuses the type changes and archived edits the server refuses', async () => {
      expect(await code(api.updateTask('p1', '6', { type: 'TASK' }))).toBe(
        'CANNOT_CHANGE_TYPE_WITH_CHILDREN'
      );
      expect(await code(api.updateTask('p1', '1', { type: 'MASTER' }))).toBe(
        'INVALID_TYPE_UNDER_EPIC'
      );
      await api.changeTaskStatus('p1', '2', {
        status: 'done',
        resolution: 'done',
      });
      await api.archiveTask('p1', '2');
      expect(await code(api.updateTask('p1', '2', { title: 'x' }))).toBe(
        'TASK_ARCHIVED_READ_ONLY'
      );
    });

    it('moves a task under an epic, or to the root', async () => {
      await api.changeTaskParent('p1', '2', { parentTaskId: '6' });
      expect((await api.getTask('p1', '2')).parentTask).toMatchObject({
        id: '6',
        taskKey: 'CHK-120',
      });
      await api.changeTaskParent('p1', '2', { parentTaskId: null });
      const task = await api.getTask('p1', '2');
      expect(task.parentTaskId).toBeUndefined();
      expect(task.parentTask).toBeUndefined();
    });

    it('refuses parents the server refuses', async () => {
      expect(
        await code(api.changeTaskParent('p1', '6', { parentTaskId: '2' }))
      ).toBe('INVALID_PARENT_TYPE');
      expect(
        await code(api.changeTaskParent('p1', '6', { parentTaskId: '6' }))
      ).toBe('INVALID_PARENT_CYCLE');
    });

    it('replaces every assignee', async () => {
      await api.assignTask('p1', '1', { assigneeIds: ['a2', 'a3'] });
      expect(
        (await api.getTask('p1', '1')).assignees?.map((a) => a.firstName)
      ).toEqual(['Ben', 'Chen']);
      expect(
        await code(api.assignTask('p1', '1', { assigneeIds: ['nobody'] }))
      ).toBe('ASSIGNEE_NOT_PROJECT_MEMBER');
    });

    it('deletes a task', async () => {
      await api.deleteTask('p1', '2');
      await expect(api.getTask('p1', '2')).rejects.toThrow();
    });

    it('lists a project’s labels by name, and adds and removes them by id', async () => {
      expect((await api.listLabels('p1')).map((l) => l.name)).toEqual([
        '3ds',
        'android',
        'ios',
        'payments',
        'safari',
      ]);
      await api.addTaskLabel('p1', 'l4', '1');
      await api.removeTaskLabel('p1', 'l1', '1');
      expect((await api.getTask('p1', '1')).labels).toEqual([
        'payments',
        '3ds',
        'ios',
      ]);
    });
  });
});
