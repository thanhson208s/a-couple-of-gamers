import { Injectable } from '@nestjs/common';

@Injectable()
export class MatchesService {
  async createMatch(_body: { gameSlug: string; opponentType: string }) {
    throw new Error('not implemented');
  }

  async listActiveMatches() {
    throw new Error('not implemented');
  }

  async getMatch(_id: string) {
    throw new Error('not implemented');
  }

  async joinMatch(_id: string, _inviteCode: string) {
    throw new Error('not implemented');
  }

  async abandonMatch(_id: string) {
    throw new Error('not implemented');
  }

  async submitMove(_matchId: string, _move: unknown) {
    throw new Error('not implemented');
  }

  async completeAiMatch(_matchId: string, _winnerId: string | null) {
    throw new Error('not implemented');
  }

  async getInvite(_matchId: string) {
    throw new Error('not implemented');
  }
}
