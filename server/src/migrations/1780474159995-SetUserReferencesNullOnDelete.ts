import { MigrationInterface, QueryRunner } from "typeorm";

export class SetUserReferencesNullOnDelete1780474159995 implements MigrationInterface {
    name = 'SetUserReferencesNullOnDelete1780474159995'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "PK_a9f7d818b6225dbd1f6cef58000"`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ALTER COLUMN "user_id2" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "PK_dd3c4cd995a2bf9f8ee3a263cfc" PRIMARY KEY ("id")`);
        await queryRunner.query(`UPDATE "user_rivals" SET "user_id2" = NULL WHERE "user_id2" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "user_rivals"."user_id2")`);
        await queryRunner.query(`UPDATE "matches" SET "player1_id" = NULL WHERE "player1_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "matches"."player1_id")`);
        await queryRunner.query(`UPDATE "matches" SET "player2_id" = NULL WHERE "player2_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "matches"."player2_id")`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "UQ_a9f7d818b6225dbd1f6cef58000" UNIQUE ("user_id1", "user_id2", "game_id")`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "FK_9995df9821e2bef6e7188a3a621" FOREIGN KEY ("user_id2") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_4160c564de33391537026e4ed27" FOREIGN KEY ("player1_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_3e098e236f56bf7f46c2663e1aa" FOREIGN KEY ("player2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_3e098e236f56bf7f46c2663e1aa"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_4160c564de33391537026e4ed27"`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "FK_9995df9821e2bef6e7188a3a621"`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "UQ_a9f7d818b6225dbd1f6cef58000"`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "PK_dd3c4cd995a2bf9f8ee3a263cfc"`);
        await queryRunner.query(`DELETE FROM "user_rivals" WHERE "user_id2" IS NULL`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ALTER COLUMN "user_id2" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "PK_a9f7d818b6225dbd1f6cef58000" PRIMARY KEY ("user_id1", "user_id2", "game_id")`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP COLUMN "id"`);
    }

}
