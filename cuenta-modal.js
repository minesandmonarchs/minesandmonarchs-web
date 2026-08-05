/* ============================================================
   cuenta-modal.js – Mines & Monarchs · Modal de Cuenta
   Implementación: vinculación `usuarios` ↔ `verificaciones`
   - Guarda datos de personaje en `verificaciones/{discordId}`
   - Guarda en `usuarios/{uid}` solo la referencia `discordId`
   - Al abrir modal combina `usuarios` + `verificaciones` para mostrar
   ============================================================ */

import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth,
         signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         onAuthStateChanged,
         signOut,
         signInAnonymously }         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore,
         doc, setDoc, getDoc,
         runTransaction, collection, query, where, getDocs }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import bcryptModule from 'https://esm.sh/bcryptjs@2.4.3';
// esm.sh a veces envuelve el export por defecto de forma distinta según el
// paquete. Nos quedamos con la primera versión que realmente tenga los
// métodos que necesitamos, en vez de asumir una forma fija.
const bcrypt = (bcryptModule && typeof bcryptModule.compareSync === 'function')
    ? bcryptModule
    : (bcryptModule?.default && typeof bcryptModule.default.compareSync === 'function')
        ? bcryptModule.default
        : bcryptModule;

const firebaseConfig = {
    apiKey:            "AIzaSyC97DUSkDy8qOHnk5rm3P-263m4W6Okbzo",
    authDomain:        "minesandmonarch.firebaseapp.com",
    projectId:         "minesandmonarch",
    storageBucket:     "minesandmonarch.firebasestorage.app",
    messagingSenderId: "379898851786",
    appId:             "1:379898851786:web:b892cbf4d8508798d61f33"
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);

const ROL = { admin: 'admin', escriba: 'escriba', ciudadano: 'ciudadano' };

function normalizeDiscordTag(tag) {
    // Mismo criterio que normalizeDiscordUsername: minúsculas, sin '@' ni
    // '#discriminador'. Se define aquí arriba porque discordTagToEmail se
    // usa antes de declarar normalizeDiscordUsername más abajo.
    return String(tag || '').trim().toLowerCase().replace(/^@/, '').replace(/#\d+$/, '').replace(/[#\s]/g, '_');
}

function discordTagToEmail(tag) {
    const normalized = normalizeDiscordTag(tag);
    return `${normalized}@discord.minasymonarcas.local`;
}

async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

const RAZAS = { Humano:"Humano", Elfo:"Elfo", Goblin:"Goblin", Enano:"Enano", Demonio:"Demonio", Sirena:"Sirena", Valquiria:"Valquiria", Hada:"Hada", Ogro:"Ogro", Revenant:"Revenant" };
const CLASES = { magoender:"Mago del Ender", magoelectrico:"Mago Eléctrico", magosangre:"Mago de Sangre", magohelado:"Mago Helado", magoinvocador:"Mago Invocador", magofuego:"Mago de Fuego", magoeldritch:"Mago del Eldritch", magoViento:"Mago de Viento", magotierra:"Mago de Tierra", support:"Support", magoBendito:"Mago Bendito", tanque:"Tanque", ingeniero:"Ingeniero", guerrero:"Guerrero", carterista:"Carterista", soldadoDorado:"Soldado Dorado", guerreroInfernal:"Guerrero Infernal", tritonisa:"Tritonisa", guerreroBendito:"Guerrero Bendito", berserker:"Berserker", bestiaSalvaje:"Bestia Salvaje" };
const CLASES_POR_RAZA = { humano: ['guerrero','tanque','ingeniero'], elfo: ['magohelado','magoelectrico','magotierra','support'], goblin: ['carterista','soldadoDorado','ingeniero'], enano: ['guerrero','tanque','ingeniero'], demonio: ['guerreroInfernal','magosangre','magofuego'], sirena: ['magohelado','tritonisa','magotierra'], valquiria: ['guerreroBendito','magoViento','magoBendito','magoelectrico'], hada: ['carterista','magoViento','support'], ogro: ['berserker','bestiaSalvaje','tanque'], revenant: ['magoeldritch','magoinvocador','magosangre','magoender'] };
const TRABAJOS = { inutilerrante:"Inútil", herrero:"Herrero", clerigo:"Clérigo", minero:"Minero", agricultor:"Agricultor", granjero:"Granjero", cocinero:"Cocinero" };

const opts = obj => Object.entries(obj).map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

let _googleUser = null;
let _creandoPersonaje = false;
let _currentPassword = '';
let _discordIdPendiente = null;

function redirigirSegunRol(rol, uid) {
    if (rol === 'admin') window.location.href = `/Admin/admin.html`;
    else window.location.href = `/Mundo/Personajes/personaje.html?uid=${uid}`;
}

function inyectar() {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="cm-overlay" id="cmOverlay">
            <div class="cm-box">
                <div class="cm-header">
                    <div class="cm-header-deco"></div>
                    <button type="button" class="cm-close" id="cmClose">✕</button>
                    <h2 class="cm-titulo" id="cmTitulo">Cuenta</h2>
                    <p class="cm-subtitulo" id="cmSub">Accede con tu usuario y contraseña</p>
                </div>

                <div class="cm-body" id="vistaGoogle">
                    <div class="cm-opciones">
                        <div class="cm-field"><label class="cm-label">Nombre de usuario de Discord</label><input class="cm-input" type="text" id="loginDiscordTag" placeholder="tu_usuario_discord"></div>
                        <div class="cm-field"><label class="cm-label">Contraseña</label><input class="cm-input" type="password" id="loginPassword" placeholder="Contraseña"></div>
                        <div style="display:flex;gap:8px;margin-top:8px;"><button type="button" class="cm-opcion-btn" id="optLogin">Entrar</button><button type="button" class="cm-opcion-btn secundario" id="optVolver">← Volver</button></div>
                    </div>
                    <p class="cm-error" id="loginError"></p>
                </div>

        <div class="cm-body" id="vistaPersonaje" style="display:none">
          <p class="cm-section">Datos</p>
          <div class="cm-field">
            <label class="cm-label">Nombre de Discord <span>*</span></label>
            <input class="cm-input" type="text" id="pDiscord" placeholder="Ej: eira#1234">
          </div>
          <div class="cm-field">
            <label class="cm-label">Nombre de Minecraft <span>*</span></label>
                        <input class="cm-input" type="text" id="pNombreMC" placeholder="Tu nick en MC">
          </div>
                    <div class="cm-field">
                        <label class="cm-label">Contraseña <span>*</span></label>
                        <input class="cm-input" type="password" id="pPassword" placeholder="Contraseña">
                    </div>

          <p class="cm-section">Rol</p>
          <div class="cm-field">
            <label class="cm-label">Nombre de rol <span>*</span></label>
            <input class="cm-input" type="text" id="pNombreRol" placeholder="Ej: Eira Frostmantle">
          </div>
          <div class="cm-field">
            <label class="cm-label">Raza <span>*</span></label>
            <select class="cm-select" id="pRaza"><option value="" disabled selected>Selecciona…</option>${opts(RAZAS)}</select>
          </div>
          <div class="cm-row">
            <div class="cm-field">
              <label class="cm-label">Clase <span>*</span></label>
              <select class="cm-select" id="pClase" disabled><option value="" disabled selected>Selecciona primero la raza…</option></select>
            </div>
            <div class="cm-field">
              <label class="cm-label">Trabajo <span>*</span></label>
              <select class="cm-select" id="pTrabajo"><option value="" disabled selected>Selecciona…</option>${opts(TRABAJOS)}</select>
            </div>
          </div>
          <p class="cm-error" id="pError"></p>
          <div class="cm-form-footer">
            <button type="button" class="cm-btn-volver" id="pCancelar">Cancelar</button>
            <button type="button" class="cm-btn-submit" id="pGuardar">⚜ Guardar</button>
          </div>
        </div>

        <div class="cm-exito" id="cmExito">
          <div class="cm-exito-icono">⚜</div>
          <h3 id="exitoTitulo">¡Hecho!</h3>
          <p id="exitoTexto"></p>
        </div>
      </div>
    </div>`);
}

function mostrar(id, titulo, sub) {
    ['vistaGoogle','vistaPersonaje','cmExito'].forEach(v => {
        const el = document.getElementById(v); if (!el) return;
        if (v === 'cmExito') el.classList.toggle('visible', v === id);
        else el.style.display = v === id ? '' : 'none';
    });
    if (titulo !== undefined) document.getElementById('cmTitulo').textContent = titulo;
    if (sub !== undefined) document.getElementById('cmSub').textContent = sub;
}

function setError(id, msg) {
    const el = document.getElementById(id); if (!el) return; el.textContent = msg; el.style.display = msg ? '' : 'none';
}

function esErrorPermisosFirestore(err) {
    const texto = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
    return err?.code === 'permission-denied' || err?.code === 'unavailable' || texto.includes('permission') || texto.includes('insufficient permissions');
}

function guardarPersonajeLocalmente(datos) {
    try { const prev = JSON.parse(localStorage.getItem('mm_personajes_pendientes') || '[]'); prev.push(datos); localStorage.setItem('mm_personajes_pendientes', JSON.stringify(prev)); } catch (_) {}
}

async function nextId() {
    const ref = doc(db, 'meta', 'contador_usuarios'); let id;
    await runTransaction(db, async tx => { const snap = await tx.get(ref); id = snap.exists() ? snap.data().total + 1 : 1; tx.set(ref, { total: id }); });
    return id;
}

function sanitizeDiscordTag(tag) {
    return String(tag || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function guardarSesion(datos) {
    sessionStorage.setItem('mm_usuario', JSON.stringify(datos));
    const li = document.getElementById('nav-cuenta-li');
    if (!li) return;
    if (!li.classList.contains('dropdown')) {
        const esAdmin = datos.rol === 'admin';
        li.classList.add('dropdown');
        li.innerHTML = `
            <button class="dropbtn" style="font-weight:bold;color:#ffd700;display:flex;align-items:center;gap:6px">⚜ ${datos.nombreRol}</button>
            <ul class="dropdown-content" style="right:0;left:auto;min-width:160px;">
                <li><a href="/Mundo/Personajes/personaje.html?uid=${datos.uid}">Mi cartilla</a></li>
                ${esAdmin ? `<li><a href="/Admin/admin.html" style="color:#ffd700">⚙️ Panel Admin</a></li>` : ''}
                <li><a href="#" id="btnCerrarSesion">Cerrar sesión</a></li>
            </ul>`;
        li.querySelector('.dropbtn').addEventListener('click', e => { e.preventDefault(); li.querySelector('.dropdown-content').classList.toggle('show'); });
        document.getElementById('btnCerrarSesion').addEventListener('click', async e => { e.preventDefault(); await signOut(auth); sessionStorage.removeItem('mm_usuario'); location.reload(); });
    }
}

function normalizeDiscordUsername(raw) {
    // Los nombres de usuario de Discord son siempre en minúsculas y ya no
    // llevan discriminador (#1234). Quitamos espacios, '@' inicial y
    // cualquier '#xxxx' residual por si el usuario lo escribe a la antigua.
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/#\d+$/, '');
}

async function fetchVerificacionByDiscordIdOrTag(identifier) {
    if (!identifier) return null;

    // 1) Si lo que nos pasan ya es un ID numérico de Discord (snowflake),
    //    probamos a leerlo directamente como ID de documento.
    if (/^\d{5,}$/.test(identifier.trim())) {
        try {
            const ref = doc(db, 'verificaciones', identifier.trim());
            const snap = await getDoc(ref);
            if (snap.exists()) return snap.data();
        } catch (e) {
            console.error('[cuenta-modal] Error leyendo verificaciones por ID:', e.code || '', e.message || e);
        }
    }

    // 2) Caso normal: el usuario escribe su nombre de usuario de Discord
    //    (sin '#discriminador', tal y como lo guarda el bot en discordTag).
    const tagNormalizado = normalizeDiscordUsername(identifier);
    try {
        const q = query(collection(db, 'verificaciones'), where('discordTag', '==', tagNormalizado));
        const snaps = await getDocs(q);
        if (!snaps.empty) return snaps.docs[0].data();
    } catch (e) {
        console.error('[cuenta-modal] Error leyendo verificaciones por tag:', e.code || '', e.message || e);
    }

    console.warn('[cuenta-modal] No se encontró verificación para:', identifier, '(normalizado:', tagNormalizado + ')');
    return null;
}

/* ────────────────────────────────────────────────────────────
   Crea automáticamente usuarios/{uid} a partir de los datos que
   el bot de Discord ya guardó en verificaciones/{discordId}.
   Ya no se le pide al jugador rellenar el formulario otra vez.
   ──────────────────────────────────────────────────────────── */
async function crearUsuarioDesdeVerificacion(user, ver) {
    const uid = user.uid;
    const nombreRol = ver.nombreRol || '';

    if (!nombreRol || !ver.raza || !ver.clase || !ver.trabajo) {
        console.error('[cuenta-modal] Datos incompletos en la verificación para crear el personaje automáticamente:', ver);
        setError('loginError', 'Tu verificación de Discord no tiene todos los datos del personaje. Contacta con un administrador.');
        return;
    }

    const rol = nombreRol.toLowerCase() === 'skyroft' ? ROL.admin : ROL.ciudadano;
    const personaje = {
        nombreRol,
        nombreMC: ver.nombreMinecraft || '',
        raza: ver.raza,
        clase: ver.clase,
        trabajo: ver.trabajo
    };

    try {
        const id = await nextId();
        await setDoc(doc(db, 'usuarios', uid), {
            id,
            email: user.email,
            discord: ver.discordTag || ver.discordId || '',
            discordId: ver.discordId || '',
            rol,
            creadoEn: new Date(),
            personaje
        }, { merge: true });

        guardarSesion({ uid, nombreRol, id, rol });
        document.getElementById('exitoTitulo').textContent = `¡Bienvenido, ${nombreRol}!`;
        document.getElementById('exitoTexto').textContent  = rol === 'admin' ? 'Redirigiendo al panel de administración…' : 'Sesión iniciada correctamente.';
        mostrar('cmExito');
        setTimeout(() => redirigirSegunRol(rol, uid), 1800);
    } catch (err) {
        console.error('[cuenta-modal] Error creando usuario desde verificación:', err.code, err.message);
        if (esErrorPermisosFirestore(err)) {
            guardarPersonajeLocalmente({ uid, email: user.email, discord: ver.discordTag, rol, creadoEn: new Date().toISOString(), personaje, guardadoLocal: true, error: err?.message || '' });
            setError('loginError', 'No se pudo guardar en Firestore por permisos. El personaje quedó guardado localmente.');
            return;
        }
        setError('loginError', 'Error al crear tu personaje. Inténtalo de nuevo.');
    }
}

async function loginManual() {
    console.log('[cuenta-modal] loginManual() disparado');
    setError('loginError', '');
    const discordTag = (document.getElementById('loginDiscordTag')?.value || '').trim();
    const password = (document.getElementById('loginPassword')?.value || '').trim();
    if (!discordTag || !password) return setError('loginError', 'Introduce Discord Tag y contraseña.');

    // Paso obligatorio: comprobar que este Discord ya se verificó por el bot.
    let ver;
    try {
        ver = await fetchVerificacionByDiscordIdOrTag(discordTag);
    } catch (e) {
        console.error('[cuenta-modal] Excepción inesperada buscando verificación:', e);
        setError('loginError', 'Error de conexión con la base de datos. Revisa la consola.');
        return;
    }
    if (!ver) {
        setError('loginError', 'Ese Discord no está verificado, o no se pudo comprobar (revisa la consola / reglas de Firestore).');
        return;
    }

    const email = discordTagToEmail(discordTag);
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const user = cred.user; _googleUser = user; _creandoPersonaje = false;
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) {
            const datos = snap.data();
            let nombreRolGuardado = datos.personaje?.nombreRol || null;
            if (!nombreRolGuardado && (datos.discordId || datos.discord)) {
                const verif = await fetchVerificacionByDiscordIdOrTag(datos.discordId || datos.discord);
                if (verif && verif.nombreRol) nombreRolGuardado = verif.nombreRol;
            }
            if (nombreRolGuardado) {
                guardarSesion({ uid: user.uid, nombreRol: nombreRolGuardado, id: datos.id, rol: datos.rol });
                document.getElementById('exitoTitulo').textContent = `¡Bienvenido, ${nombreRolGuardado}!`;
                document.getElementById('exitoTexto').textContent  = datos.rol === 'admin' ? 'Redirigiendo al panel de administración…' : 'Sesión iniciada correctamente.';
                mostrar('cmExito'); setTimeout(() => redirigirSegunRol(datos.rol, user.uid), 1800);
            } else {
                // No tiene personaje guardado en 'usuarios' todavía: lo creamos
                // automáticamente con los datos que ya existen en 'verificaciones'.
                await crearUsuarioDesdeVerificacion(user, ver);
            }
        } else {
            // Primer login con Firebase Auth ya existente pero sin documento en 'usuarios'.
            await crearUsuarioDesdeVerificacion(user, ver);
        }
    } catch (err) {
        console.error('[cuenta-modal] Error en signInWithEmailAndPassword:', err.code, err.message);
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            console.log('[cuenta-modal] Rama primera vez: comparando contraseña contra passwordHash del bot');
            // Primera vez entrando por la web: todavía no existe cuenta de Firebase Auth.
            // Antes de crearla, comprobamos que la contraseña coincide con la que
            // el bot de Discord guardó (hasheada) durante la verificación.
            if (!ver.passwordHash) {
                console.error('[cuenta-modal] El documento de verificación no tiene passwordHash:', ver);
                setError('loginError', 'Tu verificación no tiene contraseña guardada. Vuelve a verificarte en Discord.');
                return;
            }
            console.log('[cuenta-modal] passwordHash presente:', ver.passwordHash);
            if (typeof bcrypt.compareSync !== 'function') {
                console.error('[cuenta-modal] bcrypt.compareSync no está disponible. Objeto bcrypt recibido:', bcrypt);
                setError('loginError', 'Error interno cargando el módulo de contraseñas. Revisa la consola.');
                return;
            }
            let passwordValida = false;
            try {
                passwordValida = bcrypt.compareSync(password, ver.passwordHash);
                console.log('[cuenta-modal] Resultado de bcrypt.compareSync:', passwordValida);
            } catch (e) {
                console.error('[cuenta-modal] Error comparando hash de contraseña:', e);
                setError('loginError', 'Error comprobando la contraseña. Revisa la consola.');
                return;
            }
            if (!passwordValida) {
                console.warn('[cuenta-modal] Contraseña no coincide con el hash guardado.');
                setError('loginError', 'Contraseña incorrecta.');
                return;
            }
            console.log('[cuenta-modal] Contraseña válida, creando cuenta en Firebase Auth para', email);
            try {
                const reg = await createUserWithEmailAndPassword(auth, email, password);
                console.log('[cuenta-modal] Cuenta creada correctamente, uid:', reg.user.uid);
                const user = reg.user; _googleUser = user;
                // Ya tenemos todos los datos del personaje desde la verificación
                // de Discord: creamos la cuenta completa sin pedir el formulario.
                await crearUsuarioDesdeVerificacion(user, ver);
                return;
            } catch (regErr) {
                console.error('[cuenta-modal] Error en createUserWithEmailAndPassword:', regErr.code, regErr.message);
                if (regErr.code === 'auth/email-already-in-use') {
                    setError('loginError', 'Contraseña incorrecta.');
                } else {
                    setError('loginError', regErr.message || 'Error al crear la cuenta.');
                }
                return;
            }
        }
        console.log('[cuenta-modal] Error no manejado por las ramas anteriores, código:', err.code);
        setError('loginError', err.message || errMsg(err.code));
    }
}

async function guardarPersonaje() {
    const discord   = document.getElementById('pDiscord').value.trim();
    const nombreMC  = document.getElementById('pNombreMC').value.trim();
    const nombreRol = document.getElementById('pNombreRol').value.trim();
    const raza      = document.getElementById('pRaza').value;
    const clase     = document.getElementById('pClase').value;
    const trabajo   = document.getElementById('pTrabajo').value;
    const password  = document.getElementById('pPassword').value || '';

    if (!discord)                    return setError('pError', 'El nombre de Discord es obligatorio.');
    if (!nombreMC)                   return setError('pError', 'El nombre de Minecraft es obligatorio.');
    if (!nombreRol)                  return setError('pError', 'El nombre de rol es obligatorio.');
    if (!raza || !clase || !trabajo) return setError('pError', 'Selecciona raza, clase y trabajo.');
    if (!password)                   return setError('pError', 'Introduce una contraseña.');
    setError('pError', '');
    const user = auth.currentUser || _googleUser; if (!user) { setError('pError', 'No hay sesión activa. Vuelve a iniciar sesión.'); return; }
    const uid = user.uid; const rol = nombreRol.toLowerCase() === 'skyroft' ? ROL.admin : ROL.ciudadano;
    const verifId = discord.replace(/[#\s]/g, '_');
    try {
        const id = await nextId();
        const verifData = {
            discordId: verifId,
            discordTag: discord,
            nombreMinecraft: nombreMC,
            nombreRol,
            raza,
            clase,
            trabajo,
            verificadoEn: new Date()
        };
        if (_currentPassword) {
            verifData.passwordHash = await hashPassword(_currentPassword);
        }
        await setDoc(doc(db, 'verificaciones', verifId), verifData);
        await setDoc(doc(db, 'usuarios', uid), {
            id,
            email: user.email,
            discord,
            discordId: verifId,
            rol,
            creadoEn: new Date(),
            personaje: {
                nombreRol,
                nombreMC,
                raza,
                clase,
                trabajo
            }
        }, { merge: true });
        _creandoPersonaje = false; _googleUser = null; _currentPassword = '';
        sessionStorage.removeItem('mm_uid_pendiente'); guardarSesion({ uid, nombreRol, id, rol });
        document.getElementById('exitoTitulo').textContent = '¡Bienvenido a Belmaria!';
        document.getElementById('exitoTexto').textContent  = `${nombreRol} ha llegado al mundo.`; mostrar('cmExito'); setTimeout(() => redirigirSegunRol(rol, uid), 2000);
    } catch (err) {
        console.error('[cuenta-modal] Error en guardarPersonaje:', err.code, err.message);
        if (esErrorPermisosFirestore(err)) {
            guardarPersonajeLocalmente({ uid, email: user.email, discord, rol, creadoEn: new Date().toISOString(), personaje: { nombreRol, nombreMC, raza, clase, trabajo }, guardadoLocal: true, error: err?.message || '' });
            setError('pError', 'No se pudo guardar en Firestore por permisos. El personaje quedó guardado localmente.'); console.warn('Firestore permission denied', err); return;
        }
        setError('pError', 'Error al guardar. Inténtalo de nuevo.'); return;
    }
}

/* ════════════════════════════════════════
   CANCELAR / CERRAR
   ════════════════════════════════════════ */
async function cancelarPersonaje() {
    _creandoPersonaje = false; _currentPassword = ''; _discordIdPendiente = null;
    cerrar();
}

function cerrar() {
    document.getElementById('cmOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

function resetForm() {
    ['pDiscord','pNombreRol','pNombreMC'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    ['pRaza','pTrabajo'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const pClase = document.getElementById('pClase');
    if (pClase) {
        pClase.innerHTML = '<option value="" disabled selected>Selecciona primero la raza…</option>';
        pClase.value = ''; pClase.disabled = true;
    }
    setError('googleError', '');
    setError('pError', '');
}

window.abrirModalCuenta = function () {
    resetForm();
    mostrar('vistaGoogle', 'Cuenta', 'Accede con tu cuenta de Google');
    document.getElementById('cmOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('[cuenta-modal] DOMContentLoaded: inicializando modal');
    inyectar();

    const cmClose = document.getElementById('cmClose');
    const cmOverlay = document.getElementById('cmOverlay');
    const optLogin = document.getElementById('optLogin');
    const optVolver = document.getElementById('optVolver');
    const pCancelar = document.getElementById('pCancelar');
    const pGuardar = document.getElementById('pGuardar');
    const pRaza = document.getElementById('pRaza');

    // Comprobación defensiva: si algún elemento clave no existe, lo decimos
    // fuerte y claro en vez de fallar en silencio.
    const elementosClave = { cmClose, cmOverlay, optLogin, optVolver, pCancelar, pGuardar, pRaza };
    for (const [nombre, el] of Object.entries(elementosClave)) {
        if (!el) console.error(`[cuenta-modal] No se encontró el elemento "${nombre}" tras inyectar el modal.`);
    }

    cmClose?.addEventListener('click', cerrar);
    cmOverlay?.addEventListener('click', e => {
        if (e.target.id === 'cmOverlay') cerrar();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.getElementById('cmOverlay')?.classList.contains('active')) cerrar();
    });

    optLogin?.addEventListener('click', loginManual);
    optVolver?.addEventListener('click', cerrar);
    pCancelar?.addEventListener('click', cancelarPersonaje);
    pGuardar?.addEventListener('click', guardarPersonaje);
    pRaza?.addEventListener('change', function () {
        const select = document.getElementById('pClase'); const razaKey = this.value.toLowerCase(); const clases = CLASES_POR_RAZA[razaKey] || [];
        select.innerHTML = '<option value="" disabled selected>Selecciona…</option>' + clases.map(c => `<option value="${c}">${CLASES[c]}</option>`).join(''); select.value = ''; select.disabled = clases.length === 0;
    });

    // restore session from sessionStorage (source of truth)
    const sesion = JSON.parse(sessionStorage.getItem('mm_usuario') || 'null');
    if (sesion) guardarSesion(sesion);
});

function errMsg(code) { return ({ 'auth/popup-blocked': 'El navegador bloqueó la ventana. Permite popups e inténtalo de nuevo.', 'auth/popup-closed-by-user': '', 'auth/network-request-failed': 'Error de red. Comprueba tu conexión.', 'auth/too-many-requests': 'Demasiados intentos. Espera un momento.', 'auth/unauthorized-domain': 'Dominio no autorizado en Firebase.' })[code] || 'Error al conectar con Google. Inténtalo de nuevo.'; }