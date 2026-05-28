import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MatchesService } from '../../modules/matches/matches.service';

// Repeatable job: deletes stale matches on a fixed schedule.
// Covers aged abandoned matches and inactivity-threshold active matches.
@Processor('cleanup')
export class CleanupProcessor extends WorkerHost {
  constructor(private readonly matchesService: MatchesService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'stale-matches') {
      await this.matchesService.cleanupStaleMatches();
    }
  }
}
