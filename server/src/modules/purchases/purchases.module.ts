import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { GuardsModule } from "../../common/guards/guards.module";
import { PurchasesService } from "./purchases.service";
import { PurchasesController } from "./purchases.controller";

@Module({
  imports: [UsersModule, GuardsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}