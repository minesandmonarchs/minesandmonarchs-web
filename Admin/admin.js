/* ============================================================
   admin.js – Mines & Monarchs · Panel de Administración
   Solo accesible para usuarios con rol 'admin'
   ============================================================ */

import { initializeApp, getApp, getApps }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signOut }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc, getDoc }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey:            "AIzaSyC97DUSkDy8qOHnk5rm3P-263m4W6Okbzo",
    authDomain:        "minesandmonarch.firebaseapp.com",
    projectId:         "minesandmonarch",
    storageBucket:     "minesandmonarch.firebasestorage.app",
    messagingSenderId: "379898851786",
    appId:             "1:379898851786:web:b892cbf4d8508798d61f33"
};

const app  = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ── Datos de referencia ── */
const RAZAS = {
    humano:"Humano", elfo:"Elfo", goblin:"Goblin", enano:"Enano",
    demonio:"Demonio", sirena:"Sirena", valquiria:"Valquiria",
    hada:"Hada", ogro:"Ogro", revenant:"Revenant"
};
const CLASES = {
    magoender:"Mago del Ender", magoelectrico:"Mago Eléctrico",
    magosangre:"Mago de Sangre", magohelado:"Mago Helado",
    magoinvocador:"Mago Invocador", magofuego:"Mago de Fuego",
    magoeldritch:"Mago del Eldritch", magoViento:"Mago de Viento", 
    magotierra:"Mago de Tierra", support:"Support", magoBendito:"Mago Bendito",
    tanque:"Tanque",
    ingeniero:"Ingeniero", guerrero:"Guerrero",
    carterista:"Carterista", soldadoDorado:"Soldado Dorado",
    guerreroInfernal:"Guerrero Infernal", support:"Support",
    tritonisa:"Tritonisa", guerreroBendito:"Guerrero Bendito", berserker:"Berserker", bestiaSalvaje:"Bestia Salvaje"
};
const CLASES_POR_RAZA = {
    humano:       ['guerrero','tanque','ingeniero'],
    elfo:         ['magohelado','magoelectrico','magotierra','support'],
    goblin:       ['carterista','soldadoDorado','ingeniero'],
    enano:        ['guerrero','tanque','ingeniero'],
    demonio:      ['guerreroInfernal','magosangre','magofuego'],
    sirena:       ['magohelado','tritonisa','magotierra'],
    valquiria:    ['guerreroBendito','magoViento','magoBendito','magoelectrico'],
    hada:         ['carterista','magoViento','support'],
    ogro:         ['berserker','bestiaSalvaje','tanque'],
    revenant:     ['magoeldritch','magoinvocador','magosangre','magoender'],
};
const TRABAJOS = {
    inutilerrante:"Inútil",
    herrero:"Herrero", clerigo:"Clérigo",
    minero:"Minero", agricultor:"Agricultor",
    granjero:"Granjero", cocinero:"Cocinero"
};

const opts = (obj, sel = '') => Object.entries(obj)
    .map(([v,l]) => `<option value="${v}"${v===sel?' selected':''}>${l}</option>`).join('');

/* ── Estado global ── */
let todosLosPersonajes = [];

/* ════════════════════════
   GUARD – solo admins
   ════════════════════════ */
async function verificarAcceso() {
    const sesion = JSON.parse(sessionStorage.getItem('mm_usuario') || 'null');
    if (!sesion || !sesion.uid || sesion.rol !== 'admin') return denegarAcceso();
    try {
        document.getElementById('nav-admin-nombre').textContent = `⚜ ${sesion.nombreRol || 'Admin'}`;
        await cargarPersonajes();
    } catch (err) {
        console.error(err);
        denegarAcceso();
    }
}
verificarAcceso();

function denegarAcceso() {
    const main = document.querySelector('.admin-main');
    main.innerHTML = `
        <div class="admin-denegado">
            <h2>⛔ Acceso denegado</h2>
            <p>No tienes permisos para ver esta página.</p>
            <a href="https://www.minesandmonarchs.com//" style="color:#ffd700">← Volver al inicio</a>
        </div>`;
}

/* ════════════════════════
   CERRAR SESIÓN
   ════════════════════════ */
document.getElementById('btnCerrarSesionAdmin').addEventListener('click', async e => {
    e.preventDefault();
    await signOut(auth);
    sessionStorage.removeItem('mm_usuario');
    window.location.href = 'https://www.minesandmonarchs.com/';
});

/* ════════════════════════
   CARGAR PERSONAJES
   ════════════════════════ */
async function cargarPersonajes() {
    const loading = document.getElementById('loadingMsg');
    const tabla   = document.getElementById('adminTabla');
    try {
        const snap = await getDocs(collection(db, 'usuarios'));
        todosLosPersonajes = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.personaje) todosLosPersonajes.push({ uid: d.id, ...data });
        });

        /* Stats */
        document.getElementById('totalPersonajes').textContent = todosLosPersonajes.length;
        document.getElementById('totalAdmins').textContent     = todosLosPersonajes.filter(p => p.rol === 'admin').length;
        document.getElementById('totalCiudadanos').textContent = todosLosPersonajes.filter(p => p.rol === 'ciudadano').length;

        loading.style.display = 'none';
        tabla.style.display   = '';
        renderTabla(todosLosPersonajes);
    } catch (err) {
        loading.textContent = 'Error al cargar los personajes.';
        console.error(err);
    }
}

/* ════════════════════════
   RENDER TABLA
   ════════════════════════ */
function renderTabla(lista) {
    const tbody = document.getElementById('adminTbody');
    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#6a5a3a;padding:32px">No se encontraron personajes.</td></tr>`;
        return;
    }
    tbody.innerHTML = lista.map((p, i) => {
        const per = p.personaje;
        const badgeClass = p.rol === 'admin' ? 'badge-admin' : p.rol === 'escriba' ? 'badge-escriba' : 'badge-ciudadano';
        return `<tr>
            <td>${p.id || i+1}</td>
            <td><strong>${per.nombreRol}</strong></td>
            <td>${p.discord || '—'}</td>
            <td>${per.nombreMC || '—'}</td>
            <td>${RAZAS[per.raza] || per.raza}</td>
            <td>${CLASES[per.clase] || per.clase}</td>
            <td>${TRABAJOS[per.trabajo] || per.trabajo}</td>
            <td><span class="badge ${badgeClass}">${p.rol}</span></td>
            <td>
                <button class="btn-editar" data-uid="${p.uid}">✏️ Editar</button>
                <button class="btn-eliminar" data-uid="${p.uid}" data-nombre="${per.nombreRol}">🗑️ Eliminar</button>
            </td>
        </tr>`;
    }).join('');

    /* Eventos de botones */
    tbody.querySelectorAll('.btn-editar').forEach(btn =>
        btn.addEventListener('click', () => abrirEditar(btn.dataset.uid)));
    tbody.querySelectorAll('.btn-eliminar').forEach(btn =>
        btn.addEventListener('click', () => abrirEliminar(btn.dataset.uid, btn.dataset.nombre)));
}

/* ════════════════════════
   BÚSQUEDA
   ════════════════════════ */
document.getElementById('searchInput').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    const filtrado = todosLosPersonajes.filter(p => {
        const per = p.personaje;
        return (per.nombreRol?.toLowerCase().includes(q) ||
                p.discord?.toLowerCase().includes(q) ||
                per.nombreMC?.toLowerCase().includes(q));
    });
    renderTabla(filtrado);
});

/* ════════════════════════
   MODAL EDITAR
   ════════════════════════ */
function abrirEditar(uid) {
    const p   = todosLosPersonajes.find(x => x.uid === uid);
    const per = p.personaje;

    document.getElementById('editUid').value        = uid;
    document.getElementById('editDiscord').value    = p.discord || '';
    document.getElementById('editNombreMC').value   = per.nombreMC || '';
    document.getElementById('editNombreRol').value  = per.nombreRol || '';
    document.getElementById('editRolSistema').value = p.rol || 'ciudadano';

    /* Raza */
    const selRaza = document.getElementById('editRaza');
    selRaza.innerHTML = opts(RAZAS, per.raza);

    /* Clase según raza actual */
    rellenarClases(per.raza, per.clase);

    /* Trabajo */
    document.getElementById('editTrabajo').innerHTML = opts(TRABAJOS, per.trabajo);

    selRaza.addEventListener('change', function () {
        rellenarClases(this.value, '');
    });

    document.getElementById('editError').style.display = 'none';
    document.getElementById('editOverlay').classList.add('active');
}

function rellenarClases(raza, claseSeleccionada) {
    const clases  = CLASES_POR_RAZA[raza] || Object.keys(CLASES);
    const selClase = document.getElementById('editClase');
    selClase.innerHTML = clases
        .map(c => `<option value="${c}"${c===claseSeleccionada?' selected':''}>${CLASES[c]}</option>`)
        .join('');
}

document.getElementById('editClose').addEventListener('click',  () => document.getElementById('editOverlay').classList.remove('active'));
document.getElementById('editCancel').addEventListener('click', () => document.getElementById('editOverlay').classList.remove('active'));

document.getElementById('editSave').addEventListener('click', async () => {
    const uid       = document.getElementById('editUid').value;
    const discord   = document.getElementById('editDiscord').value.trim();
    const nombreMC  = document.getElementById('editNombreMC').value.trim();
    const nombreRol = document.getElementById('editNombreRol').value.trim();
    const raza      = document.getElementById('editRaza').value;
    const clase     = document.getElementById('editClase').value;
    const trabajo   = document.getElementById('editTrabajo').value;
    const rol       = document.getElementById('editRolSistema').value;
    const errEl     = document.getElementById('editError');

    if (!discord || !nombreMC || !nombreRol || !raza || !clase || !trabajo) {
        errEl.textContent = 'Todos los campos son obligatorios.';
        errEl.style.display = '';
        return;
    }
    errEl.style.display = 'none';

    try {
        await updateDoc(doc(db, 'usuarios', uid), {
            discord,
            rol,
            'personaje.nombreRol': nombreRol,
            'personaje.nombreMC':  nombreMC,
            'personaje.raza':      raza,
            'personaje.clase':     clase,
            'personaje.trabajo':   trabajo
        });
        /* Actualizar caché local */
        const idx = todosLosPersonajes.findIndex(x => x.uid === uid);
        if (idx !== -1) {
            todosLosPersonajes[idx] = {
                ...todosLosPersonajes[idx],
                discord, rol,
                personaje: { ...todosLosPersonajes[idx].personaje, nombreRol, nombreMC, raza, clase, trabajo }
            };
        }
        document.getElementById('editOverlay').classList.remove('active');
        renderTabla(todosLosPersonajes);

        /* Actualizar stats */
        document.getElementById('totalAdmins').textContent     = todosLosPersonajes.filter(p => p.rol === 'admin').length;
        document.getElementById('totalCiudadanos').textContent = todosLosPersonajes.filter(p => p.rol === 'ciudadano').length;
    } catch (err) {
        errEl.textContent = 'Error al guardar. Inténtalo de nuevo.';
        errEl.style.display = '';
        console.error(err);
    }
});

/* ════════════════════════
   MODAL ELIMINAR
   ════════════════════════ */
function abrirEliminar(uid, nombre) {
    document.getElementById('deleteUid').value    = uid;
    document.getElementById('deleteNombre').textContent = nombre;
    document.getElementById('deleteOverlay').classList.add('active');
}

document.getElementById('deleteClose').addEventListener('click',  () => document.getElementById('deleteOverlay').classList.remove('active'));
document.getElementById('deleteCancel').addEventListener('click', () => document.getElementById('deleteOverlay').classList.remove('active'));

document.getElementById('deleteConfirm').addEventListener('click', async () => {
    const uid = document.getElementById('deleteUid').value;
    try {
        await deleteDoc(doc(db, 'usuarios', uid));
        todosLosPersonajes = todosLosPersonajes.filter(p => p.uid !== uid);
        document.getElementById('deleteOverlay').classList.remove('active');
        renderTabla(todosLosPersonajes);

        /* Actualizar stats */
        document.getElementById('totalPersonajes').textContent = todosLosPersonajes.length;
        document.getElementById('totalAdmins').textContent     = todosLosPersonajes.filter(p => p.rol === 'admin').length;
        document.getElementById('totalCiudadanos').textContent = todosLosPersonajes.filter(p => p.rol === 'ciudadano').length;
    } catch (err) {
        console.error('Error al eliminar:', err);
    }
});

/* ════════════════════════════════════════════
   TABS DE NAVEGACIÓN
   ════════════════════════════════════════════ */
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).style.display = '';
        if (tab.dataset.tab === 'territorios' && !window._territoriosCargados) {
            cargarSolicitudesTerritorios();
        }
    });
});

/* ════════════════════════════════════════════
   SOLICITUDES DE TERRITORIO
   ════════════════════════════════════════════ */
let todasLasSolicitudes = [];
window._territoriosCargados = false;

async function cargarSolicitudesTerritorios() {
    const loading = document.getElementById('loadingTerritorios');
    const tabla   = document.getElementById('tablaTerritorios');
    try {
        const snap = await getDocs(collection(db, 'solicitudes_territorio'));
        todasLasSolicitudes = [];
        snap.forEach(d => todasLasSolicitudes.push({ docId: d.id, ...d.data() }));

        // Ordenar: pendientes primero
        todasLasSolicitudes.sort((a, b) => {
            const orden = { pendiente: 0, aprobado: 1, rechazado: 2 };
            return (orden[a.estado] ?? 3) - (orden[b.estado] ?? 3);
        });

        actualizarStatsTerritorios();
        loading.style.display = 'none';
        tabla.style.display = '';
        renderTablaTerritorios(todasLasSolicitudes);
        window._territoriosCargados = true;
    } catch (err) {
        loading.textContent = 'Error al cargar las solicitudes.';
        console.error(err);
    }
}

function actualizarStatsTerritorios() {
    document.getElementById('totalPendientes').textContent  = todasLasSolicitudes.filter(s => s.estado === 'pendiente').length;
    document.getElementById('totalAprobados').textContent   = todasLasSolicitudes.filter(s => s.estado === 'aprobado').length;
    document.getElementById('totalRechazados').textContent  = todasLasSolicitudes.filter(s => s.estado === 'rechazado').length;
}

function renderTablaTerritorios(lista) {
    const tbody = document.getElementById('tbodyTerritorios');
    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#6a5a3a;padding:32px">No hay solicitudes.</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(s => {
        const badgeClass = s.estado === 'aprobado' ? 'badge-admin' : s.estado === 'rechazado' ? 'badge-rechazado' : 'badge-pendiente';
        const fecha = s.creadoEn?.toDate ? s.creadoEn.toDate().toLocaleDateString('es-ES') : '—';
        const fundador = s.fundador?.nombreRol || '—';
        return `<tr>
            <td><strong>${s.nombre || '—'}</strong></td>
            <td>${s.nombre_corto || '—'}</td>
            <td>${fundador}</td>
            <td><span class="badge ${badgeClass}">${s.estado}</span></td>
            <td>${fecha}</td>
            <td>
                <button class="btn-editar btn-ver-solicitud" data-id="${s.docId}">🔍 Ver</button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-ver-solicitud').forEach(btn =>
        btn.addEventListener('click', () => abrirDetalleSolicitud(btn.dataset.id))
    );
}

/* ── Modal detalle ── */
let _solicitudActual = null;

function abrirDetalleSolicitud(docId) {
    const s = todasLasSolicitudes.find(x => x.docId === docId);
    if (!s) return;
    _solicitudActual = s;

    document.getElementById('territorioModalTitle').textContent = `📜 ${s.nombre || 'Solicitud'}`;

    const fila = (label, val) => val
        ? `<div class="sol-fila"><span class="sol-label">${label}</span><span class="sol-val">${val}</span></div>`
        : '';
    const parrafos = arr => Array.isArray(arr) ? arr.map(p => `<p style="margin:0 0 8px">${p}</p>`).join('') : arr || '—';

    const gent = s.gentilicio || {};
    const gentStr = [
        gent.masc_sg && `♂ sg: ${gent.masc_sg}`,
        gent.fem_sg  && `♀ sg: ${gent.fem_sg}`,
        gent.masc_pl && `♂ pl: ${gent.masc_pl}`,
        gent.fem_pl  && `♀ pl: ${gent.fem_pl}`,
        gent.neutro  && `⚧ : ${gent.neutro}`
    ].filter(Boolean).join(' · ');

    document.getElementById('territorioModalBody').innerHTML = `
        <div class="sol-seccion-title">General</div>
        ${fila('Nombre completo', s.nombre)}
        ${fila('Nombre corto', s.nombre_corto)}
        ${fila('Gentilicio', gentStr)}
        ${fila('Fundador', s.fundador?.nombreRol)}

        <div class="sol-seccion-title">Descripción</div>
        <div class="sol-label">Descripción</div>
        <div class="sol-val sol-parrafos">${parrafos(s.descripcion)}</div>
        ${fila('Creencia', s.creencia)}

        <div class="sol-seccion-title">Lore</div>
        <div class="sol-label">Lore</div>
        <div class="sol-val sol-parrafos">${parrafos(s.lore)}</div>

        <div class="sol-seccion-title">Gobierno</div>
        ${fila('Forma de gobierno', s.gobierno_desc)}
        ${fila('Planificación', s.planificacion)}
        ${fila('Políticas exteriores', s.politicas_ext)}
        ${s.guerras ? fila('Posibles guerras', s.guerras) : ''}
        ${fila('¿Por qué es fundador?', s.por_que_fundador)}
        ${s.comentario ? fila('Comentario', s.comentario) : ''}
    `;

    // Mostrar/ocultar botones según estado
    const yaDecidido = s.estado !== 'pendiente';
    document.getElementById('territorioAprobar').style.display  = yaDecidido ? 'none' : '';
    document.getElementById('territorioRechazar').style.display = yaDecidido ? 'none' : '';

    document.getElementById('territorioOverlay').classList.add('active');
}

// Cerrar modal
['territorioClose','territorioCerrar'].forEach(id =>
    document.getElementById(id).addEventListener('click', () =>
        document.getElementById('territorioOverlay').classList.remove('active')
    )
);

// Aprobar
document.getElementById('territorioAprobar').addEventListener('click', async () => {
    await cambiarEstadoSolicitud(_solicitudActual.docId, 'aprobado');
});

// Rechazar
document.getElementById('territorioRechazar').addEventListener('click', async () => {
    await cambiarEstadoSolicitud(_solicitudActual.docId, 'rechazado');
});

async function cambiarEstadoSolicitud(docId, nuevoEstado) {
    try {
        await updateDoc(doc(db, 'solicitudes_territorio', docId), { estado: nuevoEstado });
        // Actualizar caché local
        const idx = todasLasSolicitudes.findIndex(s => s.docId === docId);
        if (idx !== -1) todasLasSolicitudes[idx].estado = nuevoEstado;
        actualizarStatsTerritorios();
        renderTablaTerritorios(todasLasSolicitudes);
        document.getElementById('territorioOverlay').classList.remove('active');
    } catch (err) {
        console.error('Error al actualizar estado:', err);
    }
}
