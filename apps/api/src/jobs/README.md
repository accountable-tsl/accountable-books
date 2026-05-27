# Jobs & Workers

## Architecture

The worker system uses a **Declarative Registry** pattern.

- **`workers/registry.ts`**: Single source of truth. Define workers and queues here.
- **`workers/index.ts`**: Automatically starts all workers defined in the registry.
- **`queues/queue-broker.ts`**: Manages queue execution (disabling in tests, etc).

## How to Add a New Worker

1.  **Create your Worker & Queue** in your domain folder.
2.  **Add to Registry**: Open `apps/api/src/jobs/workers/registry.ts` and add an entry:

```typescript
{
  name: 'myWorker',
  queue: myQueue,
  factory: () => startMyWorker(), // Factory function
  label: 'My Worker',
  icon: '⚡',
  config: {
    envVar: 'MY_WORKER_CONCURRENCY', // Env var to control concurrency
    defaultValue: 5,
  },
}
```

That's it! The system will automatically:

- Start the worker.
- Register the queue in the BullBoard Admin UI.
- Handle graceful shutdown.
