/**
 * Scripted story beats: tutorial ambush, cursed altars, the forest ambush, the North Gate,
 * the Blood Seal and the Veiled Countess fight (intro, phase 2, defeat and ending).
 */
import * as THREE from '../three.js';
import { Boss } from '../enemies/Boss.js';
import { ARENA } from '../world/areas/altar.js';

export class StoryEvents {
  constructor(game) {
    this.game = game;
  }

  /** Mark a trigger as fired (persisted) and spawn its enemies. */
  fire(name) {
    const g = this.game;
    if (g.flags['trig_' + name]) return [];
    g.flags['trig_' + name] = true;
    return g.enemies.fireTrigger(name);
  }

  startTutorial() {
    const g = this.game;
    g.quests.progress('m1', 'note');
    g.tasks.after(0.6, () => {
      this.fire('tutorial');
      g.audio.sting('soft');
      g.shake(0.3);
      g.world.lights.surge = 0.8;
      g.ui.subtitle('Something claws its way up through the floor grate…', true);
      g.tasks.after(1.5, () => g.ui.hint('Left-click to attack. Chain clicks for a combo. Use Q / E abilities when your blood energy allows.'));
    });
  }

  destroyAltar(id, altar, pos) {
    const g = this.game;
    if (g.flags['altar_' + id]) return;
    g.flags['altar_' + id] = true;
    altar.destroy();
    g.audio.play('altarBreak', { pos });
    g.fx.pillar(pos, 0xff1a30, 1.4, 12, 0.9);
    g.fx.ring(pos, { r0: 0.5, r1: 6, color: 0xff1a30, dur: 0.8 });
    g.particles.add.burst(new THREE.Vector3(pos.x, 2, pos.z), 60, { color: 0xff1030, size: 0.3, speed: 6, life: 0.9 });
    g.shake(0.5);
    g.quests.progress('s2', 'altars');
    g.player.addXP(25);
    const spawned = this.fire('altar_' + id);
    if (spawned.length) g.ui.subtitle('The altar\'s guardians claw their way out of the earth!', true);
  }

  ambush() {
    const g = this.game;
    if (g.flags.trig_ambush) return;
    const spawned = this.fire('ambush');
    g.horror.jumpscare();
    g.ui.banner('AMBUSH', 'The forest closes in. Survive!');
    for (const e of spawned) e.alert && e.alert(false);
  }

  breakSeal() {
    const g = this.game;
    g.flags.seal_broken = true;
    g.world.seal.set(false);
    g.quests.progress('m5', 'seal');
    g.audio.play('altarBreak');
    g.audio.play('shockwave');
    g.particles.add.burst(g.world.seal.group.position.clone().setY(2.5), 120, { color: 0xff1a30, size: 0.3, speed: 7, life: 1.1 });
    g.shake(0.6);
    g.ui.subtitle('The Blood Seal shatters. Beyond it, the altar waits beneath the moon.', true);
    g.requestAutosave();
  }

  startBoss() {
    const g = this.game;
    if (g.boss || g.flags.boss_defeated) return;
    g.flags.boss_started = true;
    g.world.seal.set(true);
    const boss = new Boss(g);
    g.boss = boss;
    g.enemies.add(boss);
    g.audio.playMusic('boss');
    g.audio.setMusicIntensity(0.2);
    g.audio.play('bossLaugh');
    g.ui.showBossBar(boss);
    g.ui.subtitle('A shape descends from the crimson moon…', true);
    g.tasks.after(2.9, () => {
      if (g.boss !== boss) return;
      g.dialogue.start('countess_intro', () => {
        boss.setState('idle');
        boss.cd = 1.0;
        g.audio.play('bossRoar');
        g.ui.hint('Watch her hands and the ground: red circles erupt, raised hands mean a volley. Stagger her with relentless attacks.');
      });
    });
  }

  bossPhase2() {
    const g = this.game;
    g.bossPhaseMoon = 1.6;
    g.audio.setMusicIntensity(1);
    g.audio.play('bossRoar');
    g.ui.banner('THE VEIL TEARS', '"Enough! See what the moon has made of me!"');
    g.screenTint(0x400010, 2.5, 0.3);
  }

  bossDefeated(boss) {
    const g = this.game;
    g.flags.boss_defeated = true;
    g.stats.bossTime = g.stats.playTime;
    g.slowmo(0.25, 2.0);
    g.audio.stopMusic();
    g.audio.play('bossRoar');
    g.shake(0.8);
    g.fx.pillar(boss.pos, 0xff1a30, 3, 30, 2.5);
    g.particles.add.burst(new THREE.Vector3(boss.pos.x, 2, boss.pos.z), 150, { color: 0xff1a30, color1: 0x200008, size: 0.35, speed: 8, life: 1.6, gravity: 1 });
    // remove her summoned crawlers
    for (const e of g.enemies.list) if (e.alive && e.def && e.def.group === 'bossAdds') e.die();
    g.projectiles.clear();
    g.quests.progress('m5', 'boss');
    g.tasks.after(2.2, () => {
      g.dialogue.start('countess_defeat', () => {
        boss.remove();
        g.boss = null;
        g.flags.boss_started = false;
        g.world.seal.set(false);
        g.bossPhaseMoon = 1;
        g.ui.hideBossBar();
        if (g.flags.ending === 'crimson') g.player.gainBlood(999);
        g.requestAutosave(true);
        g.showVictory();
      });
    });
  }

  /** Reset an unfinished boss fight when the player dies. */
  resetBoss() {
    const g = this.game;
    if (!g.boss) return;
    g.boss.remove();
    g.enemies.list = g.enemies.list.filter((e) => e !== g.boss);
    for (const e of g.enemies.list) if (e.alive && e.def && e.def.group === 'bossAdds') e.remove();
    g.boss = null;
    g.flags.boss_started = false;
    g.world.seal.set(false);
    g.bossPhaseMoon = 1;
    g.ui.hideBossBar();
    for (const t of g.world.triggers) if (t.id === 'boss_start') t.inside = false;
  }

  questComplete(qid) {
    const g = this.game;
    if (qid === 'm1') {
      g.ui.subtitle('Cold night air pours through the open doors. The Ashen Village lies beyond.', true);
    }
    if (qid === 'm2' && !g.flags.gate_open) {
      g.tasks.after(1.5, () => {
        g.dialogue.start('gate_open', () => {
          g.flags.gate_open = true;
          g.world.doors.northGate.open();
          g.audio.play('gate', { pos: new THREE.Vector3(0, 2, -92) });
          g.requestAutosave();
        });
      });
    }
    if (qid === 'm4') g.ui.subtitle('The altar\'s seal pulses with the rhythm of a heartbeat.', true);
  }

  onKill(e) {
    const g = this.game;
    const tag = e.def && e.def.tag;
    if (tag === 'tutorial') g.quests.progress('m1', 'crawlers');
    if (tag === 'ambush') g.quests.progress('m4', 'ambush');
    const group = e.def && e.def.group;
    if (group && !g.enemies.groupAlive(group) && !g.flags['cleared_' + group]) {
      g.flags['cleared_' + group] = true;
      if (group === 'forge') g.ui.subtitle('"Is… is it over? Over here! Behind the crates!" — a voice from the forge.', true);
      if (group === 'cage') g.ui.subtitle('The cage guards are dead. Someone stirs inside the iron cage.', true);
    }
    void ARENA;
  }
}
