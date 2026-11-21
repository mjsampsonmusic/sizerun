import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { environment } from '../environments/environment';
import { demoInterceptor } from './demo/demo-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // The GitHub Pages demo answers API calls in the browser; every other build calls the real services.
    provideHttpClient(withFetch(), withInterceptors(environment.demo ? [demoInterceptor] : [])),
  ],
};
