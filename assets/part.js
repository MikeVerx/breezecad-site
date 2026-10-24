// BreezeCAD hero part: a hex fitting with a real M20x2.5 outer thread and an M16x2 inner thread.
// The mesh is generated from formulas, rendered with plain WebGL (no libraries).
function bzMountPart(canvas, opts) {
  opts = opts || {};
  var gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) return function () {};
  var ext32 = gl.getExtension('OES_element_index_uint');

  // ---------- geometry ----------
  var TAU = Math.PI * 2, NT0 = 220;
  var P = [], N = [], I = [];
  function prof(u) { // ISO metric thread profile, 0 = root, 1 = crest
    u = u - Math.floor(u);
    if (u < 0.125) return 1;
    if (u < 0.4375) return 1 - (u - 0.125) / 0.3125;
    if (u < 0.6875) return 0;
    return (u - 0.6875) / 0.3125;
  }
  function cl(x, a, b) { return x < a ? a : x > b ? b : x; }
  function profS(u) { // profile with rounded crest and root
    var s = 0; for (var k = -3; k <= 3; k++) s += prof(u + k * 0.016); return s / 7;
  }
  // rows of constant u follow the helix, so crests and roots stay crisp
  var UROWS = (function () {
    var br = [0, 0.125, 0.4375, 0.6875, 1], a = [0];
    for (var b = 0; b < 4; b++) { var n = Math.ceil((br[b + 1] - br[b]) / 0.03); for (var k = 1; k <= n; k++) a.push(br[b] + (br[b + 1] - br[b]) * k / n); }
    return a;
  })();
  // rBase(u) = profile radius, clip(r, z) = chamfers / run-outs; z is clamped to [z0, z1]
  function helix(z0, z1, pitch, phase, rBase, clip, inward, nt) {
    var NT = nt || 128, t0 = TAU * (Math.floor((z0 - phase) / pitch) - 1), t1 = TAU * (Math.ceil((z1 - phase) / pitch) + 1);
    var cols = Math.round((t1 - t0) / TAU * NT), base = P.length / 3, e = 1e-4;
    var H = UROWS.length, R0 = [], RP = [], RM = [];
    for (var j = 0; j < H; j++) { R0.push(rBase(UROWS[j])); RP.push(rBase(UROWS[j] + e)); RM.push(rBase(UROWS[j] - e)); }
    var o = [0, 0, 0];
    function F(t, u, rbv) {
      var z = pitch * (u + t / TAU) + phase, zc = z < z0 ? z0 : z > z1 ? z1 : z;
      var r = clip(rbv, zc); o[0] = r * Math.cos(t); o[1] = r * Math.sin(t); o[2] = zc; return z !== zc;
    }
    for (var i = 0; i <= cols; i++) {
      var t = t0 + (t1 - t0) * i / cols;
      for (j = 0; j < H; j++) {
        var u = UROWS[j];
        F(t + e, u, R0[j]); var ax = o[0], ay = o[1], az = o[2];
        F(t - e, u, R0[j]); var tx = ax - o[0], ty = ay - o[1], tz = az - o[2];
        F(t, u + e, RP[j]); ax = o[0]; ay = o[1]; az = o[2];
        F(t, u - e, RM[j]); var ux = ax - o[0], uy = ay - o[1], uz = az - o[2];
        var clamped = F(t, u, R0[j]);
        var nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        var rr = Math.sqrt(o[0] * o[0] + o[1] * o[1]) || 1, rx_ = o[0] / rr, ry_ = o[1] / rr;
        if (clamped || l < 1e-12) { nx = rx_; ny = ry_; nz = 0; l = 1; }
        var sg = (nx * rx_ + ny * ry_ >= 0 ? 1 : -1) * (inward ? -1 : 1);
        P.push(o[0], o[1], o[2]); N.push(sg * nx / l, sg * ny / l, sg * nz / l);
      }
    }
    for (i = 0; i < cols; i++) for (j = 0; j < H - 1; j++) {
      var q = base + i * H + j, q2 = q + H; I.push(q, q2, q2 + 1, q, q2 + 1, q + 1);
    }
  }
  function zrange(z0, z1, dz) { var a = [], n = Math.max(2, Math.ceil((z1 - z0) / dz)); for (var k = 0; k <= n; k++) a.push(z0 + (z1 - z0) * k / n); return a; }
  function patch(z0, z1, dz, rf, inward, nt) {
    var zs = Array.isArray(z0) ? z0 : zrange(z0, z1, dz), NT = nt || NT0;
    var base = P.length / 3, e = 1e-3;
    for (var j = 0; j < zs.length; j++) {
      var z = zs[j];
      for (var i = 0; i <= NT; i++) {
        var t = TAU * i / NT, c = Math.cos(t), s = Math.sin(t);
        var r = rf(t, z);
        var rt = (rf(t + e, z) - rf(t - e, z)) / (2 * e);
        var rz = (rf(t, z + e) - rf(t, z - e)) / (2 * e);
        // dP/dt x dP/dz
        var ax = -r * s + rt * c, ay = r * c + rt * s, az = 0;
        var bx = rz * c, by = rz * s, bz = 1;
        var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        var l = Math.hypot(nx, ny, nz) || 1, sg = inward ? -1 : 1;
        P.push(r * c, r * s, z); N.push(sg * nx / l, sg * ny / l, sg * nz / l);
      }
    }
    var W = NT + 1;
    for (j = 0; j < zs.length - 1; j++) for (i = 0; i < NT; i++) {
      var a = base + j * W + i, b = a + 1, d = a + W, f = d + 1;
      I.push(a, b, f, a, f, d);
    }
  }
  function ring(z, r1, r2, up, nt) {
    var base = P.length / 3, NT = nt || NT0;
    for (var i = 0; i <= NT; i++) {
      var t = TAU * i / NT, c = Math.cos(t), s = Math.sin(t), a = r1(t), b = r2(t);
      P.push(a * c, a * s, z, b * c, b * s, z); N.push(0, 0, up, 0, 0, up);
    }
    for (i = 0; i < NT; i++) { var o = base + i * 2; I.push(o, o + 1, o + 3, o, o + 3, o + 2); }
  }
  // outer thread M20x2.5 (z 0..18) + undercut
  var Po = 2.5, Ro = 10, ro = 10 - 0.6134 * Po;
  function clipOut(r, z) {
    r = Math.min(r, ro - 0.25 + z);                        // lead-in chamfer
    return Math.min(r, 8.15 + Math.max(0, 18 - z) * 1.1);  // run-out into undercut
  }
  helix(0, 19.5, Po, 0, function (u) { return ro + (Ro - ro) * profS(u); }, clipOut, false);
  // hex S27, double-chamfered
  function rHexRaw(t) { var a = ((t % (TAU / 6)) + TAU / 6) % (TAU / 6) - TAU / 12; return 13.5 / Math.cos(a); }
  function rHex(t, z) { var d = Math.min(z - 19.5, 29.5 - z); return Math.min(rHexRaw(t), 13.75 + Math.max(0, d) * 1.6); }
  var HN = 480, hz = zrange(19.5, 21, 0.06).concat(zrange(21, 28, 7).slice(1), zrange(28, 29.5, 0.06).slice(1));
  ring(19.5, function () { return 8.15; }, function (t) { return rHex(t, 19.5); }, -1, HN);
  patch(hz, 0, 0, rHex, false, HN);
  ring(29.5, function (t) { return rHex(t, 29.5); }, function () { return 11; }, 1, HN);
  // top boss with chamfer
  patch([29.5].concat(zrange(43, 44, 0.125)), 0, 0, function (t, z) { return Math.min(11, 11 - (z - 43)); }, false, 160);
  // inner thread M16x2 (z 28..44)
  var Pi = 2, Ri = 8, ri = 8 - 0.5413 * Pi * 1.0;
  function clipIn(r, z) {
    r = ri + (r - ri) * cl((z - 28.3) / 1.4, 0, 1);       // thread starts after the bore step
    return Math.max(r, 8.45 - (44 - z));                   // top chamfer
  }
  ring(44, function () { return 8.45; }, function () { return 10; }, 1);
  helix(28, 44, Pi, 0.6, function (u) { return ri + (Ri - ri) * (1 - profS(u)); }, clipIn, true);
  ring(28, function () { return 5; }, function () { return ri; }, 1);
  // through bore with bottom chamfer
  patch(zrange(0, 0.8, 0.1).concat([28]), 0, 0, function (t, z) { return Math.max(5, 5.8 - z); }, true, 128);
  ring(0, function () { return 5.8; }, function () { return ro - 0.25; }, -1);

  var pos = new Float32Array(P), nrm = new Float32Array(N);
  var idx = (ext32 ? new Uint32Array(I) : new Uint16Array(I));

  // ---------- GL ----------
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var vs = 'attribute vec3 p;attribute vec3 n;uniform mat4 M;uniform mat4 V;varying vec3 vn;varying vec3 vp;' +
    'void main(){vec4 w=M*vec4(p,1.);vp=w.xyz;vn=mat3(M)*n;gl_Position=V*w;}';
  var fs = 'precision highp float;varying vec3 vn;varying vec3 vp;uniform vec3 eye;uniform vec3 tint;' +
    'void main(){vec3 N=normalize(vn);vec3 E=normalize(eye-vp);if(dot(N,E)<0.)N=-N;' +
    'vec3 L1=normalize(vec3(-.5,.9,.6)),L2=normalize(vec3(.8,.2,-.4));' +
    'float d1=max(dot(N,L1),0.),d2=max(dot(N,L2),0.);' +
    'vec3 H=normalize(L1+E);float sp=pow(max(dot(N,H),0.),48.);' +
    'float hemi=.5+.5*N.y;float fr=pow(1.-max(dot(N,E),0.),3.);' +
    'vec3 base=vec3(.86,.875,.90);' +
    'vec3 c=base*(.42+.20*hemi)+base*d1*.50+base*d2*.18+vec3(1.)*sp*.40+tint*fr*.45;' +
    'gl_FragColor=vec4(pow(c,vec3(.95)),1.);}';
  var pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr); gl.useProgram(pr);
  function buf(t, d) { var b = gl.createBuffer(); gl.bindBuffer(t, b); gl.bufferData(t, d, gl.STATIC_DRAW); return b; }
  var bp = buf(gl.ARRAY_BUFFER, pos), bn = buf(gl.ARRAY_BUFFER, nrm); buf(gl.ELEMENT_ARRAY_BUFFER, idx);
  var lp = gl.getAttribLocation(pr, 'p'), ln = gl.getAttribLocation(pr, 'n');
  gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.enableVertexAttribArray(ln); gl.vertexAttribPointer(ln, 3, gl.FLOAT, false, 0, 0);
  var uM = gl.getUniformLocation(pr, 'M'), uV = gl.getUniformLocation(pr, 'V'), uE = gl.getUniformLocation(pr, 'eye'), uT = gl.getUniformLocation(pr, 'tint');
  gl.uniform3f(uT, 0.12, 0.31, 0.85);
  gl.enable(gl.DEPTH_TEST);

  // ---------- math ----------
  function mul(a, b) { var o = new Float32Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function rx(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  function ry(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
  function tr(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); }
  function persp(f, a, n, fa) { var t = 1 / Math.tan(f / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]); }

  // ---------- interaction ----------
  var yaw = opts.yaw != null ? opts.yaw : 0.6, pitch = opts.pitch != null ? opts.pitch : 0.42, vy = 0, vp = 0, drag = false, lx = 0, ly = 0, last = 0, idle = 0, raf = 0, alive = true;
  var auto = opts.auto !== false;
  function down(e) { drag = true; lx = e.clientX; ly = e.clientY; vy = vp = 0; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} }
  function move(e) { if (!drag) return; var dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; vy = dx * 0.008; vp = dy * 0.006; yaw += vy; pitch = cl(pitch + vp, -0.2, 1.2); idle = 0; }
  function up() { drag = false; }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  function size() {
    var d = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(canvas.clientWidth * d), h = Math.round(canvas.clientHeight * d);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  // stop drawing when the part is off screen or the tab is hidden (saves the battery)
  var visible = true, running = false;
  function wake() { if (alive && visible && !document.hidden && !running && !opts.still) { running = true; last = 0; raf = requestAnimationFrame(frame); } }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; wake(); }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  canvas.addEventListener('pointerdown', wake);
  function frame(ts) {
    if (!alive) return;
    if (!opts.still && (!visible || document.hidden)) { running = false; return; }
    var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0; last = ts;
    if (!drag) { yaw += vy; pitch = cl(pitch + vp, -0.2, 1.2); vy *= 0.94; vp *= 0.9; idle += dt; if (auto && idle > 1.2) yaw += dt * 0.35 * Math.min(1, (idle - 1.2)); }
    size(); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // model: z-up -> y-up, centered
    var M = mul(rx(pitch), mul(ry(yaw), mul(rx(-Math.PI / 2), tr(0, 0, -22))));
    var dist = opts.dist || 118, V = mul(persp(0.5, canvas.width / canvas.height, 10, 400), tr(0, 0, -dist));
    gl.uniformMatrix4fv(uM, false, M); gl.uniformMatrix4fv(uV, false, V); gl.uniform3f(uE, 0, 0, dist);
    gl.drawElements(gl.TRIANGLES, idx.length, ext32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    if (!opts.still) raf = requestAnimationFrame(frame);
  }
  running = true; raf = requestAnimationFrame(frame);
  return function () { alive = false; cancelAnimationFrame(raf); };
}
