import { http, HttpResponse } from 'msw';

import { setupServer } from 'msw/node';

export const handlers = [
  http.post('https://api2.amplitude.com/2/httpapi', () => {
    return HttpResponse.json({
      code: 200,
      events_ingested: 4,
      payload_size_bytes: 2504,
      server_upload_time: 1714522639863,
    });
  }),
  http.get('https://sr-client-cfg.amplitude.com/config?api_key=static_key&config_keys=sessionReplay', () => {
    return HttpResponse.json({
      configs: {
        sessionReplay: {
          sr_sampling_config: {
            sample_rate: 0.4,
            capture_enabled: true,
          },
        },
      },
    });
  }),
];

export const server = setupServer(...handlers);
