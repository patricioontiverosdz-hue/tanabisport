// Read-only client preparation. Never writes to Supabase or reads server secrets.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validatePortfolioJpeg,normalizePortfolioJpeg} from './functions/tsi-guest-access/portfolio.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const HOST='tantlgswituiwkxfgmsr.supabase.co';
function sql(value){return "'"+String(value).replaceAll("'","''")+"'";}
export function readRows(input){
 if(Array.isArray(input))return input;
 if(Array.isArray(input?.rows))return input.rows;
 if(Array.isArray(input?.content))for(const block of input.content)if(block.type==='text'){
  let data;try{data=JSON.parse(block.text);}catch{continue;}
  if(typeof data.result==='string'){
   const match=data.result.match(/^<untrusted-data-[^>]+>\s*\n([\s\S]*?)\n<\/untrusted-data-/m);
   if(match){const rows=JSON.parse(match[1]);if(Array.isArray(rows))return rows;}
  }
 }
 throw Error('Expected MCP portfolio rows, not credentials or a server URL.');
}
export function exifOrientation(bytes){
 let at=2;
 while(at<bytes.length-2){
  if(bytes[at]!==255)throw Error('Malformed JPEG marker');const marker=bytes[at+1],size=bytes.readUInt16BE(at+2);if(marker===0xda)break;
  if(size<2||at+2+size>bytes.length)throw Error('Malformed JPEG segment');
  if(marker===0xe1&&bytes.subarray(at+4,at+10).equals(Buffer.from([69,120,105,102,0,0]))){
   const t=at+10,end=at+2+size;if(t+8>end)throw Error('Malformed EXIF TIFF');const order=bytes.subarray(t,t+2).toString(),little=order==='II';if(!little&&order!=='MM')throw Error('Malformed EXIF byte order');
   const u16=o=>{if(o+2>end)throw Error('Truncated EXIF');return little?bytes.readUInt16LE(o):bytes.readUInt16BE(o);},u32=o=>{if(o+4>end)throw Error('Truncated EXIF');return little?bytes.readUInt32LE(o):bytes.readUInt32BE(o);};
   if(u16(t+2)!==42)throw Error('Malformed EXIF header');const ifd=t+u32(t+4),count=u16(ifd);if(count>1024||ifd+2+12*count>end)throw Error('Malformed EXIF directory');
   for(let n=0;n<count;n++){const pos=ifd+2+12*n;if(u16(pos)===0x112){if(u16(pos+2)!==3||u32(pos+4)!==1)throw Error('Malformed EXIF Orientation');return u16(pos+8);}}
  }
  at+=2+size;
 }
 return 1;
}
export async function prepareLegacyRows(input,{fetcher=fetch}={}){
 const rows=readRows(input),seen=new Set(),out=[];
 for(const [index,row]of rows.entries()){
  if(typeof row?.id!=='string'||!row.id||row.id.length>160||seen.has(row.id))throw Error('Invalid/repeated legacy ID at row '+index);seen.add(row.id);
  const data=row.data;if(typeof data?.title!=='string'||!data.title.trim()||data.title.trim().length>80||typeof data.path!=='string')throw Error('Legacy title/path needs review at row '+index);
  const parts=data.path.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||!/^[-a-zA-Z0-9_.]+$/.test(p)))throw Error('Unsafe legacy object path at row '+index);
  let url;try{url=new URL(data.url);}catch{throw Error('Invalid legacy URL at row '+index);}
  const expected='/storage/v1/object/public/portafolio/'+parts.map(encodeURIComponent).join('/');
  if(url.protocol!=='https:'||url.hostname!==HOST||url.port||url.username||url.password||url.search||url.hash||url.pathname!==expected)throw Error('Unexpected legacy source at row '+index);
  const response=await fetcher(url.href,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Legacy photo unavailable at row '+index+' ('+response.status+')');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>1125000){await reader.cancel();throw Error('Legacy JPEG exceeds inline limit at row '+index);}chunks.push(value);}}finally{reader.releaseLock();}
  const source=Buffer.concat(chunks),orientation=exifOrientation(source);if(orientation!==1)throw Error('Legacy EXIF orientation needs review at row '+index+' (orientation '+orientation+')');
  const original='data:image/jpeg;base64,'+source.toString('base64');
  const image=normalizePortfolioJpeg(original,{maxLength:1500000}),bytes=Buffer.from(image.split(',')[1],'base64'),dimensions=validatePortfolioJpeg(image,{maxLength:1500000});
  const sourceHash=crypto.createHash('sha256').update(source).digest('hex'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  const statement='begin;\nset local role service_role;\nselect public.tsi230_import_legacy_portfolio('+sql(row.id)+','+sql(image)+','+sql(hash)+','+sql(sourceHash)+');\ncommit;\n';
  out.push({index,source_id_sha256:crypto.createHash('sha256').update(row.id).digest('hex'),source_image_sha256:sourceHash,image_sha256:hash,orientation,bytes:bytes.length,width:dimensions.width,height:dimensions.height,sql:statement});
 }
 return out;
}
async function main(){
 const inputArg=process.argv.indexOf('--input'),outArg=process.argv.indexOf('--out');
 if(inputArg<0)throw Error('Use --input test-results/prod230-launch/legacy-rows.json [--out test-results/prod230-launch/legacy-spool].');
 const inputPath=path.resolve(process.argv[inputArg+1]),outPath=path.resolve(outArg<0?path.join(ROOT,'test-results/prod230-launch/legacy-spool'):process.argv[outArg+1]);
 const ignored=path.resolve(ROOT,'test-results')+path.sep;if(!inputPath.startsWith(ignored)||!outPath.startsWith(ignored))throw Error('Input/output must remain in ignored test-results.');
 const prepared=await prepareLegacyRows(JSON.parse(await fs.readFile(inputPath,'utf8')));await fs.mkdir(outPath,{recursive:true});
 const report=[];
 for(const item of prepared){
  const name=String(item.index+1).padStart(3,'0')+'-'+item.source_id_sha256.slice(0,12)+'.sql';
  await fs.writeFile(path.join(outPath,name),item.sql);const{sql:ignoredSql,...metadata}=item;report.push({...metadata,sql_file:name});
 }
 await fs.writeFile(path.join(outPath,'manifest.json'),JSON.stringify({project_id:'tantlgswituiwkxfgmsr',count:report.length,photos:report,contains_customer_media:true,git_ignored:true},null,2)+'\n');
 console.log(JSON.stringify({validated:report.length,bytes:report.reduce((n,p)=>n+p.bytes,0),output:'ignored launch spool',remote_writes:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
