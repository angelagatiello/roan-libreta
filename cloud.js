/* ROAN · Libreta de socios
 * Capa de nube sobre Supabase. Reemplaza la base de datos de los artefactos de Claude
 * con la misma interfaz (db, user, downloads), así el resto de la libreta no cambia.
 * La clave de abajo es la clave PÚBLICA (publishable). La seguridad real está en las
 * reglas de acceso por fila (RLS) de la base: solo entran los mails de allowed_emails.
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://sylsctlkwypciaudqcwo.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_TpT45JF8qAWMxnHcGhkV0w_rtH3hRFL';

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'roan-auth' }
  });
  window.roanSB = sb;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var uid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  };

  /* ================= acceso (login) ================= */
  var me = null; // { id, email, name }
  var gate = null;

  var CSS =
    '#roan-login{position:fixed;inset:0;z-index:100;background:var(--bg,#fff);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;font-family:var(--body,system-ui,sans-serif);color:var(--ink,#12142B)}' +
    '#roan-login .box{width:100%;max-width:400px;background:var(--paper,#fff);border:1px solid var(--line,#E6E8F2);border-radius:20px;padding:26px;box-shadow:0 10px 40px -18px rgba(40,36,120,.35)}' +
    '#roan-login h2{font:800 26px var(--display,system-ui);margin:10px 0 4px;letter-spacing:-.02em}' +
    '#roan-login p.s{color:var(--muted,#5D6280);font-size:14px;margin:0 0 16px}' +
    '#roan-login label{display:block;font:600 11px var(--mono,monospace);letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5D6280);margin:12px 0 5px}' +
    '#roan-login input{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--line,#E6E8F2);border-radius:12px;background:var(--paper,#fff);color:inherit;min-height:44px}' +
    '#roan-login input:focus{outline:2px solid var(--accent-soft,rgba(84,68,232,.15));border-color:var(--accent,#5444E8)}' +
    '#roan-login button.go{width:100%;margin-top:18px;font:700 15px var(--body,system-ui);padding:12px;border:0;border-radius:12px;color:#fff;cursor:pointer;min-height:46px;background:linear-gradient(135deg,var(--btn1,#5B4CF0),var(--btn2,#8B5CF6))}' +
    '#roan-login button.go:disabled{opacity:.6}' +
    '#roan-login .lk{background:none;border:0;color:var(--accent,#5444E8);font:600 13px var(--body,system-ui);cursor:pointer;padding:6px 2px}' +
    '#roan-login .row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;margin-top:10px}' +
    '#roan-login .msg{margin-top:14px;font-size:14px;border-radius:12px;padding:10px 12px;background:var(--accent-soft,rgba(84,68,232,.12))}' +
    '#roan-login .msg.bad{background:rgba(217,54,62,.12);color:#B3262E}';

  var LOGO =
    '<svg viewBox="-2 -2 62 42" width="62" height="42" role="img" aria-label="ROAN"><defs><clipPath id="hc2"><circle cx="39" cy="19" r="17"/></clipPath></defs><circle cx="19" cy="19" r="17" fill="#5B4CF0" clip-path="url(#hc2)"/><g fill="none" stroke="#12142B" stroke-width="3.5"><circle cx="19" cy="19" r="17"/><circle cx="39" cy="19" r="17"/></g></svg>';

  function errText(e) {
    var m = String((e && (e.message || e.error_description)) || e || '');
    if (/invalid login/i.test(m)) return 'Mail o contraseña incorrectos.';
    if (/already registered|already been registered/i.test(m)) return 'Ese mail ya tiene cuenta. Entrá con tu contraseña.';
    if (/not confirmed/i.test(m)) return 'Falta confirmar el mail. Revisá tu bandeja de entrada.';
    if (/password.*(short|least|characters)/i.test(m)) return 'La contraseña tiene que tener al menos 6 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
    if (/signups? not allowed|signup.*disabled/i.test(m)) return 'El registro de cuentas nuevas está cerrado. Entrá con tu cuenta.';
    if (/network|fetch|failed to/i.test(m)) return 'No hay conexión. Revisá internet y probá de nuevo.';
    return 'No se pudo completar. ' + m;
  }

  function showLogin(initialMode, resolve) {
    if (!document.getElementById('roan-login-css')) {
      var st = document.createElement('style');
      st.id = 'roan-login-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var el = document.getElementById('roan-login');
    if (!el) {
      el = document.createElement('div');
      el.id = 'roan-login';
      document.body.appendChild(el);
    }
    var mode = initialMode || 'login';

    function draw(msg, bad) {
      var t = { login: 'Entrar a la libreta', signup: 'Crear mi cuenta', reset: 'Recuperar contraseña', newpass: 'Nueva contraseña', denied: 'Mail no habilitado' }[mode];
      var s = {
        login: 'Solo pueden entrar los socios de ROAN.',
        signup: 'Usá el mismo mail que habilitaron los socios.',
        reset: 'Te mandamos un enlace para elegir otra contraseña.',
        newpass: 'Elegí una contraseña nueva para tu cuenta.',
        denied: 'Tu mail no está en la lista de socios. Pedile a un socio que lo agregue.'
      }[mode];
      var f = '';
      if (mode === 'signup') f += '<label for="rl-name">Tu nombre</label><input id="rl-name" autocomplete="name" required>';
      if (mode !== 'newpass' && mode !== 'denied') f += '<label for="rl-mail">Mail</label><input id="rl-mail" type="email" autocomplete="email" inputmode="email" required>';
      if (mode === 'login' || mode === 'signup' || mode === 'newpass') f += '<label for="rl-pass">Contraseña</label><input id="rl-pass" type="password" autocomplete="' + (mode === 'login' ? 'current-password' : 'new-password') + '" minlength="6" required>';
      var btn = { login: 'Entrar', signup: 'Crear cuenta', reset: 'Enviar enlace', newpass: 'Guardar contraseña', denied: 'Cerrar sesión' }[mode];
      var links = '';
      if (mode === 'login') links = '<div class="row"><button type="button" class="lk" data-m="signup">Crear cuenta</button><button type="button" class="lk" data-m="reset">Olvidé mi contraseña</button></div>';
      else if (mode === 'signup' || mode === 'reset') links = '<div class="row"><button type="button" class="lk" data-m="login">Ya tengo cuenta</button></div>';
      el.innerHTML = '<form class="box" novalidate>' + LOGO + '<h2>' + t + '</h2><p class="s">' + s + '</p>' + f +
        '<button class="go" type="submit">' + btn + '</button>' + links +
        (msg ? '<div class="msg' + (bad ? ' bad' : '') + '" role="alert">' + esc(msg) + '</div>' : '') + '</form>';
      var first = el.querySelector('input');
      if (first) first.focus();
    }

    el.onclick = function (ev) {
      var b = ev.target.closest('[data-m]');
      if (b) { mode = b.getAttribute('data-m'); draw(); }
    };
    el.onsubmit = async function (ev) {
      ev.preventDefault();
      var g = function (id) { var i = el.querySelector('#' + id); return i ? i.value.trim() : ''; };
      var go = el.querySelector('button.go');
      var mail = g('rl-mail'), pass = el.querySelector('#rl-pass') ? el.querySelector('#rl-pass').value : '', name = g('rl-name');
      if (mode === 'denied') { await sb.auth.signOut(); location.reload(); return; }
      if (mode !== 'newpass' && !/^\S+@\S+\.\S+$/.test(mail)) { draw('Revisá el mail.', true); return; }
      if ((mode === 'login' || mode === 'signup' || mode === 'newpass') && pass.length < 6) { draw('La contraseña tiene que tener al menos 6 caracteres.', true); return; }
      if (mode === 'signup' && !name) { draw('Escribí tu nombre.', true); return; }
      go.disabled = true; go.textContent = 'Un momento…';
      try {
        if (mode === 'login') {
          var r = await sb.auth.signInWithPassword({ email: mail, password: pass });
          if (r.error) throw r.error;
        } else if (mode === 'signup') {
          var r2 = await sb.auth.signUp({ email: mail, password: pass, options: { data: { name: name } } });
          if (r2.error) throw r2.error;
          if (!r2.data.session) { mode = 'login'; draw('Cuenta creada. Te mandamos un mail para confirmarla; después entrá acá.'); return; }
        } else if (mode === 'reset') {
          var r3 = await sb.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + location.pathname });
          if (r3.error) throw r3.error;
          mode = 'login'; draw('Listo. Si el mail está habilitado, te llega el enlace en unos minutos.'); return;
        } else if (mode === 'newpass') {
          var r4 = await sb.auth.updateUser({ password: pass });
          if (r4.error) throw r4.error;
        }
        var res = await verify();
        if (res === true) { el.remove(); resolve(); }
        else if (res === 'denied') { mode = 'denied'; draw(); }
        else draw('No se pudo verificar el acceso. Probá de nuevo.', true);
      } catch (e) { draw(errText(e), true); }
    };
    draw();
  }

  async function verify() {
    var s = await sb.auth.getSession();
    var ses = s.data && s.data.session;
    if (!ses) return false;
    var r = await sb.rpc('is_socio');
    if (r.error) return 'error';
    if (r.data !== true) return 'denied';
    var u = ses.user;
    me = { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || String(u.email || '').split('@')[0] };
    try { await sb.from('profiles').upsert({ user_id: me.id, name: me.name }, { onConflict: 'user_id', ignoreDuplicates: true }); } catch (e) { /* no es crítico */ }
    return true;
  }

  function ensureAccess() {
    if (gate) return gate;
    gate = new Promise(function (resolve) {
      var recovering = /type=recovery/.test(location.hash + location.search);
      sb.auth.onAuthStateChange(function (ev) {
        if (ev === 'PASSWORD_RECOVERY') showLogin('newpass', resolve);
        if (ev === 'SIGNED_OUT' && me) location.reload();
      });
      (async function () {
        if (recovering) return; // lo maneja PASSWORD_RECOVERY
        var res = await verify().catch(function () { return false; });
        if (res === true) resolve();
        else showLogin(res === 'denied' ? 'denied' : 'login', resolve);
      })();
    });
    return gate;
  }

  /* ================= datos ================= */
  var cache = {};      // col -> Map(id -> fila)
  var cfgCache = {};   // key -> data
  var cfgLoaded = false;
  var listeners = {};  // col -> Set(fn)
  var cfgListeners = {};
  var chan = null;

  function wrapErr(e) {
    var c = e && (e.code || e.status);
    var code = 'error';
    if (c === '42501' || c === 'PGRST301' || c === 401 || c === 403) code = 'invalid_argument';
    var o = new Error((e && e.message) || 'error');
    o.code = code;
    return o;
  }
  function rowToDoc(r) {
    var d = Object.assign({}, r.data || {});
    d.by = r.by || null;
    d.ts = r.ts;
    return d;
  }
  function docSnap(r) {
    return { id: r.id, exists: true, data: function () { return rowToDoc(r); }, metadata: { fromCache: false } };
  }
  function qSnap(col) {
    var rows = Array.from((cache[col] || new Map()).values()).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    return { docs: rows.map(docSnap), size: rows.length, empty: !rows.length, metadata: { fromCache: false } };
  }
  function cfgSnap(key) {
    var has = Object.prototype.hasOwnProperty.call(cfgCache, key);
    return { id: key, exists: has, data: function () { return has ? Object.assign({}, cfgCache[key]) : undefined; }, metadata: { fromCache: false } };
  }
  function notify(col) { (listeners[col] || []).forEach(function (fn) { try { fn(); } catch (e) { /* */ } }); }
  function notifyCfg() { Object.keys(cfgListeners).forEach(function (k) { cfgListeners[k].forEach(function (fn) { try { fn(); } catch (e) { /* */ } }); }); }

  async function fetchCol(col) {
    var all = [], from = 0, step = 1000;
    for (;;) {
      var r = await sb.from('records').select('id,col,data,by,ts').eq('col', col).order('ts', { ascending: true }).range(from, from + step - 1);
      if (r.error) throw wrapErr(r.error);
      all = all.concat(r.data || []);
      if (!r.data || r.data.length < step) break;
      from += step;
    }
    var m = new Map();
    all.forEach(function (x) { m.set(x.id, x); });
    cache[col] = m;
  }
  async function fetchCfg() {
    var r = await sb.from('config').select('key,data');
    if (r.error) throw wrapErr(r.error);
    var o = {};
    (r.data || []).forEach(function (x) { o[x.key] = x.data; });
    cfgCache = o;
    cfgLoaded = true;
  }
  function refreshAll() {
    Object.keys(cache).forEach(function (col) { fetchCol(col).then(function () { notify(col); }).catch(function () { }); });
    if (cfgLoaded) fetchCfg().then(notifyCfg).catch(function () { });
  }
  function applyRec(p) {
    var ev = p.eventType, row = p.new, old = p.old;
    if (ev === 'DELETE') {
      var id = old && old.id;
      if (!id) return;
      Object.keys(cache).forEach(function (col) { if (cache[col].delete(id)) notify(col); });
      return;
    }
    if (row && cache[row.col]) { cache[row.col].set(row.id, row); notify(row.col); }
  }
  function applyCfg(p) {
    if (p.eventType === 'DELETE') { if (p.old && p.old.key) delete cfgCache[p.old.key]; }
    else if (p.new) cfgCache[p.new.key] = p.new.data;
    notifyCfg();
  }
  function ensureChannel() {
    if (chan) return;
    chan = sb.channel('roan-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, applyRec)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, applyCfg)
      .subscribe(function (st) { if (st === 'SUBSCRIBED') refreshAll(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshAll(); });
    window.addEventListener('online', refreshAll);
    setInterval(function () { if (!document.hidden) refreshAll(); }, 60000);
  }

  /* fusión profunda con marcas de borrado { __delete__: true } (igual que la base de Claude) */
  function isDel(v) { return v && typeof v === 'object' && !Array.isArray(v) && v.__delete__ === true && Object.keys(v).length === 1; }
  function merge(a, b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
    var res = (a && typeof a === 'object' && !Array.isArray(a)) ? Object.assign({}, a) : {};
    Object.keys(b).forEach(function (k) {
      var v = b[k];
      if (isDel(v)) delete res[k];
      else if (v && typeof v === 'object' && !Array.isArray(v) && res[k] && typeof res[k] === 'object' && !Array.isArray(res[k])) res[k] = merge(res[k], v);
      else res[k] = v;
    });
    return res;
  }

  function colRef(col) {
    if (!cache[col]) cache[col] = new Map();
    function docRef(id) {
      id = id || uid();
      return {
        id: id,
        set: async function (data) {
          var d = Object.assign({}, data);
          var ts = d.ts != null ? d.ts : Date.now();
          var by = UUID.test(d.by || '') ? d.by : null;
          delete d.ts; delete d.by; delete d.id;
          var row = { id: id, col: col, data: d, by: by, ts: ts };
          var r = await sb.from('records').upsert(row);
          if (r.error) throw wrapErr(r.error);
          cache[col].set(id, row); notify(col);
        },
        update: async function (patch) {
          var r = await sb.rpc('merge_record', { p_id: id, p_patch: patch });
          if (r.error) throw wrapErr(r.error);
          var cur = cache[col].get(id);
          if (cur) { cache[col].set(id, Object.assign({}, cur, { data: merge(cur.data, patch) })); notify(col); }
        },
        delete: async function () {
          var r = await sb.from('records').delete().eq('id', id);
          if (r.error) throw wrapErr(r.error);
          cache[col].delete(id); notify(col);
        },
        get: async function () {
          var r = await sb.from('records').select('id,col,data,by,ts').eq('id', id).maybeSingle();
          if (r.error) throw wrapErr(r.error);
          return r.data ? docSnap(r.data) : { id: id, exists: false, data: function () { return undefined; }, metadata: { fromCache: false } };
        }
      };
    }
    return {
      doc: docRef,
      get: async function () { await fetchCol(col); return qSnap(col); },
      onSnapshot: function (cb, errCb) {
        var L = listeners[col] || (listeners[col] = new Set());
        var fn = function () { cb(qSnap(col)); };
        L.add(fn);
        fetchCol(col).then(fn).catch(function (e) { if (errCb) errCb(wrapErr(e)); });
        ensureChannel();
        return function () { L.delete(fn); };
      }
    };
  }

  function cfgRef(key) {
    return {
      id: key,
      get: async function () { await fetchCfg(); return cfgSnap(key); },
      set: async function (data) {
        var r = await sb.from('config').upsert({ key: key, data: data });
        if (r.error) throw wrapErr(r.error);
        cfgCache[key] = Object.assign({}, data); notifyCfg();
      },
      update: async function (patch) {
        var next = merge(cfgCache[key] || {}, patch);
        var r = await sb.from('config').upsert({ key: key, data: next });
        if (r.error) throw wrapErr(r.error);
        cfgCache[key] = next; notifyCfg();
      },
      delete: async function () {
        var r = await sb.from('config').delete().eq('key', key);
        if (r.error) throw wrapErr(r.error);
        delete cfgCache[key]; notifyCfg();
      },
      onSnapshot: function (cb, errCb) {
        var L = cfgListeners[key] || (cfgListeners[key] = new Set());
        var fn = function () { cb(cfgSnap(key)); };
        L.add(fn);
        (cfgLoaded ? Promise.resolve() : fetchCfg()).then(fn).catch(function (e) { if (errCb) errCb(wrapErr(e)); });
        ensureChannel();
        return function () { L.delete(fn); };
      }
    };
  }

  var db = {
    collection: colRef,
    doc: function (path) { return cfgRef(String(path).split('/').slice(1).join('/')); }
  };

  var user = {
    me: async function () { return me ? { id: me.id, email: me.email, name: me.name } : null; },
    can: async function () { return true; },
    profiles: async function (ids) {
      var out = {};
      if (!ids || !ids.length) return out;
      var r = await sb.from('profiles').select('user_id,name').in('user_id', ids.filter(function (i) { return UUID.test(i); }));
      if (r.error) return out;
      (r.data || []).forEach(function (p) { out[p.user_id] = { name: p.name, isMe: !!me && p.user_id === me.id }; });
      return out;
    }
  };

  /* descargas: navegador (enlace) o app Android (compartir archivo) */
  var downloads = {
    save: async function (o) {
      var name = o.filename || 'copia.txt';
      var mime = /\.json$/i.test(name) ? 'application/json' : 'text/csv';
      var native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (native && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem && window.Capacitor.Plugins.Share) {
        var P = window.Capacitor.Plugins;
        var b64 = btoa(unescape(encodeURIComponent(o.data)));
        var w = await P.Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
        await P.Share.share({ title: name, url: w.uri, dialogTitle: 'Guardar copia' });
        return;
      }
      var blob = new Blob([o.data], { type: mime + ';charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }
  };

  window.roanLogout = async function () { await sb.auth.signOut(); location.reload(); };
  window.roanMe = function () { return me; };

  /* La libreta pide los servicios con claude.use(nombre); acá se los damos desde Supabase.
   * 'sample' (resúmenes con IA) no existe en esta versión: devuelve null y la libreta oculta esas funciones. */
  window.claude = {
    use: async function (name) {
      await ensureAccess();
      if (name === 'db') return db;
      if (name === 'user') return user;
      if (name === 'downloads') return downloads;
      return null;
    }
  };
})();
