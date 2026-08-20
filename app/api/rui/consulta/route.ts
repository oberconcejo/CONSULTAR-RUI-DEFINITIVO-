import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  tipoDocumento: z.string().min(1, 'Selecciona el tipo de documento'),
  numeroDocumento: z.string().min(5, 'El número de documento debe tener al menos 5 caracteres').regex(/^[0-9]+$/, 'Solo se permiten números'),
});

interface InspectStats {
  fields: number;
  arrays: number;
  objects: number;
}

/**
 * Inspecciona dinámicamente la estructura de respuesta del servicio RUI.
 * No guarda valores reales (PII) en la estructura mapeada, sólo los tipos.
 */
function inspectRuiResponse(data: any) {
  const stats: InspectStats = { fields: 0, arrays: 0, objects: 0 };
  const arraysMap: Record<string, any[]> = {};

  function traverse(obj: any, path: string): any {
    if (obj === null) {
      stats.fields++;
      return 'null';
    }
    if (Array.isArray(obj)) {
      stats.arrays++;
      // Si el array contiene objetos, detectarlo como posible lista/núcleo familiar
      if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
        arraysMap[path || 'lista_principal'] = obj;
      }
      return {
        tipo: 'array',
        items: obj.length > 0 ? traverse(obj[0], path ? `${path}[]` : '[]') : 'unknown'
      };
    }
    if (typeof obj === 'object') {
      stats.objects++;
      const schemaObj: any = { tipo: 'object', fields: {} };
      for (const key of Object.keys(obj)) {
        schemaObj.fields[key] = traverse(obj[key], path ? `${path}.${key}` : key);
      }
      return schemaObj;
    }
    
    // Campo escalar
    stats.fields++;
    return typeof obj;
  }

  const schemaDef = traverse(data, '');
  return { schema: schemaDef, stats, arraysMap };
}

/**
 * Normaliza la respuesta para que el frontend pueda consumirla uniformemente.
 */
function normalizeRuiResponse(rawData: any, inspection: ReturnType<typeof inspectRuiResponse>, reqMeta: any) {
  const scalarData: Record<string, string> = {};
  
  // Aplanar los datos escalares para facilitar la vista de "Información encontrada"
  function flattenScalars(obj: any, prefix = '') {
    if (obj === null || typeof obj !== 'object') {
      scalarData[prefix] = String(obj);
      return;
    }
    if (Array.isArray(obj)) return; // Se omiten aquí; se gestionan en arraysData
    
    for (const key in obj) {
      if (Array.isArray(obj[key])) continue;
      if (obj[key] !== null && typeof obj[key] === 'object') {
        flattenScalars(obj[key], prefix ? `${prefix}.${key}` : key);
      } else {
        scalarData[prefix ? `${prefix}.${key}` : key] = String(obj[key] ?? '');
      }
    }
  }
  
  if (rawData !== null && typeof rawData === 'object') {
    flattenScalars(rawData);
  } else {
    scalarData['respuesta_bruta'] = String(rawData);
  }

  return {
    scalarData,
    arraysData: inspection.arraysMap,
    diagnostic: {
      endpoint: reqMeta.endpoint,
      method: reqMeta.method,
      status: reqMeta.status,
      timeMs: reqMeta.timeMs,
      responseType: reqMeta.responseType,
      fields: inspection.stats.fields,
      arrays: inspection.stats.arrays,
      objects: inspection.stats.objects,
      hasNucleoFamiliar: Object.keys(inspection.arraysMap).length > 0
    }
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = schema.safeParse(body);
    
    if (!parseResult.success) {
      return NextResponse.json({ 
        success: false, 
        message: 'Datos inválidos', 
        errors: parseResult.error.flatten().fieldErrors 
      }, { status: 400 });
    }

    const { tipoDocumento, numeroDocumento } = parseResult.data;
    const isMock = process.env.RUI_MOCK_MODE === 'true';
    const isDebug = process.env.RUI_DEBUG_MODE === 'true';

    const baseUrl = process.env.RUI_BASE_URL || 'https://ventanillasocial.dnp.gov.co';
    const endpoint = `${baseUrl}/Home/ObtenerDatosRUI`;

    // 1. MOCK MODE
    if (isMock) {
      const startTime = performance.now();
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate delay
      
      if (numeroDocumento === '00000') {
        return NextResponse.json({ success: false, message: 'No se encontró información para los datos ingresados.' }, { status: 404 });
      }

      // Estructura realista con objetos anidados y un array de integrantes (núcleo familiar)
      const mockResponse = {
        estado_registro: "VIGENTE",
        clasificacion: {
          grupo: "A",
          subgrupo: "A1"
        },
        fecha_actualizacion: "2023-10-15",
        ubicacion: {
          departamento: "BOGOTÁ D.C.",
          municipio: "BOGOTÁ D.C."
        },
        integrantes_hogar: [
          { documento: "***1234", parentesco: "JEFE DE HOGAR", edad: 45, estado: "VALIDADO" },
          { documento: "***5678", parentesco: "HIJO(A)", edad: 15, estado: "VALIDADO" }
        ],
        _aviso: "DATOS DE PRUEBA - MOCK MODE"
      };

      const timeMs = performance.now() - startTime;
      const inspection = inspectRuiResponse(mockResponse);

      if (isDebug) {
        // En modo debug, mostramos SÓLO LA ESTRUCTURA para no exponer datos reales/PII
        console.log('[RUI_DEBUG] Estructura devuelta (Mock):', JSON.stringify(inspection.schema, null, 2));
      }

      const normalized = normalizeRuiResponse(mockResponse, inspection, {
        endpoint: '/Home/ObtenerDatosRUI (MOCK)',
        method: 'POST',
        status: 200,
        timeMs,
        responseType: 'JSON'
      });

      return NextResponse.json({ success: true, data: normalized });
    }

    // 2. REAL SERVICE INTEGRATION
    const timeout = parseInt(process.env.RUI_TIMEOUT || '15000', 10);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const startTime = performance.now();
    let status = 0;
    let responseText = '';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          pTipDoc: tipoDocumento,
          pNumDoc: numeroDocumento
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      status = response.status;
      responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Error HTTP: ${status}`);
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({ success: false, message: 'El servicio tardó demasiado en responder.' }, { status: 504 });
      }
      throw fetchError;
    }

    const timeMs = performance.now() - startTime;
    
    // Parse response
    let parsedData = null;
    let responseType = 'TEXT';
    try {
      parsedData = JSON.parse(responseText);
      responseType = 'JSON';
    } catch (e) {
      // Manejar como texto si el endpoint falla pero devuelve un 200 con HTML (ej: WAF/Proxy error)
      parsedData = { _rawText: responseText.substring(0, 500) }; 
    }

    const inspection = inspectRuiResponse(parsedData);
    
    if (isDebug) {
      // NUNCA IMPRIMIR parsedData COMPLETO para proteger PII, sólo se imprime inspection.schema
      console.log('[RUI_DEBUG] Estructura real inspeccionada:', JSON.stringify(inspection.schema, null, 2));
    }

    const normalized = normalizeRuiResponse(parsedData, inspection, {
      endpoint: '/Home/ObtenerDatosRUI',
      method: 'POST',
      status,
      timeMs,
      responseType
    });

    return NextResponse.json({ success: true, data: normalized });

  } catch (error) {
    console.error('[RUI_API_ERROR]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ success: false, message: 'No fue posible realizar la consulta. Intenta nuevamente.' }, { status: 500 });
  }
}
