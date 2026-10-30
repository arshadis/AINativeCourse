import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve, extname} from 'node:path';
import {resolveQuestion} from './resolve.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile=JSON.parse(await readFile(resolve(root,'profile.json'),'utf8'));
const staticRoot=resolve(root,'public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  try {
    if(url.pathname==='/health' && req.method==='GET'){
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(JSON.stringify({status:'ok'}));
    }
    if(url.pathname==='/api/ask' && req.method==='POST'){
      const chunks=[]; let total=0;
      for await (const chunk of req) {total+=chunk.length;if(total>16_384){res.writeHead(413);return res.end('Too large');}chunks.push(chunk);}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(typeof data.question!=='string' || !data.question.trim()){
        res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});
        return res.end(JSON.stringify({error:'Question required'}));
      }
      const result=await resolveQuestion(data.question,profile,{useModel:!!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL)});
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(JSON.stringify(result));
    }
    if(req.method!=='GET'){res.writeHead(405);return res.end('Method not allowed');}
    let name=url.pathname==='/'?'index.html':url.pathname.substring(1);
    if(!['index.html','style.css','app.js'].includes(name)){res.writeHead(404);return res.end('Not found');}
    const content=await readFile(resolve(staticRoot,name));
    res.writeHead(200,{'Content-Type': mime[extname(name)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff'});
    return res.end(content);
  } catch(err){
    const status=err instanceof SyntaxError?400:500;
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
    return res.end(JSON.stringify({error:status===400?'Invalid JSON':'Server error'}));
  }
});
const port=Number(process.env.PORT || 3000);
server.listen(port,'0.0.0.0',()=>console.log(`Local demo: http://localhost:${port}`));
