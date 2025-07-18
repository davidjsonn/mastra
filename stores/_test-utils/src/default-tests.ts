import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import type { MetricResult } from '@mastra/core/eval';
import type { WorkflowRunState } from '@mastra/core/workflows';
import type { MastraStorage } from '@mastra/core/storage';
import { TABLE_WORKFLOW_SNAPSHOT, TABLE_EVALS, TABLE_MESSAGES, TABLE_THREADS } from '@mastra/core/storage';
import { MastraMessageV1 } from '@mastra/core';

// Sample test data factory functions to ensure unique records
export const createSampleThread = () => ({
  id: `thread-${randomUUID()}`,
  resourceId: `resource-${randomUUID()}`,
  title: 'Test Thread',
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: { key: 'value' },
});

export const createSampleThreadWithParams = (
  threadId: string,
  resourceId: string,
  createdAt: Date,
  updatedAt: Date,
) => ({
  id: threadId,
  resourceId,
  title: 'Test Thread with given ThreadId and ResourceId',
  createdAt,
  updatedAt,
  metadata: { key: 'value' },
});

let role: 'assistant' | 'user' = 'assistant';
export const getRole = () => {
  if (role === 'user') role = 'assistant';
  else role = 'user';
  return role;
};
export const createSampleMessage = (threadId: string, createdAt?: Date) =>
  ({
    id: `msg-${randomUUID()}`,
    role: getRole(),
    type: 'text',
    threadId,
    content: [{ type: 'text', text: 'Hello' }],
    createdAt: createdAt || new Date(),
  }) satisfies MastraMessageV1;

export const createSampleTraceForDB = (
  name: string,
  scope?: string,
  attributes?: Record<string, string>,
  createdAt?: Date,
) => ({
  id: `trace-${randomUUID()}`,
  parentSpanId: `span-${randomUUID()}`,
  traceId: `trace-${randomUUID()}`,
  name,
  scope,
  kind: 0,
  status: JSON.stringify({ code: 'success' }),
  events: JSON.stringify([{ name: 'start', timestamp: Date.now() }]),
  links: JSON.stringify([]),
  attributes: attributes ? attributes : undefined,
  startTime: (createdAt || new Date()).getTime(),
  endTime: (createdAt || new Date()).getTime(),
  other: JSON.stringify({ custom: 'data' }),
  createdAt: createdAt || new Date(),
});

export const createSampleEval = (agentName: string, isTest = false, createdAt?: Date) => {
  const testInfo = isTest ? { testPath: 'test/path.ts', testName: 'Test Name' } : undefined;

  return {
    agent_name: agentName,
    input: 'Sample input',
    output: 'Sample output',
    result: { score: 0.8 } as MetricResult,
    metric_name: 'sample-metric',
    instructions: 'Sample instructions',
    test_info: testInfo,
    global_run_id: `global-${randomUUID()}`,
    run_id: `run-${randomUUID()}`,
    created_at: createdAt || new Date().toISOString(),
    createdAt: createdAt || new Date(),
  };
};

export const createSampleWorkflowSnapshot = (status: string, createdAt?: Date) => {
  const runId = `run-${randomUUID()}`;
  const stepId = `step-${randomUUID()}`;
  const timestamp = createdAt || new Date();
  const snapshot = {
    result: { success: true },
    value: {},
    context: {
      [stepId]: {
        status,
        payload: {},
        error: undefined,
        startedAt: timestamp.getTime(),
        endedAt: new Date(timestamp.getTime() + 15000).getTime(),
      },
      input: {},
    },
    serializedStepGraph: [],
    activePaths: [],
    suspendedPaths: {},
    runId,
    timestamp: timestamp.getTime(),
  } as WorkflowRunState;
  return { snapshot, runId, stepId };
};
export function createTestSuite(storage: MastraStorage) {
  describe(storage.constructor.name, () => {
    const checkWorkflowSnapshot = (snapshot: WorkflowRunState | string, stepId: string, status: string) => {
      if (typeof snapshot === 'string') {
        throw new Error('Expected WorkflowRunState, got string');
      }
      expect(snapshot.context?.[stepId]?.status).toBe(status);
    };

    beforeAll(async () => {
      await storage.init();
    });

    beforeEach(async () => {
      // Clear tables before each test
      await storage.clearTable({ tableName: TABLE_WORKFLOW_SNAPSHOT });
      await storage.clearTable({ tableName: TABLE_EVALS });
      await storage.clearTable({ tableName: TABLE_MESSAGES });
      await storage.clearTable({ tableName: TABLE_THREADS });
    });

    afterAll(async () => {
      // Clear tables after tests
      await storage.clearTable({ tableName: TABLE_WORKFLOW_SNAPSHOT });
      await storage.clearTable({ tableName: TABLE_EVALS });
      await storage.clearTable({ tableName: TABLE_MESSAGES });
      await storage.clearTable({ tableName: TABLE_THREADS });
    });

    describe('Thread Operations', () => {
      it('should create and retrieve a thread', async () => {
        const thread = createSampleThread();

        // Save thread
        const savedThread = await storage.saveThread({ thread });
        expect(savedThread).toEqual(thread);

        // Retrieve thread
        const retrievedThread = await storage.getThreadById({ threadId: thread.id });
        expect(retrievedThread?.title).toEqual(thread.title);
      });

      it('should create and retrieve a thread with the same given threadId and resourceId', async () => {
        const exampleThreadId = '1346362547862769664';
        const exampleResourceId = '532374164040974346';
        const createdAt = new Date();
        const updatedAt = new Date();
        const thread = createSampleThreadWithParams(exampleThreadId, exampleResourceId, createdAt, updatedAt);

        // Save thread
        const savedThread = await storage.saveThread({ thread });
        expect(savedThread).toEqual(thread);

        // Retrieve thread
        const retrievedThread = await storage.getThreadById({ threadId: thread.id });
        expect(retrievedThread?.id).toEqual(exampleThreadId);
        expect(retrievedThread?.resourceId).toEqual(exampleResourceId);
        expect(retrievedThread?.title).toEqual(thread.title);
        expect(retrievedThread?.createdAt).toEqual(createdAt.toISOString());
        expect(retrievedThread?.updatedAt).toEqual(updatedAt.toISOString());
      });

      it('should return null for non-existent thread', async () => {
        const result = await storage.getThreadById({ threadId: 'non-existent' });
        expect(result).toBeNull();
      });

      it('should get threads by resource ID', async () => {
        const thread1 = createSampleThread();
        const thread2 = { ...createSampleThread(), resourceId: thread1.resourceId };

        await storage.saveThread({ thread: thread1 });
        await storage.saveThread({ thread: thread2 });

        const threads = await storage.getThreadsByResourceId({ resourceId: thread1.resourceId });
        expect(threads).toHaveLength(2);
        expect(threads.map(t => t.id)).toEqual(expect.arrayContaining([thread1.id, thread2.id]));
      });

      it('should update thread title and metadata', async () => {
        const thread = createSampleThread();
        await storage.saveThread({ thread });

        const newMetadata = { newKey: 'newValue' };
        const updatedThread = await storage.updateThread({
          id: thread.id,
          title: 'Updated Title',
          metadata: newMetadata,
        });

        expect(updatedThread.title).toBe('Updated Title');
        expect(updatedThread.metadata).toEqual({
          ...thread.metadata,
          ...newMetadata,
        });

        // Verify persistence
        const retrievedThread = await storage.getThreadById({ threadId: thread.id });
        expect(retrievedThread).toEqual(updatedThread);
      });

      it('should delete thread', async () => {
        const thread = createSampleThread();
        await storage.saveThread({ thread });

        await storage.deleteThread({ threadId: thread.id });

        const retrievedThread = await storage.getThreadById({ threadId: thread.id });
        expect(retrievedThread).toBeNull();
      });
    });

    describe('Message Operations', () => {
      it('should save and retrieve messages', async () => {
        const thread = createSampleThread();
        await storage.saveThread({ thread });

        const messages = [createSampleMessage(thread.id), createSampleMessage(thread.id)];

        // Save messages
        const savedMessages = await storage.saveMessages({ messages });

        expect(savedMessages).toEqual(messages);

        // Retrieve messages
        const retrievedMessages = await storage.getMessages({ threadId: thread.id });

        expect(retrievedMessages).toHaveLength(2);

        expect(retrievedMessages).toEqual(expect.arrayContaining(messages));
      });

      it('should handle empty message array', async () => {
        const result = await storage.saveMessages({ messages: [] });
        expect(result).toEqual([]);
      });

      it('should maintain message order', async () => {
        const thread = createSampleThread();
        await storage.saveThread({ thread });

        const messages = [
          { ...createSampleMessage(thread.id), content: [{ type: 'text', text: 'First' }] },
          { ...createSampleMessage(thread.id), content: [{ type: 'text', text: 'Second' }] },
          { ...createSampleMessage(thread.id), content: [{ type: 'text', text: 'Third' }] },
        ] satisfies MastraMessageV1[];

        await storage.saveMessages({ messages });

        const retrievedMessages = await storage.getMessages({ threadId: thread.id });

        expect(retrievedMessages).toHaveLength(3);

        // Verify order is maintained
        retrievedMessages.forEach((msg, idx) => {
          // @ts-expect-error
          expect(msg.content[0].text).toBe(messages[idx].content[0].text);
        });
      });

      it('should rollback on error during message save', async () => {
        const thread = createSampleThread();
        await storage.saveThread({ thread });

        const messages = [
          createSampleMessage(thread.id),
          // @ts-ignore
          { ...createSampleMessage(thread.id), id: null }, // This will cause an error
        ] as MastraMessageV1[];

        await expect(storage.saveMessages({ messages })).rejects.toThrow();

        // Verify no messages were saved
        const savedMessages = await storage.getMessages({ threadId: thread.id });
        expect(savedMessages).toHaveLength(0);
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle large metadata objects', async () => {
        const thread = createSampleThread();
        const largeMetadata = {
          ...thread.metadata,
          largeArray: Array.from({ length: 1000 }, (_, i) => ({ index: i, data: 'test'.repeat(100) })),
        };

        const threadWithLargeMetadata = {
          ...thread,
          metadata: largeMetadata,
        };

        await storage.saveThread({ thread: threadWithLargeMetadata });
        const retrieved = await storage.getThreadById({ threadId: thread.id });

        expect(retrieved?.metadata).toEqual(largeMetadata);
      });

      it('should handle special characters in thread titles', async () => {
        const thread = {
          ...createSampleThread(),
          title: 'Special \'quotes\' and "double quotes" and emoji 🎉',
        };

        await storage.saveThread({ thread });
        const retrieved = await storage.getThreadById({ threadId: thread.id });

        expect(retrieved?.title).toBe(thread.title);
      });

      it('should handle concurrent thread updates', async () => {
        const thread = createSampleThread();
        await storage.saveThread({ thread });

        // Perform multiple updates concurrently
        const updates = Array.from({ length: 5 }, (_, i) =>
          storage.updateThread({
            id: thread.id,
            title: `Update ${i}`,
            metadata: { update: i },
          }),
        );

        await expect(Promise.all(updates)).resolves.toBeDefined();

        // Verify final state
        const finalThread = await storage.getThreadById({ threadId: thread.id });
        expect(finalThread).toBeDefined();
      });
    });

    describe('Workflow Snapshots', () => {
      beforeAll(async () => {
        // Create workflow_snapshot table
        await storage.createTable({
          tableName: TABLE_WORKFLOW_SNAPSHOT,
          schema: {
            workflow_name: { type: 'text', nullable: false },
            run_id: { type: 'text', nullable: false },
            snapshot: { type: 'text', nullable: false },
            created_at: { type: 'timestamp', nullable: false },
            updated_at: { type: 'timestamp', nullable: false },
          },
        });
      });

      it('should persist and load workflow snapshots', async () => {
        const workflowName = 'test-workflow';
        const runId = `run-${randomUUID()}`;
        const snapshot = {
          status: 'running',
          context: {
            stepResults: {},
            attempts: {},
            triggerData: { type: 'manual' },
          },
        } as any;

        await storage.persistWorkflowSnapshot({
          workflowName,
          runId,
          snapshot,
        });

        const loadedSnapshot = await storage.loadWorkflowSnapshot({
          workflowName,
          runId,
        });

        expect(loadedSnapshot).toEqual(snapshot);
      });

      it('should return null for non-existent workflow snapshot', async () => {
        const result = await storage.loadWorkflowSnapshot({
          workflowName: 'non-existent',
          runId: 'non-existent',
        });

        expect(result).toBeNull();
      });

      it('should update existing workflow snapshot', async () => {
        const workflowName = 'test-workflow';
        const runId = `run-${randomUUID()}`;
        const initialSnapshot = {
          status: 'running',
          context: {
            stepResults: {},
            attempts: {},
            triggerData: { type: 'manual' },
          },
        };

        await storage.persistWorkflowSnapshot({
          workflowName,
          runId,
          snapshot: initialSnapshot as any,
        });

        const updatedSnapshot = {
          status: 'completed',
          context: {
            stepResults: {
              'step-1': { status: 'success', result: { data: 'test' } },
            },
            attempts: { 'step-1': 1 },
            triggerData: { type: 'manual' },
          },
        } as any;

        await storage.persistWorkflowSnapshot({
          workflowName,
          runId,
          snapshot: updatedSnapshot,
        });

        const loadedSnapshot = await storage.loadWorkflowSnapshot({
          workflowName,
          runId,
        });

        expect(loadedSnapshot).toEqual(updatedSnapshot);
      });

      it('should handle complex workflow state', async () => {
        const workflowName = 'complex-workflow';
        const runId = `run-${randomUUID()}`;
        const complexSnapshot = {
          value: { currentState: 'running' },
          context: {
            stepResults: {
              'step-1': {
                status: 'success',
                result: {
                  nestedData: {
                    array: [1, 2, 3],
                    object: { key: 'value' },
                    date: new Date().toISOString(),
                  },
                },
              },
              'step-2': {
                status: 'waiting',
                dependencies: ['step-3', 'step-4'],
              },
            },
            attempts: { 'step-1': 1, 'step-2': 0 },
            triggerData: {
              type: 'scheduled',
              metadata: {
                schedule: '0 0 * * *',
                timezone: 'UTC',
              },
            },
          },
          activePaths: [
            {
              stepPath: ['step-1'],
              stepId: 'step-1',
              status: 'success',
            },
            {
              stepPath: ['step-2'],
              stepId: 'step-2',
              status: 'waiting',
            },
          ],
          runId: runId,
          timestamp: Date.now(),
        };

        await storage.persistWorkflowSnapshot({
          workflowName,
          runId,
          snapshot: complexSnapshot as unknown as WorkflowRunState,
        });

        const loadedSnapshot = await storage.loadWorkflowSnapshot({
          workflowName,
          runId,
        });

        expect(loadedSnapshot).toEqual(complexSnapshot);
      });
    });
    describe('getWorkflowRuns', () => {
      beforeEach(async () => {
        await storage.clearTable({ tableName: TABLE_WORKFLOW_SNAPSHOT });
      });
      it('returns empty array when no workflows exist', async () => {
        const { runs, total } = await storage.getWorkflowRuns();
        expect(runs).toEqual([]);
        expect(total).toBe(0);
      });

      it('returns all workflows by default', async () => {
        const workflowName1 = 'default_test_1';
        const workflowName2 = 'default_test_2';

        const { snapshot: workflow1, runId: runId1, stepId: stepId1 } = createSampleWorkflowSnapshot('completed');
        const { snapshot: workflow2, runId: runId2, stepId: stepId2 } = createSampleWorkflowSnapshot('running');

        await storage.persistWorkflowSnapshot({ workflowName: workflowName1, runId: runId1, snapshot: workflow1 });
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
        await storage.persistWorkflowSnapshot({ workflowName: workflowName2, runId: runId2, snapshot: workflow2 });

        const { runs, total } = await storage.getWorkflowRuns();
        expect(runs).toHaveLength(2);
        expect(total).toBe(2);
        expect(runs[0]!.workflowName).toBe(workflowName2); // Most recent first
        expect(runs[1]!.workflowName).toBe(workflowName1);
        const firstSnapshot = runs[0]!.snapshot as WorkflowRunState;
        const secondSnapshot = runs[1]!.snapshot as WorkflowRunState;
        expect(firstSnapshot.context?.[stepId2]?.status).toBe('running');
        expect(secondSnapshot.context?.[stepId1]?.status).toBe('completed');
      });

      it('filters by workflow name', async () => {
        const workflowName1 = 'filter_test_1';
        const workflowName2 = 'filter_test_2';

        const { snapshot: workflow1, runId: runId1, stepId: stepId1 } = createSampleWorkflowSnapshot('completed');
        const { snapshot: workflow2, runId: runId2 } = createSampleWorkflowSnapshot('failed');

        await storage.persistWorkflowSnapshot({ workflowName: workflowName1, runId: runId1, snapshot: workflow1 });
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
        await storage.persistWorkflowSnapshot({ workflowName: workflowName2, runId: runId2, snapshot: workflow2 });

        const { runs, total } = await storage.getWorkflowRuns({ workflowName: workflowName1 });
        expect(runs).toHaveLength(1);
        expect(total).toBe(1);
        expect(runs[0]!.workflowName).toBe(workflowName1);
        const snapshot = runs[0]!.snapshot as WorkflowRunState;
        expect(snapshot.context?.[stepId1]?.status).toBe('completed');
      });

      it('filters by date range', async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const workflowName1 = 'date_test_1';
        const workflowName2 = 'date_test_2';
        const workflowName3 = 'date_test_3';

        const { snapshot: workflow1, runId: runId1 } = createSampleWorkflowSnapshot('completed');
        const { snapshot: workflow2, runId: runId2, stepId: stepId2 } = createSampleWorkflowSnapshot('running');
        const { snapshot: workflow3, runId: runId3, stepId: stepId3 } = createSampleWorkflowSnapshot('waiting');

        await storage.insert({
          tableName: TABLE_WORKFLOW_SNAPSHOT,
          record: {
            workflow_name: workflowName1,
            run_id: runId1,
            snapshot: workflow1,
            createdAt: twoDaysAgo,
            updatedAt: twoDaysAgo,
          },
        });
        await storage.insert({
          tableName: TABLE_WORKFLOW_SNAPSHOT,
          record: {
            workflow_name: workflowName2,
            run_id: runId2,
            snapshot: workflow2,
            createdAt: yesterday,
            updatedAt: yesterday,
          },
        });
        await storage.insert({
          tableName: TABLE_WORKFLOW_SNAPSHOT,
          record: {
            workflow_name: workflowName3,
            run_id: runId3,
            snapshot: workflow3,
            createdAt: now,
            updatedAt: now,
          },
        });

        const { runs } = await storage.getWorkflowRuns({
          fromDate: yesterday,
          toDate: now,
        });

        expect(runs).toHaveLength(2);
        expect(runs[0]!.workflowName).toBe(workflowName3);
        expect(runs[1]!.workflowName).toBe(workflowName2);
        const firstSnapshot = runs[0]!.snapshot as WorkflowRunState;
        const secondSnapshot = runs[1]!.snapshot as WorkflowRunState;
        expect(firstSnapshot.context?.[stepId3]?.status).toBe('waiting');
        expect(secondSnapshot.context?.[stepId2]?.status).toBe('running');
      });

      it('handles pagination', async () => {
        const workflowName1 = 'page_test_1';
        const workflowName2 = 'page_test_2';
        const workflowName3 = 'page_test_3';

        const { snapshot: workflow1, runId: runId1, stepId: stepId1 } = createSampleWorkflowSnapshot('completed');
        const { snapshot: workflow2, runId: runId2, stepId: stepId2 } = createSampleWorkflowSnapshot('running');
        const { snapshot: workflow3, runId: runId3, stepId: stepId3 } = createSampleWorkflowSnapshot('waiting');

        await storage.persistWorkflowSnapshot({ workflowName: workflowName1, runId: runId1, snapshot: workflow1 });
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
        await storage.persistWorkflowSnapshot({ workflowName: workflowName2, runId: runId2, snapshot: workflow2 });
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
        await storage.persistWorkflowSnapshot({ workflowName: workflowName3, runId: runId3, snapshot: workflow3 });

        // Get first page
        const page1 = await storage.getWorkflowRuns({ limit: 2, offset: 0 });
        expect(page1.runs).toHaveLength(2);
        expect(page1.total).toBe(3); // Total count of all records
        expect(page1.runs[0]!.workflowName).toBe(workflowName3);
        expect(page1.runs[1]!.workflowName).toBe(workflowName2);
        const firstSnapshot = page1.runs[0]!.snapshot as WorkflowRunState;
        const secondSnapshot = page1.runs[1]!.snapshot as WorkflowRunState;
        expect(firstSnapshot.context?.[stepId3]?.status).toBe('waiting');
        expect(secondSnapshot.context?.[stepId2]?.status).toBe('running');

        // Get second page
        const page2 = await storage.getWorkflowRuns({ limit: 2, offset: 2 });
        expect(page2.runs).toHaveLength(1);
        expect(page2.total).toBe(3);
        expect(page2.runs[0]!.workflowName).toBe(workflowName1);
        const snapshot = page2.runs[0]!.snapshot as WorkflowRunState;
        expect(snapshot.context?.[stepId1]?.status).toBe('completed');
      });
    });
    describe('getWorkflowRunById', () => {
      const workflowName = 'workflow-id-test';
      let runId: string;
      let stepId: string;

      beforeEach(async () => {
        // Insert a workflow run for positive test
        const sample = createSampleWorkflowSnapshot('success');
        runId = sample.runId;
        stepId = sample.stepId;
        await storage.insert({
          tableName: TABLE_WORKFLOW_SNAPSHOT,
          record: {
            workflow_name: workflowName,
            run_id: runId,
            resourceId: 'resource-abc',
            snapshot: sample.snapshot,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      });

      it('should retrieve a workflow run by ID', async () => {
        const found = await storage.getWorkflowRunById({
          runId,
          workflowName,
        });
        expect(found).not.toBeNull();
        expect(found?.runId).toBe(runId);
        checkWorkflowSnapshot(found?.snapshot!, stepId, 'success');
      });

      it('should return null for non-existent workflow run ID', async () => {
        const notFound = await storage.getWorkflowRunById({
          runId: 'non-existent-id',
          workflowName,
        });
        expect(notFound).toBeNull();
      });
    });
    describe('getWorkflowRuns with resourceId', () => {
      const workflowName = 'workflow-id-test';
      let resourceId: string;
      let runIds: string[] = [];

      beforeEach(async () => {
        // Insert multiple workflow runs for the same resourceId
        resourceId = 'resource-shared';
        for (const status of ['success', 'failed']) {
          const sample = createSampleWorkflowSnapshot(status as WorkflowRunState['context'][string]['status']);
          runIds.push(sample.runId);
          await storage.insert({
            tableName: TABLE_WORKFLOW_SNAPSHOT,
            record: {
              workflow_name: workflowName,
              run_id: sample.runId,
              resourceId,
              snapshot: sample.snapshot,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
        // Insert a run with a different resourceId
        const other = createSampleWorkflowSnapshot('waiting');
        await storage.insert({
          tableName: TABLE_WORKFLOW_SNAPSHOT,
          record: {
            workflow_name: workflowName,
            run_id: other.runId,
            resourceId: 'resource-other',
            snapshot: other.snapshot,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      });

      it('should retrieve all workflow runs by resourceId', async () => {
        const { runs } = await storage.getWorkflowRuns({
          resourceId,
          workflowName,
        });
        expect(Array.isArray(runs)).toBe(true);
        expect(runs.length).toBeGreaterThanOrEqual(2);
        for (const run of runs) {
          expect(run.resourceId).toBe(resourceId);
        }
      });

      it('should return an empty array if no workflow runs match resourceId', async () => {
        const { runs } = await storage.getWorkflowRuns({
          resourceId: 'non-existent-resource',
          workflowName,
        });
        expect(Array.isArray(runs)).toBe(true);
        expect(runs.length).toBe(0);
      });
    });

    it('should store valid ISO date strings for createdAt and updatedAt in workflow runs', async () => {
      // Use the storage instance from the test context
      const workflowName = 'test-workflow';
      const runId = 'test-run-id';
      const snapshot = {
        runId,
        value: {},
        context: {},
        activePaths: [],
        suspendedPaths: {},
        serializedStepGraph: [],
        timestamp: Date.now(),
      };
      await storage.persistWorkflowSnapshot({
        workflowName,
        runId,
        snapshot,
      });
      // Fetch the row directly from the database
      const run = await storage.getWorkflowRunById({ workflowName, runId });
      expect(run).toBeTruthy();
      // Check that these are valid Date objects
      expect(run?.createdAt instanceof Date).toBe(true);
      expect(run?.updatedAt instanceof Date).toBe(true);
      expect(!isNaN(run!.createdAt.getTime())).toBe(true);
      expect(!isNaN(run!.updatedAt.getTime())).toBe(true);
    });

    it('getWorkflowRuns should return valid createdAt and updatedAt', async () => {
      // Use the storage instance from the test context
      const workflowName = 'test-workflow';
      const runId = 'test-run-id-2';
      const snapshot = {
        runId,
        value: {},
        context: {},
        activePaths: [],
        suspendedPaths: {},
        serializedStepGraph: [],
        timestamp: Date.now(),
      };
      await storage.persistWorkflowSnapshot({
        workflowName,
        runId,
        snapshot,
      });

      const { runs } = await storage.getWorkflowRuns({ workflowName });
      expect(runs.length).toBeGreaterThan(0);
      const run = runs.find(r => r.runId === runId);
      expect(run).toBeTruthy();
      expect(run?.createdAt instanceof Date).toBe(true);
      expect(run?.updatedAt instanceof Date).toBe(true);
      expect(!isNaN(run!.createdAt.getTime())).toBe(true);
      expect(!isNaN(run!.updatedAt.getTime())).toBe(true);
    });
  });

  describe('hasColumn', () => {
    const tempTable = 'temp_test_table';

    beforeEach(async () => {
      // Always try to drop the table before each test, ignore errors if it doesn't exist
      try {
        await storage['client'].execute({ sql: `DROP TABLE IF EXISTS ${tempTable}` });
      } catch {
        /* ignore */
      }
    });

    it('returns true if the column exists', async () => {
      await storage['client'].execute({ sql: `CREATE TABLE ${tempTable} (id INTEGER PRIMARY KEY, resourceId TEXT)` });
      expect(await storage['hasColumn'](tempTable, 'resourceId')).toBe(true);
    });

    it('returns false if the column does not exist', async () => {
      await storage['client'].execute({ sql: `CREATE TABLE ${tempTable} (id INTEGER PRIMARY KEY)` });
      expect(await storage['hasColumn'](tempTable, 'resourceId')).toBe(false);
    });

    afterEach(async () => {
      // Always try to drop the table after each test, ignore errors if it doesn't exist
      try {
        await storage['client'].execute({ sql: `DROP TABLE IF EXISTS ${tempTable}` });
      } catch {
        /* ignore */
      }
    });
  });

  describe('Eval Operations', () => {
    const createSampleEval = (agentName: string, isTest = false) => {
      const testInfo = isTest ? { testPath: 'test/path.ts', testName: 'Test Name' } : undefined;

      return {
        id: randomUUID(),
        agentName,
        input: 'Sample input',
        output: 'Sample output',
        result: { score: 0.8 } as MetricResult,
        metricName: 'sample-metric',
        instructions: 'Sample instructions',
        testInfo,
        globalRunId: `global-${randomUUID()}`,
        runId: `run-${randomUUID()}`,
        createdAt: new Date().toISOString(),
      };
    };

    it('should retrieve evals by agent name', async () => {
      const agentName = `test-agent-${randomUUID()}`;

      // Create sample evals
      const liveEval = createSampleEval(agentName, false);
      const testEval = createSampleEval(agentName, true);
      const otherAgentEval = createSampleEval(`other-agent-${randomUUID()}`, false);

      // Insert evals
      await storage.insert({
        tableName: TABLE_EVALS,
        record: {
          agent_name: liveEval.agentName,
          input: liveEval.input,
          output: liveEval.output,
          result: liveEval.result,
          metric_name: liveEval.metricName,
          instructions: liveEval.instructions,
          test_info: null,
          global_run_id: liveEval.globalRunId,
          run_id: liveEval.runId,
          created_at: liveEval.createdAt,
          createdAt: new Date(liveEval.createdAt),
        },
      });

      await storage.insert({
        tableName: TABLE_EVALS,
        record: {
          agent_name: testEval.agentName,
          input: testEval.input,
          output: testEval.output,
          result: testEval.result,
          metric_name: testEval.metricName,
          instructions: testEval.instructions,
          test_info: JSON.stringify(testEval.testInfo),
          global_run_id: testEval.globalRunId,
          run_id: testEval.runId,
          created_at: testEval.createdAt,
          createdAt: new Date(testEval.createdAt),
        },
      });

      await storage.insert({
        tableName: TABLE_EVALS,
        record: {
          agent_name: otherAgentEval.agentName,
          input: otherAgentEval.input,
          output: otherAgentEval.output,
          result: otherAgentEval.result,
          metric_name: otherAgentEval.metricName,
          instructions: otherAgentEval.instructions,
          test_info: null,
          global_run_id: otherAgentEval.globalRunId,
          run_id: otherAgentEval.runId,
          created_at: otherAgentEval.createdAt,
          createdAt: new Date(otherAgentEval.createdAt),
        },
      });

      // Test getting all evals for the agent
      const allEvals = await storage.getEvalsByAgentName(agentName);
      expect(allEvals).toHaveLength(2);
      expect(allEvals.map(e => e.runId)).toEqual(expect.arrayContaining([liveEval.runId, testEval.runId]));

      // Test getting only live evals
      const liveEvals = await storage.getEvalsByAgentName(agentName, 'live');
      expect(liveEvals).toHaveLength(1);
      expect(liveEvals?.[0]?.runId).toBe(liveEval.runId);

      // Test getting only test evals
      const testEvals = await storage.getEvalsByAgentName(agentName, 'test');
      expect(testEvals).toHaveLength(1);
      expect(testEvals?.[0]?.runId).toBe(testEval.runId);
      expect(testEvals?.[0]?.testInfo).toEqual(testEval.testInfo);

      // Test getting evals for non-existent agent
      const nonExistentEvals = await storage.getEvalsByAgentName('non-existent-agent');
      expect(nonExistentEvals).toHaveLength(0);
    });
  });
}
