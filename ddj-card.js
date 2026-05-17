/**
 * ddj-card.js — Shared 道德經 card module
 * Hosted at: spgo5.github.io/Go5.SHARED/ddj-card.js
 *
 * Exposes window.DDJCard:
 *   DDJCard.fetch(chapterNum)            → Promise<data>
 *   DDJCard.render(data, opts)           → builds card HTML into containerId
 *   DDJCard.downloadCard(data, opts)     → saves PNG
 *   DDJCard.copyText(data, opts)         → copies plain text
 *   DDJCard.showConfirm(confirmId)       → flashes the "Downloaded!" / "Copied!" span
 *
 * opts = {
 *   containerId : string   — id of the <div> to render the card into
 *   userId      : string   — currentUser for filename (default 'Go')
 *   source      : string   — RNG source label or 'DDJ Directory'
 *   imgConfirmId: string   — id of the image confirm span
 *   txtConfirmId: string   — id of the text confirm span
 *   prefix      : string   — filename prefix e.g. 'FW' or 'DDJ' (default 'DDJ')
 * }
 */

(function () {
  'use strict';

  // ── GAS endpoint ──────────────────────────────────────────────────
  const DDJ_GAS_URL = 'https://script.google.com/macros/s/AKfycbyF1TjNDmeBqi-vlHx5GSzxQ_Zb54PLyMqcUoACNqjjc2GXBxaqcDmsH97SlAmSOGkd/exec';

  // ── Inject CSS once ───────────────────────────────────────────────
  const STYLE_ID = 'ddj-card-styles';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
/* ══ DDJ CARD — shared styles ══════════════════════════════════════ */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=Klee+One&family=Shalimar&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap');

:root {
  --ddj-lcol: 52px;
  --ddj-card-w: 520px;
  --ddj-no: #ccff00;
  --ddj-zh: #ffff00;
  --ddj-hv: #E0B0FF;
  --ddj-en: #CBFFC0;
  --ddj-green: #CBFFC0;
  --ddj-green-dim: #8FD9A0;
}

.ddj-export-card {
  width: var(--ddj-card-w);
  max-width: 96vw;
  background: linear-gradient(160deg, #00006a 0%, #000058 60%, #00004a 100%);
  border: 2px solid rgba(203,255,192,.8);
  border-radius: 8px;
  box-shadow: 0 0 0 4px rgba(0,0,50,.95), 0 0 0 6px rgba(203,255,192,.25), 0 16px 60px rgba(0,0,0,.8);
  padding: 32px 32px 24px 32px;
  position: relative;
}
.ddj-cc {
  position: absolute; font-size: 15px; color: #CBFFC0;
  opacity: .55; line-height: 1; pointer-events: none;
}
.ddj-cc.tl { top: 9px; left: 12px; }
.ddj-cc.tr { top: 9px; right: 12px; }
.ddj-cc.bl { bottom: 9px; left: 12px; }
.ddj-cc.br { bottom: 9px; right: 12px; }

.ddj-row { display: flex; align-items: flex-start; }
.ddj-col-no {
  width: var(--ddj-lcol); flex-shrink: 0; padding-top: 4px;
  font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 700;
  color: var(--ddj-no);
  text-shadow: 0 0 8px rgba(204,255,0,.6), 0 0 20px rgba(204,255,0,.3);
}
.ddj-col-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; }

.ddj-t-zh {
  font-family: 'Klee One', cursive; font-size: 30px; font-weight: 700;
  color: var(--ddj-zh); letter-spacing: .1em; line-height: 1.3;
  text-shadow: 0 0 6px rgba(255,255,255,1), 0 0 14px rgba(255,255,255,.9),
               0 0 30px rgba(255,255,255,.6), 0 0 55px rgba(255,255,255,.3);
}
.ddj-t-hv { font-family: 'Shalimar', cursive; font-size: 38px; color: var(--ddj-hv); line-height: 1.1; }
.ddj-t-en {
  font-family: 'Cormorant Garamond', serif; font-style: italic;
  font-size: 20px; font-weight: 700; color: var(--ddj-en); line-height: 1.4;
}

.ddj-flower { text-align: center; padding: 16px 0 12px; }
.ddj-flower img {
  height: 120px; width: auto; display: inline-block;
  filter: drop-shadow(0 0 10px rgba(180,140,255,.75))
          drop-shadow(0 0 24px rgba(180,140,255,.45))
          drop-shadow(0 0 50px rgba(120,90,220,.28));
}

.ddj-c-line {
  display: flex; align-items: flex-start;
  padding: 12px 0; border-top: 1px solid rgba(203,255,192,.12);
}
.ddj-c-zh {
  font-family: 'Klee One', cursive; font-size: 30px; line-height: 1.45;
  color: var(--ddj-zh);
  text-shadow: 0 0 6px rgba(255,255,255,1), 0 0 14px rgba(255,255,255,.9),
               0 0 30px rgba(255,255,255,.6), 0 0 55px rgba(255,255,255,.3);
}
.ddj-c-hv { font-family: 'Shalimar', cursive; font-size: 30px; line-height: 1.2; color: var(--ddj-hv); }
.ddj-c-en {
  font-family: 'Cormorant Garamond', serif; font-style: italic;
  font-size: 20px; line-height: 1.5; color: var(--ddj-en);
}

.ddj-card-foot {
  margin-top: 18px; padding-top: 12px;
  border-top: 1px solid rgba(203,255,192,.2);
  display: flex; justify-content: space-between;
  align-items: center; flex-wrap: wrap; gap: 4px;
}
.ddj-card-foot span {
  font-family: 'Crimson Pro', serif; font-style: italic;
  font-size: 11px; color: rgba(203,255,192,.5); letter-spacing: .05em;
}
/* ══ end DDJ CARD styles ════════════════════════════════════════════ */
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Fetch chapter data ────────────────────────────────────────────
  async function fetchChapter(n) {
    const r = await fetch(`${DDJ_GAS_URL}?chapter=${n}`, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('Network error');
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'Unknown error');
    return d;
  }

  // ── Build card HTML into container ───────────────────────────────
  function render(data, opts) {
    opts = opts || {};
    const containerId = opts.containerId || 'ddj-export-card';
    const source = opts.source || 'DDJ Directory';
    const container = document.getElementById(containerId);
    if (!container) { console.error('DDJCard: container #' + containerId + ' not found'); return; }

    const now = new Date();
    const timeStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

    // Build content lines HTML
    let linesHtml = '';
    (data.lines || []).forEach(l => {
      linesHtml += `
        <div class="ddj-c-line">
          <span class="ddj-col-no">${l.no}</span>
          <div class="ddj-col-text">
            <div class="ddj-c-zh">${l.zh}</div>
            <div class="ddj-c-hv">${l.hv}</div>
            <div class="ddj-c-en">${l.en}</div>
          </div>
        </div>`;
    });

    container.className = 'ddj-export-card';
    container.innerHTML = `
      <span class="ddj-cc tl">✦</span>
      <span class="ddj-cc tr">✦</span>

      <div class="ddj-row">
        <span class="ddj-col-no">${data.chapter}</span>
        <div class="ddj-col-text">
          <div class="ddj-t-zh">${data.title.zh}</div>
          <div class="ddj-t-hv">${data.title.hv}</div>
          <div class="ddj-t-en">${data.title.en}</div>
        </div>
      </div>

      <div class="ddj-flower">
        <img src="https://i.postimg.cc/sXYKGqbp/Momo-Hanoi-Old-Quarter-Temple.png"
             alt="" crossorigin="anonymous">
      </div>

      ${linesHtml}

      <div class="ddj-card-foot">
        <span>${source}</span>
        <span>${timeStr}</span>
      </div>

      <span class="ddj-cc bl">✦</span>
      <span class="ddj-cc br">✦</span>
    `;
  }

  // ── Download as PNG ───────────────────────────────────────────────
  async function downloadCard(data, opts) {
    opts = opts || {};
    const containerId = opts.containerId || 'ddj-export-card';
    const userId = opts.userId || 'Go';
    const prefix = opts.prefix || 'DDJ';
    const imgConfirmId = opts.imgConfirmId || null;

    // html2canvas must be loaded by the consuming page
    if (typeof html2canvas === 'undefined') {
      console.error('DDJCard.downloadCard: html2canvas not loaded');
      return;
    }

    const card = document.getElementById(containerId);
    if (!card) return;

    try {
      const cvs = await html2canvas(card, {
        backgroundColor: null,
        scale: 2, useCORS: true, allowTaint: false, logging: false,
        onclone: function(doc) {
          doc.querySelectorAll('.ddj-c-zh, .ddj-t-zh').forEach(function(el) {
            el.style.textShadow = '0 0 6px rgba(255,255,255,1), 0 0 14px rgba(255,255,255,.9), 0 0 30px rgba(255,255,255,.6), 0 0 55px rgba(255,255,255,.3)';
          });
          doc.querySelectorAll('.ddj-c-hv, .ddj-t-hv, .ddj-c-en, .ddj-t-en').forEach(function(el) {
            el.style.textShadow = 'none';
          });
        }
      });

      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yy = String(now.getFullYear()).slice(2);
      const hh = String(now.getHours()).padStart(2, '0');
      const mn = String(now.getMinutes()).padStart(2, '0');

      const link = document.createElement('a');
      link.download = `${prefix} ${userId} Ch${data.chapter} ${mm}${dd}${yy} ${hh}${mn}.png`;
      link.href = cvs.toDataURL('image/png');
      link.click();

      showConfirm(imgConfirmId);
    } catch(e) {
      alert('Render error: ' + e.message);
    }
  }

  // ── Copy as plain text ────────────────────────────────────────────
  async function copyText(data, opts) {
    opts = opts || {};
    const source = opts.source || 'DDJ Directory';
    const txtConfirmId = opts.txtConfirmId || null;

    if (!data) return;
    const now = new Date();
    let text = '道德經 · Chapter ' + data.chapter + '\n';
    text += (data.title.zh || '') + '\n';
    text += (data.title.hv || '') + '\n';
    text += (data.title.en || '') + '\n\n';
    (data.lines || []).forEach(function(l) {
      text += l.no + '. ' + l.zh + '\n';
      text += '   ' + l.hv + '\n';
      text += '   ' + l.en + '\n\n';
    });
    text += source + ' · ' + now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    text += "\nYou're using Super Portal 五 Go";

    try {
      await navigator.clipboard.writeText(text);
    } catch(e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    showConfirm(txtConfirmId);
  }

  // ── Flash confirm span ─────────────────────────────────────────────
  function showConfirm(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = '1';
    setTimeout(function() { el.style.opacity = '0'; }, 2400);
  }

  // ── Public API ────────────────────────────────────────────────────
  window.DDJCard = {
    fetch: fetchChapter,
    render: render,
    downloadCard: downloadCard,
    copyText: copyText,
    showConfirm: showConfirm
  };

})();
