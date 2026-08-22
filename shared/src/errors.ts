export interface OperationContextValueSnapshot { name:string; value:unknown; sensitive:boolean; }
export interface OperationNodeSnapshot {
 id:string; description:string; userDescription?:string; status:'running'|'completed'|'failed'|'cancelled';
 startedAt:string; completedAt?:string; durationMs?:number; comments:OperationContextValueSnapshot[]; children:OperationNodeSnapshot[]; errorCode?:string; errorMessage?:string;
}
/** Transport-neutral application error; HTTP mapping is deliberately outside services. */
export class AppError extends Error {
 operationTrace?:OperationNodeSnapshot[];
 constructor(public readonly code:string,message:string,public readonly userMessage:string,public readonly retryable=false,options?:{cause?:unknown}){super(message,{cause:options?.cause});this.name=new.target.name;}
}
export class NotFoundError extends AppError { constructor(entity:string,id:string){super('NOT_FOUND',`${entity} '${id}' was not found.`,`The requested ${entity} could not be found.`);} }
export class ConflictError extends AppError { constructor(code:string,dev:string,user:string){super(code,dev,user,false);} }
export class ValidationAppError extends AppError { constructor(msg:string,user=msg){super('VALIDATION_ERROR',msg,user,false);} }
export class AuthenticationError extends AppError { constructor(){super('INVALID_CREDENTIALS','Invalid email/user-name or password.','Invalid email/user-name or password.',true);} }
export class ForbiddenAppError extends AppError { constructor(msg='Forbidden.'){super('FORBIDDEN',msg,'You are not authorized to perform this operation.');} }
export class StorageAppError extends AppError { constructor(msg:string,cause?:unknown){super('STORAGE_ERROR',msg,'The application could not persist the requested changes.',true,{cause});} }
