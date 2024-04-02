import * as amplitude from '@amplitude/analytics-browser';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

amplitude.init('API_KEY').promise.then(function () {
  console.log('Amplitude initialized');
});

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
