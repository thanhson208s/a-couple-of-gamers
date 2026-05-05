import { Injectable } from '@nestjs/common';
import { RcEventData } from './rc-webhook.dto';

@Injectable()
export class PurchasesService {
  async handleRcTestEvent(event: RcEventData) {

  }

  async handleRcSubscriptionEvent(event: RcEventData) {

  }

  async handleRcTransferEvent(event: RcEventData) {

  }
}
