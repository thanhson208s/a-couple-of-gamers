import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInitialSchema1777977003138 implements MigrationInterface {
    name = 'CreateInitialSchema1777977003138'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" character(10) NOT NULL, "provider" text NOT NULL, "provider_id" text NOT NULL, "display_name" text NOT NULL, "avatar_url" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_6425135effde2ab8322f8464932" UNIQUE ("provider_id"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_entitlements" ("user_id" character(10) NOT NULL, "game_id" text NOT NULL, "store" text NOT NULL, "original_transaction_id" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_97c2fdfe64a4534a73f0307cd10" PRIMARY KEY ("user_id", "game_id"))`);
        await queryRunner.query(`CREATE TABLE "games" ("id" text NOT NULL, "name" text NOT NULL, "status" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_c9b16b62917b5595af982d66337" PRIMARY KEY ("id"))`);
        await queryRunner.query(`INSERT INTO "typeorm_metadata"("database", "schema", "table", "type", "name", "value") VALUES ($1, $2, $3, $4, $5, $6)`, ["acog","public","user_rivals","GENERATED_COLUMN","match_count","\"win_count\" + \"loss_count\" + \"draw_count\""]);
        await queryRunner.query(`CREATE TABLE "user_rivals" ("user_id1" character(10) NOT NULL, "user_id2" character(10) NOT NULL, "game_id" text NOT NULL, "match_count" integer GENERATED ALWAYS AS ("win_count" + "loss_count" + "draw_count") STORED NOT NULL, "win_count" integer NOT NULL DEFAULT '0', "loss_count" integer NOT NULL DEFAULT '0', "draw_count" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_a9f7d818b6225dbd1f6cef58000" PRIMARY KEY ("user_id1", "user_id2", "game_id"))`);
        await queryRunner.query(`CREATE TABLE "user_friends" ("requester_id" character(10) NOT NULL, "addressee_id" character(10) NOT NULL, "status" text NOT NULL DEFAULT 'pending', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ade6409cd34b6a9602a694f463c" PRIMARY KEY ("requester_id", "addressee_id"))`);
        await queryRunner.query(`CREATE TABLE "user_favorites" ("user_id" character(10) NOT NULL, "game_id" text NOT NULL, CONSTRAINT "PK_cac44ec4336c9ee825c8c9a0a68" PRIMARY KEY ("user_id", "game_id"))`);
        await queryRunner.query(`CREATE TABLE "fcm_tokens" ("token" text NOT NULL, "user_id" character(10) NOT NULL, "platform" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_639c0f1d38d97d778122d4f2998" PRIMARY KEY ("token"))`);
        await queryRunner.query(`CREATE TABLE "matches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" text NOT NULL, "state" jsonb NOT NULL, "options" jsonb, "player1_id" character(10), "player2_id" character(10), "winner" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "game_id" text, CONSTRAINT "PK_8a22c7b2e0828988d51256117f4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "config" ("id" SERIAL NOT NULL, "config" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" text, CONSTRAINT "PK_d0ee79a681413d50b0a4f98cf7b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character(10) NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user_entitlements" ADD CONSTRAINT "FK_a73e33e151f2988cd863aa283d2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "FK_8d45019dfa2fb03e75c6123c493" FOREIGN KEY ("user_id1") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_rivals" ADD CONSTRAINT "FK_c9ded943cf8ca9e4a1c96cb3783" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_friends" ADD CONSTRAINT "FK_094d2b274593f88675deeb3f870" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_friends" ADD CONSTRAINT "FK_368b823ae2b2d92ebb4afa09326" FOREIGN KEY ("addressee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_favorites" ADD CONSTRAINT "FK_5238ce0a21cc77dc16c8efe3d36" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_favorites" ADD CONSTRAINT "FK_9c87b59dd764da9ab780b43aa85" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fcm_tokens" ADD CONSTRAINT "FK_9fd867cabc75028a5625ce7b24c" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "matches" ADD CONSTRAINT "FK_721191f60100575734fb03261f3" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP CONSTRAINT "FK_721191f60100575734fb03261f3"`);
        await queryRunner.query(`ALTER TABLE "fcm_tokens" DROP CONSTRAINT "FK_9fd867cabc75028a5625ce7b24c"`);
        await queryRunner.query(`ALTER TABLE "user_favorites" DROP CONSTRAINT "FK_9c87b59dd764da9ab780b43aa85"`);
        await queryRunner.query(`ALTER TABLE "user_favorites" DROP CONSTRAINT "FK_5238ce0a21cc77dc16c8efe3d36"`);
        await queryRunner.query(`ALTER TABLE "user_friends" DROP CONSTRAINT "FK_368b823ae2b2d92ebb4afa09326"`);
        await queryRunner.query(`ALTER TABLE "user_friends" DROP CONSTRAINT "FK_094d2b274593f88675deeb3f870"`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "FK_c9ded943cf8ca9e4a1c96cb3783"`);
        await queryRunner.query(`ALTER TABLE "user_rivals" DROP CONSTRAINT "FK_8d45019dfa2fb03e75c6123c493"`);
        await queryRunner.query(`ALTER TABLE "user_entitlements" DROP CONSTRAINT "FK_a73e33e151f2988cd863aa283d2"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP TABLE "config"`);
        await queryRunner.query(`DROP TABLE "matches"`);
        await queryRunner.query(`DROP TABLE "fcm_tokens"`);
        await queryRunner.query(`DROP TABLE "user_favorites"`);
        await queryRunner.query(`DROP TABLE "user_friends"`);
        await queryRunner.query(`DROP TABLE "user_rivals"`);
        await queryRunner.query(`DELETE FROM "typeorm_metadata" WHERE "type" = $1 AND "name" = $2 AND "database" = $3 AND "schema" = $4 AND "table" = $5`, ["GENERATED_COLUMN","match_count","acog","public","user_rivals"]);
        await queryRunner.query(`DROP TABLE "games"`);
        await queryRunner.query(`DROP TABLE "user_entitlements"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
