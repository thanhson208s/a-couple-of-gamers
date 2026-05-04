import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

export interface ConfigData {
  appVersion?: {
    ios?: {
      minSupportedVersion: string;
      latestVersion: string;
    };
    android?: {
      minSupportedVersion: string;
      latestVersion: string;
    }
  };

  featureLimits: {
    anonymous: {
      maxFavorites: number;
      maxFriends: number;
      maxConcurrentMatches: number;
    };
    social: {
      maxFavorites: number;
      maxFriends: number;
      maxConcurrentMatches: number;
    };
    dev: {
      maxFavorites: number;
      maxFriends: number;
      maxConcurrentMatches: number;
    };
  }
}

export const DEFAULT_CONFIG: ConfigData = {
  appVersion: {
    ios: {
      minSupportedVersion: '1.0.0',
      latestVersion: '1.0.0',
    },
    android: {
      minSupportedVersion: '1.0.0',
      latestVersion: '1.0.0',
    },
  },

  featureLimits: {
    anonymous: {
      maxFavorites: 2,
      maxFriends: 0,
      maxConcurrentMatches: 1,
    },
    social: {
      maxFavorites: 10,
      maxFriends: 100,
      maxConcurrentMatches: 5,
    },
    dev: {
      maxFavorites: 1_000_000_000,
      maxFriends: 1_000_000_000,
      maxConcurrentMatches: 1_000_000_000,
    }
  },
};

@Entity('config')
export class Config {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'jsonb', name: 'config' })
  configData: ConfigData;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'text', name: 'updated_by', nullable: true })
  updatedBy: string | null;
}
