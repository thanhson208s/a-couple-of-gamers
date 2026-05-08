import { Controller, HttpCode, HttpStatus, UseGuards, Post, Body } from "@nestjs/common";
import { RcAuthGuard } from "../../common/guards/rc-auth.guard";
import { RcEventType, RcWebhookDto } from "./rc-webhook.dto";
import { PurchasesService } from "./purchases.service";

@UseGuards(RcAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post('rc-webhook')
  @HttpCode(HttpStatus.NO_CONTENT)
  handleRcWebhook(@Body() body: RcWebhookDto){
    const { event } = body;

    switch (event.type) {
      case RcEventType.TEST:
        return this.purchasesService.handleRcTestEvent(event);
      case RcEventType.INITIAL_PURCHASE:
      case RcEventType.NON_RENEWING_PURCHASE:
      case RcEventType.TEMPORARY_ENTITLEMENT_GRANT:
        return this.purchasesService.handleRcPurchaseEvent(event);
      case RcEventType.PRODUCT_CHANGE:
        return this.purchasesService.handleRcChangeEvent(event);
      case RcEventType.CANCELLATION:
        return this.purchasesService.handleRcCancellationEvent(event);
      case RcEventType.EXPIRATION:
        return this.purchasesService.handleRcExpirationEvent(event);
      case RcEventType.TRANSFER:
        return this.purchasesService.handleRcTransferEvent(event);
      default:
        // TODO: Log unexpected RC events
        break;
    }
  }
}