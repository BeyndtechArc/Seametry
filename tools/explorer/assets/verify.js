/**
 * The verification ritual.
 *
 * Everything here is real computation on real data. The batch was sealed by
 * the Go engine; this file recomputes its digests and Merkle path in the
 * visitor's browser using Web Crypto, and compares the result to the published
 * root. It shares no code with the server, which is the only thing that makes
 * the closing line honest.
 *
 * It works with the network disconnected after load. That is deliberate: a
 * verification that needs to phone home is not a verification.
 */
(function () {
  'use strict';

  var batch = window.__SEAMETRY_BATCH__;
  if (!batch) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };
  var HEX = '0123456789abcdef';

  var enc = new TextEncoder();

  /** RFC 8785 subset, matching internal/canonical. */
  function canonicalize(value) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('non-finite number');
        if (!Number.isInteger(value)) throw new Error('non-integer number');
        if (!Number.isSafeInteger(value)) throw new Error('integer outside the safe range');
      }
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (k) {
      return JSON.stringify(k) + ':' + canonicalize(value[k]);
    }).join(',') + '}';
  }

  function sha256(bytes) {
    return crypto.subtle.digest('SHA-256', bytes).then(function (b) { return new Uint8Array(b); });
  }
  function cat() {
    var parts = [].slice.call(arguments);
    var n = parts.reduce(function (a, p) { return a + p.length; }, 0);
    var out = new Uint8Array(n), i = 0;
    parts.forEach(function (p) { out.set(p, i); i += p.length; });
    return out;
  }
  function hex(b) {
    var s = '';
    for (var i = 0; i < b.length; i++) s += HEX[b[i] >> 4] + HEX[b[i] & 15];
    return s;
  }
  function unhex(h) {
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }

  var digestBody = function (o) { return sha256(enc.encode(canonicalize(o))); };
  var leafHash = function (pub, priv) { return sha256(cat(new Uint8Array([0]), pub, priv)); };
  var nodeHash = function (l, r) { return sha256(cat(new Uint8Array([1]), l, r)); };

  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); });
  };

  /** Resolves characters out of noise. Purely presentational. */
  function resolve(el, text, ms) {
    if (reduce || !ms) { el.textContent = text; return Promise.resolve(); }
    return new Promise(function (done) {
      var t0 = performance.now();
      function frame(t) {
        var p = Math.min(1, (t - t0) / ms), fixed = Math.floor(p * text.length);
        var s = text.slice(0, fixed);
        for (var i = fixed; i < text.length; i++) s += HEX[(Math.random() * 16) | 0];
        el.textContent = s;
        if (p < 1) requestAnimationFrame(frame); else { el.textContent = text; done(); }
      }
      requestAnimationFrame(frame);
    });
  }

  var bySerial = {};
  batch.proofs.forEach(function (p) { bySerial[p.serial] = p; });

  var chips = $('chips');
  batch.proofs.forEach(function (p) {
    var c = document.createElement('button');
    c.type = 'button'; c.className = 'chip'; c.textContent = p.serial;
    c.addEventListener('click', function () { $('serial').value = p.serial; run(p.serial, false); });
    chips.appendChild(c);
  });

  /**
   * Draws a tree for any leaf count, not only powers of two. Levels are built
   * by the same RFC 6962 split the engine uses, so the picture is the shape
   * that was actually hashed rather than an illustration of one.
   */
  function splitPoint(n) { var k = 1; while (k * 2 < n) k *= 2; return k; }

  /**
   * Groups the tree's spans by depth, so each level can be drawn as a row.
   * The recursion uses the same split the engine uses, which is what makes
   * the picture the shape that was actually hashed rather than an
   * illustration of one.
   */
  function buildLevels(n) {
    var byDepth = {};
    (function walk(lo, hi, depth) {
      byDepth[depth] = byDepth[depth] || [];
      byDepth[depth].push({ lo: lo, hi: hi });
      if (hi - lo <= 1) return;
      var k = splitPoint(hi - lo);
      walk(lo, lo + k, depth + 1);
      walk(lo + k, hi, depth + 1);
    })(0, n, 0);
    var depths = Object.keys(byDepth).map(Number).sort(function (a, b) { return b - a; });
    return depths.map(function (d) { return byDepth[d]; });
  }

  var tree = $('tree');

  function drawTree(n, litPath) {
    var levels = buildLevels(n);
    var W = Math.max(520, n * 78), rowH = 62;
    var H = levels.length * rowH + 30;
    tree.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    tree.style.minWidth = W + 'px';
    tree.innerHTML = '';
    var NS = 'http://www.w3.org/2000/svg';

    var pos = {};
    levels.forEach(function (row, li) {
      var y = H - 26 - li * rowH;
      row.forEach(function (span) {
        var mid = (span.lo + span.hi) / 2;
        pos[span.lo + '-' + span.hi] = { x: 30 + (mid / n) * (W - 60), y: y };
      });
    });

    function keyOf(s) { return s.lo + '-' + s.hi; }

    // Edges first so nodes sit above them.
    levels.forEach(function (row) {
      row.forEach(function (span) {
        if (span.hi - span.lo <= 1) return;
        var k = splitPoint(span.hi - span.lo);
        [{ lo: span.lo, hi: span.lo + k }, { lo: span.lo + k, hi: span.hi }].forEach(function (child) {
          var a = pos[keyOf(span)], b = pos[keyOf(child)];
          if (!a || !b) return;
          var line = document.createElementNS(NS, 'line');
          line.setAttribute('x1', b.x); line.setAttribute('y1', b.y);
          line.setAttribute('x2', a.x); line.setAttribute('y2', a.y);
          if (litPath && litPath[keyOf(child)] && litPath[keyOf(span)]) line.setAttribute('class', 'lit');
          tree.appendChild(line);
        });
      });
    });

    levels.forEach(function (row, li) {
      row.forEach(function (span) {
        var p = pos[keyOf(span)];
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
        c.setAttribute('r', li === levels.length - 1 ? 7 : 5);
        var cls = [];
        if (litPath && litPath[keyOf(span)] === 'on') cls.push('lit');
        if (litPath && litPath[keyOf(span)] === 'sib') cls.push('sib');
        if (cls.length) c.setAttribute('class', cls.join(' '));
        tree.appendChild(c);
      });
    });

    // Leaf labels.
    for (var i = 0; i < n; i++) {
      var p = pos[i + '-' + (i + 1)];
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', p.x); t.setAttribute('y', H - 8);
      t.setAttribute('text-anchor', 'middle');
      t.textContent = batch.proofs[i] ? batch.proofs[i].serial.slice(-3) : String(i);
      tree.appendChild(t);
    }
  }

  /** Which spans the audit path touches, so the drawing matches the maths. */
  function pathSpans(n, index) {
    var lit = {}, lo = 0, hi = n;
    lit[index + '-' + (index + 1)] = 'on';
    while (hi - lo > 1) {
      var k = splitPoint(hi - lo);
      if (index < lo + k) {
        lit[(lo + k) + '-' + hi] = 'sib';
        hi = lo + k;
      } else {
        lit[lo + '-' + (lo + k)] = 'sib';
        lo = lo + k;
      }
      lit[lo + '-' + hi] = 'on';
    }
    lit['0-' + n] = 'on';
    return lit;
  }

  var short = function (h) { return h.slice(0, 18) + '…' + h.slice(-10); };

  var busy = false, current = null;

  async function run(serial, tamper) {
    if (busy) return;
    var s = (serial || '').trim().toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0');
    var proof = bySerial[s];
    if (!proof) {
      $('msg').textContent = s
        ? 'No hallmark with serial ' + s + ' is in this batch. Choose one above.'
        : 'Enter a serial, or choose one above.';
      return;
    }
    busy = true; current = s; $('msg').textContent = '';
    $('result').hidden = false;
    ['s1', 's2', 's3', 's4'].forEach(function (id) { $(id).classList.remove('on'); });
    ['hp', 'hq', 'hl', 'rc', 'rp'].forEach(function (id) { $(id).textContent = ' '; });
    $('levels').innerHTML = ''; $('verdict').textContent = ''; $('verdict').className = 'verdict';
    $('closing').classList.remove('on');
    $('result').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

    var body = JSON.parse(JSON.stringify(proof.public_body));
    var shown = JSON.stringify(body, null, 2);
    if (tamper) {
      body.policy_version = body.policy_version.replace(/(\d)$/, function (d) {
        return String((parseInt(d, 10) + 1) % 10);
      });
      shown = JSON.stringify(body, null, 2);
    }

    var index = batch.proofs.indexOf(proof);
    drawTree(batch.proofs.length, null);

    // Build the DOM rather than splicing HTML, so a public body can never
    // carry markup into the page.
    var pre = $('pub');
    pre.textContent = '';
    if (tamper) {
      var needle = '"' + body.policy_version + '"';
      var at = shown.indexOf(needle);
      pre.appendChild(document.createTextNode(shown.slice(0, at)));
      var mark = document.createElement('mark');
      mark.textContent = needle;
      pre.appendChild(mark);
      pre.appendChild(document.createTextNode(shown.slice(at + needle.length)));
    } else {
      pre.textContent = shown;
    }

    $('s1').classList.add('on');
    await sleep(300);
    var publicDigest = await digestBody(body);
    await resolve($('hp'), hex(publicDigest), 650);

    await sleep(200); $('s2').classList.add('on');
    await resolve($('hq'), proof.private_commitment, 450);
    var leaf = await leafHash(publicDigest, unhex(proof.private_commitment));
    await resolve($('hl'), hex(leaf), 550);

    await sleep(200); $('s3').classList.add('on');
    drawTree(batch.proofs.length, pathSpans(batch.proofs.length, index));
    var cur = leaf;
    for (var i = 0; i < proof.path.length; i++) {
      var step = proof.path[i];
      var sib = unhex(step.hash);
      cur = step.side === 'left' ? await nodeHash(sib, cur) : await nodeHash(cur, sib);
      var dt = document.createElement('dt');
      dt.textContent = i === proof.path.length - 1 ? 'Root' : 'Level ' + (i + 1);
      var dd = document.createElement('dd');
      dd.title = hex(cur);
      $('levels').append(dt, dd);
      await resolve(dd, short(hex(cur)), 400);
      await sleep(120);
    }

    await sleep(200); $('s4').classList.add('on');
    await resolve($('rc'), hex(cur), 450);
    $('rp').textContent = batch.root;
    await sleep(250);

    var ok = hex(cur) === batch.root;
    $('verdict').textContent = ok
      ? 'Matches the published root.'
      : 'Does not match the published root.';
    if (!ok) $('verdict').className = 'verdict no';
    $('seal').textContent = ok
      ? 'This batch root is not written on-chain yet. Once it is, this step also checks it against the Solana memo transaction, signed by a published anchor key.'
      : 'One changed character in the public record produced an entirely different root. That is the whole guarantee.';

    // Announce the settled verdict once. The hashes above update every frame
    // and are outside any live region on purpose.
    $('announce').textContent = 'Verification complete. ' + $('verdict').textContent;

    if (ok) { await sleep(400); $('closing').classList.add('on'); }
    busy = false;
  }

  $('form').addEventListener('submit', function (e) { e.preventDefault(); run($('serial').value, false); });
  $('tamper').addEventListener('click', function () { if (current) run(current, true); });
  $('again').addEventListener('click', function () { if (current) run(current, false); });
})();
