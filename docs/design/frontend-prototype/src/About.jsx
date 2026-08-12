// "Conozca el RA-0" — institutional info page
const About = () => {
  const facts = [
    { k: "Tipo", v: "Argonauta · reactor de investigación" },
    { k: "Potencia nominal", v: "10 W térmicos" },
    { k: "Combustible", v: "U₃O₈ enriquecido al 20 %" },
    { k: "Moderador", v: "Grafito + agua liviana" },
    { k: "Refrigerante", v: "Agua liviana, convección natural" },
    { k: "Primera criticidad", v: "1971" },
    { k: "Ubicación", v: "FCEFyN · Ciudad Universitaria, Córdoba" },
    { k: "Operador", v: "Universidad Nacional de Córdoba" },
  ];

  return (
    <div className="space-y-5">
      <div className="banner">Conozca el RA-0</div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <div className="img-placeholder rounded-xl" style={{ height: 320 }}>
            <div className="h-full w-full flex items-end p-5">
              <div className="font-mono text-[10px] text-[#3a3d42]/70">[ vista sala-control · placeholder ]</div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-2">Acerca del reactor</div>
            <h2 className="text-[22px] font-semibold mb-3">Reactor Nuclear de Investigación RA-0</h2>
            <p className="text-[14px] leading-relaxed text-[#3a3d42] mb-3">
              El RA-0 es un reactor argonauta de baja potencia operado por la Universidad Nacional de Córdoba en la Facultad de
              Ciencias Exactas, Físicas y Naturales. Se utiliza para la formación de estudiantes de grado y posgrado en física
              nuclear, ingeniería nuclear y radioquímica, y para experimentos de medición de flujo, calibración de detectores y
              activación neutrónica.
            </p>
            <p className="text-[14px] leading-relaxed text-[#3a3d42]">
              El presente sistema (SSE) provee a los estudiantes una vista en vivo y un archivo histórico de las variables
              operativas del reactor durante prácticas y experimentos, sin permitir ningún tipo de control sobre la planta.
            </p>
          </div>
        </div>

        <aside className="col-span-12 lg:col-span-5 space-y-4">
          <div className="card card-pad">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-3">Ficha técnica</div>
            <dl className="grid grid-cols-1 gap-2.5">
              {facts.map(f => (
                <div key={f.k} className="flex items-baseline justify-between gap-4 py-1.5 border-b border-line last:border-0">
                  <dt className="text-[12px] text-muted">{f.k}</dt>
                  <dd className="text-[13px] font-medium text-right">{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="card card-pad">
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted mb-3">Líneas de uso didáctico</div>
            <ul className="text-[13px] text-[#3a3d42] space-y-2">
              <li>• Determinación de período y reactividad</li>
              <li>• Calibración de barras de control</li>
              <li>• Mapeo de flujo neutrónico</li>
              <li>• Análisis por activación neutrónica</li>
              <li>• Práctica de operación bajo SERMO</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
};

window.About = About;
