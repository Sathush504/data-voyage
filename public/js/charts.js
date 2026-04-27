/* ============================================================
   DATA VOYAGE — charts.js
   Network Canvas · Bar · Line · Scatter · Area · Donut · Radar
   All drawn on HTML5 Canvas with smooth animated entry
   ============================================================ */

'use strict';

const charts = (() => {

  // ── HELPERS ────────────────────────────────────────────────

  function getCtx(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    return { canvas, ctx: canvas.getContext('2d'), W: canvas.width, H: canvas.height };
  }

  // Easing
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function easeInOutSine(t){ return -(Math.cos(Math.PI * t) - 1) / 2; }

  // Animate a value from 0→1 over `ms` ms, calling `onFrame(progress)` each frame
  function animate(ms, onFrame, onDone) {
    const start = performance.now();
    function step(now) {
      const raw = Math.min((now - start) / ms, 1);
      onFrame(easeOutCubic(raw));
      if (raw < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    }
    requestAnimationFrame(step);
  }

  // ── NETWORK GRAPH (hero) ────────────────────────────────────
  function initNetwork() {
    const c = getCtx('networkCanvas');
    if (!c || c.canvas._running) return;
    c.canvas._running = true;

    const { ctx, W, H } = c;
    const N = 42;
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: Math.random() * 4 + 2,
      hue: Math.random() > 0.6 ? 'cyan' : 'blue'
    }));

    let alpha = 0;
    animate(800, p => { alpha = p; });

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // edges
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            const opacity = (1 - dist / 120) * 0.55 * alpha;
            ctx.strokeStyle = `rgba(9,1,250,${opacity})`;
            ctx.lineWidth = 1;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // nodes
      nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.hue === 'cyan'
          ? `rgba(0,212,255,${0.8 * alpha})`
          : `rgba(61,53,251,${0.8 * alpha})`;
        ctx.fill();

        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      });

      requestAnimationFrame(draw);
    }
    draw();
  }

  // ── BAR CHART (home section) ────────────────────────────────
  function drawBarChart(id) {
    const c = getCtx(id);
    if (!c || c.canvas._drawn) return;
    c.canvas._drawn = true;

    const { ctx, W, H } = c;
    const data   = [65, 90, 45, 110, 75, 130, 85, 60];
    const labels = ['ML', 'Stats', 'NLP', 'CV', 'Graph', 'Bio', 'Rob', 'RL'];
    const max    = Math.max(...data) * 1.1;
    const barW   = (W - 60) / data.length;
    const padB   = 24;

    animate(900, (progress) => {
      ctx.clearRect(0, 0, W, H);
      data.forEach((v, i) => {
        const bh    = (v / max) * (H - padB - 16) * progress;
        const x     = 30 + i * barW + barW * 0.15;
        const y     = H - padB - bh;
        const grad  = ctx.createLinearGradient(0, y, 0, H - padB);
        grad.addColorStop(0, 'rgba(9,1,250,0.95)');
        grad.addColorStop(1, 'rgba(0,212,255,0.45)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW * 0.7, bh, [4, 4, 0, 0]);
        ctx.fill();

        if (progress > 0.5) {
          ctx.fillStyle = `rgba(255,255,255,${(progress - 0.5) * 2 * 0.55})`;
          ctx.font = '9px DM Sans, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(labels[i], x + barW * 0.35, H - 7);
        }
      });
    });
  }

  // ── LINE CHART (home section) ───────────────────────────────
  function drawLineChart(id) {
    const c = getCtx(id);
    if (!c || c.canvas._drawn) return;
    c.canvas._drawn = true;

    const { ctx, W, H } = c;
    const d1 = [30, 40, 35, 55, 45, 68, 75, 82, 70, 90];
    const d2 = [20, 25, 30, 28, 40, 38, 50, 55, 60, 72];

    function pts(data) {
      return data.map((v, i) => [
        28 + i * (W - 56) / 9,
        H - 16 - (v / 100) * (H - 36)
      ]);
    }

    animate(1000, (progress) => {
      ctx.clearRect(0, 0, W, H);

      // grid lines
      for (let i = 0; i < 4; i++) {
        const y = 12 + i * (H - 28) / 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(W - 10, y); ctx.stroke();
      }

      // clip to animated width
      const clipX = 28 + progress * (W - 56);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, clipX, H);
      ctx.clip();

      function drawLine(data, color, dotColor) {
        const p = pts(data);
        // area fill
        const areaGrad = ctx.createLinearGradient(0, 0, 0, H);
        areaGrad.addColorStop(0, color.replace(')', ',0.15)').replace('rgb', 'rgba'));
        areaGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        p.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
        ctx.lineTo(p[p.length - 1][0], H - 16);
        ctx.lineTo(p[0][0], H - 16);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();
        // line
        ctx.beginPath();
        p.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
        ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.stroke();
        // dots
        p.forEach(([x, y]) => {
          ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = dotColor; ctx.fill();
        });
      }

      drawLine(d1, 'rgb(9,1,250)',    '#3d35fb');
      drawLine(d2, 'rgb(0,212,255)',  '#00d4ff');
      ctx.restore();
    });
  }

  // ── SCATTER CHART (home section) ────────────────────────────
  function drawScatterChart(id) {
    const c = getCtx(id);
    if (!c || c.canvas._drawn) return;
    c.canvas._drawn = true;

    const { ctx, W, H } = c;
    const points = Array.from({ length: 65 }, () => ({
      x: 20 + Math.random() * (W - 40),
      y: 20 + Math.random() * (H - 40),
      r: Math.random() * 5 + 2,
      type: Math.random() > 0.5
    }));

    animate(1100, (progress) => {
      ctx.clearRect(0, 0, W, H);
      const count = Math.round(points.length * progress);
      points.slice(0, count).forEach((pt, idx) => {
        const scale = Math.min(1, (progress * points.length - idx) * 3);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r * scale, 0, Math.PI * 2);
        ctx.fillStyle = pt.type
          ? `rgba(9,1,250,${0.45 + Math.random() * 0.4})`
          : `rgba(0,212,255,${0.45 + Math.random() * 0.4})`;
        ctx.fill();
      });
    });
  }

  // ── DASHBOARD BIG AREA CHART ─────────────────────────────────
  function drawDashBigChart(trend) {
    const c = getCtx('dashBigChart');
    if (!c) return;
    const key = JSON.stringify(trend || []);
    if (c.canvas._drawnKey === key) return;
    c.canvas._drawnKey = key;

    const { ctx, W, H } = c;
    const months = (trend?.length ? trend : Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: 0 })))
      .map(x => x.label);
    const vals   = (trend?.length ? trend : Array.from({ length: 12 }, () => ({ value: 0 }))).map(x => x.value || 0);
    const max    = Math.max(4, ...vals) * 1.2;
    const padL = 50, padR = 20, padT = 24, padB = 36;

    function getPts(pct) {
      return vals.map((v, i) => [
        padL + i * (W - padL - padR) / 11,
        H - padB - (v / max) * (H - padT - padB) * pct
      ]);
    }

    animate(1200, (progress) => {
      ctx.clearRect(0, 0, W, H);

      // Y grid
      for (let i = 0; i <= 4; i++) {
        const y = padT + i * (H - padT - padB) / 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        const val = Math.round(max - (max / 4) * i);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '9px DM Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(val, padL - 6, y + 3);
      }

      const pts = getPts(progress);

      // Area
      const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
      grad.addColorStop(0, 'rgba(9,1,250,0.32)');
      grad.addColorStop(1, 'rgba(9,1,250,0)');
      ctx.beginPath();
      pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.lineTo(pts[pts.length - 1][0], H - padB);
      ctx.lineTo(pts[0][0], H - padB);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      // Line
      ctx.beginPath();
      pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.strokeStyle = '#0901FA'; ctx.lineWidth = 2.5; ctx.stroke();

      // Dots + labels
      pts.forEach(([x, y], i) => {
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#00d4ff'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '9px DM Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(months[i] || '', x, H - padB + 14);
      });
    });
  }

  // ── DONUT / PIE CHART ───────────────────────────────────────
  function drawDashPie(domains) {
    const c = getCtx('dashPie');
    if (!c) return;
    const key = JSON.stringify(domains || []);
    if (c.canvas._drawnKey === key) return;
    c.canvas._drawnKey = key;

    const { ctx, W, H } = c;
    const cx = W / 2, cy = H / 2 - 6;
    const outerR = Math.min(W, H) / 2 - 24;
    const innerR = outerR * 0.52;

    const slices = (domains?.length ? domains : [{ pct: 1, color: '#0901FA', label: '—', count: 0 }])
      .map(d => ({ pct: d.pct ?? 0, color: d.color || '#0901FA', label: d.label || '—', count: d.count || 0 }));
    const total = slices.reduce((a, s) => a + (s.count || 0), 0);

    animate(1000, (progress) => {
      ctx.clearRect(0, 0, W, H);

      let start = -Math.PI / 2;
      slices.forEach(sl => {
        const sweep = sl.pct * Math.PI * 2 * progress;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, outerR, start, start + sweep);
        ctx.closePath();
        ctx.fillStyle = sl.color; ctx.fill();
        ctx.strokeStyle = 'rgba(13,18,51,0.8)';
        ctx.lineWidth = 2; ctx.stroke();
        start += sweep;
      });

      // hole
      ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.fillStyle = '#0d1233'; ctx.fill();

      // center text
      if (progress > 0.6) {
        const alpha = (progress - 0.6) / 0.4;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'white';
        ctx.font = `bold 15px Syne, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(total || 0), cx, cy - 7);
        ctx.font = '10px DM Sans, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Papers', cx, cy + 9);
        ctx.globalAlpha = 1;
      }
    });
  }

  // ── RADAR CHART ──────────────────────────────────────────────
  function drawDashRadar(radar) {
    const c = getCtx('dashRadar');
    if (!c) return;
    const key = JSON.stringify(radar || {});
    if (c.canvas._drawnKey === key) return;
    c.canvas._drawnKey = key;

    const { ctx, W, H } = c;
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(W, H) / 2 - 32;
    const axes = radar?.axes?.length ? radar.axes : ['Views', 'Endorsements', 'Badges', 'Researchers', 'Papers'];
    const N    = axes.length;
    const vals1 = (radar?.values?.length ? radar.values : Array.from({ length: N }, () => 0)).map(v => Math.max(0, Math.min(1, Number(v) || 0)));

    function getPoint(i, val, radius) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      return [cx + radius * val * Math.cos(a), cy + radius * val * Math.sin(a)];
    }

    animate(1000, (progress) => {
      ctx.clearRect(0, 0, W, H);

      // grid rings
      for (let lvl = 1; lvl <= 4; lvl++) {
        const rr = r * lvl / 4;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const [x, y] = getPoint(i, 1, rr);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1; ctx.stroke();
      }

      // spokes
      for (let i = 0; i < N; i++) {
        const [x, y] = getPoint(i, 1, r);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1; ctx.stroke();
      }

      // polygons
      function drawPolygon(vals, strokeColor, fillColor) {
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const [x, y] = getPoint(i, vals[i] * progress, r);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = fillColor; ctx.fill();
        ctx.strokeStyle = strokeColor; ctx.lineWidth = 2; ctx.stroke();
      }

      drawPolygon(vals1, '#0901FA', 'rgba(9,1,250,0.18)');

      // axis labels
      if (progress > 0.7) {
        const labelAlpha = (progress - 0.7) / 0.3;
        ctx.globalAlpha = labelAlpha;
        axes.forEach((label, i) => {
          const [x, y] = getPoint(i, 1, r + 18);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = '10px DM Sans, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x, y);
        });
        ctx.globalAlpha = 1;
      }
    });
  }

  // ── ADMIN CHARTS ───────────────────────────────────────────
  function drawAdminTrends(trends) {
    const c = getCtx('admin-chart-trends');
    if (!c) return;
    const { ctx, W, H } = c;
    const data = (trends && trends.length) ? trends : [12, 19, 3, 5, 2, 3, 15, 20, 25, 30, 28, 35];
    const max = Math.max(10, ...data) * 1.2;
    const pad = 30;

    animate(1000, p => {
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = pad + i * (W - pad * 2) / (data.length - 1);
        const y = H - pad - (v / max) * (H - pad * 2) * p;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#0901FA'; ctx.lineWidth = 3; ctx.stroke();
    });
  }

  function drawAdminDomains(domains) {
    const c = getCtx('admin-chart-domains');
    if (!c) return;
    const { ctx, W, H } = c;
    const data = (domains && domains.length) ? domains : [
      { label: 'ML', value: 40, color: '#0901FA' },
      { label: 'Stats', value: 30, color: '#00d4ff' },
      { label: 'NLP', value: 20, color: '#3d35fb' },
      { label: 'Bio', value: 10, color: '#ca8a04' }
    ];
    const total = data.reduce((a, b) => a + (Number(b.value) || 0), 0);
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 20;

    animate(1000, p => {
      ctx.clearRect(0, 0, W, H);
      let start = -Math.PI / 2;
      data.forEach(d => {
        const sweep = (Number(d.value) / total) * Math.PI * 2 * p;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, start + sweep);
        ctx.fillStyle = d.color; ctx.fill();
        start += sweep;
      });
    });
  }

  // ── HOME MINI CHARTS ────────────────────────────────────────
  function initHome() {
    initNetwork();
    drawBarChart('homeBarChart');
    drawLineChart('homeLineChart');
    drawScatterChart('homeScatterChart');
  }

  // ── DASHBOARD CHARTS ────────────────────────────────────────
  async function initDash() {
    try {
      const data = await window.API?.getDashboardCharts?.();
      drawDashBigChart(data?.trend);
      drawDashPie(data?.domains);
      drawDashRadar(data?.radar);
    } catch {
      drawDashBigChart([]);
      drawDashPie([]);
      drawDashRadar(null);
    }
  }

  // Public API
  return { initHome, initDash, drawAdminTrends, drawAdminDomains };

})();
