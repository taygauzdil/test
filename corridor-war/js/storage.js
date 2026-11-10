// Corridor War — permanent progression (unit levels, deck, gems) saved to localStorage.
(function (CC) {
  'use strict';
  const KEY = 'corridorWar.save.v1';

  function defaults() {
    const levels = {};
    for (const id of CC.CONFIG.unitOrder) levels[id] = 0;
    return { gems: 0, levels, deck: CC.CONFIG.defaultDeck.slice(), wins: 0, losses: 0 };
  }

  function validDeck(deck) {
    return Array.isArray(deck) && deck.length === CC.CONFIG.deckSize &&
      new Set(deck).size === deck.length && deck.every(id => CC.CONFIG.units[id]);
  }

  function load() {
    const d = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.gems === 'number') d.gems = s.gems;
        if (s.levels) for (const id in d.levels) if (typeof s.levels[id] === 'number') d.levels[id] = s.levels[id];
        if (validDeck(s.deck)) d.deck = s.deck;
        d.wins = s.wins | 0; d.losses = s.losses | 0;
      }
    } catch (e) { /* storage unavailable — play without saving */ }
    return d;
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function unitUpgradeCost(level) {
    const P = CC.CONFIG.progression;
    return Math.round(P.unitUpgradeBaseCost * Math.pow(P.unitUpgradeGrowth, level));
  }

  CC.Save = { load, save, defaults, validDeck, unitUpgradeCost };
})(globalThis.CC = globalThis.CC || {});
