import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  async getConfig() {
    // TODO: read from config table
    throw new Error('not implemented');
  }

  async updateConfig(_config: unknown) {
    // TODO: update config in DB
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
