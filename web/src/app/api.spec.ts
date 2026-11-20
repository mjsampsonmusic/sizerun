import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the Idempotency-Key with every order', () => {
    api.placeOrder('IND01', [{ sku: 'RUN1-NVY-095', quantity: 2 }], 'key-123').subscribe();

    const request = http.expectOne('/api/orders');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('key-123');
    expect(request.request.body).toEqual({ storeCode: 'IND01', lines: [{ sku: 'RUN1-NVY-095', quantity: 2 }] });
    request.flush({});
  });

  it('asks for the recent orders of one store', () => {
    api.orders('CHI01').subscribe();

    const request = http.expectOne((req) => req.url === '/api/orders');
    expect(request.request.params.get('store')).toBe('CHI01');
    expect(request.request.params.get('limit')).toBe('8');
    request.flush([]);
  });
});
