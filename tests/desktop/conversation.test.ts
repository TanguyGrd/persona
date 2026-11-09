import { describe, expect, it } from 'vitest';
import { localIntent, pauseMessage } from '../../src/hosts/windows/conversation';

describe('bounded desktop commands', () => {
  it('understands simple French/English pause requests without executing compound or negated requests', () => {
    for (const prompt of ['Mets la vidéo en pause', 'Peux-tu mettre ma musique en pause ?', 'pause video', 'Mets en pause stp', 'Pause', 'mets pause à la vidéo']) expect(localIntent(prompt)).toBe('pause');
    for (const prompt of ['Ne mets pas la vidéo en pause', 'Mets la vidéo en pause puis ouvre mon terminal', 'La vidéo est-elle en pause ?', 'explique comment mettre la vidéo en pause', 'pause; calc.exe']) expect(localIntent(prompt)).toBe('unknown');
    expect(localIntent('Rejoins mes amis sur Discord et dis que j’arrive')).toBe('discord');
  });
  it('only reports a confirmed pause when the native result establishes it', () => {
    expect(pauseMessage({ status: 'paused' })).toContain('confirme');
    expect(pauseMessage({ status: 'alreadyPaused' })).toContain('déjà');
    expect(pauseMessage({ status: 'unconfirmed' })).toContain('ne confirme pas');
    expect(pauseMessage({ status: 'noSession' })).toContain('aucun média');
    expect(pauseMessage(undefined)).toContain('Aucun succès');
  });
});
