/**
 * โหมดพรีเซนเทชันแบบโมชันกราฟิก (Motion Presentation)
 * วาดฉากเคลื่อนไหวบน <canvas> จากข้อมูลจริงใน State ของ app.js พร้อมเสียงสังเคราะห์ (Web Audio)
 * ตรวจข้อมูลทุก 1 วินาที — ถ้าข้อมูล/ตัวกรองเปลี่ยน ตัวเลขและกราฟจะค่อยๆ เปลี่ยนตามทันทีขณะเล่น
 */
(() => {
  const VW = 1920, VH = 1080;
  const C = {
    bg0: '#050d18', bg1: '#0c2238', text: '#f1f5f9', muted: '#94a3b8',
    orange: '#f15a29', sky: '#38bdf8', emerald: '#34d399', rose: '#fb7185', amber: '#fbbf24',
    line: 'rgba(148,163,184,0.14)', card: 'rgba(255,255,255,0.05)'
  };
  const FONT = "'Prompt', system-ui, sans-serif";
  const LIVE_REFRESH_MS = 60000;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const prog = (t, start, dur) => clamp((t - start) / dur);
  const outCubic = p => 1 - Math.pow(1 - p, 3);
  const inOutCubic = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const outBack = p => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const money = v => formatCurrency(v, 0);
  const millions = v => `${(v / 1e6).toFixed(2)} ล้านบาท`;
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1567.98, 1760, 2093, 2349.32];

  // ---------------- เสียง (สังเคราะห์ทั้งหมด ไม่ต้องใช้ไฟล์เสียง) ----------------
  const Sound = {
    ctx: null, master: null, muted: false, nextBeat: 0, lastTick: 0,
    init() {
      if (this.ctx) return this.ctx.resume();
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(comp);
      this.padFilter = ctx.createBiquadFilter();
      this.padFilter.type = 'lowpass';
      this.padFilter.frequency.value = 900;
      this.padGain = ctx.createGain();
      this.padGain.gain.value = 0;
      this.padFilter.connect(this.padGain).connect(this.master);
      this.pad = [0, 1, 2].map(i => {
        const o = ctx.createOscillator();
        o.type = i ? 'triangle' : 'sine';
        o.detune.value = (i - 1) * 7;
        o.connect(this.padFilter);
        o.start();
        return o;
      });
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    },
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    },
    padOn(on) {
      if (this.ctx) this.padGain.gain.setTargetAtTime(on ? 0.07 : 0, this.ctx.currentTime, 0.4);
    },
    chord(freqs) {
      if (!this.ctx) return;
      this.pad.forEach((o, i) => o.frequency.setTargetAtTime(freqs[i], this.ctx.currentTime, 0.25));
    },
    voice(type, freq, dur, vol, freqEnd, at) {
      if (!this.ctx) return;
      const t = at ?? this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    noiseHit(dur, vol, type, f0, f1, at) {
      if (!this.ctx) return;
      const t = at ?? this.ctx.currentTime;
      const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      src.buffer = this.noise;
      f.type = type;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.05);
    },
    whoosh() { this.noiseHit(0.7, 0.22, 'bandpass', 250, 4000); },
    pop(f = 660) { this.voice('triangle', f, 0.18, 0.14, f * 1.5); },
    low() { this.voice('sine', 220, 0.5, 0.18, 150); },
    chime(f = 880) {
      this.voice('sine', f, 1.3, 0.16);
      this.voice('sine', f * 1.5, 0.9, 0.07);
      this.voice('sine', f * 2, 0.6, 0.035);
    },
    tick(f) {
      if (!this.ctx || this.ctx.currentTime - this.lastTick < 0.055) return;
      this.lastTick = this.ctx.currentTime;
      this.voice('square', f, 0.03, 0.025);
    },
    // จังหวะเบาๆ 96 BPM ใต้ภาพ
    beat() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime, step = 60 / 96;
      if (this.nextBeat < now) this.nextBeat = now + 0.05;
      while (this.nextBeat < now + 0.12) {
        this.voice('sine', 120, 0.32, 0.32, 42, this.nextBeat);
        this.noiseHit(0.05, 0.035, 'highpass', 7000, 0, this.nextBeat + step / 2);
        this.nextBeat += step;
      }
    }
  };

  const CHORDS = {
    Am: [220, 261.63, 329.63], F: [174.61, 220, 261.63], C: [196, 261.63, 329.63],
    G: [196, 246.94, 293.66], Em: [164.81, 196, 246.94], Dm: [146.83, 174.61, 220]
  };

  // ---------------- ข้อมูลจริงจาก app.js ----------------
  function groupBy(txs, keyFn) {
    const map = {};
    txs.forEach(t => {
      const k = keyFn(t) || 'ไม่ระบุ';
      const g = map[k] || (map[k] = { key: k, savings: 0, purchase: 0, count: 0 });
      g.savings += t.totalSaving;
      g.purchase += t.totalPrice;
      g.count++;
    });
    return Object.values(map).sort((a, b) => b.savings - a.savings);
  }

  function snapshot() {
    const all = getMonthlyAggregatedData();
    const inScope = State.activeMonth !== 'ALL' ? all.filter(m => m.month === State.activeMonth) : all;
    const txs = getActiveScopeTransactions();
    let purchase = inScope.reduce((s, m) => s + (m.pv || 0), 0);
    let savings = inScope.reduce((s, m) => s + (m.cr || 0), 0);
    if (!State.data?.workbookSource && purchase === 0 && txs.length) {
      txs.forEach(t => { purchase += t.totalPrice; savings += t.totalSaving; });
    }
    const months = all.filter(m => m.pv > 0 || m.cr > 0);
    return {
      year: State.activeYear,
      month: State.activeMonth,
      targetRate: State.targetRate || 0.03,
      purchase, savings,
      credit: inScope.reduce((s, m) => s + (m.creditSaving || 0), 0),
      rate: purchase > 0 && !inScope.some(m => m.missingPurchase) ? savings / purchase : null,
      poCount: txs.length,
      months: months.length ? months : all,
      strategies: groupBy(txs, t => t.strategy).slice(0, 6),
      suppliers: groupBy(txs, t => t.supplier).slice(0, 5),
      pics: groupBy(txs, t => t.pic).slice(0, 7)
    };
  }

  const periodLabel = s => {
    const y = s.year === 'ALL' ? 'ทุกปี' : `ปี ${Number(s.year) + 543}`;
    return s.month === 'ALL' ? `${y} · ภาพรวมทั้งปี` : `${THAI_MONTHS[s.month]} ${y}`;
  };

  // ---------------- สถานะการเล่น ----------------
  let stage, canvas, ctx, hud = {};
  let S = null, sKey = '', sceneIdx = 0, sceneT = 0, playing = false, lastFrame = 0, raf = 0;
  let dt = 0, clock = 0, updatedFlash = 0, fired = new Set(), disp = {}, idleTimer = 0;
  let pollTimer = 0, refreshTimer = 0, wasFullscreen = false, fade = 1;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const logo = new Image();
  logo.src = 'qtc-logo.png';

  // ค่าที่แสดงจะไหลเข้าหาค่าจริงเสมอ — ข้อมูลเปลี่ยนกลางฉากก็ morph อย่างนุ่มนวล
  function tv(key, target) {
    const c = disp[key];
    if (c === undefined || !isFinite(c)) return (disp[key] = target);
    return (disp[key] = c + (target - c) * (1 - Math.exp(-dt * 5)));
  }

  function cue(at, id, fn) {
    if (sceneT >= at && !fired.has(id)) { fired.add(id); fn(); }
  }

  // ---------------- ตัวช่วยวาด ----------------
  function txt(s, x, y, size, o = {}) {
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.font = `${o.w || 600} ${size}px ${FONT}`;
    ctx.fillStyle = o.c || C.text;
    ctx.textAlign = o.a || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    if (o.ls) ctx.letterSpacing = `${o.ls}px`;
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function fit(s, maxW, size, w = 600) {
    ctx.font = `${w} ${size}px ${FONT}`;
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(w, 0), Math.max(h, 0), Math.max(0, Math.min(r, w / 2, h / 2)));
  }

  function card(x, y, w, h, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    rrect(x, y, w, h, 24);
    ctx.fillStyle = C.card;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function heading(t, eyebrow, title) {
    const p = outCubic(prog(t, 0.1, 0.8));
    txt(eyebrow.toUpperCase(), 120, 150, 24, { c: C.orange, w: 700, ls: 6, alpha: p });
    txt(title, 120 - (1 - p) * 60, 225, 60, { w: 700, alpha: p });
    ctx.fillStyle = C.orange;
    ctx.globalAlpha = fade * (p);
    ctx.fillRect(120, 252, 140 * p, 5);
    ctx.globalAlpha = fade;
  }

  function drawBackground(W, H) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, C.bg0);
    g.addColorStop(1, C.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const orb = (x, y, r, color) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, color);
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    };
    const m = reduceMotion ? 0 : clock;
    orb(W * (0.8 + Math.sin(m * 0.13) * 0.08), H * (0.2 + Math.cos(m * 0.11) * 0.08), H * 0.7, 'rgba(241,90,41,0.16)');
    orb(W * (0.15 + Math.cos(m * 0.09) * 0.06), H * (0.85 + Math.sin(m * 0.1) * 0.06), H * 0.8, 'rgba(56,189,248,0.13)');
    if (reduceMotion) return;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 60; i++) {
      const x = ((i * 337.7 + m * (8 + (i % 7) * 3)) % (W + 40)) - 20;
      const y = (i * 911.3) % H + Math.sin(m * 0.5 + i) * 12;
      ctx.globalAlpha = 0.15 + (i % 5) * 0.08;
      ctx.beginPath();
      ctx.arc(x, y, 1 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function liveBadge() {
    const pulse = 0.5 + Math.sin(clock * 4) * 0.5;
    const label = updatedFlash > 0 ? 'อัปเดตข้อมูลล่าสุดแล้ว' : 'LIVE DATA';
    ctx.font = `700 22px ${FONT}`;
    const w = ctx.measureText(label).width + 70;
    const x = VW - 120 - w;
    rrect(x, 110, w, 50, 25);
    ctx.fillStyle = updatedFlash > 0 ? `rgba(52,211,153,${0.15 + updatedFlash * 0.1})` : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.fillStyle = C.emerald;
    ctx.globalAlpha = 0.4 + pulse * 0.6;
    ctx.beginPath();
    ctx.arc(x + 30, 135, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    txt(label, x + 48, 136, 22, { w: 700, c: updatedFlash > 0 ? C.emerald : C.text, base: 'middle' });
  }

  // ---------------- ฉาก ----------------
  const SCENES = [
    {
      name: 'เปิดตัว', dur: 5.5, chord: 'Am',
      draw(t, s) {
        const pl = outBack(prog(t, 0.1, 0.9));
        if (logo.complete && logo.naturalWidth) {
          const h = 130 * pl, w = h * (logo.naturalWidth / logo.naturalHeight);
          ctx.save();
          ctx.globalAlpha = fade * (prog(t, 0.1, 0.4));
          rrect(VW / 2 - w / 2 - 24, 290 - h / 2 - 18, w + 48, h + 36, 28);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.drawImage(logo, VW / 2 - w / 2, 290 - h / 2, w, h);
          ctx.restore();
        }
        txt('QTC ENERGY · PROCUREMENT PERFORMANCE', VW / 2, 480, 26, { a: 'center', c: C.orange, w: 700, ls: 8, alpha: prog(t, 0.4, 0.6) });
        const pt = outCubic(prog(t, 0.7, 0.9));
        txt('ทุกการต่อรอง สร้างคุณค่า', VW / 2, 610 + (1 - pt) * 50, 112, { a: 'center', w: 700, alpha: pt });
        const lw = 640 * inOutCubic(prog(t, 1.2, 0.9));
        ctx.fillStyle = C.orange;
        ctx.fillRect(VW / 2 - lw / 2, 660, lw, 6);
        txt(`${periodLabel(s)} · ข้อมูลจริงจากระบบติดตาม KPI`, VW / 2, 745, 34, { a: 'center', c: C.muted, w: 500, alpha: prog(t, 1.7, 0.6) });
        cue(0.7, 'c1', () => Sound.chime(523.25));
        cue(1.2, 'c2', () => Sound.chime(783.99));
      }
    },
    {
      name: 'ภาพรวมผลประหยัด', dur: 8, chord: 'F',
      draw(t, s) {
        heading(t, 'ผลลัพธ์ภาพรวม', 'มูลค่าที่ต่อรองลดลงได้');
        const p = outCubic(prog(t, 0.6, 2.2));
        const sav = tv('sav', s.savings) * p;
        if (p > 0 && p < 1) Sound.tick(700 + p * 1300);
        txt(money(sav), 120, 520, 150, { w: 700, c: C.emerald, alpha: prog(t, 0.5, 0.3) });
        txt(millions(sav), 125, 590, 38, { c: C.muted, w: 500, alpha: prog(t, 0.8, 0.4) });

        const chips = [
          ['มูลค่าการสั่งซื้อรวม', s.purchase > 0 ? money(tv('pur', s.purchase)) : '—', C.sky],
          ['จำนวนรายการ PO', `${formatNumber(Math.round(tv('po', s.poCount)))} รายการ`, C.amber],
          ['ลดต้นทุนจากเครดิตเทอม', money(tv('cred', s.credit)), C.orange]
        ];
        chips.forEach(([label, value, color], i) => {
          const cp = outCubic(prog(t, 2.6 + i * 0.25, 0.7));
          const x = 120 + i * 570, y = 720 + (1 - cp) * 60;
          card(x, y, 530, 170, cp);
          ctx.fillStyle = color;
          ctx.globalAlpha = fade * (cp);
          ctx.fillRect(x, y + 30, 6, 110);
          ctx.globalAlpha = fade;
          txt(label, x + 40, y + 70, 28, { c: C.muted, w: 500, alpha: cp });
          txt(value, x + 40, y + 130, 46, { w: 700, alpha: cp });
          cue(2.6 + i * 0.25, 'chip' + i, () => Sound.pop(600 + i * 120));
        });

        // วงแหวนเป้าหมาย
        const cx = 1500, cy = 420, r = 170;
        const gp = outCubic(prog(t, 1.2, 2));
        const rate = s.rate === null ? 0 : tv('rate', s.rate);
        const met = s.rate !== null && s.rate >= s.targetRate;
        const color = s.rate === null ? C.muted : met ? C.emerald : C.rose;
        ctx.lineCap = 'round';
        ctx.lineWidth = 34;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        const frac = clamp(rate / s.targetRate) * gp;
        if (frac > 0) {
          ctx.strokeStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 30;
          ctx.beginPath();
          ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        txt(s.rate === null ? '—' : `${(rate * gp * 100).toFixed(2)}%`, cx, cy + 10, 78, { a: 'center', w: 700, alpha: prog(t, 1, 0.4) });
        txt(`เป้าหมาย ${(s.targetRate * 100).toFixed(2)}%`, cx, cy + 65, 28, { a: 'center', c: C.muted, w: 500, alpha: prog(t, 1, 0.4) });
        const sp = outBack(prog(t, 3.3, 0.6));
        if (sp > 0) {
          const label = s.rate === null ? 'รอมูลค่าซื้อรวม' : met ? '✓ ได้ตามเป้าหมาย' : 'ต่ำกว่าเป้าหมาย';
          ctx.save();
          ctx.translate(cx, cy + r + 75);
          ctx.scale(sp, sp);
          ctx.font = `700 32px ${FONT}`;
          const w = ctx.measureText(label).width + 60;
          rrect(-w / 2, -32, w, 64, 32);
          ctx.fillStyle = color;
          ctx.fill();
          txt(label, 0, 2, 32, { a: 'center', w: 700, c: '#051018', base: 'middle' });
          ctx.restore();
        }
        cue(3.3, 'stamp', () => (met ? Sound.chime(1046.5) : Sound.low()));
      }
    },
    {
      name: 'ผลรายเดือน', dur: 8.5, chord: 'C',
      draw(t, s) {
        heading(t, 'รายเดือน', `ผลลดต้นทุนจริง เทียบเป้าหมาย ${(s.targetRate * 100).toFixed(1)}%`);
        const x0 = 230, x1 = 1800, base = 900, top = 340, H = base - top;
        const ms = s.months, n = ms.length, slot = (x1 - x0) / n, bw = Math.min(slot * 0.56, 110);
        const max = tv('mmax', Math.max(1, ...ms.map(m => Math.max(m.cr || 0, m.target || 0)))) * 1.18;
        const gp = prog(t, 0.3, 0.6);
        for (let i = 0; i <= 4; i++) {
          const y = base - (H * i) / 4;
          ctx.fillStyle = C.line;
          ctx.globalAlpha = fade * (gp);
          ctx.fillRect(x0 - 20, y, (x1 - x0) + 20, 1.5);
          txt(`${((max * i) / 4 / 1e6).toFixed(1)}M`, x0 - 40, y + 8, 22, { a: 'right', c: C.muted, w: 500, alpha: gp });
        }
        ctx.globalAlpha = fade;
        ms.forEach((m, i) => {
          const d = 0.6 + i * (3.6 / n);
          const p = outCubic(prog(t, d, 0.7));
          const cx = x0 + slot * i + slot / 2;
          const h = (tv('m' + m.month, m.cr || 0) / max) * H * p;
          const dim = s.month !== 'ALL' && s.month !== m.month ? 0.35 : 1;
          const color = m.pct === null ? C.muted : m.isPassed ? C.emerald : C.sky;
          ctx.save();
          ctx.globalAlpha = fade * (dim);
          const g = ctx.createLinearGradient(0, base - h, 0, base);
          g.addColorStop(0, color);
          g.addColorStop(1, 'rgba(56,189,248,0.15)');
          rrect(cx - bw / 2, base - h, bw, h, 10);
          ctx.fillStyle = g;
          ctx.fill();
          if (m.target) {
            const ty = base - (tv('t' + m.month, m.target) / max) * H;
            ctx.globalAlpha = fade * (dim * p);
            ctx.strokeStyle = C.orange;
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 7]);
            ctx.beginPath();
            ctx.moveTo(cx - bw / 2 - 12, ty);
            ctx.lineTo(cx + bw / 2 + 12, ty);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
          txt(`${((m.cr || 0) / 1e6).toFixed(1)}M`, cx, base - h - 18, 24, { a: 'center', w: 700, alpha: prog(t, d + 0.5, 0.3) * dim });
          txt(THAI_MONTHS_SHORT[m.month], cx, base + 45, 26, { a: 'center', c: C.muted, w: 600, alpha: gp * dim });
          cue(d + 0.6, 'bar' + i, () => (m.isPassed ? Sound.chime(PENTA[i % PENTA.length]) : Sound.pop(440 + i * 20)));
        });
        const lp = prog(t, 1, 0.5);
        [[C.emerald, 'ผ่านเป้าหมาย'], [C.sky, 'ต่ำกว่าเป้าหมาย'], [C.orange, 'เป้าหมาย']].forEach(([c, l], i) => {
          const x = 230 + i * 250;
          ctx.globalAlpha = fade * (lp);
          ctx.fillStyle = c;
          rrect(x, i === 2 ? 287 : 277, 26, i === 2 ? 6 : 26, 4);
          ctx.fill();
          ctx.globalAlpha = fade;
          txt(l, x + 40, 300, 24, { c: C.muted, w: 500, alpha: lp });
        });
      }
    },
    {
      name: 'ผลสะสม', dur: 8, chord: 'G',
      draw(t, s) {
        heading(t, 'สะสมทั้งปี', 'เส้นทางผลประหยัดสะสม เทียบเป้าหมาย');
        let a = 0, b = 0;
        const act = s.months.map((m, i) => tv('ca' + i, (a += m.cr || 0)));
        const tgt = s.months.map((m, i) => tv('ct' + i, (b += m.target || 0)));
        const n = act.length, x0 = 200, x1 = 1480, base = 900, H = 540;
        const max = tv('cmax', Math.max(1, a, b)) * 1.1;
        const X = i => (n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1));
        const Y = v => base - (v / max) * H;
        const p = inOutCubic(prog(t, 0.6, 3.4));
        const gp = prog(t, 0.3, 0.6);
        ctx.globalAlpha = fade * (gp);
        for (let i = 0; i <= 4; i++) {
          ctx.fillStyle = C.line;
          ctx.fillRect(x0, base - (H * i) / 4, x1 - x0, 1.5);
          txt(`${((max * i) / 4 / 1e6).toFixed(0)}M`, x0 - 25, base - (H * i) / 4 + 8, 22, { a: 'right', c: C.muted, w: 500 });
        }
        s.months.forEach((m, i) => txt(THAI_MONTHS_SHORT[m.month], X(i), base + 45, 24, { a: 'center', c: C.muted, w: 500 }));
        ctx.globalAlpha = fade;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, x0 + (x1 - x0) * p + 4, VH);
        ctx.clip();
        const path = vals => { ctx.beginPath(); vals.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); };
        path(act);
        ctx.lineTo(X(n - 1), base);
        ctx.lineTo(X(0), base);
        const fill = ctx.createLinearGradient(0, base - H, 0, base);
        fill.addColorStop(0, 'rgba(52,211,153,0.35)');
        fill.addColorStop(1, 'rgba(52,211,153,0)');
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5;
        ctx.setLineDash([14, 10]);
        ctx.strokeStyle = C.orange;
        path(tgt);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 7;
        ctx.strokeStyle = C.emerald;
        ctx.shadowColor = C.emerald;
        ctx.shadowBlur = 20;
        path(act);
        ctx.stroke();
        ctx.restore();

        // จุดนำหน้าเส้น
        const fi = p * (n - 1), i0 = Math.floor(fi), i1 = Math.min(n - 1, i0 + 1), f = fi - i0;
        const hx = X(i0) + (X(i1) - X(i0)) * f, hy = Y(act[i0] + (act[i1] - act[i0]) * f);
        if (p > 0) {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(hx, hy, 11 + Math.sin(clock * 6) * 2, 0, Math.PI * 2);
          ctx.fill();
          if (p < 1) Sound.tick(500 + p * 900);
        }

        const ep = outCubic(prog(t, 4.2, 0.8));
        const gap = act[n - 1] - tgt[n - 1];
        const lx = 1560;
        card(lx, 360, 300, 150, ep);
        txt('ลดต้นทุนจริงสะสม', lx + 30, 410, 24, { c: C.muted, w: 500, alpha: ep });
        txt(money(act[n - 1]), lx + 30, 465, 38, { c: C.emerald, w: 700, alpha: ep });
        card(lx, 540, 300, 150, ep);
        txt('เป้าหมายสะสม', lx + 30, 590, 24, { c: C.muted, w: 500, alpha: ep });
        txt(money(tgt[n - 1]), lx + 30, 645, 38, { c: C.orange, w: 700, alpha: ep });
        card(lx, 720, 300, 150, ep);
        txt(gap >= 0 ? 'สูงกว่าเป้าหมาย' : 'ต่ำกว่าเป้าหมาย', lx + 30, 770, 24, { c: C.muted, w: 500, alpha: ep });
        txt(`${gap >= 0 ? '+' : '−'}${money(Math.abs(gap))}`, lx + 30, 825, 38, { c: gap >= 0 ? C.emerald : C.rose, w: 700, alpha: ep });
        cue(4.2, 'gap', () => (gap >= 0 ? Sound.chime(1318.5) : Sound.low()));
      }
    },
    {
      name: 'กลยุทธ์จัดซื้อ', dur: 8, chord: 'Em',
      draw(t, s) {
        heading(t, 'กลยุทธ์', 'สัดส่วนผลลดต้นทุนตามกลยุทธ์จัดซื้อ');
        const list = s.strategies;
        const total = list.reduce((x, g) => x + Math.max(0, g.savings), 0) || 1;
        const cx = 600, cy = 640, r = 250;
        const p = inOutCubic(prog(t, 0.5, 2.2));
        let ang = -Math.PI / 2;
        ctx.lineWidth = 90;
        list.forEach((g, i) => {
          const share = Math.max(0, tv('st' + g.key, g.savings)) / total;
          const sweep = Math.PI * 2 * share * p;
          ctx.strokeStyle = STRATEGY_COLOR_MAP[g.key] || DISTINCT_PALETTE[i % DISTINCT_PALETTE.length];
          ctx.beginPath();
          ctx.arc(cx, cy, r, ang, ang + Math.max(0, sweep - 0.015));
          ctx.stroke();
          ang += sweep;
        });
        txt(money(tv('sttot', total) * p), cx, cy + 10, 52, { a: 'center', w: 700, alpha: prog(t, 0.6, 0.4) });
        txt('ลดต้นทุนรวม', cx, cy + 60, 28, { a: 'center', c: C.muted, w: 500, alpha: prog(t, 0.6, 0.4) });
        if (!list.length) txt('ยังไม่มีข้อมูลกลยุทธ์ในช่วงเวลานี้', cx, cy + 120, 26, { a: 'center', c: C.muted });

        list.forEach((g, i) => {
          const lp = outCubic(prog(t, 1 + i * 0.25, 0.6));
          const y = 380 + i * 100, x = 1040 + (1 - lp) * 80;
          const color = STRATEGY_COLOR_MAP[g.key] || DISTINCT_PALETTE[i % DISTINCT_PALETTE.length];
          card(x, y - 50, 760, 84, lp);
          ctx.globalAlpha = fade * (lp);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x + 40, y - 8, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = fade;
          txt(fit(THAI_STRATEGIES[g.key] || g.key, 330, 28), x + 70, y + 2, 28, { w: 600, alpha: lp });
          txt(money(tv('sv' + g.key, g.savings)), x + 600, y + 2, 28, { a: 'right', w: 700, alpha: lp });
          txt(`${((Math.max(0, g.savings) / total) * 100).toFixed(1)}%`, x + 735, y + 2, 26, { a: 'right', c: color, w: 700, alpha: lp });
          cue(1 + i * 0.25, 'lg' + i, () => Sound.pop(520 + i * 90));
        });
      }
    },
    {
      name: 'คู่ค้าสูงสุด', dur: 8, chord: 'Dm',
      draw(t, s) {
        heading(t, 'คู่ค้า', '5 อันดับซัพพลายเออร์ที่ลดต้นทุนได้สูงสุด');
        const list = s.suppliers;
        const max = tv('supmax', Math.max(1, ...list.map(g => g.savings)));
        if (!list.length) txt('ยังไม่มีข้อมูลซัพพลายเออร์ในช่วงเวลานี้', VW / 2, 600, 30, { a: 'center', c: C.muted });
        list.forEach((g, i) => {
          const d = 0.6 + i * 0.4;
          const p = outCubic(prog(t, d, 0.9));
          const y = 340 + i * 132;
          const color = i === 0 ? C.amber : C.sky;
          ctx.globalAlpha = fade * (p);
          ctx.fillStyle = i === 0 ? C.amber : 'rgba(255,255,255,0.1)';
          ctx.beginPath();
          ctx.arc(170, y + 38, 36, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = fade;
          txt(`${i + 1}`, 170, y + 40, 34, { a: 'center', base: 'middle', w: 700, c: i === 0 ? '#051018' : C.text, alpha: p });
          txt(fit(g.key, 1000, 30), 240, y + 14, 30, { w: 600, alpha: p });
          const avg = g.purchase > 0 ? (g.savings / g.purchase) * 100 : 0;
          txt(`${g.count} รายการ · ลดเฉลี่ย ${avg.toFixed(1)}%`, 1800, y + 14, 24, { a: 'right', c: C.muted, w: 500, alpha: p });
          const w = (tv('sp' + g.key, g.savings) / max) * 1180 * p;
          const bg = ctx.createLinearGradient(240, 0, 240 + w, 0);
          bg.addColorStop(0, 'rgba(56,189,248,0.25)');
          bg.addColorStop(1, color);
          rrect(240, y + 36, w, 40, 20);
          ctx.fillStyle = bg;
          ctx.fill();
          txt(money(g.savings), 240 + w + 20, y + 66, 30, { w: 700, alpha: prog(t, d + 0.5, 0.4) });
          cue(d, 'sup' + i, () => Sound.whoosh());
          cue(d + 0.7, 'supp' + i, () => (i === 0 ? Sound.chime(1046.5) : Sound.pop(700 - i * 60)));
        });
      }
    },
    {
      name: 'ทีมจัดซื้อ', dur: 8, chord: 'F',
      draw(t, s) {
        heading(t, 'ทีมจัดซื้อ', 'ผลงานการต่อรองรายบุคคล');
        const list = s.pics, n = list.length;
        const total = list.reduce((x, g) => x + g.savings, 0) || 1;
        const max = tv('picmax', Math.max(1, ...list.map(g => g.savings)));
        const x0 = 220, x1 = 1700, base = 860, H = 440, slot = (x1 - x0) / Math.max(n, 1), bw = Math.min(slot * 0.55, 170);
        if (!n) txt('ยังไม่มีข้อมูลทีมในช่วงเวลานี้', VW / 2, 600, 30, { a: 'center', c: C.muted });
        list.forEach((g, i) => {
          const d = 0.6 + i * 0.3;
          const p = outBack(prog(t, d, 0.9));
          const cx = x0 + slot * i + slot / 2;
          const h = (tv('pc' + g.key, g.savings) / max) * H * p;
          const color = PIC_COLOR_MAP[g.key] || DISTINCT_PALETTE[i % DISTINCT_PALETTE.length];
          const grd = ctx.createLinearGradient(0, base - h, 0, base);
          grd.addColorStop(0, color);
          grd.addColorStop(1, 'rgba(255,255,255,0.04)');
          rrect(cx - bw / 2, base - h, bw, h, 16);
          ctx.fillStyle = grd;
          ctx.fill();
          const vp = prog(t, d + 0.6, 0.4);
          if (i === 0) txt('★', cx, base - h - 95, 44, { a: 'center', c: C.amber, alpha: vp });
          txt(money(g.savings), cx, base - h - 48, 28, { a: 'center', w: 700, alpha: vp });
          txt(`${((g.savings / total) * 100).toFixed(1)}%`, cx, base - h - 16, 22, { a: 'center', c: color, w: 700, alpha: vp });
          txt(fit(THAI_PIC_NAMES[g.key] || g.key, slot - 10, 30), cx, base + 48, 30, { a: 'center', w: 600, alpha: prog(t, d, 0.3) });
          txt(`${g.count} รายการ`, cx, base + 85, 22, { a: 'center', c: C.muted, w: 500, alpha: prog(t, d, 0.3) });
          cue(d + 0.6, 'pic' + i, () => (i === 0 ? Sound.chime(880) : Sound.pop(500 + i * 70)));
        });
      }
    },
    {
      name: 'สรุป', dur: 7, chord: 'C',
      draw(t, s) {
        txt('สรุปผลการดำเนินงาน', VW / 2, 260, 30, { a: 'center', c: C.orange, w: 700, ls: 6, alpha: prog(t, 0.2, 0.5) });
        txt(periodLabel(s), VW / 2, 345, 64, { a: 'center', w: 700, alpha: prog(t, 0.4, 0.6) });
        const stats = [
          ['ลดต้นทุนได้', money(tv('sav', s.savings)), C.emerald],
          ['อัตราส่วนลด', s.rate === null ? '—' : `${(tv('rate', s.rate) * 100).toFixed(2)}%`, s.rate !== null && s.rate >= s.targetRate ? C.emerald : C.rose],
          ['รายการ PO', formatNumber(Math.round(tv('po', s.poCount))), C.sky]
        ];
        stats.forEach(([label, value, color], i) => {
          const p = outBack(prog(t, 0.9 + i * 0.35, 0.7));
          const cx = 420 + i * 540;
          ctx.save();
          ctx.translate(cx, 600);
          ctx.scale(Math.max(p, 0.01), Math.max(p, 0.01));
          card(-240, -150, 480, 280);
          txt(label, 0, -60, 30, { a: 'center', c: C.muted, w: 500 });
          txt(value, 0, 40, 58, { a: 'center', c: color, w: 700 });
          ctx.restore();
          cue(0.9 + i * 0.35, 'st' + i, () => Sound.chime([659.25, 783.99, 1046.5][i]));
        });
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} น.`;
        txt(`ข้อมูลจริง ณ เวลา ${time} · ระบบติดตามส่วนลดจัดซื้อ QTC ENERGY`, VW / 2, 900, 28, { a: 'center', c: C.muted, w: 500, alpha: prog(t, 2.4, 0.6) });
      }
    }
  ];

  // ---------------- ลูปหลัก ----------------
  function goTo(i) {
    sceneIdx = (i + SCENES.length) % SCENES.length;
    sceneT = 0;
    fired = new Set();
    Sound.whoosh();
    Sound.chord(CHORDS[SCENES[sceneIdx].chord]);
    hud.name.textContent = `${sceneIdx + 1}/${SCENES.length} · ${SCENES[sceneIdx].name}`;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    clock += dt;
    updatedFlash = Math.max(0, updatedFlash - dt);
    const scene = SCENES[sceneIdx];
    if (playing) {
      sceneT += dt;
      Sound.beat();
      if (sceneT >= scene.dur) return goTo(sceneIdx + 1);
    }

    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground(W, H);
    const k = Math.min(W / VW, H / VH);
    ctx.setTransform(k, 0, 0, k, (W - VW * k) / 2, (H - VH * k) / 2);
    ctx.save();
    ctx.globalAlpha = fade = Math.min(prog(sceneT, 0, 0.35), 1 - prog(sceneT, scene.dur - 0.45, 0.45));
    scene.draw(sceneT, S);
    ctx.restore();
    liveBadge();

    hud.bars.forEach((b, i) => {
      b.style.width = i < sceneIdx ? '100%' : i === sceneIdx ? `${(sceneT / scene.dur) * 100}%` : '0%';
    });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }

  function setPlaying(p) {
    playing = p;
    Sound.padOn(p);
    hud.play.innerHTML = p ? ICONS.pause : ICONS.play;
    hud.play.setAttribute('aria-label', p ? 'หยุดชั่วคราว' : 'เล่นต่อ');
  }

  // ตรวจข้อมูลจริงทุกวินาที: ไฟล์ Excel ใหม่, ซิงค์ Google Sheet, เปลี่ยนปี/เดือน → ภาพเปลี่ยนตามทันที
  function pollData() {
    const next = snapshot(), key = JSON.stringify(next);
    if (key === sKey) return;
    const first = !sKey;
    S = next;
    sKey = key;
    if (!first) { updatedFlash = 3; Sound.chime(1567.98); }
  }

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="m23 9-6 6M17 9l6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  function build() {
    stage = document.createElement('div');
    stage.className = 'motion-stage';
    stage.hidden = true;
    stage.setAttribute('role', 'dialog');
    stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', 'พรีเซนเทชันแบบเคลื่อนไหว');
    stage.innerHTML = `
      <canvas class="motion-canvas" aria-hidden="true"></canvas>
      <div class="motion-hud">
        <div class="motion-progress">${SCENES.map((sc, i) => `<button class="motion-seg" data-seg="${i}" aria-label="ไปยังฉาก ${sc.name}"><span></span></button>`).join('')}</div>
        <div class="motion-controls">
          <button data-act="prev" aria-label="ฉากก่อนหน้า">${ICONS.prev}</button>
          <button data-act="toggle" class="motion-play" aria-label="หยุดชั่วคราว">${ICONS.pause}</button>
          <button data-act="next" aria-label="ฉากถัดไป">${ICONS.next}</button>
          <span class="motion-scene-name" aria-live="polite"></span>
          <span class="motion-hint">Space เล่น/หยุด · ← → เปลี่ยนฉาก · M เสียง · Esc ออก</span>
          <button data-act="mute" aria-label="ปิดเสียง">${ICONS.sound}</button>
          <button data-act="close" aria-label="ออกจากพรีเซนเทชัน">${ICONS.close}</button>
        </div>
      </div>`;
    document.body.appendChild(stage);
    canvas = stage.querySelector('canvas');
    ctx = canvas.getContext('2d');
    hud = {
      play: stage.querySelector('.motion-play'),
      mute: stage.querySelector('[data-act="mute"]'),
      name: stage.querySelector('.motion-scene-name'),
      bars: [...stage.querySelectorAll('.motion-seg span')]
    };
    const actions = {
      prev: () => goTo(sceneIdx - 1),
      next: () => goTo(sceneIdx + 1),
      toggle: () => setPlaying(!playing),
      mute: () => {
        Sound.setMuted(!Sound.muted);
        hud.mute.innerHTML = Sound.muted ? ICONS.muted : ICONS.sound;
        hud.mute.setAttribute('aria-label', Sound.muted ? 'เปิดเสียง' : 'ปิดเสียง');
      },
      close
    };
    stage.addEventListener('click', e => {
      const seg = e.target.closest('[data-seg]');
      if (seg) return goTo(Number(seg.dataset.seg));
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) actions[act]();
    });
    stage.addEventListener('mousemove', () => {
      stage.classList.remove('hud-idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => stage.classList.add('hud-idle'), 2500);
    });
    document.addEventListener('keydown', e => {
      if (stage.hidden) return;
      const map = { ' ': 'toggle', ArrowRight: 'next', ArrowLeft: 'prev', m: 'mute', M: 'mute', Escape: 'close' };
      if (!map[e.key]) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      actions[map[e.key]]();
    }, true);
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement === stage) wasFullscreen = true;
      else if (wasFullscreen && !stage.hidden) close();
    });
    window.addEventListener('resize', () => !stage.hidden && resize());
  }

  async function open() {
    if (!State.data) return alert('ยังโหลดข้อมูลไม่เสร็จ กรุณารอสักครู่');
    if (!stage) build();
    Sound.init();
    stage.hidden = false;
    wasFullscreen = false;
    stage.requestFullscreen?.().catch(() => {});
    await document.fonts.load(`700 40px ${FONT}`).catch(() => {});
    resize();
    disp = {};
    sKey = '';
    pollData();
    pollTimer = setInterval(pollData, 1000);
    refreshTimer = setInterval(() => window.refreshLatestData?.(false), LIVE_REFRESH_MS);
    lastFrame = 0;
    goTo(0);
    setPlaying(true);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    stage.querySelector('.motion-play').focus();
    stage.dispatchEvent(new Event('mousemove')); // เริ่มนับเวลาซ่อนแถบควบคุม
  }

  function close() {
    setPlaying(false);
    cancelAnimationFrame(raf);
    clearInterval(pollTimer);
    clearInterval(refreshTimer);
    stage.hidden = true;
    Sound.ctx?.suspend();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.getElementById('motion-start-btn')?.focus();
  }

  window.startMotionPresentation = open;
})();
