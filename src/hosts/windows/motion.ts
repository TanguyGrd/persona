import type { Directive, World } from '../../core/animation/brain';
import type { DesktopBridge } from './desktop';

export interface MotionConfig {
  enabled: boolean; perching: boolean; paused: boolean;
  anchorX: number; actorWidth: number; actorHeight: number;
}
export function isDesktopWorld(value: unknown): value is Pick<World, 'x' | 'minX' | 'maxX'> {
  if (!value || typeof value !== 'object') return false;
  const w = value as Record<string, unknown>;
  return ['x', 'minX', 'maxX'].every((key) => typeof w[key] === 'number' && Number.isFinite(w[key]))
    && (w.maxX as number) >= (w.minX as number);
}

/** Only starts native paths. Animation frames stay native; IPC is not used at 60 Hz. */
export function createDesktopMotion(bridge: DesktopBridge, report: (error: unknown) => void) {
  let world: Pick<World, 'x' | 'minX' | 'maxX'> | undefined;
  let config: MotionConfig | undefined;
  let requested = '';
  let configWrite: Promise<unknown> = Promise.resolve();
  let revision = 0;
  let polling = false;
  let alive = true;
  let autoPerchAt = Date.now() + 6000;
  const poll = async () => {
    if (!alive || polling || !config?.enabled || config.paused) { world = undefined; return; }
    polling = true;
    const version = revision;
    try {
      const value = await bridge.invoke('desktop_world');
      if (alive && version === revision && config?.enabled && !config.paused) {
        world = isDesktopWorld(value) ? value : undefined;
        const surface = value as { canPerch?: boolean; onSurface?: boolean } | null;
        if (world && config.perching && surface?.canPerch === true && surface.onSurface !== true && Date.now() >= autoPerchAt) {
          autoPerchAt = Date.now() + 60000;
          // A window can close between observation and action. This is a best-effort
          // idle interaction, never a claimed completed task or a blocking error.
          await bridge.invoke('perch_companion').catch(() => undefined);
        }
      }
    } catch (error) { world = undefined; report(error); }
    finally { polling = false; }
  };
  const timer = setInterval(() => { void poll(); }, 250);
  const configure = (next: MotionConfig): Promise<unknown> => {
    config = next;
    if (!next.enabled || next.paused) { world = undefined; revision++; }
    const serialized = JSON.stringify(next);
    if (serialized === requested) return configWrite;
    requested = serialized;
    const write = configWrite.catch(() => undefined).then(() => bridge.invoke('configure_motion', { config: next }));
    configWrite = write;
    return write;
  };
  return {
    world: () => alive ? (world ?? (config ? { x: 0, minX: 0, maxX: 0 } : undefined)) : undefined,
    configure,
    walk(directive: Directive) {
      if (!alive || !world || !config?.enabled || config.paused || directive.targetX === undefined) return false;
      void bridge.invoke('walk_desktop', { targetX: directive.targetX, durationMs: directive.durationMs }).catch(report);
      return true;
    },
    reset() { world = undefined; revision++; },
    destroy() { alive = false; clearInterval(timer); world = undefined; }
  };
}
