import { Controller, Get, Render } from '@nestjs/common';
import { AppService } from './app.service';
import * as amplitude from '@amplitude/analytics-node';

const AMPLITUDE_API_KEY = 'API_KEY';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {
    amplitude.init(AMPLITUDE_API_KEY, {
      logLevel: amplitude.Types.LogLevel.Debug,
    });
  }

  @Get()
  @Render('index')
  getOptions(): any {
    return this.appService.getOptions();
  }

  @Get('track')
  async track(): Promise<string> {
    await amplitude.track(
      'nest-app example event',
      { property1: '1' },
      { user_id: 'test_user' },
    ).promise;
    return 'Triggered, check console output...';
  }

  @Get('identify')
  async identify(): Promise<string> {
    const identifyObj = new amplitude.Identify();
    identifyObj.set('email', 'test_user@email.com');
    identifyObj.set('role', 'test');
    await amplitude.identify(identifyObj, { user_id: 'test_user' }).promise;
    return 'Triggered, check console output...';
  }

  @Get('group')
  async group(): Promise<string> {
    await amplitude.setGroup('org', 'engineering', { user_id: 'test_user' })
      .promise;
    return 'Triggered, check console output...';
  }

  @Get('group-identify')
  async groupIdentify(): Promise<string> {
    await amplitude.groupIdentify(
      'org',
      'engineering',
      new amplitude.Identify().set('technology', 'nest.js'),
      { user_id: 'test_user' },
    ).promise;
    return 'Triggered, check console output...';
  }
}
