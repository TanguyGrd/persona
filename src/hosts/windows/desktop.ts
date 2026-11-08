import { Repository } from '../../core/settings/store';
import type { Settings } from '../../core/settings/settings';
import { Companion } from '../../stage/companion';
import { DesktopStore } from './store';
import { createLauncher, WELCOME_KEY } from './launcher';

export interface DesktopBridge {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  listen(event: string, handler: () => void): Promise<() => void>;
}

export interface HitRegion { x: number; y: number; width: number; height: number }

/** CSS pixels; Rust converts cursor coordinates using the WebView's current DPI. */
export function hitRegions(elements: Element[], width: number, height: number): HitRegion[] {
  return elements.flatMap((element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return [];
    const r = element.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return [];
    const x = Math.max(0, r.left - 6), y = Math.max(0, r.top - 6);
    const right = Math.min(width, r.right + 6), bottom = Math.min(height, r.bottom + 6);
    return right > x && bottom > y ? [{ x, y, width: right - x, height: bottom - y }] : [];
  });
}

export async function startDesktop(bridge: DesktopBridge): Promise<() => void> {
  const panel = document.querySelector<HTMLElement>('#settings')!;
  const error = document.querySelector<HTMLElement>('#error')!;
  const form = document.querySelector<HTMLFormElement>('#settings-form')!;
  const report = (cause: unknown) => {
    console.error(cause);
    error.textContent = `Persona : ${String(cause)}. L’icône près de l’horloge permet de quitter ou réafficher l’application.`;
    error.hidden = false;
  };
  const call = (command: string, args?: Record<string, unknown>) => bridge.invoke(command, args);
  const run = (operation: Promise<unknown>) => { void operation.catch(report); };
  const repo = new Repository(new DesktopStore(localStorage));
  let companion: Companion | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let settings: Settings;
  const cleanups: (() => void)[] = [];
  const dragCleanups: (() => void)[] = [];
  const on = (target: EventTarget, event: string, handler: EventListener, capture = false, bucket = cleanups) => {
    target.addEventListener(event, handler, capture);
    bucket.push(() => target.removeEventListener(event, handler, capture));
  };
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  const openSettings = async () => {
    settings = await repo.getSettings();
    const profiles = await repo.listProfiles();
    const select = field('activeProfileId') as HTMLSelectElement;
    select.replaceChildren(...profiles.map((profile) => new Option(profile.name, profile.id)));
    for (const name of ['activeProfileId', 'userName', 'scale', 'frequency', 'chattiness', 'reduceMotion'] as const) {
      field(name).value = String(settings[name]);
    }
    panel.hidden = false;
    field('userName').focus();
  };

  const mount = async () => {
    for (const cleanup of dragCleanups.splice(0)) cleanup();
    companion?.destroy();
    settings = await repo.getSettings();
    const { profile, avatar } = await repo.getActiveCharacter(settings);
    companion = new Companion({
      profile, avatar, settings, memory: await repo.getMemory(profile.id), owner: 'windows',
      callbacks: {
        saveMemory: (memory) => run(repo.saveMemory(profile.id, memory)),
        savePosition: (position) => run(repo.saveSettings({ position })),
        openSettings: () => run(openSettings()),
        placeName: () => 'votre bureau',
        onHiddenChange: (hidden) => { if (hidden) run(call('hide_companion')); },
      },
    }).mount();
  };

  // Consume the stage's page-local drag on this host. A short gesture remains a click;
  // crossing the threshold starts a native OS move, including across monitors.
  let gesture: { id: number; x: number; y: number; target: HTMLElement } | undefined;
  const release = () => {
    if (gesture?.target.hasPointerCapture(gesture.id)) gesture.target.releasePointerCapture(gesture.id);
    gesture = undefined;
  };
  const bindDrag = () => {
    const hit = companion!.shadow.querySelector<HTMLElement>('.pc-hit')!;
    on(hit, 'pointerdown', ((event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, target: hit };
      hit.setPointerCapture(event.pointerId);
      run(call('set_pointer_capture', { captured: true }));
    }) as EventListener, true, dragCleanups);
    on(hit, 'pointermove', ((event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      event.stopImmediatePropagation();
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 6) return;
      release();
      // Native code keeps hit testing interactive until the left mouse button is released.
      run(call('start_dragging'));
    }) as EventListener, true, dragCleanups);
    on(hit, 'pointerup', ((event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      event.stopImmediatePropagation();
      release();
      run(call('set_pointer_capture', { captured: false }));
      companion?.click();
    }) as EventListener, true, dragCleanups);
    on(hit, 'pointercancel', (() => {
      release();
      run(call('set_pointer_capture', { captured: false }));
    }) as EventListener, true, dragCleanups);
  };

  const launcher = createLauncher(repo, bridge, async () => { await mount(); bindDrag(); });
  cleanups.push(() => launcher.destroy());
  try {
    await repo.ensureDefaults();
    await mount();
    bindDrag();
    cleanups.push(await bridge.listen('desktop-show', () => { companion?.show(); }));
    cleanups.push(await bridge.listen('desktop-settings', () => { run(openSettings()); }));
    cleanups.push(await bridge.listen('desktop-menu', () => { run(launcher.open()); }));
    on(document.querySelector('#open-launcher')!, 'click', () => { panel.hidden = true; run(launcher.open()); });
    on(document.querySelector('#close-settings')!, 'click', () => { panel.hidden = true; });
    on(document.querySelector('#hide')!, 'click', () => {
      panel.hidden = true;
      run(call('hide_companion'));
    });
    on(document.querySelector('#quit')!, 'click', () => run(call('quit_app')));
    on(window, 'keydown', ((event: KeyboardEvent) => {
      if (event.key === 'Escape') { panel.hidden = true; if (!launcher.panel.hidden) run(launcher.close()); }
    }) as EventListener);
    on(form, 'submit', (event) => {
      event.preventDefault();
      run((async () => {
        await repo.saveSettings({
          activeProfileId: field('activeProfileId').value,
          userName: field('userName').value,
          scale: Number(field('scale').value),
          frequency: field('frequency').value as Settings['frequency'],
          chattiness: field('chattiness').value as Settings['chattiness'],
          reduceMotion: field('reduceMotion').value as Settings['reduceMotion'],
        });
        await mount();
        bindDrag();
        panel.hidden = true;
      })());
    });
    // Independent of pointer events: Windows can recover interaction after passthrough.
    let last = '';
    let pending = false;
    const updateRegions = () => {
      if (pending) return;
      const shadow = companion!.shadow;
      const actor = shadow.querySelector<HTMLElement>('.pc-actor')!;
      const toolbar = shadow.querySelector<HTMLElement>('.pc-toolbar')!;
      // The shared stage can walk to either viewport edge. Keep its toolbar
      // inside this much smaller desktop scene without changing Chrome layout.
      const useLeft = actor.getBoundingClientRect().right > innerWidth - 40;
      toolbar.style.right = useLeft ? 'auto' : '-34px';
      toolbar.style.left = useLeft ? '-34px' : 'auto';
      toolbar.style.paddingLeft = useLeft ? '0' : '8px';
      toolbar.style.paddingRight = useLeft ? '8px' : '0';
      const elements = [launcher.panel, panel, error, ...shadow.querySelectorAll('.pc-hit, .pc-toolbar, .pc-bubble, .pc-restore')];
      const regions = hitRegions(elements, innerWidth, innerHeight);
      const serialized = JSON.stringify(regions);
      if (serialized === last) return;
      pending = true;
      void call('set_hit_regions', { regions }).then(() => { last = serialized; }).catch(report).finally(() => { pending = false; });
    };
    updateRegions();
    timer = setInterval(updateRegions, 50);
    if (!localStorage.getItem(WELCOME_KEY)) await launcher.open();
    await call('desktop_ready');
  } catch (cause) {
    report(cause);
    // Never leave a failed boot as an invisible process. Tray remains a second exit path.
    await call('set_hit_regions', { regions: [{ x: 0, y: 0, width: innerWidth, height: innerHeight }] }).catch(console.error);
    await call('desktop_ready').catch(console.error);
  }
  return () => {
    clearInterval(timer);
    release();
    for (const cleanup of [...dragCleanups, ...cleanups]) cleanup();
    companion?.destroy();
  };
}
