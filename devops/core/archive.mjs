/** Portable, deterministic, regular-files-only USTAR+gzip archive engine.
 * Shared by Windows CMD and GitHub Linux adapters; no tar/gzip binary required.
 * Strict parser validates all headers, sizes, checksums and file paths.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, closeSync, readSync, writeSync, readdirSync, statSync,
  rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';

const BLOCK=512;
const CHUNK=64*1024;
const MAX_ARCHIVE_BYTES=1024*1024*1024;
const MAX_FILE_BYTES=512*1024*1024;
const MAX_FILES=50000;
function reject(message) { throw new Error(`Archive integrity: ${message}`); }
function safeName(path) {
  if (typeof path!=='string' || !path || path.includes('\\') || path.startsWith('/') ||
      /^[a-zA-Z]:/.test(path) || path.split('/').some(x=>!x||x==='.'||x==='..') ||
      /[\x00-\x1f\x7f]/.test(path)) reject('Unsafe entry path');
  return path;
}
function nameFields(path) {
  safeName(path);
  const parts=path.split('/');
  const name=parts.pop();
  const prefix=parts.join('/');
  if (Buffer.byteLength(name)>100 || Buffer.byteLength(prefix)>155 || Buffer.byteLength(path)>255) {
    reject(`Path too long for deterministic USTAR: ${path}`);
  }
  return {name,prefix};
}
function octal(buf,offset,length,num) {
  const s=num.toString(8).padStart(length-1,'0');
  if(s.length>length-1)reject('USTAR numeric overflow');
  buf.write(s+'\0',offset,length,'ascii');
}
function header(path,size) {
  const {name,prefix}=nameFields(path);
  const b=Buffer.alloc(BLOCK,0);
  b.write(name,0,100,'utf8');
  octal(b,100,8,0o644); octal(b,108,8,0); octal(b,116,8,0);
  octal(b,124,12,size); octal(b,136,12,0);
  b.fill(0x20,148,156);b.write('0',156,1,'ascii');
  b.write('ustar\0',257,6,'ascii');b.write('00',263,2,'ascii');
  b.write(prefix,345,155,'utf8');
  const checksum=b.reduce((sum,v)=>sum+v,0);
  octal(b,148,8,checksum);
  return b;
}
function collectFiles(dir) {
  const root=resolve(dir), found=[];
  function walk(abs,parts) {
    for(const item of readdirSync(abs,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
      const p=join(abs,item.name), path=[...parts,item.name].join('/');
      const info=lstatSync(p);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) reject(`Non-regular archive entry: ${path}`);
      if (info.isDirectory()) walk(p,[...parts,item.name]);
      else {safeName(path);nameFields(path); if(info.size>MAX_FILE_BYTES)reject('File exceeds archive size limit');found.push({path,abs:p,size:info.size});}
      if(found.length>MAX_FILES)reject('Too many archive entries');
    }
  }
  walk(root,[]);
  if(!found.length)reject('No regular files to archive');
  return found;
}
export async function createDeterministicArchive(sourceDir,destination) {
  const files=collectFiles(sourceDir);
  const temp=mkdtempSync(join(tmpdir(),'manatos-portable-tar-'));
  const tar=join(temp,'data.tar');
  let fd;
  try {
    fd=openSync(tar,'wx',0o600);
    const copy=Buffer.alloc(CHUNK);
    const pad=Buffer.alloc(BLOCK,0);
    for(const file of files) {
      writeSync(fd,header(file.path,file.size));
      const input=openSync(file.abs,'r');
      try {let rest=file.size;while(rest>0){const n=readSync(input,copy,0,Math.min(CHUNK,rest),null);if(n<=0)reject('Source changed during archive creation');writeSync(fd,copy,0,n);rest-=n;}}finally{closeSync(input);}
      if(file.size%BLOCK)writeSync(fd,pad,0,BLOCK-(file.size%BLOCK));
      if(statSync(file.abs).size!==file.size)reject('Source changed during archive creation');
    }
    writeSync(fd,Buffer.alloc(BLOCK*2));
    closeSync(fd);fd=undefined;
    const dest=resolve(destination);
    mkdirSync(dirname(dest),{recursive:true});
    if(existsSync(dest))reject('Refusing to overwrite existing archive');
    await pipeline(createReadStream(tar),createGzip({level:9,mtime:0}),createWriteStream(dest,{flags:'wx',mode:0o600}));
    return files.map(x=>x.path);
  } finally {if(fd!==undefined)closeSync(fd);rmSync(temp,{recursive:true,force:true});}
}
function octalRead(buf,offset,length) {
  const bytes=buf.subarray(offset,offset+length);
  const s=bytes.toString('ascii').replace(/\0.*$/s,'').trim();
  if(!/^[0-7]+$/.test(s))reject('Invalid TAR numeric field');
  const n=Number.parseInt(s,8);
  if(!Number.isSafeInteger(n)||n<0)reject('Invalid TAR numeric size');
  return n;
}
function nullTerm(buf,offset,length) {
  const bytes=buf.subarray(offset,offset+length);
  const n=bytes.indexOf(0);
  return bytes.subarray(0,n<0?bytes.length:n).toString('utf8');
}
export async function inspectDeterministicArchive(source) {
  const archive=resolve(source);
  if(statSync(archive).size>MAX_ARCHIVE_BYTES)reject('Compressed archive too large');
  const temp=mkdtempSync(join(tmpdir(),'manatos-inspect-tar-'));
  const tar=join(temp,'decoded.tar');
  try {
    let expanded=0;
    const gunzip=createGunzip();
    gunzip.on('data',chunk=>{expanded+=chunk.length;if(expanded>MAX_ARCHIVE_BYTES)gunzip.destroy(new Error('Decompressed archive too large'));});
    await pipeline(createReadStream(archive),gunzip,createWriteStream(tar,{flags:'wx',mode:0o600}));
    const bytes=statSync(tar).size;
    const fd=openSync(tar,'r');
    const entries=new Map();
    const block=Buffer.alloc(BLOCK), buffer=Buffer.alloc(CHUNK);
    let position=0, ended=false;
    try {
      while(position+BLOCK<=bytes) {
        readSync(fd,block,0,BLOCK,position);position+=BLOCK;
        if(block.every(x=>x===0)) {
          if(position+BLOCK>bytes)reject('Missing TAR EOF marker');
          const tail=Buffer.alloc(Math.min(CHUNK,bytes-position));
          for(let p=position;p<bytes;p+=tail.length){const n=readSync(fd,tail,0,Math.min(tail.length,bytes-p),p);if(n<=0||tail.subarray(0,n).some(v=>v!==0))reject('Nonzero bytes after TAR EOF');}
          ended=true;break;
        }
        if(nullTerm(block,257,6)!=='ustar')reject('Not USTAR archive');
        const stored=octalRead(block,148,8);
        const copy=Buffer.from(block);copy.fill(0x20,148,156);
        if(copy.reduce((n,v)=>n+v,0)!==stored)reject('TAR header checksum mismatch');
        if(block[156]!==48 && block[156]!==0)reject('Symlinks/directories/special members prohibited');
        if(octalRead(block,136,12)!==0||octalRead(block,108,8)!==0||octalRead(block,116,8)!==0)reject('Non-reproducible TAR metadata');
        const name=nullTerm(block,0,100),prefix=nullTerm(block,345,155);
        const rel=safeName(prefix?`${prefix}/${name}`:name);
        if(entries.has(rel))reject('Duplicate archive entry');
        const size=octalRead(block,124,12);
        if(size>MAX_FILE_BYTES||position+size>bytes)reject('TAR file size overflow');
        const hash=createHash('sha256');
        let remain=size;
        while(remain>0){const n=readSync(fd,buffer,0,Math.min(remain,CHUNK),position);if(n<=0)reject('Truncated TAR entry');hash.update(buffer.subarray(0,n));position+=n;remain-=n;}
        position+=((BLOCK-size%BLOCK)%BLOCK);
        if(position>bytes)reject('TAR padding overflow');
        if(rel==='release-manifest.json' && size<=1024*1024){const payload=Buffer.alloc(size);readSync(fd,payload,0,size,position-((BLOCK-size%BLOCK)%BLOCK)-size);entries.set(rel,{size,sha256:hash.digest('hex'),content:payload.toString('utf8')});}
        else entries.set(rel,{size,sha256:hash.digest('hex')});
        if(entries.size>MAX_FILES)reject('Too many TAR entries');
      }
    } finally {closeSync(fd);}
    if(!ended)reject('Missing TAR EOF');
    return entries;
  } finally {rmSync(temp,{recursive:true,force:true});}
}
