// Run only on loopback for documentation screenshots; never a real deployment.
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const root=resolve('public'),images=resolve('docs/images');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let body,type='text/html';
 if(url.pathname==='/')body=readFileSync(root+'/index.html','utf8').replace(/<script[^>]*>.*?<\/script>/gs,'').replace('<head>','<head><base href="/ui/">').replace('</head>','<script type="module" src="/ui/viewport.js"></script></head>').replace('</body>','<script type="module" src="/preview.js"></script></body>');
 else if(url.pathname==='/preview.js'){body=readFileSync('scripts/release-preview.js');type='text/javascript';}
 else if(url.pathname==='/preview-icons.js'){body='export '+readFileSync(root+'/app.js','utf8').match(/const icons=\{[\s\S]*?\n\};/)[0];type='text/javascript';}
 else if(url.pathname==='/example.svg'){body=readFileSync(images+'/demo-landscape.svg');type='image/svg+xml';}
 else if(url.pathname==='/overview'){body=readFileSync('scripts/release-overview.html');}
 else {
  const prefix=url.pathname.startsWith('/ui/')?'/ui/':url.pathname.startsWith('/shots/')?'/shots/':null;
  if(!prefix){res.writeHead(404);return res.end();}
  const base=prefix==='/ui/'?root:images,file=resolve(base,decodeURIComponent(url.pathname.slice(prefix.length)));
  if(!file.startsWith(base+'/')||!existsSync(file)){res.writeHead(404);return res.end();}
  body=readFileSync(file);type=mime[extname(file)]||'application/octet-stream';
 }
 res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.end(body);
}).listen(8196,'127.0.0.1',()=>console.log('Synthetic release preview: http://localhost:8196/'));
