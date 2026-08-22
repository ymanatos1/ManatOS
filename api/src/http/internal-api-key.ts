import type {RequestHandler} from 'express';import {ForbiddenAppError} from '@manatos/shared';import {config} from '../config.js';
export const requireInternalApiKey:RequestHandler=(req,_res,next)=>{if(req.header('x-internal-api-key')!==config.INTERNAL_API_KEY){next(new ForbiddenAppError('Missing or invalid internal API key.'));return;}next();};
