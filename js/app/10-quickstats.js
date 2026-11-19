/* PAWCARE quickstats（旧 app.js を分割。読み込み順は index.html の <script> の並び） */
'use strict';

/* ============================================================
 * v1.5 共通：時間の表記と、記録の回数・最後の時刻
 * ============================================================ */
function agoText(dt) {
  const d = parseLocal(dt);
  if (!d) return '';
  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (min < 60) return min + '分前';
  if (min < 1440) return Math.floor(min / 60) + '時間前';
  return Math.floor(min / 1440) + '日前';
}
function lastLog(petId, cat) {
  return logsSorted(db.logs.filter((l) => l.petId === petId && l.category === cat))[0] || null;
}
function quickStatText(petId, cat) {
  const last = lastLog(petId, cat);
  if (cat === 'weight') return last && last.value ? last.value + 'kg・' + agoText(last.datetime) : '—';
  const weekAgo = toLocalInput(new Date(Date.now() - 7 * 86400000));
  if (!last || last.datetime < weekAgo) return '—';
  const today = db.logs.filter((l) => l.petId === petId && l.category === cat && l.datetime.slice(0, 10) === todayStr()).length;
  return today + '回・' + agoText(last.datetime);
}
function updateQuickStats() {
  if (currentView !== 'home') return;
  const pet = activePet();
  if (!pet) return;
  document.querySelectorAll('.quick-btn[data-cat] .qs').forEach((el) => { el.textContent = quickStatText(pet.id, el.parentNode.dataset.cat); });
}
setInterval(updateQuickStats, 60000);

/* 電話メモ・要点に使う「24時間の回数と最後の時刻」 */
const KEY_CATS = ['ingest', 'vomit', 'regurgitate', 'stool', 'urine', 'food', 'water', 'medicine'];
function countsWithLast(logs) {
  const out = {};
  logs.forEach((l) => {
    const e = out[l.category] || (out[l.category] = { n: 0, last: '' });
    e.n += 1;
    if (l.datetime > e.last) e.last = l.datetime;
  });
  return out;
}
