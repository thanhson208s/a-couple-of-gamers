import { Injectable } from '@nestjs/common';
import { RcEventData } from './rc-webhook.dto';

@Injectable()
export class PurchasesService {
  async handleRcTestEvent(event: RcEventData) {

  }

  async handleRcPurchaseEvent(event: RcEventData) {

  }

  async handleRcChangeEvent(event: RcEventData) {

  }

  async handleRcCancellationEvent(event: RcEventData) {

  }

  async handleRcExpirationEvent(event: RcEventData) {

  }

  async handleRcTransferEvent(event: RcEventData) {

  }
}
