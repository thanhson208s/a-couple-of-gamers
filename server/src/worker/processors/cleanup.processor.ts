import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

// Repeatable job: marks matches as abandoned if updated_at is older
// than the inactivity threshold (e.g. 30 days).
// Registered as a repeatable job on worker startup.
@Processor('cleanup')
export class CleanupProcessor extends WorkerHost {
  async process(_job: Job) {
    // TODO: query matches WHERE status IN ('pending','active') AND updated_at < threshold
    // TODO: set status = 'abandoned' for each stale match
    throw new Error('not implemented');
  }
}
