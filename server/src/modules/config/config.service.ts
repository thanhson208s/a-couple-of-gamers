import { Injectable } from '@nestjs/common';
import { GamesService } from '../games/games.service';

@Injectable()
export class ConfigService {
  constructor(private readonly gamesService: GamesService) {}

  async getConfig() {
    const games = await this.gamesService.listGames();
    const gamesMap: Record<string, unknown> = {};
    for (const game of games) {
      gamesMap[game.slug] = {
        enabled: game.enabled,
        bundleUrl: game.bundleUrl,
        bundleVersion: game.bundleVersion,
      };
    }
    return { games: gamesMap };
  }

  async updateConfig(_config: unknown) {
    // TODO: persist feature flags to config table
    await this.purgeCloudflareCache().catch((err) =>
      console.error('Cloudflare cache purge failed:', err),
    );
  }

  private async purgeCloudflareCache(): Promise<void> {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const baseUrl = process.env.APP_BASE_URL;
    if (!zoneId || !token || !baseUrl) return;

    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: [`${baseUrl}/v1/config`] }),
    });
  }
}
