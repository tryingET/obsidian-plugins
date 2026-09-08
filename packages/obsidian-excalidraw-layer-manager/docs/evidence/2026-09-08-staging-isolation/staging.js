(async () => {
 const p=app.plugins.plugins['obsidian-excalidraw-plugin'];
 const leaf=app.workspace.getLeavesOfType('excalidraw').find(l=>l.view.file?.path==='testing.md');
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const steps=[]; const check=(name,pass,detail)=>steps.push({name,pass:!!pass,detail});
 globalThis.excalidrawLayerManagerRuntime?.dispose();
 const seed=p.ea; seed.reset(); seed.setView(leaf.view,false);
 const a=seed.addRect(1000,1000,100,80), b=seed.addRect(1150,1000,100,80);
 await seed.addElementsToView(false,false,true); seed.clear();
 await p.scriptEngine.executeScriptFile(leaf.view,app.vault.getAbstractFileByPath('Excalidraw/Scripts/LayerManager.md'),'LayerManager'); await sleep(300);
 const rt=globalThis.excalidrawLayerManagerRuntime;
 const tab=p.ea.checkForActiveSidepanelTabForScript('LayerManager');
 const host=tab?.getHostEA();
 if(!rt||!host) throw Error('runtime/host missing');
 const api=leaf.view.excalidrawAPI; const get=id=>api.getSceneElements().find(e=>e.id===id);
 check('first LayerManager rename applies',(await rt.commands.renameNode({elementId:a,nextName:'AK5574 first'})).status==='applied'); await sleep(100);
 const first=get(a); const originalX=first.x;
 // Native canvas edit, unrelated to the following LayerManager command.
 api.updateScene({elements:api.getSceneElements().map(e=>e.id===a?{...e,x:e.x+333,strokeColor:'#ff0000',version:e.version+1,versionNonce:e.versionNonce+1,customData:{...e.customData,foreign5574:'canvas edit'}}:e),captureUpdate:'IMMEDIATELY'}); await sleep(150);
 const before=JSON.parse(JSON.stringify(get(a))); const stagedBefore=Object.keys(host.elementsDict);
 check('canvas edit visible before second command',before.x===originalX+333 && before.customData.foreign5574==='canvas edit',before);
 check('second LayerManager rename applies',(await rt.commands.renameNode({elementId:b,nextName:'AK5574 second'})).status==='applied'); await sleep(150);
 const after=JSON.parse(JSON.stringify(get(a)));
 check('unrelated canvas geometry preserved',after.x===before.x,{before:before.x,after:after.x});
 check('unrelated canvas color preserved',after.strokeColor===before.strokeColor,{before:before.strokeColor,after:after.strokeColor});
 check('unrelated canvas metadata preserved',after.customData.foreign5574==='canvas edit',after.customData);
 check('second label persisted',get(b).customData?.lmx?.label==='AK5574 second');
 await leaf.view.save();
 globalThis.__ak5574Fixture={a,b,before,after};
 return {title:document.title,pluginVersion:p.manifest.version,steps,pass:steps.every(s=>s.pass),stagedBefore,stagedAfter:Object.keys(host.elementsDict),fixture:{a,b},mode:'real native script command facade, native API canvas edit, save; no injected EA staging implementation'};
})()
