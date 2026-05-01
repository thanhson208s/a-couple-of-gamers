import { SetMetadata } from '@nestjs/common';

export const WS_MESSAGE_METADATA = 'ws:on-message';
export const WS_CONNECTED_METADATA = 'ws:on-connected';
export const WS_DISCONNECTED_METADATA = 'ws:on-disconnected';
export const WS_DTO_METADATA = 'ws:dto';

// Attach a method handler for an inbound WS message. The method is called with
// `{ userId, ...data }` where `data` is the message payload.
// export const OnWsMessage = (event: string) => SetMetadata(WS_MESSAGE_METADATA, event);
export const OnWsMessage = (event: string, dto?: new (...args: any[]) => any) => {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    SetMetadata(WS_MESSAGE_METADATA, event)(target, key, descriptor);
    if (dto) {
      SetMetadata(WS_DTO_METADATA, dto)(target, key, descriptor);
    }
  };
};

// Attach a method handler invoked after a client successfully authenticates.
// The method is called with `{ userId }`.
export const OnWsConnected = () => SetMetadata(WS_CONNECTED_METADATA, true);

// Attach a method handler invoked when an authenticated client disconnects.
// The method is called with `{ userId }`.
export const OnWsDisconnected = () => SetMetadata(WS_DISCONNECTED_METADATA, true);
