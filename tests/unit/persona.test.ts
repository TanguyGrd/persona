// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { applyTerryPersona, normalizeSourceUrls } from '../../src/core/profile/persona';
import { normalizeProfile } from '../../src/core/profile/validate';
import { composeLine, candidateTiers, fillTemplate, speechVars, lineKey } from '../../src/core/profile/speech';
import { SPEECH_KINDS } from '../../src/core/profile/types';
import { seededRng } from '../../src/core/rng';
import { LocalProfileGenerator } from '../../src/core/profile/generator';
import { createCompanion, prepareReferences, exportCompanionPack } from '../../src/core/creation/character';
import { Repository, MemoryStore } from '../../src/core/settings/store';
import { importAvatarFiles } from '../../src/core/avatar/importer';

describe('explicit persona and unidentified characters', () => {
  it('keeps the selected persona authoritative even after all its lines were recently used', () => {
    const base = normalizeProfile({ id:'user-avatar',name:'Mon avatar',avatarId:'my-image',meta:{source:'manual',creation:{mode:'instant',source:'user',preparedAt:1,referenceAvatarIds:['my-image']}} }).value;
    const profile = applyTerryPersona(base);
    expect(profile.id).toBe(base.id); expect(profile.avatarId).toBe('my-image');
    expect(profile.meta.creation).toEqual(base.meta.creation);
    for (const kind of SPEECH_KINDS) {
      for (let seed=0; seed<25; seed++) {
        const ctx = { profile, now:new Date(2026,10,8,19),rng:seededRng(seed),userName:'Tanguy' };
        const custom = candidateTiers(kind,profile,ctx.now).custom;
        const allowed = custom.map((tpl)=>fillTemplate(tpl,speechVars(ctx)));
        const recent = custom.map((tpl)=>lineKey(kind,tpl));
        expect(allowed).toContain(composeLine(kind,{...ctx,recent})!.text);
      }
    }
    expect(profile.meta.uncertainties?.join()).toContain('sans reconnaissance');
  });
  it('uses a calm provisional tone without claiming to have recognized an image', async () => {
    const result=await new LocalProfileGenerator().generate({name:'',description:''});
    expect(result.profile.name).toBe('Compagnon'); expect(result.profile.tone).toBe('calm');
    expect(result.confidence).toBeLessThan(.3);
  });
  it('persists user links through a portable pack without claiming they were fetched', async () => {
    const repo=new Repository(new MemoryStore());
    const refs=await prepareReferences([{name:'image.png',mime:'image/png',size:10,dataUrl:'data:image/png;base64,aGVsbG8='}],{imageSize:async()=>({w:100,h:100})});
    const profile=await createCompanion(repo,{references:refs,primaryIndex:0,sourceUrls:['https://fr.wikipedia.org/wiki/Batman_Beyond']});
    expect(profile.name).toBe('Compagnon'); expect(profile.meta.sourceUrls).toHaveLength(1);
    const text=JSON.stringify(await exportCompanionPack(repo,profile.id));
    const imported=await importAvatarFiles([{name:'pack.json',mime:'application/json',size:text.length,text}],{imageSize:async()=>({w:100,h:100})});
    expect(imported.profile!.meta.sourceUrls).toEqual(profile.meta.sourceUrls);
    expect(imported.profile!.meta.generator).toBe('local-heuristic@1');
  });
  it.each(['javascript:alert(1)','http://example.com','https://user:password@example.com/','https://127.0.0.1/','https://host.local/','https://example.com:8443/'])('rejects an invalid or nonpublic link %s',url=>{
    expect(()=>normalizeSourceUrls([url])).toThrow();
  });
  it('bounds and deduplicates supplied links',()=>{
    expect(normalizeSourceUrls(['https://fr.wikipedia.org/','https://fr.wikipedia.org/'])).toHaveLength(1);
    expect(()=>normalizeSourceUrls(Array(6).fill('https://example.com'))).toThrow();
  });
});
