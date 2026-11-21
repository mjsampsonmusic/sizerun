import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { mergeMap, of, throwError, timer } from 'rxjs';
import { DemoBackend } from './demo-backend';

/** A short pause, so the demo feels like a real network call. */
const LATENCY_MS = 250;

/**
 * Demo build only: answers the app's /api calls from DemoBackend instead of the network, with the
 * same status codes and bodies the real services send. The rest of the app does not know.
 */
export const demoInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) {
    return next(request);
  }
  const { status, body } = inject(DemoBackend).handle(
    request.method,
    request.url,
    request.params,
    request.headers.get('Idempotency-Key'),
    request.body,
  );
  return timer(LATENCY_MS).pipe(
    mergeMap(() =>
      status < 400
        ? of(new HttpResponse({ status, body, url: request.url }))
        : throwError(() => new HttpErrorResponse({ status, error: body, url: request.url })),
    ),
  );
};
