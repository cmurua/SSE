const Help = () => {
  const L = window.LABELS.help;
  const TABS = [
    { id: "intro", label: L.tabs.intro },
    { id: "realtime", label: L.tabs.realtime },
    { id: "histories", label: L.tabs.histories },
    { id: "report", label: L.tabs.report },
    { id: "glossary", label: L.tabs.glossary },
  ];
  const [tab, setTab] = React.useState("intro");

  return (
    <div className="space-y-5">
      <div className="banner">{L.title}</div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-5 border-b border-line">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className={"py-4 px-3 text-[13px] font-medium border-b-2 -mb-px text-center transition-colors " +
                      (tab === t.id ? "border-[var(--ink)] text-[var(--ink)] bg-[#fafbfc]" : "border-transparent text-muted hover:text-[var(--ink)]")}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-7 prose-sse">
          {tab === "intro" && <Intro />}
          {tab === "realtime" && <RT />}
          {tab === "histories" && <Hist />}
          {tab === "report" && <Rep />}
          {tab === "glossary" && <Glos />}
        </div>
      </div>

      <style>{`
        .prose-sse h3 { font-size: 16px; font-weight: 600; color: var(--ink); margin-bottom: 8px; }
        .prose-sse p, .prose-sse li { font-size: 14px; line-height: 1.6; color: #3a3d42; }
        .prose-sse ul { list-style: disc; padding-left: 22px; margin-top: 4px; }
        .prose-sse .block { margin-bottom: 22px; }
        .prose-sse code { font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #f3f4f5; padding: 1px 6px; border-radius: 4px; color: #2a2d31; }
      `}</style>
    </div>
  );
};

const Intro = () => (
  <div>
    <div className="block">
      <h3>1. Acceso al sistema</h3>
      <p>Para ingresar al SSE, utilice su correo institucional de la UNC. Solo los usuarios con permisos válidos pueden acceder a los datos en tiempo real.</p>
      <p>Si no logra iniciar sesión, verifique que:</p>
      <ul>
        <li>Tenga conexión a la red de la UNC.</li>
        <li>Sus credenciales estén actualizadas.</li>
        <li>El servidor del SSE esté operativo (consulte con el administrador).</li>
      </ul>
    </div>
    <div className="block">
      <h3>2. Carácter del sistema</h3>
      <p>El SSE es un sistema de <strong>solo lectura</strong>: no controla el reactor RA-0. Su única función es visualizar variables operativas con fines educativos y de capacitación.</p>
    </div>
    <div className="block">
      <h3>3. Estado del reactor</h3>
      <p>El indicador <code>SERMO</code> en la cabecera muestra el estado actual del reactor. Cuando está en <strong>OPERACIÓN</strong> se habilita la visualización en vivo. En estado <strong>DETENIDO</strong> solo se accede a históricos.</p>
    </div>
  </div>
);

const RT = () => (
  <div>
    <div className="block">
      <h3>1. Selección de variables</h3>
      <p>En el panel lateral encontrará alrededor de 30 variables agrupadas por subsistema (núcleo, refrigeración, control, radiación, etc.). Puede seleccionar hasta <strong>2 variables simultáneamente</strong>.</p>
    </div>
    <div className="block">
      <h3>2. Modo de gráfico</h3>
      <ul>
        <li><strong>Variable vs Tiempo:</strong> evolución temporal de cada variable, con muestreo de 1 Hz.</li>
        <li><strong>Variable vs Variable:</strong> requiere 2 variables. Una se grafica en función de la otra (por ejemplo Potencia vs Posición de barras).</li>
      </ul>
    </div>
    <div className="block">
      <h3>3. Exportación</h3>
      <p>El botón <code>Exportar PNG</code> guarda una imagen del gráfico actual. Útil para informes y prácticas.</p>
    </div>
    <div className="block">
      <h3>4. Finalización</h3>
      <p>Al producirse un SCRAM o al salir del modo OPERACIÓN, el sistema detiene la actualización en vivo y la sesión queda disponible como registro histórico.</p>
    </div>
  </div>
);

const Hist = () => (
  <div>
    <div className="block">
      <h3>1. Filtros de búsqueda</h3>
      <p>Puede consultar operaciones pasadas combinando rango de fechas y/o ID de operación. Los resultados se muestran en el listado con metadatos básicos: operador, duración, cantidad de muestras.</p>
    </div>
    <div className="block">
      <h3>2. Detalle de una operación</h3>
      <p>Al abrir una operación, accede al mismo visor de gráficos del modo en tiempo real (variable vs tiempo o variable vs variable), con un control de reproducción para recorrer la sesión.</p>
    </div>
    <div className="block">
      <h3>3. Exportación</h3>
      <p>Tanto el gráfico como la tabla de muestras pueden exportarse para análisis posterior.</p>
    </div>
  </div>
);

const Rep = () => (
  <div>
    <div className="block">
      <h3>Tipos de reporte</h3>
      <ul>
        <li><strong>Error:</strong> comportamiento incorrecto del sistema, datos incoherentes, fallas de visualización.</li>
        <li><strong>Sugerencia:</strong> ideas de mejora, nuevas variables, cambios en la interfaz.</li>
      </ul>
    </div>
    <div className="block">
      <h3>Buenas prácticas</h3>
      <ul>
        <li>Indique fecha y hora aproximada del incidente.</li>
        <li>Si es un error visual, adjunte capturas en el cuerpo del mensaje.</li>
        <li>Para sugerencias relacionadas con docencia, mencione el curso o práctica.</li>
      </ul>
    </div>
  </div>
);

const Glos = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
    <Term k="SERMO" v="Señal binaria que indica si el reactor RA-0 se encuentra en modo OPERACIÓN. Habilita la adquisición en vivo del SSE." />
    <Term k="SCRAM" v="Detención rápida del reactor por inserción de barras de control de seguridad ante una condición fuera de rango." />
    <Term k="RA-0" v="Reactor de investigación tipo Argonauta de la UNC, utilizado con fines didácticos y experimentales." />
    <Term k="Reactividad" v="Medida de la desviación del reactor respecto del estado crítico. Expresada habitualmente en pcm." />
    <Term k="Período" v="Tiempo característico de variación exponencial de la potencia. Períodos largos indican operación estable." />
    <Term k="CIC / BF₃" v="Cámaras de ionización y detectores proporcionales que componen la cadena de instrumentación neutrónica." />
  </div>
);

const Term = ({ k, v }) => (
  <div>
    <div className="font-mono text-[12px] uppercase tracking-wider text-[var(--ink)] font-semibold">{k}</div>
    <div className="text-[13px] text-[#3a3d42] leading-relaxed mt-1">{v}</div>
  </div>
);

window.Help = Help;
