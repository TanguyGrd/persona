/** Styles for the companion layer. Lives in a shadow root, so it never leaks into pages. */
export const STAGE_CSS = /* css */ `
:host { all: initial; position: fixed !important; inset: 0 auto auto 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483646 !important; pointer-events: none !important; display: block !important; }
*, *::before, *::after { box-sizing: border-box; }
.pc-layer {
  position: fixed; inset: 0; pointer-events: none; overflow: hidden;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2933;
  contain: strict;
}
.pc-layer[data-fullscreen="1"] { display: none; }
.pc-actor {
  position: absolute; left: 0; bottom: 0; will-change: transform;
  pointer-events: none;
}
.pc-actor[hidden] { display: none; }
.pc-hit {
  position: relative; width: 100%; height: 100%; pointer-events: auto; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none; outline: none;
  -webkit-tap-highlight-color: transparent;
}
.pc-actor[data-activity="dragging"] .pc-hit { cursor: grabbing; }
.pc-hit:focus-visible { outline: 3px solid #4c9ffe; outline-offset: 4px; border-radius: 16px; }
.pc-flip, .pc-motion, .pc-avatar { position: absolute; inset: 0; }
.pc-flip[data-flip="1"] { transform: scaleX(-1); }
.pc-motion { transform-origin: 50% 100%; }
.pc-avatar > svg, .pc-avatar > canvas { display: block; width: 100%; height: 100%; overflow: visible; }

/* ---------- whole-body motion: works for every avatar kind ---------- */
.pc-actor[data-activity="idle"] .pc-motion,
.pc-actor[data-activity="look"] .pc-motion { animation: pc-breathe 3.2s ease-in-out infinite; }
.pc-actor[data-activity="walk"] .pc-motion { animation: pc-walk .44s ease-in-out infinite; }
.pc-actor[data-activity="talk"] .pc-motion { animation: pc-talk .5s ease-in-out infinite; }
.pc-actor[data-activity="wave"] .pc-motion { animation: pc-sway .75s ease-in-out 2; }
.pc-actor[data-activity="dragging"] .pc-motion { transform-origin: 50% 0%; animation: pc-dangle 1s ease-in-out infinite; }
.pc-actor[data-activity="falling"] .pc-motion { transform: scale(.94, 1.07); }
.pc-actor[data-activity="sleep"] .pc-motion { animation: pc-breathe 4.8s ease-in-out infinite; }
.pc-actor[data-activity="waking"] .pc-motion { animation: pc-shake .3s ease-in-out 3; }
.pc-actor[data-activity="react"][data-reaction="giggle"] .pc-motion { animation: pc-giggle .15s ease-in-out 5; }
.pc-actor[data-activity="react"][data-reaction="spin"] .pc-motion { animation: pc-spin .7s cubic-bezier(.3,.7,.4,1) 1; }
.pc-actor[data-activity="react"][data-reaction="blush"] .pc-motion { animation: pc-shrink .9s ease-in-out 1; }
.pc-actor[data-activity="react"][data-reaction="dizzy"] .pc-motion { animation: pc-wobble .6s ease-in-out 3; }
.pc-actor[data-activity="entering"][data-entrance="pop"] .pc-motion { animation: pc-pop .6s cubic-bezier(.2,1.6,.4,1) 1 both; }
.pc-actor[data-land="1"] .pc-motion { animation: pc-land .26s ease-out 1 !important; }
.pc-actor[data-launch="1"] .pc-motion { animation: pc-launch .18s ease-out 1 !important; }

@keyframes pc-breathe { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.015,.985); } }
@keyframes pc-walk { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-5px) rotate(3deg); } }
@keyframes pc-talk { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes pc-sway { 0%,100% { transform: rotate(0); } 50% { transform: rotate(4deg); } }
@keyframes pc-dangle { 0%,100% { transform: rotate(-9deg); } 50% { transform: rotate(9deg); } }
@keyframes pc-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
@keyframes pc-giggle { 0%,100% { transform: rotate(0) scale(1); } 50% { transform: rotate(5deg) scale(1.03,.97); } }
@keyframes pc-spin { from { transform: rotateY(0); } to { transform: rotateY(360deg); } }
@keyframes pc-shrink { 0%,100% { transform: scale(1); } 40%,70% { transform: scale(.93,.9); } }
@keyframes pc-wobble { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }
@keyframes pc-pop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
@keyframes pc-land { 0% { transform: scale(1.18,.78); } 60% { transform: scale(.96,1.05); } 100% { transform: scale(1); } }
@keyframes pc-launch { 0% { transform: scale(1); } 100% { transform: scale(1.12,.84); } }

/* ---------- rigged SVG parts ---------- */
[data-part] { transform-box: fill-box; }
[data-part="mouth-open"] { opacity: 0; }
.pc-avatar[data-mouth="open"] [data-part="mouth-open"] { opacity: 1; }
.pc-avatar[data-mouth="open"] [data-part="mouth"] { opacity: 0; }
[data-part="sprout"] { animation: pc-sprout 3.4s ease-in-out infinite; }
[data-part^="eye-"] { transition: transform .08s linear; }
[data-part^="pupil-"] { transition: transform .18s ease-out; }
.pc-avatar[data-blink="1"] [data-part^="eye-"] { transform: scaleY(.1); }
.pc-avatar[data-clip="wave"] [data-part="arm-right"] { animation: pc-wave .5s ease-in-out 3; }
.pc-avatar[data-clip="enter"] [data-part="arm-right"] { animation: pc-wave .5s ease-in-out 2 .9s; }
.pc-avatar[data-clip="walk"] [data-part="arm-left"] { animation: pc-arm .44s ease-in-out infinite; }
.pc-avatar[data-clip="walk"] [data-part="arm-right"] { animation: pc-arm .44s ease-in-out infinite reverse; }
.pc-avatar[data-clip="walk"] [data-part="feet"] { animation: pc-feet .44s ease-in-out infinite; }
.pc-avatar[data-clip="dangle"] [data-part="arm-left"],
.pc-avatar[data-clip="fall"] [data-part="arm-left"] { animation: pc-flail-l .3s ease-in-out infinite; }
.pc-avatar[data-clip="dangle"] [data-part="arm-right"],
.pc-avatar[data-clip="fall"] [data-part="arm-right"] { animation: pc-flail-r .3s ease-in-out infinite; }
.pc-avatar[data-clip="jump"] [data-part="arm-left"] { transform: rotate(75deg); }
.pc-avatar[data-clip="jump"] [data-part="arm-right"] { transform: rotate(-75deg); }
.pc-avatar[data-clip="look"] [data-part^="pupil-"] { animation: pc-look 2s ease-in-out 1; }
.pc-avatar[data-clip="talk"] [data-part="arm-left"] { animation: pc-arm 1s ease-in-out infinite; }
.pc-avatar[data-mood="sleepy"] [data-part^="eye-"] { transform: scaleY(.12); }
.pc-avatar[data-mood="sleepy"] [data-part="sprout"] { animation: pc-droop 4.8s ease-in-out infinite; }
.pc-avatar[data-mood="surprised"] [data-part^="eye-"] { transform: scale(1.12); }
.pc-avatar[data-mood="surprised"] [data-part="mouth-open"] { opacity: 1; }
.pc-avatar[data-mood="surprised"] [data-part="mouth"] { opacity: 0; }
.pc-avatar[data-mood="shy"] [data-part="cheeks"] { opacity: 1; animation: pc-blush .9s ease-in-out 1; }
.pc-avatar[data-mood="shy"] [data-part^="pupil-"] { transform: translate(0, 3px) !important; }
.pc-avatar[data-mood="dizzy"] [data-part^="pupil-"] { animation: pc-dizzy .5s linear infinite; }
[data-part="cheeks"] { opacity: .8; transition: opacity .3s; }

@keyframes pc-sprout { 0%,100% { transform: rotate(-5deg); } 50% { transform: rotate(6deg); } }
@keyframes pc-droop { 0%,100% { transform: rotate(18deg); } 50% { transform: rotate(24deg); } }
@keyframes pc-wave { 0%,100% { transform: rotate(-80deg); } 50% { transform: rotate(-118deg); } }
@keyframes pc-arm { 0%,100% { transform: rotate(-14deg); } 50% { transform: rotate(14deg); } }
@keyframes pc-feet { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes pc-flail-l { 0%,100% { transform: rotate(40deg); } 50% { transform: rotate(75deg); } }
@keyframes pc-flail-r { 0%,100% { transform: rotate(-40deg); } 50% { transform: rotate(-75deg); } }
@keyframes pc-look { 0%,100% { transform: translate(0,0); } 25%,40% { transform: translate(-3.5px,-1px); } 60%,80% { transform: translate(3.5px,-1px); } }
@keyframes pc-dizzy { 0% { transform: translate(2.5px,0); } 25% { transform: translate(0,2.5px); } 50% { transform: translate(-2.5px,0); } 75% { transform: translate(0,-2.5px); } 100% { transform: translate(2.5px,0); } }
@keyframes pc-blush { 0% { opacity: .5; } 50% { opacity: 1; } 100% { opacity: 1; } }

/* ---------- effects ---------- */
.pc-zzz { position: absolute; right: 2%; top: -6%; font: 700 15px/1 system-ui, sans-serif; color: #5b6b79; opacity: 0; pointer-events: none; }
.pc-actor[data-activity="sleep"] .pc-zzz { animation: pc-zzz 2.4s ease-in-out infinite; }
.pc-actor[data-activity="sleep"] .pc-zzz:nth-child(2) { animation-delay: .8s; right: -6%; }
.pc-actor[data-activity="sleep"] .pc-zzz:nth-child(3) { animation-delay: 1.6s; right: -14%; }
@keyframes pc-zzz { 0% { opacity: 0; transform: translate(0,0) scale(.6); } 30% { opacity: .9; } 100% { opacity: 0; transform: translate(12px,-26px) scale(1.15); } }
.pc-spark { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #ffd166; pointer-events: none; animation: pc-spark .7s ease-out forwards; }
@keyframes pc-spark { from { opacity: 1; transform: translate(0,0) scale(1); } to { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.2); } }

/* ---------- toolbar ---------- */
.pc-toolbar {
  position: absolute; top: -6px; right: -34px; padding-left: 8px; display: flex; flex-direction: column; gap: 4px;
  opacity: 0; transform: translateX(-4px); transition: opacity .15s, transform .15s; pointer-events: none;
}
.pc-actor:hover .pc-toolbar, .pc-actor:focus-within .pc-toolbar, .pc-actor[data-toolbar="1"] .pc-toolbar { opacity: 1; transform: none; pointer-events: auto; }
.pc-actor[data-activity="dragging"] .pc-toolbar, .pc-actor[data-activity="exiting"] .pc-toolbar { opacity: 0 !important; pointer-events: none !important; }
.pc-btn {
  all: unset; box-sizing: border-box; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  background: #ffffff; color: #264653; box-shadow: 0 1px 4px rgba(0,0,0,.22); cursor: pointer;
}
.pc-btn:hover { background: #eef9f6; }
.pc-btn:focus-visible { outline: 2px solid #4c9ffe; outline-offset: 2px; }
.pc-btn svg { width: 14px; height: 14px; display: block; }

/* ---------- speech bubble ---------- */
.pc-bubble {
  position: absolute; left: 0; bottom: 0; max-width: 250px; min-width: 60px; padding: 9px 13px;
  background: #ffffff; color: #1f2933; border-radius: 16px; font: 500 14px/1.38 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 4px 16px rgba(15, 23, 42, .18), 0 0 0 1px rgba(15, 23, 42, .06);
  pointer-events: auto; cursor: pointer; opacity: 0; transform: translateY(6px) scale(.96);
  transition: opacity .18s ease, transform .18s ease; white-space: pre-wrap; overflow-wrap: anywhere;
}
.pc-bubble[data-open="1"] { opacity: 1; transform: none; }
.pc-bubble[hidden] { display: none; }
.pc-bubble::after {
  content: ""; position: absolute; bottom: -7px; left: var(--tail, 50%); width: 14px; height: 14px; margin-left: -7px;
  background: inherit; transform: rotate(45deg); border-radius: 0 0 4px 0;
  box-shadow: 3px 3px 4px rgba(15, 23, 42, .06);
}
.pc-ghost { visibility: hidden; }
.pc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---------- restore pill ---------- */
.pc-restore {
  all: unset; box-sizing: border-box; position: absolute; right: 14px; bottom: 14px; pointer-events: auto; cursor: pointer;
  padding: 7px 12px 7px 10px; border-radius: 999px; background: #264653; color: #fff; font: 600 12px/1 system-ui, sans-serif;
  box-shadow: 0 2px 10px rgba(0,0,0,.25); opacity: .78; display: flex; align-items: center; gap: 6px; transition: opacity .15s, transform .15s;
}
.pc-restore:hover, .pc-restore:focus-visible { opacity: 1; transform: translateY(-2px); }
.pc-restore[hidden] { display: none; }

@media (prefers-reduced-motion: reduce) {
  .pc-motion, [data-part] { animation-duration: 0s !important; animation-iteration-count: 1 !important; }
}
.pc-layer[data-reduced="1"] .pc-motion, .pc-layer[data-reduced="1"] [data-part] { animation-iteration-count: 1 !important; }
`;
