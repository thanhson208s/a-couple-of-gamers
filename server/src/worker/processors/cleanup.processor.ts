import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MatchesService } from '../../modules/matches/matches.service';
import { UsersService } from '../../modules/users/users.service';

// Repeatable job: deletes stale matches on a fixed schedule.
// Covers aged abandoned matches and inactivity-threshold active matches.
@Processor('cleanup')
export class CleanupProcessor extends WorkerHost {

  constructor(
    private readonly matchesService: MatchesService,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'stale-matches') {
      await this.matchesService.cleanupStaleMatches();
      return;
    }

    if (job.name === 'deleted-users') {
      const graves = await this.usersService.listUnprocessedDeletedUsers();

      for (const grave of graves) {
        try {
          await this.matchesService.cleanupForDeletedUser(grave);
          await this.usersService.cleanupForDeletedUser(grave);

          await this.usersService.markDeletedUserProcessed(grave.userId);
        } catch (e) {
          // Retry next time
        }
      }
    }
  }
}
