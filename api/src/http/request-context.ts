import {randomUUID} from 'node:crypto';import type {RequestHandler} from 'express';import {operationContext} from '@manatos/shared';
export const requestContextMiddleware:RequestHandler=(req,res,next)=>{const id=req.header('x-request-id')||randomUUID();res.setHeader('x-request-id',id);operationContext.runRequest(id,()=>next());};
