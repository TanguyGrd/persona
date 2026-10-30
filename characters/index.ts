import type { AvatarAsset } from '../src/core/avatar/types';
import type { CharacterProfile } from '../src/core/profile/types';
import { PIP_PROFILE } from './pip/profile';
import pipSvg from './pip/avatar.svg';

/** Built-in characters. The engine never refers to them by name: they are data like any other. */
export const BUILTIN_PROFILES: CharacterProfile[] = [PIP_PROFILE];

export const BUILTIN_AVATARS: AvatarAsset[] = [
  {
    id: 'builtin:pip',
    kind: 'svg',
    name: 'Pip',
    svg: pipSvg,
    rigged: true,
    facing: 'front',
    height: 116,
    builtin: true,
    credits: 'Personnage original Persona.',
    license: 'Propriété du projet Persona',
  },
];
