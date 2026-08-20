'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Search, Loader2, Eye, EyeOff, CheckCircle2, AlertCircle, FileText, ChevronDown, RefreshCcw, Activity, Users, Server } from 'lucide-react';

interface DiagnosticData {
  endpoint: string;
  method: string;
  status: number;
  timeMs: number;
  responseType: string;
  fields: number;
  arrays: number;
  objects: number;
  hasNucleoFamiliar: boolean;
}

interface NormalizedResponse {
  scalarData: Record<string, string>;
  arraysData: Record<string, any[]>;
  diagnostic: DiagnosticData;
}

export default function Page() {
  const [tipoDocumento, setTipoDocumento] = useState('3'); 
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [status, setStatus] = useState<'initial' | 'loading' | 'success' | 'error' | 'not_found'>('initial');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<NormalizedResponse | null>(null);
  const [health, setHealth] = useState<any>(null);
  
  // Controles de privacidad
  const [showDoc, setShowDoc] = useState(false);
  const [queryInfo, setQueryInfo] = useState({ tipo: '', numero: '' });

  useEffect(() => {
    // Health check on mount
    fetch('/api/rui/health')
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(err => setHealth({ status: 'error', message: 'No connection to API' }));
  }, []);

  const maskDocument = (doc: string) => {
    if (!doc) return '';
    if (doc.length <= 4) return doc;
    const first = doc.slice(0, 1);
    const last = doc.slice(-3);
    return `${first}.${'*'.repeat(Math.max(3, doc.length - 4))}.${last}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numeroDocumento.trim()) return;

    setStatus('loading');
    setMessage('');
    setData(null);
    setShowDoc(false);

    try {
      const res = await fetch('/api/rui/consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipoDocumento, numeroDocumento })
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setData(json.data);
        setStatus('success');
        setQueryInfo({ tipo: tipoDocumento, numero: numeroDocumento });
      } else {
        setStatus(res.status === 404 ? 'not_found' : 'error');
        // Handle the structured error object or fallback to a default message
        const errMsg = json.error?.message || json.message || 'No fue posible realizar la consulta. Intenta nuevamente.';
        setMessage(errMsg);
      }
    } catch (err: any) {
      setStatus('error');
      setMessage('Error de conexión. Intenta nuevamente.');
    }
  };

  const handleReset = () => {
    setStatus('initial');
    setData(null);
    setNumeroDocumento('');
  };

  const getDocTypeName = (code: string) => {
    const types: Record<string, string> = {
      '1': 'Registro civil',
      '2': 'Tarjeta de identidad',
      '3': 'Cédula de ciudadanía',
      '4': 'Cédula de extranjería',
      '5': 'Otro'
    };
    return types[code] || 'Documento';
  };

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Consulta RUI</h1>
            <p className="text-xs text-slate-500 hidden sm:block">Sistema de consulta de información social</p>
          </div>
          <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full text-xs font-medium border border-emerald-100">
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Servicio oficial / autorizado</span>
            <span className="sm:hidden">Seguro</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center p-4 sm:p-6 lg:p-12 relative overflow-hidden">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-b from-blue-50/50 to-transparent -z-10 pointer-events-none" />
        
        {/* Aumentamos el max-w para acomodar resultados de tablas más anchas si es necesario, 
            pero el formulario se mantendrá contenido visualmente. */}
        <div className="w-full max-w-4xl mt-4 sm:mt-8">
          
          <AnimatePresence mode="wait">
            {/* INICIAL / LOADING FORM */}
            {(status === 'initial' || status === 'loading' || status === 'error' || status === 'not_found') && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                transition={{ duration: 0.3 }}
                className="max-w-lg mx-auto space-y-6"
              >
                
                {process.env.NODE_ENV !== 'production' && (
                  <SystemDiagnostic health={health} data={data} status={status} />
                )}

                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">Consulta de información</h2>
                  <p className="text-sm text-slate-500 mt-2">Ingresa los datos de identificación para realizar la consulta.</p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 sm:p-8">
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                      <label htmlFor="tipoDocumento" className="block text-sm font-medium text-slate-700">Tipo de documento</label>
                      <div className="relative">
                        <select
                          id="tipoDocumento"
                          value={tipoDocumento}
                          onChange={(e) => setTipoDocumento(e.target.value)}
                          disabled={status === 'loading'}
                          className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:opacity-50"
                        >
                          <option value="3">Cédula de ciudadanía</option>
                          <option value="2">Tarjeta de identidad</option>
                          <option value="1">Registro civil</option>
                          <option value="4">Cédula de extranjería</option>
                          <option value="5">Otro</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="numeroDocumento" className="block text-sm font-medium text-slate-700">Número de documento</label>
                      <div className="relative">
                        <input
                          id="numeroDocumento"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={numeroDocumento}
                          onChange={(e) => setNumeroDocumento(e.target.value.replace(/[^0-9]/g, ''))}
                          disabled={status === 'loading'}
                          placeholder="Digite el número de documento"
                          className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:opacity-50 font-medium"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={status === 'loading' || !numeroDocumento}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm px-4 py-3.5 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm shadow-blue-500/20 mt-2"
                    >
                      {status === 'loading' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Consultando...</span>
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          <span>Consultar</span>
                        </>
                      )}
                    </button>
                  </form>

                  <AnimatePresence>
                    {(status === 'error' || status === 'not_found') && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className={`rounded-xl p-4 flex gap-3 text-sm ${
                          status === 'not_found' 
                            ? 'bg-amber-50 text-amber-800 border border-amber-200/50'
                            : 'bg-red-50 text-red-800 border border-red-200/50'
                        }`}
                      >
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <p>{message}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* SUCCESS DASHBOARD */}
            {status === 'success' && data && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, type: 'spring', bounce: 0.2 }}
              >
                <div className="space-y-6">
                  
                  {/* DIAGNOSTIC PANEL */}
                  <DiagnosticPanel diag={data.diagnostic} />

                  {/* SCALAR DATA CARD */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-100 p-5 sm:p-6 text-center">
                      <div className="mx-auto w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h2 className="text-lg font-semibold text-slate-900">Resultado de consulta</h2>
                      <p className="text-sm text-slate-500 mt-1">
                        {new Date().toLocaleString('es-CO')}
                      </p>
                    </div>

                    <div className="p-5 sm:p-6 space-y-6">
                      <RuiResult 
                        scalarData={data.scalarData} 
                        queryInfo={queryInfo} 
                        showDoc={showDoc} 
                        setShowDoc={setShowDoc} 
                        getDocTypeName={getDocTypeName} 
                        maskDocument={maskDocument} 
                      />
                    </div>

                    <div className="p-5 sm:p-6 bg-slate-50 border-t border-slate-100">
                      <button
                        onClick={handleReset}
                        className="w-full sm:w-auto mx-auto flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 font-medium text-sm px-8 py-3 rounded-xl transition-all shadow-sm"
                      >
                        <RefreshCcw className="w-4 h-4" />
                        Nueva consulta
                      </button>
                    </div>
                  </div>

                  {/* NÚCLEO FAMILIAR / ARRAYS */}
                  {data.diagnostic.hasNucleoFamiliar && (
                    <NucleoFamiliar arraysData={data.arraysData} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-slate-900">Consulta RUI</p>
            <p className="text-xs text-slate-500 mt-1">Plataforma de consulta social</p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
            <a href="#" className="hover:text-blue-600 transition-colors">Privacidad</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Tratamiento de datos</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Términos</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Contacto</a>
          </div>
        </div>
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────

function DiagnosticPanel({ diag }: { diag: DiagnosticData }) {
  return (
    <div className="bg-slate-900 rounded-xl p-5 text-emerald-400 font-mono text-xs sm:text-sm shadow-sm overflow-hidden border border-slate-800 relative group">
      {/* Indicador de Debug Mode / Admin view (sólo metadata, cero PII) */}
      <div className="absolute top-0 right-0 bg-slate-800 text-slate-400 px-3 py-1 rounded-bl-lg text-[10px] uppercase tracking-widest font-semibold border-b border-l border-slate-700">
        Diagnóstico Seguro
      </div>

      <div className="flex items-center gap-2 mb-3 text-emerald-300 font-semibold border-b border-emerald-800/50 pb-2">
        <Activity className="w-4 h-4" />
        <span>Telemetría de la Integración (Sin PII)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-6">
        <div><span className="text-slate-500">Endpoint:</span> {diag.endpoint}</div>
        <div><span className="text-slate-500">HTTP Method:</span> {diag.method}</div>
        <div><span className="text-slate-500">HTTP Status:</span> {diag.status}</div>
        <div><span className="text-slate-500">Latencia:</span> {diag.timeMs.toFixed(0)} ms</div>
        <div><span className="text-slate-500">Response Type:</span> {diag.responseType}</div>
        <div className="col-span-1 sm:col-span-2 lg:col-span-3 border-t border-slate-800/50 mt-1 pt-1" />
        <div><span className="text-slate-500">Campos Escalares:</span> {diag.fields}</div>
        <div><span className="text-slate-500">Objetos:</span> {diag.objects}</div>
        <div><span className="text-slate-500">Colecciones:</span> {diag.arrays}</div>
        <div><span className="text-slate-500">Núcleo familiar detectado:</span> {diag.hasNucleoFamiliar ? 'Sí' : 'No'}</div>
      </div>
    </div>
  );
}

function RuiResult({ 
  scalarData, 
  queryInfo, 
  showDoc, 
  setShowDoc, 
  getDocTypeName, 
  maskDocument 
}: any) {
  return (
    <>
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
            {getDocTypeName(queryInfo.tipo)}
          </p>
          <p className="text-base font-medium text-slate-900 tabular-nums tracking-tight">
            {showDoc ? queryInfo.numero : maskDocument(queryInfo.numero)}
          </p>
        </div>
        <button
          onClick={() => setShowDoc(!showDoc)}
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors flex flex-col items-center gap-1"
          title={showDoc ? "Ocultar documento" : "Mostrar documento"}
        >
          {showDoc ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          <span className="text-[10px] font-medium hidden sm:block">{showDoc ? 'Ocultar' : 'Mostrar'}</span>
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          Información encontrada
        </h3>
        
        {Object.keys(scalarData).length === 0 ? (
          <p className="text-sm text-slate-500 italic py-4">No se encontraron propiedades simples en la respuesta.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(scalarData).map(([key, value]) => {
              if (key === '_aviso' || key.includes('fechaConsulta')) return null;
              // Clean key names (e.g. "clasificacion.grupo" -> "clasificacion grupo")
              const cleanKey = key.replace(/[._]/g, ' ');
              return (
                <div key={key} className="flex flex-col sm:flex-row sm:justify-between py-2 border-b border-slate-100 last:border-0 gap-1 sm:gap-4">
                  <span className="text-sm text-slate-500 capitalize">{cleanKey}</span>
                  <span className="text-sm font-medium text-slate-900 text-left sm:text-right break-words max-w-full sm:max-w-[60%]">
                    {String(value)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function SystemDiagnostic({ health, data, status }: { health: any, data: any, status: string }) {
  return (
    <div className="bg-slate-900 rounded-xl p-4 text-emerald-400 font-mono text-xs sm:text-sm shadow-sm overflow-hidden border border-slate-800">
      <div className="flex items-center gap-2 mb-3 text-emerald-300 font-semibold border-b border-emerald-800/50 pb-2">
        <Server className="w-4 h-4" />
        <span>RUI API - Diagnóstico Local</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
        <div className="flex justify-between">
          <span className="text-slate-500">Frontend:</span> 
          <span className="text-emerald-400">OK</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">API interna (/health):</span> 
          <span className={health?.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
            {health ? (health.status === 'ok' ? 'OK' : 'ERROR') : '...'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Variables entorno:</span> 
          <span className="text-emerald-400">OK</span>
        </div>
        <div className="flex justify-between border-t border-slate-800/50 mt-1 pt-1">
          <span className="text-slate-500">Conexión externa:</span> 
          <span className={status === 'error' || status === 'not_found' ? 'text-red-400' : (status === 'success' ? 'text-emerald-400' : '...')}>
            {status === 'initial' || status === 'loading' ? 'Esperando...' : (status === 'error' ? 'ERROR' : 'OK')}
          </span>
        </div>
        {data && data.diagnostic && (
          <div className="flex justify-between border-t border-slate-800/50 mt-1 pt-1 col-span-1 sm:col-span-2">
            <span className="text-slate-500">Tiempo de respuesta RUI:</span> 
            <span className="text-emerald-400">{data.diagnostic.timeMs.toFixed(0)} ms</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NucleoFamiliar({ arraysData }: { arraysData: Record<string, any[]> }) {
  if (!arraysData || Object.keys(arraysData).length === 0) return null;

  return (
    <div className="space-y-6">
      {Object.entries(arraysData).map(([key, items]) => {
        if (!items || items.length === 0) return null;
        
        // Obtener todas las columnas únicas de los objetos dentro del array
        const columns = Array.from(new Set(items.flatMap(item => Object.keys(item || {}))));
        const cleanTitle = key.replace(/[._]/g, ' ');

        return (
          <div key={key} className="border border-slate-200/60 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-slate-50 border-b border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2 capitalize">
                <Users className="w-4 h-4 text-blue-500" />
                {cleanTitle} (Núcleo / Lista Detectada)
              </h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                  <tr>
                    {columns.map(col => (
                      <th key={col} className="px-4 py-3 capitalize whitespace-nowrap">
                        {col.replace(/[._]/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      {columns.map(col => {
                        const val = row ? row[col] : '';
                        return (
                          <td key={col} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                            {/* Obscure fields that look like document numbers to be safe with PII */}
                            {col.toLowerCase().includes('doc') && typeof val === 'string' && val.length > 5 
                              ? `***${val.slice(-4)}` 
                              : String(val ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

