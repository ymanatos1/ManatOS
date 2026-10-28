import '@angular/compiler';

import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { TestBed } from '@angular/core/testing';

// Browser component tests still initialize Angular as before. Server-only
// tests execute in the Node environment and must not initialize the DOM TestBed.
if (typeof document !== 'undefined') {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
}
