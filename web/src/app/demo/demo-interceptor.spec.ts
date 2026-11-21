import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api';
import { demoInterceptor } from './demo-interceptor';

describe('demoInterceptor', () => {
  let api: ApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([demoInterceptor]))] });
    api = TestBed.inject(ApiService);
  });

  it('answers the app API calls in the browser, with no network', async () => {
    const stores = await firstValueFrom(api.stores());

    expect(stores.map((store) => store.code)).toEqual(['CHI01', 'IND01', 'NYC01']);
  });

  it('turns a rejected order into the same HTTP error the order service sends', async () => {
    const error = await firstValueFrom(
      api.placeOrder('IND01', [{ sku: 'RUN1-NVY-095', quantity: 9 }], 'key-9'),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(409);
    expect((error as HttpErrorResponse).error.status).toBe('REJECTED');
  });
});
