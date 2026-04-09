import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInitialSchema1775700000000 implements MigrationInterface {
    name = 'CreateInitialSchema1775700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" character(10) NOT NULL, "provider" text NOT NULL, "provider_id" text NOT NULL, "display_name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_users_provider" UNIQUE ("provider", "provider_id"), CONSTRAINT "PK_users" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "games" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" text NOT NULL, "name" text NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "is_preinstalled" boolean NOT NULL DEFAULT false, "bundle_url" text, CONSTRAINT "UQ_games_slug" UNIQUE ("slug"), CONSTRAINT "PK_games" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "matches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" text NOT NULL, "state" jsonb NOT NULL, "player1_id" character(10), "player1_guest_uuid" text, "player2_id" character(10), "player2_guest_uuid" text, "current_turn" integer, "winner" integer, "invite_code" text, "invite_code_expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "game_id" uuid, CONSTRAINT "UQ_matches_invite_code" UNIQUE ("invite_code"), CONSTRAINT "PK_matches" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "moves" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "player_id" uuid, "guest_uuid" text, "move_data" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "match_id" uuid, CONSTRAINT "PK_moves" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "config" ("id" SERIAL NOT NULL, "config" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" text, CONSTRAINT "PK_config" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character(10) NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"), CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_game" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "moves" ADD CONSTRAINT "FK_moves_match" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_user"`);
        await queryRunner.query(`ALTER TABLE "moves" DROP CONSTRAINT "FK_moves_match"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_game"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP TABLE "config"`);
        await queryRunner.query(`DROP TABLE "moves"`);
        await queryRunner.query(`DROP TABLE "matches"`);
        await queryRunner.query(`DROP TABLE "games"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
