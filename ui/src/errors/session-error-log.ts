import type { Request } from 'express';
import { operationContext, type AppError, type OperationNodeSnapshot } from '@manatos/shared';
import { config } from '../config.js';
export interface SessionErrorEntry {
  timestamp: string;
  requestId: string;
  errorCode: string;
  userMessage: string;
  developerMessage: string;
  retryable: boolean;
  operationTrace?: OperationNodeSnapshot[];
  technicalStack?: string;
}
export function addSessionError(req: Request, e: AppError): SessionErrorEntry {
  const x: SessionErrorEntry = {
    timestamp: new Date().toISOString(),
    requestId: operationContext.getRequestId(),
    errorCode: e.code,
    userMessage: e.userMessage,
    developerMessage: e.message,
    retryable: e.retryable,
    ...(e.operationTrace ? { operationTrace: e.operationTrace } : {}),
    ...(config.SHOW_TECHNICAL_ERROR_DETAILS && e.stack ? { technicalStack: e.stack } : {}),
  };
  const a = req.session.errorLog ?? [];
  a.unshift(x);
  req.session.errorLog = a.slice(0, config.SESSION_ERROR_LOG_MAX_ENTRIES);
  return x;
}
