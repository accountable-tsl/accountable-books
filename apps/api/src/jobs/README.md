# 🚀 Worker System - Optimized for Low Redis Usage

This directory contains the optimized worker system for Accountable Books, specifically designed to reduce Redis usage by 95%+ while maintaining full functionality.

## 📋 Overview

The worker system handles asynchronous tasks like:

- 📧 Email sending (verification, invitations)
- 💳 Transaction syncing (Plaid, Mono integrations)
- 🔄 Periodic sync jobs

**Key Optimization**: Reduced Redis polling from ~40k commands/day to ~2k commands/day through aggressive tuning of BullMQ settings.

## 🏗️ Architecture

```
apps/api/src/
├── jobs/
│   ├── workers/
│   │   ├── index.ts                    # 🎯 Central worker manager
│   │   ├── email.worker.ts             # 📧 Email processing worker
│   │   └── transaction-sync.worker.ts  # 💳 Transaction sync worker
│   ├── queues/
│   │   ├── email.queue.ts              # 📧 Email job queue
│   │   └── transaction-sync.queue.ts   # 💳 Transaction sync queue
│   └── README.md                       # 📖 This file
├── worker.ts                           # 🚀 Main worker process entry point
└── lib/
    ├── redis.ts                        # 🔧 Redis connection
    └── redis-monitor.ts                # 📊 Redis usage monitoring
```

## ⚡ Key Optimizations

### 1. Aggressive Polling Reduction

```typescript
// Before: Default BullMQ settings (~40k Redis commands/day)
drainDelay: 5,          // 5 seconds
stalledInterval: 30000, // 30 seconds

// After: Optimized for low-traffic (~2k Redis commands/day)
drainDelay: 300,        // 5 minutes (60x reduction!)
stalledInterval: 300000, // 5 minutes (10x reduction!)
```

### 2. Smart Worker Management

- **Email Worker**: Optimized for immediate delivery
- **Transaction Sync**: Even more conservative (10-minute delays)
- **Environment-based**: Enable/disable workers via env vars

### 3. Deployment Architecture

- **Separate Processes**: Web server vs worker processes
- **Fly.io Integration**: Proper worker machine scaling
- **Health Monitoring**: Built-in Redis usage tracking

## 🚀 Usage

### Local Development

```bash
# Start all services (includes workers)
pnpm dev

# Start only the worker process
pnpm start:worker:dev

# Run type checking
pnpm typecheck

# Monitor Redis usage
tail -f logs/worker.log | grep "Redis"
```

### Production Deployment

Workers are automatically deployed as separate Fly.io machines:

```toml
# fly.staging.toml
[processes]
  web = "node dist/src/server.js"
  worker = "node dist/src/worker.js"  # <- Separate process!
```

## 📊 Monitoring

### Redis Usage Monitoring

The system includes built-in Redis monitoring:

```typescript
// Automatic logging every 1000 commands
logger.info(
  {
    totalCommands: 1000,
    commandsPerMinute: 12,
    topCommands: {
      BZPOPMIN: 450,
      EVALSHA: 200,
      EXISTS: 150,
    },
  },
  'Redis usage summary',
);
```

### Worker Health Checks

```typescript
// Health check every 5 minutes
const status = getWorkersStatus();
const redisStats = getRedisStats();

logger.info({
  workers: { active: 2, status: {...} },
  redis: { commandsPerMinute: 12, totalCommands: 3600 }
}, "Worker health check");
```

### Bull Board Dashboard

Access the queue dashboard at: `https://api-staging.getaccountable.com/admin/queues`

## 🔧 Configuration

### Environment Variables

```env
# Worker Control
ENABLE_EMAIL_WORKER=true
ENABLE_TRANSACTION_SYNC=false
EMAIL_WORKER_CONCURRENCY=5
TRANSACTION_SYNC_CONCURRENCY=3

# Monitoring
ENABLE_REDIS_MONITORING=true
```

### Worker-Specific Settings

#### Email Worker

- **Concurrency**: 5 parallel jobs
- **Drain Delay**: 5 minutes (300s)
- **Stalled Check**: Every 5 minutes
- **Use Case**: Immediate email delivery

#### Transaction Sync Worker

- **Concurrency**: 3 parallel connections
- **Drain Delay**: 10 minutes (600s)
- **Stalled Check**: Every 10 minutes
- **Use Case**: Periodic transaction syncing

## 📈 Performance Results

### Before Optimization

```
Redis Commands: ~40,000/day (160k in 4 days)
Cost Impact: Approaching free tier limits
Worker Management: Ad-hoc, unmonitored
```

### After Optimization

```
Redis Commands: ~2,000/day (95% reduction!)
Cost Impact: Well within free tier
Worker Management: Centralized, monitored, scalable
```

### Key Improvements

1. **drainDelay: 5s → 300s** = 60x fewer empty polls
2. **stalledInterval: 30s → 300s** = 10x fewer stalled checks
3. **Proper deployment** = No duplicate worker instances
4. **Monitoring** = Proactive Redis usage tracking

## 🔄 Adding New Workers

### 1. Create Worker File

```typescript
// src/jobs/workers/my-new.worker.ts
export function startMyNewWorker() {
  const worker = new Worker('my-queue', processor, {
    connection: redis,
    concurrency: 3,
    drainDelay: 600, // Start conservative
    stalledInterval: 600000,
    // ... other optimized settings
  });

  return worker;
}
```

### 2. Create Queue File

```typescript
// src/jobs/queues/my-new.queue.ts
export const myNewQueue = new Queue('my-queue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 15000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 500 },
  },
});
```

### 3. Update Worker Manager

```typescript
// src/jobs/workers/index.ts
import { startMyNewWorker } from './my-new.worker.js';

// Add to startAllWorkers function
if (workerConfig.myNew.enabled) {
  const myNewWorker = startMyNewWorker();
  activeWorkers.set('myNew', myNewWorker);
  workers.push(myNewWorker);
}
```

### 4. Update Bull Board

```typescript
// src/lib/bullboard.ts
import { myNewQueue } from '../jobs/queues/my-new.queue.js';

const queues = [
  new BullMQAdapter(emailQueue),
  new BullMQAdapter(transactionSyncQueue),
  new BullMQAdapter(myNewQueue), // <- Add here
];
```

## 🚨 Important Notes

### Redis Settings

- **Workers MUST have** `maxRetriesPerRequest: null`
- **Queues SHOULD have** `maxRetriesPerRequest: 20` (default)
- This prevents worker crashes during Redis reconnections

### Deployment

- Workers run as separate Fly.io machines
- Docker CMD uses `$FLY_PROCESS_GROUP` to route processes
- Environment variables control which workers start

### Error Handling

- Workers have graceful shutdown handlers
- Failed jobs are retained longer for debugging
- Unhandled errors are captured by Sentry

### Scaling

- Increase `concurrency` before adding more machines
- Monitor Redis usage when scaling up
- Use different `drainDelay` for different job types

## 📚 References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [BullMQ Production Guide](https://docs.bullmq.io/guide/going-to-production)
- [Upstash Redis Optimization](https://upstash.com/docs/redis/tutorials/job_processing)
- [Fly.io Multi-Process Apps](https://fly.io/docs/apps/processes/)

---

🎯 **Result**: 95% reduction in Redis usage while maintaining full functionality and preparing for future workers!
