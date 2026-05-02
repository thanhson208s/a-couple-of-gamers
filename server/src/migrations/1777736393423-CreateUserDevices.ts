import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserDevices1777736393423 implements MigrationInterface {
    name = 'CreateUserDevices1777736393423'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_devices" ("token" text NOT NULL, "user_id" character(10) NOT NULL, "platform" text NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT "PK_user_devices" PRIMARY KEY ("token"))`);
        await queryRunner.query(`ALTER TABLE "user_devices" ADD CONSTRAINT "FK_user_devices_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_devices" DROP CONSTRAINT "FK_user_devices_user"`);
        await queryRunner.query(`DROP TABLE "user_devices"`);
    }
}
