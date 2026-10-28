/**
 * Optional Stablepoint READ-ONLY SSH inspection.
 * Never stages files, alters applications, restarts Passenger or runs migrations.
 * Host key must already be pinned by an operator from a trusted channel.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fail(text) {throw new Error(text);}
function assert(value,msg) {if(!value)fail(msg);}
function validHost(value) {
  return typeof value==='string' && value.length<=253 && /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(value) &&
    !value.includes('..') && !value.startsWith('-');
}
function validUser(value) {return typeof value==='string' && /^[a-z_][a-z0-9_-]{0,31}$/.test(value);}
function hostToken(host,port) {return port===22?host:`[${host}]:${port}`;}
function assertKnownHosts(text,host,port) {
  const token=hostToken(host,port);
  const found=String(text).split(/\r?\n/).some(line=>{
    if(!line.trim()||line.trim().startsWith('#'))return false;
    const words=line.trim().split(/\s+/);
    return words.length>=3 && words[0].split(',').includes(token) &&
      /^(ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|ssh-rsa)$/.test(words[1]) &&
      /^[A-Za-z0-9+/=]{30,}$/.test(words[2]);
  });
  assert(found,`No explicit pinned known_hosts record for ${token}; refusing SSH`);
}
const script = `set -eu
printf 'MANATOS_INSPECT_V1\\n'
printf 'user='; id -un
printf 'home_present='; test -d "$HOME" && echo yes || echo no
printf 'manatos_root='; test -d "$HOME/manatos" && echo exists || echo absent
printf 'ssh_uapi='; command -v uapi >/dev/null 2>&1 && echo available || echo unavailable
printf 'cloudlinux_selector='; command -v cloudlinux-selector >/dev/null 2>&1 && echo available || echo unavailable
printf 'node_in_login_path='; command -v node >/dev/null 2>&1 && echo available || echo unavailable
printf 'home_available_kb='; df -Pk "$HOME" | awk 'END {print $4}'
`;
function optionsFromEnv(env) {
  const host=env.STABLEPOINT_SSH_HOST;
  const user=env.STABLEPOINT_SSH_USER;
  const port=env.STABLEPOINT_SSH_PORT?Number(env.STABLEPOINT_SSH_PORT):22;
  assert(validHost(host),'Invalid SSH host configuration');
  assert(validUser(user),'Invalid SSH user configuration');
  assert(Number.isSafeInteger(port)&&port>=1&&port<=65535,'Invalid SSH port');
  const key=env.STABLEPOINT_SSH_PRIVATE_KEY;
  const known=env.STABLEPOINT_SSH_KNOWN_HOSTS;
  assert(typeof key==='string' && /^-----BEGIN OPENSSH PRIVATE KEY-----|^-----BEGIN RSA PRIVATE KEY-----/.test(key) &&
    key.includes('PRIVATE KEY-----') && key.length>150,'Missing or unsupported SSH private key');
  assertKnownHosts(known,host,port);
  return {host,user,port,key,known};
}
function validateOutput(output,expectedUser) {
  const lines=String(output).trim().split(/\r?\n/);
  assert(lines.shift()==='MANATOS_INSPECT_V1','Unexpected SSH inspection response');
  const allowed=['user','home_present','manatos_root','ssh_uapi','cloudlinux_selector','node_in_login_path','home_available_kb'];
  const found={};
  for(const line of lines) {
    const i=line.indexOf('=');assert(i>0,'Malformed inspection response');
    const k=line.slice(0,i),v=line.slice(i+1);
    assert(allowed.includes(k) && found[k]===undefined,'Unexpected/duplicate inspection property');
    assert(/^[a-zA-Z0-9_.-]{1,60}$/.test(v),'Unsafe/unexpected inspection value');
    found[k]=v;
  }
  assert(allowed.every(k=>found[k]!==undefined),'Incomplete read-only inspection');
  assert(found.user===expectedUser,'SSH account identity mismatch');
  assert(found.home_present==='yes','Remote home directory unavailable');
  assert(['exists','absent'].includes(found.manatos_root),'Unexpected app root status');
  for(const k of ['ssh_uapi','cloudlinux_selector','node_in_login_path']) {
    assert(['available','unavailable'].includes(found[k]),`Unexpected ${k} result`);
  }
  assert(/^\d{1,15}$/.test(found.home_available_kb),'Invalid filesystem capacity response');
  return {status:'INSPECTED_READ_ONLY',accountIdentityVerified:true,
    applicationRoot:found.manatos_root, uapi:found.ssh_uapi,
    cloudlinuxSelector:found.cloudlinux_selector, nodeInLoginPath:found.node_in_login_path,
    availableDiskKiB:Number(found.home_available_kb),
    providerCommandsNotValidated:true,liveMutations:false};
}
function inspect(env,{runner=spawnSync}={}) {
  const x=optionsFromEnv(env);
  const temp=mkdtempSync(join(tmpdir(),'manatos-ssh-inspect-'));
  try {
    const keyPath=join(temp,'id_key'),knownPath=join(temp,'known_hosts');
    writeFileSync(keyPath,x.key,{mode:0o600});writeFileSync(knownPath,x.known,{mode:0o600});
    const sshArgs=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
      '-o',`UserKnownHostsFile=${knownPath}`,'-o','IdentitiesOnly=yes',
      '-o','PreferredAuthentications=publickey','-o','PasswordAuthentication=no',
      '-o','KbdInteractiveAuthentication=no','-o','ConnectTimeout=10',
      '-o','ConnectionAttempts=1','-o','RequestTTY=no','-o','ClearAllForwardings=yes',
      '-o','ForwardAgent=no','-o','LogLevel=ERROR',
      '-i',keyPath,'-p',String(x.port),`${x.user}@${x.host}`,'sh','-s'];
    const done=runner('ssh',sshArgs,{input:script,encoding:'utf8',timeout:30000,
      maxBuffer:256*1024,windowsHide:true});
    if(done.error||done.status!==0)fail(`Read-only SSH inspection failed (exit ${done.status ?? 'unknown'}); inspect host reachability, key and pinned host fingerprint`);
    return validateOutput(done.stdout,x.user);
  } finally {rmSync(temp,{recursive:true,force:true});}
}
function selfTest() {
  let checks=0;
  const key='-----BEGIN OPENSSH PRIVATE KEY-----\n'+'a'.repeat(160)+'\n-----END OPENSSH PRIVATE KEY-----';
  const known='host.example.test ssh-ed25519 '+'A'.repeat(48);
  const env={STABLEPOINT_SSH_HOST:'host.example.test',STABLEPOINT_SSH_USER:'finestre',
    STABLEPOINT_SSH_PORT:'22', STABLEPOINT_SSH_KNOWN_HOSTS:known,STABLEPOINT_SSH_PRIVATE_KEY:key};
  const output='MANATOS_INSPECT_V1\nuser=finestre\nhome_present=yes\nmanatos_root=absent\nssh_uapi=available\ncloudlinux_selector=unavailable\nnode_in_login_path=unavailable\nhome_available_kb=100000\n';
  const mock=(cmd,args,opts)=>{
    assert(cmd==='ssh' && args.includes('StrictHostKeyChecking=yes') &&
      args.includes('BatchMode=yes') && args.includes('PasswordAuthentication=no'),
    'Insecure SSH client options');
    assert(opts.input===script,'Remote script injection');
    checks++;return {status:0,stdout:output};
  };
  const info=inspect(env,{runner:mock});
  assert(info.status==='INSPECTED_READ_ONLY'&&info.availableDiskKiB===100000,'Mock inspection failed'); checks++;
  const reject=(fn,text)=>{try{fn();}catch(e){assert(e.message.includes(text),'Unexpected failure');checks++;return;}fail('Expected rejection');};
  reject(()=>inspect({...env,STABLEPOINT_SSH_HOST:'-oProxyCommand=evil'},{runner:mock}),'Invalid SSH host');
  reject(()=>inspect({...env,STABLEPOINT_SSH_USER:'bad;rm'},{runner:mock}),'Invalid SSH user');
  reject(()=>inspect({...env,STABLEPOINT_SSH_PORT:'70000'},{runner:mock}),'Invalid SSH port');
  reject(()=>inspect({...env,STABLEPOINT_SSH_KNOWN_HOSTS:'other ssh-ed25519 '+'A'.repeat(40)},{runner:mock}),'No explicit pinned');
  reject(()=>inspect({...env,STABLEPOINT_SSH_PRIVATE_KEY:''},{runner:mock}),'Missing or unsupported');
  reject(()=>validateOutput(output.replace('user=finestre','user=intruder'),'finestre'),'identity mismatch');
  reject(()=>validateOutput(output+'extra=secret\n','finestre'),'Unexpected/duplicate');
  reject(()=>inspect(env,{runner:()=>({status:255,stdout:'',stderr:'private diagnostic'})}),'Read-only SSH inspection failed');
  assert(!script.includes('restart.txt') && !script.includes('rm -') && !script.includes('ln -'),
    'Read-only script contains mutation'); checks++;
  console.log(`Stablepoint read-only SSH self-test PASS: ${checks} checks; host-key pinning, account identity, injection prevention, no live mutations.`);
}
try {
  const args=process.argv.slice(2);
  if(args.length!==1)fail('Usage: node stablepoint-inspect.mjs --self-test | --inspect');
  if(args[0]==='--self-test')selfTest();
  else if(args[0]==='--inspect')console.log(JSON.stringify(inspect(process.env),null,2));
  else fail('Unsupported operation; no remote deployment supported');
} catch(e) {console.error(`Stablepoint SSH ERROR: ${e.message}`); process.exitCode=1;}
