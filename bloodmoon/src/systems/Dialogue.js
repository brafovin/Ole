/**
 * Dialogue runner. Scripts are arrays of nodes:
 *   { who, text | {default, lucien, seraphina, kairo}, choices?: [{ text, set?, goto?, effect? }], effect?, label?, goto? }
 * `who` is a speaker key ('player', 'elise', 'countess', 'narrator', ...).
 * While a dialogue is open the game is paused and the UI shows the panel.
 */
import { DIALOGUES, SPEAKERS } from './story.js';

export class DialogueSystem {
  constructor(game) {
    this.game = game;
    this.active = null;
  }

  start(id, onEnd) {
    const script = DIALOGUES[id];
    if (!script) {
      console.warn('[Dialogue] missing script', id);
      onEnd && onEnd();
      return;
    }
    this.active = { id, script: typeof script === 'function' ? script(this.game) : script, i: 0, onEnd };
    this.game.openOverlay('dialogue');
    this.show();
  }

  resolveText(node) {
    const t = node.text;
    if (typeof t === 'string') return t;
    if (typeof t === 'function') return t(this.game);
    return t[this.game.player.charId] || t.default;
  }

  speaker(node) {
    if (node.who === 'player') {
      const c = this.game.player.def;
      return { name: c.name, portrait: this.game.portraits[c.id], color: c.color };
    }
    const s = SPEAKERS[node.who] || { name: node.who };
    return { name: s.name, portrait: this.game.portraits[node.who], color: s.color, narrator: node.who === 'narrator' };
  }

  show() {
    const a = this.active;
    if (!a) return;
    const node = a.script[a.i];
    if (!node) return this.end();
    if (node.effect) {
      try {
        node.effect(this.game);
      } catch (err) {
        console.error('[Dialogue] effect failed', err);
      }
    }
    const choices = node.choices ? node.choices.map((c) => (typeof c.text === 'string' ? c.text : c.text[this.game.player.charId] || c.text.default)) : null;
    this.game.ui.showDialogue(this.speaker(node), this.resolveText(node), choices);
    this.game.audio.play(node.who === 'narrator' ? 'page' : 'uiOpen', { vol: 0.5 });
  }

  /** Continue (no choices on the current node). */
  advance() {
    const a = this.active;
    if (!a) return;
    const node = a.script[a.i];
    if (node && node.choices) return;
    this.goto(node && node.goto);
  }

  choose(index) {
    const a = this.active;
    if (!a) return;
    const node = a.script[a.i];
    if (!node || !node.choices || !node.choices[index]) return;
    const c = node.choices[index];
    if (c.set) Object.assign(this.game.flags, c.set);
    if (c.effect) c.effect(this.game);
    this.game.audio.play('uiClick');
    this.goto(c.goto);
  }

  goto(label) {
    const a = this.active;
    if (label === 'end') return this.end();
    if (label) {
      const idx = a.script.findIndex((n) => n.label === label);
      a.i = idx >= 0 ? idx : a.i + 1;
    } else a.i++;
    if (a.i >= a.script.length) this.end();
    else this.show();
  }

  end() {
    const a = this.active;
    this.active = null;
    this.game.ui.hideDialogue();
    this.game.closeOverlay('dialogue');
    if (a && a.onEnd) {
      try {
        a.onEnd();
      } catch (err) {
        console.error('[Dialogue] onEnd failed', err);
      }
    }
  }
}
