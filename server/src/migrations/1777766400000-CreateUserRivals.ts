import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserRivals1777766400000 implements MigrationInterface {
    name = 'CreateUserRivals1777766400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_rivals" ("user_id1" character(10) NOT NULL, "user_id2" character(10) NOT NULL, "game_id" text NOT NULL, "match_count" integer GENERATED ALWAYS AS ("win_count" + "loss_count" + "draw_count") STORED, "win_count" integer NOT NULL DEFAULT '0', "loss_count" integer NOT NULL DEFAULT '0', "draw_count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_user_rivals" PRIMARY KEY ("user_id1", "user_id2", "game_id"))`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "FK_user_rivals_user1" FOREIGN KEY ("user_id1") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "FK_user_rivals_user2" FOREIGN KEY ("user_id2") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "FK_user_rivals_game" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "FK_user_rivals_game"`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "FK_user_rivals_user2"`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "FK_user_rivals_user1"`);
        await queryRunner.query(`DROP TABLE "user_rivals"`);
    }
}
