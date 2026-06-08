import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGravesAndCascadeMatchPlayers1780474160000 implements MigrationInterface {
    name = 'CreateGravesAndCascadeMatchPlayers1780474160000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "graves" ("user_id" character(10) NOT NULL, "provider_id" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "is_processed" boolean NOT NULL DEFAULT false, "processed_at" TIMESTAMP WITH TIME ZONE, "external_cleanup" jsonb, CONSTRAINT "UQ_graves_provider_id" UNIQUE ("provider_id"), CONSTRAINT "PK_graves_user_id" PRIMARY KEY ("user_id"))`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_3e098e236f56bf7f46c2663e1aa"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_4160c564de33391537026e4ed27"`);
        await queryRunner.query(`DELETE FROM "matches" WHERE "player1_id" IS NULL OR "player2_id" IS NULL OR NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "matches"."player1_id") OR NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."id" = "matches"."player2_id")`);
        await queryRunner.query(`ALTER TABLE "matches" ALTER COLUMN "player1_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "matches" ALTER COLUMN "player2_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_4160c564de33391537026e4ed27" FOREIGN KEY ("player1_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_3e098e236f56bf7f46c2663e1aa" FOREIGN KEY ("player2_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_3e098e236f56bf7f46c2663e1aa"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_4160c564de33391537026e4ed27"`);
        await queryRunner.query(`ALTER TABLE "matches" ALTER COLUMN "player2_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "matches" ALTER COLUMN "player1_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_4160c564de33391537026e4ed27" FOREIGN KEY ("player1_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_3e098e236f56bf7f46c2663e1aa" FOREIGN KEY ("player2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`DROP TABLE "graves"`);
    }

}
