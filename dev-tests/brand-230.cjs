const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p));
const png=read('staging/brand/tanabi-logo-transparent.png');
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
const width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert.equal(png[24],8);assert.equal(png[25],6,'PNG has real RGBA transparency');
let data=[],pos=8;while(pos<png.length){const len=png.readUInt32BE(pos),type=png.toString('ascii',pos+4,pos+8);if(type==='IDAT')data.push(png.subarray(pos+8,pos+8+len));pos+=len+12;}
const packed=zlib.inflateSync(Buffer.concat(data)),stride=width*4;assert.equal(packed.length,(stride+1)*height);let previous=Buffer.alloc(stride),transparent=0,visible=0;
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
for(let y=0;y<height;y++){const filter=packed[y*(stride+1)],row=Buffer.from(packed.subarray(y*(stride+1)+1,(y+1)*(stride+1)));assert.ok(filter<=4);for(let x=0;x<stride;x++){const a=x>=4?row[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0;row[x]=(row[x]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;}for(let x=3;x<stride;x+=4){if(row[x]===0)transparent++;if(row[x]>0)visible++;}previous=row;}
assert.ok(transparent>width*height*.3,'Surrounding background is genuinely transparent');assert.ok(visible>width*height*.2,'Logo artwork retained');
const webp=read('staging/brand/tanabi-logo-transparent.webp');assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');assert.equal(webp.toString('ascii',12,16),'VP8X');assert.ok(webp[20]&0x10,'Optimized logo retains an alpha channel');assert.ok(webp.length<read('staging/brand/tanabi-logo.png').length,'Optimized logo reduces page weight');
for(const file of ['staging/equipo.html','staging/index.html','staging/tsi-230-public.js']){const text=read(file).toString();assert.ok(text.includes('brand/tanabi-logo-transparent.webp'),file);assert.ok(!text.includes('brand/tanabi-logo.png'),file);}
const css=read('staging/tsi-230-ui.css').toString();for(const selector of ['ui230-logo','ui230-loader>img','ui230-brand-frame']){const rule=css.match(new RegExp('\\.tsi230-app \\.'+selector.replace('>','>')+' \\{([^}]+)\\}'))?.[1];assert.ok(rule&&rule.includes('background:transparent'),selector+' has no white rectangle');}
console.log('PASS transparent logo: '+width+'×'+height+' real alpha PNG, optimized WebP '+webp.length+' bytes, public/staff/loader references and transparent containers.');
