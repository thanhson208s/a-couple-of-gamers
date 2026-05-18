import { Injectable } from '@nestjs/common';
import { RcEventData } from './rc-webhook.dto';

@Injectable()
export class PurchasesService {
  async handleRcTestEvent(_event: RcEventData) {

  }

  async handleRcPurchaseEvent(_event: RcEventData) {

  }

  async handleRcChangeEvent(_event: RcEventData) {

  }

  async handleRcCancellationEvent(_event: RcEventData) {

  }

  async handleRcExpirationEvent(_event: RcEventData) {

  }

  async handleRcTransferEvent(_event: RcEventData) {

  }
}
