import { MigrationInterface, QueryRunner } from "typeorm";

export class DropMatchInviteColumns1745636447000 implements MigrationInterface {
    name = 'DropMatchInviteColumns1745636447000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "matches" WHERE "status" = 'pending'`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "UQ_d7537e0af2de6d183c34e1490fb"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "invite_code"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "invite_code_expires_at"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matches" ADD "invite_code_expires_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "invite_code" text`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "UQ_d7537e0af2de6d183c34e1490fb" UNIQUE ("invite_code")`);
    }
}
