import {
  ConflictError,
  sysConfigurationsMetadata,
  type SysBOCreateInput,
  type SysBOUpdateInput,
  type SysConfiguration,
  type SysConfigurationValueType,
} from '@manatos/shared';
import type { AuditActor } from '../audit/audit-service.js';
import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';
import { SecretsEncryptionService } from '../security/secrets-encryption-service.js';
import { GenericSysBOService } from './generic-sysbo-service.js';
import { setRuntimeConfiguration } from '../runtime-configuration.js';

export interface ConfigurationDefinition {
  name: string; group: string; description: string; valueType: SysConfigurationValueType;
  envValue: string | number | boolean | undefined; defaultValue?: string; allowedValues?: string[];
  sensitive?: boolean; restartRequired?: boolean;
}

export const CONFIGURATION_DEFINITIONS: ConfigurationDefinition[] = [
  { name:'UI_PAGE_SIZE_OPTIONS', group:'UI', description:'Page-size choices offered by SysBO list pages.', valueType:'string', envValue:process.env.UI_PAGE_SIZE_OPTIONS, defaultValue:'2,5,10,20,50,100' },
  { name:'UI_DEFAULT_PAGE_SIZE', group:'UI', description:'Default number of rows displayed on SysBO list pages.', valueType:'number', envValue:process.env.UI_DEFAULT_PAGE_SIZE, defaultValue:'10' },
  { name:'DONATIONS_SHOW', group:'Donations', description:'Show the global Donate action in the ManatOS header. The action remains disabled until donation processing is configured.', valueType:'boolean', envValue:process.env.DONATIONS_SHOW, defaultValue:'false' },
  { name:'SHOW_TECHNICAL_ERROR_DETAILS', group:'Errors & diagnostics', description:'Show technical diagnostic details in UI error dialogs.', valueType:'boolean', envValue:process.env.SHOW_TECHNICAL_ERROR_DETAILS, defaultValue:'false' },
  { name:'SESSION_ERROR_LOG_MAX_ENTRIES', group:'Sessions', description:'Maximum recent session errors retained for diagnostics.', valueType:'number', envValue:process.env.SESSION_ERROR_LOG_MAX_ENTRIES, defaultValue:'20' },
  { name:'API_DEFAULT_PAGE_SIZE', group:'API', description:'Default page size used by generic API list operations.', valueType:'number', envValue:process.env.API_DEFAULT_PAGE_SIZE, defaultValue:'10' },
  { name:'API_MAX_PAGE_SIZE', group:'API', description:'Maximum page size accepted by generic API list operations.', valueType:'number', envValue:process.env.API_MAX_PAGE_SIZE, defaultValue:'500' },
  { name:'API_ERROR_DETAIL_LEVEL', group:'Errors & diagnostics', description:'Diagnostic detail returned by API failures.', valueType:'enum', envValue:process.env.API_ERROR_DETAIL_LEVEL, defaultValue:'basic', allowedValues:['none','basic','operations','full'] },
  { name:'LOG_CONSOLE_MIN_LEVEL', group:'Logging', description:'Minimum severity written to the API console.', valueType:'enum', envValue:process.env.LOG_CONSOLE_MIN_LEVEL, defaultValue:'info', allowedValues:['debug','info','warn','error','fatal'] },
  { name:'MAIL_ENABLED', group:'Mail', description:'Enable SMTP email delivery.', valueType:'boolean', envValue:process.env.MAIL_ENABLED, defaultValue:'false', restartRequired:true },
  { name:'MAIL_FROM_ADDRESS', group:'Mail', description:'Sender email address used for application messages.', valueType:'string', envValue:process.env.MAIL_FROM_ADDRESS, restartRequired:true },
  { name:'MAIL_FROM_NAME', group:'Mail', description:'Friendly sender name used for application messages.', valueType:'string', envValue:process.env.MAIL_FROM_NAME, defaultValue:'ManatOS', restartRequired:true },
  { name:'SMTP_HOST', group:'Mail', description:'SMTP server host name.', valueType:'string', envValue:process.env.SMTP_HOST, restartRequired:true },
  { name:'SMTP_PORT', group:'Mail', description:'SMTP server TCP port.', valueType:'number', envValue:process.env.SMTP_PORT, defaultValue:'465', restartRequired:true },
  { name:'SMTP_SECURE', group:'Mail', description:'Use implicit TLS for the SMTP connection.', valueType:'boolean', envValue:process.env.SMTP_SECURE, defaultValue:'true', restartRequired:true },
  { name:'SMTP_USER', group:'Mail', description:'SMTP account/user name.', valueType:'string', envValue:process.env.SMTP_USER, restartRequired:true },
  { name:'SMTP_PASSWORD', group:'Mail', description:'SMTP password. Stored encrypted and never returned to clients.', valueType:'secret', envValue:process.env.SMTP_PASSWORD, sensitive:true, restartRequired:true },
  { name:'SMTP_TLS_REJECT_UNAUTHORIZED', group:'Mail', description:'Reject SMTP TLS certificates that cannot be validated.', valueType:'boolean', envValue:process.env.SMTP_TLS_REJECT_UNAUTHORIZED, defaultValue:'true', restartRequired:true },
];

const seedActor: AuditActor = { userId:'system', userName:'System', source:'system' };

export class SysConfigurationService extends GenericSysBOService<SysConfiguration> {
  constructor(store: InMemoryDataStore, private readonly encryption: SecretsEncryptionService) {
    super(store, store.sysConfigurations, sysConfigurationsMetadata);
  }

  async seedMissing(): Promise<void> {
    for (const def of CONFIGURATION_DEFINITIONS) {
      const existing = (await this.list({ page:1, pageSize:1000, direction:'asc', filters:{ name:def.name } })).items[0];
      if (existing) continue;
      const raw = def.envValue === undefined ? def.defaultValue : String(def.envValue);
      const input: SysBOCreateInput<SysConfiguration> = {
        name:def.name, value:def.sensitive ? null : (raw ?? null),
        ...(def.sensitive && raw ? { valueEncrypted:this.encryption.encrypt(raw) } : {}),
        group:def.group, description:def.description, valueType:def.valueType,
        ...(def.allowedValues ? { allowedValues:def.allowedValues } : {}), defaultValue:def.defaultValue ?? null,
        restartRequired:Boolean(def.restartRequired), editable:true, sensitive:Boolean(def.sensitive), enabled:true,
      };
      const created = await super.create(input, seedActor);
      if (!created.sensitive && created.value != null) setRuntimeConfiguration(created.name, created.value);
    }
  }

  async bindRuntime(): Promise<void> {
    const r=await this.list({page:1,pageSize:1000,direction:'asc',filters:{}});
    for (const item of r.items) if (!item.sensitive && item.value != null) setRuntimeConfiguration(item.name,item.value);
  }
  async safeList() { const r=await this.list({page:1,pageSize:1000,direction:'asc',filters:{}}); return r.items.map(x=>this.project(x)); }
  async resolve(name:string): Promise<string|undefined> {
    const item=(await this.list({page:1,pageSize:1000,direction:'asc',filters:{name}})).items[0];
    if (!item || !item.enabled) return undefined;
    if (item.sensitive) return item.valueEncrypted ? this.encryption.decrypt(item.valueEncrypted) : undefined;
    return item.value ?? undefined;
  }
  async setValue(id:string, value:string|null, actor:AuditActor) {
    const item=await this.get(id); if(!item) throw new ConflictError('CONFIGURATION_NOT_FOUND','Configuration not found.','The configuration setting no longer exists.');
    if(!item.editable) throw new ConflictError('CONFIGURATION_READ_ONLY','Configuration is read-only.','This setting cannot be changed here.');
    if (item.sensitive && !value) return this.project(item);
    this.validate(item,value);
    const changes:SysBOUpdateInput<SysConfiguration>= item.sensitive
      ? { value:null, valueEncrypted:value ? this.encryption.encrypt(value) : null }
      : { value, valueEncrypted:null };
    const updated=await super.update(id,changes,actor);
    if (!updated.sensitive) setRuntimeConfiguration(updated.name, updated.value ?? undefined);
    return this.project(updated);
  }
  private validate(item:SysConfiguration,value:string|null){
    if(value===null || value==='') return;
    if(item.valueType==='number' && (!Number.isFinite(Number(value)) || Number(value)<=0)) throw new ConflictError('INVALID_CONFIGURATION_VALUE','Invalid configuration value.','Enter a positive number.');
    if(item.valueType==='boolean' && !['true','false'].includes(value)) throw new ConflictError('INVALID_CONFIGURATION_VALUE','Invalid configuration value.','Choose true or false.');
    if(item.valueType==='enum' && item.allowedValues && !item.allowedValues.includes(value)) throw new ConflictError('INVALID_CONFIGURATION_VALUE','Invalid configuration value.',`Choose one of: ${item.allowedValues.join(', ')}.`);
  }
  private project(item:SysConfiguration){ const {valueEncrypted,...safe}=item; return {...safe, value:item.sensitive?null:item.value, secretConfigured:Boolean(item.sensitive && valueEncrypted)}; }
}
