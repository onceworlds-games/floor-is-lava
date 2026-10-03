// Badges, awarded where they happen, once per session. Nothing valuable hangs on them.
import { badges as api, leaderboards } from './platform.js';

const given = new Set();

export function award(id) {
  if (given.has(id)) return;
  given.add(id);
  api.award(id);
}

/** After a night: what the ledger and the night's stats earned. */
export function nightBadges(ledger, stats, profile) {
  if (!ledger) return;
  if (ledger.result === 'dawn' && ledger.night === 1) award('first-light');
  if (ledger.saved >= 10) award('safe-harbour');
  if (ledger.result === 'dawn' && ledger.wrecked === 0 && ledger.shipsIn >= 4) award('no-wrecks');
  if (ledger.result === 'dawn' && stats && stats.oilOut && stats.powerOut) award('out-of-oil');
  if (ledger.titan) award('titan-down');
  if (stats && stats.strikes > 0 && ledger.result === 'dawn' && stats.cracks === 0) award('lightning-rod');
  if (profile) {
    if (profile.sirens >= 5) award('siren-song');
    if (profile.mimics >= 5) award('false-lights');
    if (profile.pets >= 10) award('good-cat');
  }
}

export function seasonBadges(season) {
  if (season.over === 'won') {
    award('twelve-nights');
    if (season.asc >= 6) award('storm-six');
  }
}

export function submitScores(profile, season, score) {
  if (season.over === 'won' || season.over === 'lost') leaderboards.submit('season-score', score);
  if (season.endless && season.totals.nights > 12) leaderboards.submit('endless-nights', season.totals.nights - 12);
  if (profile.shipsSaved > 0) leaderboards.submit('ships-saved', profile.shipsSaved);
}
