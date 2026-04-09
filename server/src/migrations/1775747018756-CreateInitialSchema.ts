import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInitialSchema1775747018756 implements MigrationInterface {
    name = 'CreateInitialSchema1775747018756'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "games" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" text NOT NULL, "name" text NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "is_preinstalled" boolean NOT NULL DEFAULT false, "bundle_url" text, CONSTRAINT "UQ_095bbaa4f028fa5a03e37f631d6" UNIQUE ("slug"), CONSTRAINT "PK_c9b16b62917b5595af982d66337" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "matches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" text NOT NULL, "state" jsonb NOT NULL, "options" jsonb, "player1_id" character(10), "player1_guest_uuid" text, "player2_id" character(10), "player2_guest_uuid" text, "current_turn" integer, "winner" integer, "invite_code" text, "invite_code_expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "game_id" uuid, CONSTRAINT "UQ_d7537e0af2de6d183c34e1490fb" UNIQUE ("invite_code"), CONSTRAINT "PK_8a22c7b2e0828988d51256117f4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "moves" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "player_id" uuid, "guest_uuid" text, "move_data" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "match_id" uuid, CONSTRAINT "PK_fcbf4e07f988d7d37d00e933133" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "config" ("id" SERIAL NOT NULL, "config" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" text, CONSTRAINT "PK_d0ee79a681413d50b0a4f98cf7b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" character(10) NOT NULL, "provider" text NOT NULL, "provider_id" text NOT NULL, "display_name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9c126dfdc9977c5a43780494471" UNIQUE ("provider", "provider_id"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character(10) NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_721191f60100575734fb03261f3" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "moves" ADD CONSTRAINT "FK_138edd095f20a14f12c8a11760a" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
        await queryRunner.query(`ALTER TABLE "moves" DROP CONSTRAINT "FK_138edd095f20a14f12c8a11760a"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_721191f60100575734fb03261f3"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "config"`);
        await queryRunner.query(`DROP TABLE "moves"`);
        await queryRunner.query(`DROP TABLE "matches"`);
        await queryRunner.query(`DROP TABLE "games"`);
    }

}
