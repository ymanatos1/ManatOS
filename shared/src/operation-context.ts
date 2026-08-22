import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { AppError, type OperationNodeSnapshot } from './errors.js';
type Status='running'|'completed'|'failed'|'cancelled';
interface Node {id:string;description:string;userDescription?:string;status:Status;startedAt:Date;completedAt?:Date;comments:{name:string;value:unknown;sensitive:boolean}[];children:Node[];errorCode?:string;errorMessage?:string;}
interface Store {requestId:string;root?:Node;active:Node[];}
export class OperationScope {
 static sensitive=/(password|hash|token|secret|authorization|cookie|session|api[-_]?key)/i;
 constructor(private node:Node){}
 comment(name:string,value:unknown,sensitive=false){const mask=sensitive||OperationScope.sensitive.test(name);this.node.comments.push({name,value:mask?'********':value,sensitive:mask});}
 addContext(values:Record<string,unknown>){for(const [k,v] of Object.entries(values))this.comment(k,v);}
}
/** Nested semantic tracing: successful children are pruned; failed branches remain complete. */
export class OperationContext {
 private als=new AsyncLocalStorage<Store>();
 runRequest<T>(requestId:string,fn:()=>T):T{return this.als.run({requestId,active:[]},fn);}
 getRequestId(){return this.als.getStore()?.requestId??randomUUID();}
 async runRoot<T>(description:string,fn:(s:OperationScope)=>Promise<T>,userDescription?:string):Promise<T>{if(!this.als.getStore())return this.als.run({requestId:randomUUID(),active:[]},()=>this.runRoot(description,fn,userDescription));const st=this.store();const node=this.node(description,userDescription);st.root=node;try{return await this.exec(node,fn);}catch(e){const err=this.toAppError(e);err.operationTrace??=[this.snap(node)];throw err;}finally{st.root=undefined;st.active=[];}}
 async run<T>(description:string,fn:(s:OperationScope)=>Promise<T>,userDescription?:string):Promise<T>{if(!this.als.getStore())return this.als.run({requestId:randomUUID(),active:[]},()=>this.runRoot(description,fn,userDescription));const st=this.store();const node=this.node(description,userDescription);st.active.at(-1)?.children.push(node);return this.exec(node,fn);}
 private async exec<T>(node:Node,fn:(s:OperationScope)=>Promise<T>):Promise<T>{const st=this.store();st.active.push(node);try{const r=await fn(new OperationScope(node));node.status='completed';node.completedAt=new Date();node.children=[];return r;}catch(e){node.status='failed';node.completedAt=new Date();if(e instanceof AppError){node.errorCode=e.code;node.errorMessage=e.message;}else if(e instanceof Error){node.errorCode='UNEXPECTED_ERROR';node.errorMessage=e.message;}throw e;}finally{st.active.pop();}}
 private node(description:string,userDescription?:string):Node{return{id:randomUUID(),description,...(userDescription?{userDescription}:{}),status:'running',startedAt:new Date(),comments:[],children:[]};}
 private snap(n:Node):OperationNodeSnapshot{const c=n.completedAt;return{id:n.id,description:n.description,...(n.userDescription?{userDescription:n.userDescription}:{}),status:n.status,startedAt:n.startedAt.toISOString(),...(c?{completedAt:c.toISOString(),durationMs:c.getTime()-n.startedAt.getTime()}:{}),comments:n.comments.map(x=>({...x})),children:n.children.map(x=>this.snap(x)),...(n.errorCode?{errorCode:n.errorCode}:{}),...(n.errorMessage?{errorMessage:n.errorMessage}:{})};}
 private toAppError(e:unknown){return e instanceof AppError?e:new AppError('UNEXPECTED_ERROR',e instanceof Error?e.message:String(e),'An unexpected application error occurred.',true,{cause:e});}
 private store(){const s=this.als.getStore();if(!s)throw new Error('OperationContext requires request middleware.');return s;}
}
export const operationContext=new OperationContext();
