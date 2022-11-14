import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getOptions(): any {
    return {
      prerequisite: 'update AMPLITUDE_API_KEY before sending the event',
      options: [
        'GET "/", check the options',
        'GET "/track", send track event',
        'GET "/identify", send identify event, send a new track event to see the updated properties',
        'GET "/group", send group event, send a new track event to see the updated properties',
        'GET "/group-identify", send groupIdentify event, send a new track event to see the updated properties',
      ],
    };
  }
}
