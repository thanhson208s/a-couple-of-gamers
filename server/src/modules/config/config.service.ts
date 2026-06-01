import { Injectable } from '@nestjs/common';
import { GamesService } from '../games/games.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Config, ConfigData, DEFAULT_CONFIG } from './config.entity';
import { Repository } from 'typeorm';

function normalizeConfigData(configData: ConfigData | null | undefined): ConfigData {
  if (!configData) return DEFAULT_CONFIG;

  return {
    ...DEFAULT_CONFIG,
    ...configData,
    appVersion: {
      ...DEFAULT_CONFIG.appVersion,
      ...configData.appVersion,
    },
    featureLimits: {
      anonymous: {
        ...DEFAULT_CONFIG.featureLimits.anonymous,
        ...configData.featureLimits?.anonymous,
      },
      social: {
        ...DEFAULT_CONFIG.featureLimits.social,
        ...configData.featureLimits?.social,
      },
      dev: {
        ...DEFAULT_CONFIG.featureLimits.dev,
        ...configData.featureLimits?.dev,
      },
    },
  };
}

@Injectable()
export class ConfigService {
  configData: ConfigData = DEFAULT_CONFIG;

  constructor(
    @InjectRepository(Config) private readonly config: Repository<Config>,
    private readonly gamesService: GamesService,
  ) {}

  async getConfig() {
    const row = await this.config.findOne({ where: { id: 1 } });
    this.configData = normalizeConfigData(row?.configData);

    const games = await this.gamesService.listGames();
    const gamesMap: Record<string, unknown> = {};
    for (const game of games) {
      gamesMap[game.id] = { status: game.status };
    }
    return { ...this.configData, games: gamesMap };
  }

  async updateConfig(configData: ConfigData) {
    const normalizedConfigData = normalizeConfigData(configData);
    await this.config.save({ id: 1, configData: normalizedConfigData });
    this.configData = normalizedConfigData;
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
