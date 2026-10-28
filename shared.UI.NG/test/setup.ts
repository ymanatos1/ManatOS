import '@angular/compiler';

import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach } from 'vitest';

TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

afterEach(() => {
  TestBed.resetTestingModule();
});
