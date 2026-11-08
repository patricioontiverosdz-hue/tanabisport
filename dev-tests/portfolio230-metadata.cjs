// Real JPEG bytes and handler transport; synthetic metadata only, no network.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
async function main(){
 const {normalizePortfolioJpeg,validatePortfolioJpeg}=await import('../supabase/functions/tsi-guest-access/portfolio.mjs');
 const {createHandler}=await import('../supabase/functions/tsi-guest-access/handler.mjs');
 const jpeg=fs.readFileSync(path.join(root,'staging/photo-game-scenes/soccer-celebration.jpg'));
 const encode=b=>'data:image/jpeg;base64,'+b.toString('base64'),decode=s=>Buffer.from(s.split(',')[1],'base64');
 function segment(marker,payload){const head=Buffer.alloc(4);head[0]=255;head[1]=marker;head.writeUInt16BE(payload.length+2,2);return Buffer.concat([head,payload]);}
 function inject(...parts){return Buffer.concat([jpeg.subarray(0,2),...parts,jpeg.subarray(2)]);}
 function segments(bytes){const parts=[];let at=2;while(at<bytes.length-2){const marker=bytes[at+1],length=bytes.readUInt16BE(at+2),end=at+2+length;if(marker===0xda){parts.push({marker,bytes:bytes.subarray(at)});break;}parts.push({marker,bytes:bytes.subarray(at,end)});at=end;}return parts;}
 const exif=segment(0xe1,Buffer.from('Exif\0\0SYNTHETIC-CAMERA-DATA')),comment=segment(0xfe,Buffer.from('SYNTHETIC COMMENT')),iptc=segment(0xed,Buffer.from('Photoshop 3.0\0SYNTHETIC IPTC'));
 const profileBytes=Buffer.alloc(132);profileBytes.writeUInt32BE(132);profileBytes.write('acsp',36);
 const icc=segment(0xe2,Buffer.concat([Buffer.from('ICC_PROFILE\0'),Buffer.from([1,1]),profileBytes]));
 assert.equal(normalizePortfolioJpeg(encode(jpeg)),encode(jpeg),'An existing clean image is unchanged');
 const input=encode(inject(exif,icc,comment,iptc)),clean=normalizePortfolioJpeg(input),parts=segments(decode(clean));
 assert.ok(!parts.some(p=>[0xe1,0xed,0xfe].includes(p.marker)),'Camera metadata is removed automatically');
 assert.deepEqual(parts.find(p=>p.marker===0xe2).bytes,icc,'Color profile bytes are retained');
 assert.deepEqual(parts.filter(p=>p.marker<0xe0).map(p=>p.bytes),segments(jpeg).filter(p=>p.marker<0xe0).map(p=>p.bytes),'Tables, frame, scan and pixel data stay intact');
 assert.equal(validatePortfolioJpeg(clean).width,1400);
 const noJfif=Buffer.concat([jpeg.subarray(0,2),...segments(jpeg).filter(p=>p.marker!==0xe0).map(p=>p.bytes)]);
 assert.equal(validatePortfolioJpeg(normalizePortfolioJpeg(encode(noJfif))).height,788,'A baseline JPEG without a JFIF segment is accepted');
 const incomplete=segment(0xe2,Buffer.concat([Buffer.from('ICC_PROFILE\0'),Buffer.from([1,2]),profileBytes]));
 assert.ok(!segments(decode(normalizePortfolioJpeg(encode(inject(incomplete))))).some(p=>p.marker===0xe2),'Incomplete profile chunks are omitted');
 const first=segment(0xe2,Buffer.concat([Buffer.from('ICC_PROFILE\0'),Buffer.from([1,2]),profileBytes.subarray(0,64)])),last=segment(0xe2,Buffer.concat([Buffer.from('ICC_PROFILE\0'),Buffer.from([2,2]),profileBytes.subarray(64)]));
 assert.equal(segments(decode(normalizePortfolioJpeg(encode(inject(first,last))))).filter(p=>p.marker===0xe2).length,2,'Complete multi-segment profile is retained');
 for(const bad of [Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,225,0,1]),jpeg.subarray(2)]),Buffer.concat([jpeg.subarray(0,2),Buffer.from([255,225,255,255]),jpeg.subarray(2)]),jpeg.subarray(0,-2)])assert.throws(()=>normalizePortfolioJpeg(encode(bad)),'Malformed segments or truncated files remain invalid');
 const oldJfif=segments(jpeg).find(p=>p.marker===0xe0).bytes,thumb=Buffer.concat([oldJfif,Buffer.from([1,2,3])]);thumb.writeUInt16BE(19,2);thumb[16]=1;thumb[17]=1;
 const withThumb=Buffer.concat([jpeg.subarray(0,2),thumb,...segments(jpeg).filter(p=>p.marker!==0xe0).map(p=>p.bytes)]);
 assert.equal(validatePortfolioJpeg(normalizePortfolioJpeg(encode(withThumb))).width,1400,'Embedded thumbnails are removed automatically');
 const actor='23000000-0000-4000-8000-000000000001',photo='23000000-0000-4000-8000-000000000002',request='23000000-0000-4000-8000-000000000003';
 const env={SUPABASE_URL:'https://nksqpoigywfegcbvfhoa.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-not-a-real-service-key'},saved=[];
 const handler=createHandler({env:k=>env[k],crypto:webcrypto,fetch:async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:actor,is_anonymous:false});
  const body=JSON.parse(options.body),rpc=url.split('/').at(-1);
  if(rpc==='tsi230_guest_rate')return Response.json(true);
  if(rpc==='tsi230_portfolio_admin'){if(['publish','update'].includes(body.operation))saved.push(body);return Response.json({items:[],homepage_id:null});}
  throw Error('Unexpected request '+rpc);
 }});
 for(const action of ['portfolio/publish','portfolio/update']){const body={action,payload:{request_id:request,title:'Synthetic test',image:input}};if(action==='portfolio/update')body.id=photo;
  const result=await handler(new Request(env.SUPABASE_URL+'/functions/v1/tsi-guest-access',{method:'POST',headers:{origin:'https://patricioontiverosdz-hue.github.io','content-type':'application/json',authorization:'Bearer '+('synthetic.staff.'.repeat(5))},body:JSON.stringify(body)}));
  assert.equal(result.status,200,await result.text());assert.equal(saved.at(-1).payload.image,clean,'The normalized image is sent to storage for '+action);
 }
 console.log('PASS JPEG upload: automatic metadata cleanup, retained ICC profiles, unchanged image data, no-JFIF, thumbnail cleanup, malformed input rejection and actual publish/replace RPC payloads.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
