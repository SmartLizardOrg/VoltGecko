import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ProjectDocument } from '../src/types';

/** Synthetic source: no project, names or diagrams from the supplied private plan. */
function fixture() {
  return {
    v:3,rev:9,nid:50,
    project:{name:'V3 <panel> & integration',author:'Local QA',date:'2026-01-01',demand:0.75},
    boxes:[
      {name:'Main cabinet',busPos:'bottom',bus:{n:4,pe:4},bu:{n:['Incoming N'],pe:['Remote earth']}},
      {name:'Garden cabinet',busPos:'top',bus:{n:4,pe:4},bu:{n:['Protected N','','Solar N'],pe:['Local earth']}},
    ],
    rows:[{mods:12,box:0,bar:''},{mods:12,box:1,bar:'L1',barN:6}],
    comps:[
      {id:'rcd',type:'rccb',poles:'4P',row:0,x:0,name:'Four-pole RCD',tag:'FI-M',rating:40,sens:30,rtype:'A',
        infeed:{name:'Incoming cable',poles:'3P+N',side:'bottom',cable:'Cu 4×10 mm²',cores:'4',cs:'10',mat:'Cu',conductors:[{p:0,color:'#7a4a1e'},{p:1,color:'#1c1c1c'},{p:2,color:'#8a8f95'},{p:3,color:'#2d6fd3'}]}},
      {id:'neutral',type:'terminal',poles:'1P',row:0,x:5.25,name:'Neutral <tag> & terminal',tag:'X-N',tcol:'N',group:'main-terminals'},
      {id:'breaker',type:'mcb',poles:'1P',row:1,x:0,name:'Shared protection',kmsz:7,nos:'21, 22',consumers:'Garden lighting and sockets',rating:16,curve:'B',phase:'L1',power:750,
        circuits:[{no:21,name:'Garden lighting',power:250,cable:'Cu 3×1,5 mm²',cores:'3',cs:'1,5',mat:'Cu',length:12,phase:'L1',loadType:'lamp',devices:['Garden lamp']},
          {no:22,name:'Garden sockets',power:500,cable:'Cu 3×2,5 mm²',cores:'3',cs:'2,5',mat:'Cu',length:14,phase:'L1',loadType:'socket',devices:['Outdoor socket']}]},
      {id:'earth',type:'terminal',poles:'1P',row:1,x:2.5,name:'Earth terminal',tag:'X-PE',tcol:'PE',group:'garden-terminals',
        infeed:{name:'Earth electrode',kind:'earth',poles:'1P',side:'top',conductors:[{p:1,color:'gy'}],entry:{row:1,x:8},off:{'1':6}}},
    ],
    wires:[
      {id:'neutral-wire',a:{c:'rcd',s:'top',p:3},b:{c:'neutral',s:'top',p:0},color:'#2d6fd3',cable:'H07V-K 1×6 mm²',cores:'1',cs:'6',mat:'Cu',length:2},
      {id:'common-screw-bridge',a:{c:'neutral',s:'top',p:0},b:{c:'neutral',s:'bottom',p:1},color:'#2d6fd3'},
      {id:'cross-cabinet',a:{c:'rcd',s:'top',p:0},b:{c:'breaker',s:'bottom',p:0},color:'#7a4a1e',via:'left',lx:25,ly:12,off:{'1':5}},
      {id:'parallel-edge',a:{c:'rcd',s:'top',p:0},b:{c:'breaker',s:'bottom',p:0},color:'#7a4a1e'},
      {id:'loop-return',a:{c:'breaker',s:'top',p:0},b:{c:'rcd',s:'bottom',p:0},color:'#7a4a1e'},
    ],
    bw:[{id:'row-tap',c:'breaker',p:0}],
    bb:[
      {id:'row-feed',c:'rcd',s:'top',p:0,bus:'row',row:1,k:0},
      {id:'neutral-bus',c:'neutral',s:'bottom',p:1,bus:'n',box:1,k:0},
      {id:'earth-bus',c:'earth',s:'bottom',p:1,bus:'pe',box:0,k:0},
      {id:'external-neutral',s:'top',bus:'n',box:1,k:2,cable:'Cu 1×4 mm²',ext:{x:11,row:1,title:'Solar neutral',edge:'right'}},
    ],
    lo:{'in:earth':{dx:8,dy:-4},'ext:external-neutral':{dx:4,dy:9}},
  };
}

async function readDocument(page:Page,projectId?:string):Promise<ProjectDocument> {
  return page.evaluate(async requestedId=>{
    const id=requestedId??localStorage.getItem('planner.activeProject');if(!id)throw new Error('No active project');
    return new Promise<ProjectDocument>((resolve,reject)=>{
      const request=indexedDB.open('villamos-tervezo-local');request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,get=db.transaction('projects','readonly').objectStore('projects').get(id);get.onerror=()=>{db.close();reject(get.error);};get.onsuccess=()=>{db.close();if(!get.result?.document)reject(new Error('No saved document'));else resolve(get.result.document);};};
    });
  },projectId);
}

async function openSource(page:Page,source=fixture()) {
  await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
  await page.goto('/');
  await page.locator('.start-actions').getByRole('button',{name:/^Projekt megnyitása/}).click();
  const selecting=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Projektfájl kiválasztása',exact:true}).click();
  await (await selecting).setFiles({name:'synthetic-v3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
  await expect(page.locator('.project-title')).toHaveText(source.project.name);
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
}

async function download(page:Page,testInfo:TestInfo,button:string|RegExp,filename:string) {
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:button,exact:typeof button==='string'}).click();
  const result=await downloading,destination=testInfo.outputPath(filename);await result.saveAs(destination);
  return {result,destination};
}

test('imports v3 through the chooser and retains every terminal wire in all-board SVG, PNG, PDF and archive history',async({page},testInfo)=>{
  test.setTimeout(120_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const source=fixture();await openSource(page,source);
  const imported=await readDocument(page),wires=imported.data.boards.flatMap(board=>board.wiring!.wires);
  expect(imported.data.boards).toHaveLength(2);expect(imported.data.devices).toHaveLength(4);expect(wires).toHaveLength(15);
  expect(imported.data.boards[0].wiring!.source).toEqual(source);
  expect(imported.data.boards.every(board=>board.connections?.length===0)).toBe(true);
  for(const edge of [...source.wires,...source.bw,...source.bb])expect(wires.some(wire=>wire.sourceRoute?.id===edge.id)).toBe(true);
  const neutral=imported.data.devices.find(device=>device.code==='X-N')!;
  expect(neutral.moduleWidth).toBe(29/17.5);expect(neutral.electrical?.commonPoleGroups).toEqual([[0,1]]);
  expect(imported.data.boards[0].rows[0].placements.find(p=>p.deviceId===neutral.id)?.start).toBe(5.25);
  expect(imported.data.circuits.map(c=>[c.code,c.powerW])).toEqual([['21',250],['22',500]]);

  // A pre-existing feature still attaches photographs to the same shared device.
  await page.locator('.din-device').filter({hasText:'X-N'}).click();
  const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf1kAAAAASUVORK5CYII=','base64');
  await page.locator('.photo-upload input').setInputFiles({name:'terminal-photo.png',mimeType:'image/png',buffer:photo});
  await expect(page.locator('.photo-grid img')).toHaveCount(1);
  await expect.poll(async()=>Object.keys((await readDocument(page)).assets).length).toBe(1);
  await page.getByRole('button',{name:'Kijelölés bezárása',exact:true}).click();
  await page.locator('.main-nav').getByRole('button',{name:/Előzmények/}).click();
  await page.getByLabel('Verzió megjegyzése',{exact:true}).fill('QA: imported terminal wiring and photo');
  await page.locator('.revision-compose').getByRole('button',{name:'Verzió mentése',exact:true}).click();
  await expect.poll(async()=>(await readDocument(page)).revisions.at(-1)?.note).toBe('QA: imported terminal wiring and photo');

  await page.locator('.view-tabs').getByRole('button',{name:'Egyvonalas',exact:true}).click();
  await page.getByLabel('Egyvonalas rajz elosztója',{exact:true}).selectOption('all');
  const svg=page.locator('.single-line-svg svg');
  await expect(svg.locator('[data-device-id]')).toHaveCount(4);await expect(svg.locator('[data-connection-id]')).toHaveCount(15);
  const visibleIds=await svg.locator('[data-connection-id]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-connection-id')).sort());
  expect(visibleIds).toEqual(wires.map(wire=>wire.id).sort());
  for(const wire of wires)await expect(svg.locator(`[data-connection-id="${wire.id}"] path`)).not.toHaveAttribute('marker-end');
  await expect(svg).toContainText('Main cabinet');await expect(svg).toContainText('Garden cabinet');
  await expect(svg).toContainText('FI-M · felső 4 (N)');await expect(svg).toContainText('X-N · felső 1 (N)');
  await expect(svg).toContainText('X-N · alsó 2 (N)');await expect(svg).toContainText('Solar neutral');
  await expect(svg).toContainText('Garden lighting');await expect(svg).toContainText('Garden sockets');
  await expect(svg.locator('script,foreignObject')).toHaveCount(0);
  const vector=await download(page,testInfo,'SVG letöltése','all-boards.svg');
  expect(vector.result.suggestedFilename()).toMatch(/-single-line\.svg$/);
  const xml=await readFile(vector.destination,'utf8');
  expect(xml.match(/data-connection-id=/g)).toHaveLength(15);
  for(const wire of wires)expect(xml).toContain(`data-connection-id="${wire.id}"`);
  expect(xml).toContain('Neutral &lt;tag&gt; &amp; terminal');expect(xml).not.toMatch(/<script|<foreignObject/i);
  const raster=await download(page,testInfo,'PNG letöltése','all-boards.png');
  expect(raster.result.suggestedFilename()).toMatch(/\.png$/);
  const png=await readFile(raster.destination);expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect(png.readUInt32BE(16)).toBeGreaterThan(100);expect(png.readUInt32BE(20)).toBeGreaterThan(100);
  await page.screenshot({path:testInfo.outputPath('all-boards-browser.png'),fullPage:true});

  await page.getByRole('button',{name:'Mentés és export',exact:true}).click();
  const pdf=await download(page,testInfo,/Részletes szakmai PDF/,'terminal-wiring.pdf');
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  const pdfBytes=await readFile(pdf.destination);expect(pdfBytes.subarray(0,5).toString()).toBe('%PDF-');
  const loadingPdf=getDocument({data:new Uint8Array(pdfBytes),useSystemFonts:true});
  const pdfDocument=await loadingPdf.promise;
  const pdfPages:string[]=[];
  for(let number=1;number<=pdfDocument.numPages;number++) {
    const content=await (await pdfDocument.getPage(number)).getTextContent();
    pdfPages.push(content.items.map(item=>'str' in item?item.str:'').join(' '));
  }
  expect(pdfDocument.numPages).toBeGreaterThan(5);await loadingPdf.destroy();
  const pdfText=pdfPages.join('\n'),compactPdf=pdfText.replace(/\s/g,'');
  expect(pdfText).toContain('Main cabinet · kapocshuzalozás');expect(pdfText).toContain('Garden cabinet · kapocshuzalozás');
  expect(pdfText).toContain('FI-M · felső 4 (N)');expect(pdfText).toContain('X-N · alsó 2 (N)');
  expect(pdfText).toContain('Solar neutral');expect(pdfText).toContain('H07V-K');
  for(const wire of wires)expect(compactPdf,`wire ${wire.id} must have a terminal-table row`).toContain(wire.id);

  await page.getByRole('button',{name:'Mentés és export',exact:true}).click();
  const archive=await download(page,testInfo,/Projektfájl mentése/,'terminal-wiring.vgecko');
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  const exported=await readDocument(page);
  expect(exported.revisions.some(revision=>revision.note==='QA: imported terminal wiring and photo')).toBe(true);
  await svg.locator(`[data-device-id="${neutral.id}"]`).click();
  await page.getByLabel('Eszköz megjegyzése',{exact:true}).fill('Keep this local edit after archive import.');
  await expect.poll(async()=>(await readDocument(page)).data.devices.find(device=>device.id===neutral.id)?.notes).toBe('Keep this local edit after archive import.');
  await page.locator('input[accept*=".vgecko"]').setInputFiles(archive.destination);
  await expect(page.locator('.project-title')).toContainText('importált másolat');
  const restored=await readDocument(page);expect(restored.data.id).not.toBe(exported.data.id);
  expect(restored.data.boards).toEqual(exported.data.boards);expect(restored.data.devices).toEqual(exported.data.devices);
  expect(restored.data.circuits).toEqual(exported.data.circuits);expect(restored.assets).toEqual(exported.assets);
  expect(restored.revisions.map(revision=>({...revision,data:{...revision.data,id:exported.data.id}}))).toEqual(exported.revisions);
  expect((await readDocument(page,exported.data.id)).data.devices.find(device=>device.id===neutral.id)?.notes).toBe('Keep this local edit after archive import.');
  await page.locator('.view-tabs').getByRole('button',{name:'Egyvonalas',exact:true}).click();
  await page.getByLabel('Egyvonalas rajz elosztója',{exact:true}).selectOption('all');
  await expect(page.locator('.single-line-svg [data-connection-id]')).toHaveCount(15);
  expect(errors).toEqual([]);
});

test('rejects a v3 file with a missing terminal device without replacing the existing project',async({page})=>{
  const source=fixture();await openSource(page,source);const before=await readDocument(page);
  const broken={...source,wires:[...source.wires,{id:'broken-edge',a:{c:'missing-device',s:'top',p:0},b:{c:'rcd',s:'bottom',p:0}}]};
  await page.locator('input[accept*=".vgecko"]').setInputFiles({name:'broken-v3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(broken))});
  await expect(page.locator('.toast')).toContainText('hiányzó készülék');
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  expect((await readDocument(page)).data).toEqual(before.data);
  expect((await readDocument(page)).revisions).toEqual(before.revisions);
});
