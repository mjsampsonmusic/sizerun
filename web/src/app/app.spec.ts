import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { ApiService } from './api';
import { Shop } from './shop';
import { fakeApi } from './testing';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let page: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: ApiService, useValue: fakeApi() }],
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    await TestBed.inject(Shop).init();
    await fixture.whenStable();
    page = fixture.nativeElement as HTMLElement;
  });

  it('shows every size with its stock and disables sold-out sizes', () => {
    expect(page.querySelector('h3')?.textContent).toContain('Tempo Runner');
    const sizes = Array.from(page.querySelectorAll<HTMLButtonElement>('button.size'));
    expect(sizes.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Size 9.5, 3 left',
      'Size 10, sold out',
    ]);
    expect(sizes[1].disabled).toBe(true);
  });

  it('adds a pair to the order when a size is tapped', async () => {
    page.querySelector<HTMLButtonElement>('button.size')!.click();
    await fixture.whenStable();

    const line = page.querySelector('.line');
    expect(line?.querySelector('.line-name')?.textContent).toContain('Tempo Runner');
    expect(line?.textContent).toContain('Size 9.5 · Midnight Navy');
    expect(page.querySelector('.total strong')?.textContent).toContain('$130.00');
  });
});
