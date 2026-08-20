import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Resolver } from 'dns/promises';

export const maxDuration = 60; // Maximize serverless function execution time (up to 60s on Pro, 10s on Hobby)
export const dynamic = 'force-dynamic'; // Prevent any caching of this route

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
        return NextResponse.json({ 
          success: false, 
          error: { code: 'RUI_NOT_FOUND', message: 'No se encontró información para los datos ingresados.' } 
        }, { status: 404 });
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
        integrantes: [
          { documento: "***1234", nombres: "JUAN", parentesco: "JEFE DE HOGAR", edad: 45, estado: "VALIDADO" },
          { documento: "***5678", nombres: "MARIA", parentesco: "HIJO(A)", edad: 15, estado: "VALIDADO" }
        ],
        _aviso: "MODO DEMOSTRACIÓN - DATOS DE PRUEBA"
      };

      const timeMs = performance.now() - startTime;
      const inspection = inspectRuiResponse(mockResponse);

      if (isDebug) {
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
    const totalTimeout = parseInt(process.env.RUI_TIMEOUT || '20000', 10);
    const startTime = performance.now();

    let status = 0;
    let responseText = '';
    let cookieHeader = '';

    // Bypass SSL issues comunes en sitios gubernamentales
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    try {
      // 2.a FAST FETCH SESSION COOKIES (Aislado con timeout corto)
      const sessionController = new AbortController();
      const sessionTimeoutId = setTimeout(() => sessionController.abort(), 3500); // 3.5s max for GET

      try {
        const sessionResponse = await fetch(baseUrl, {
          method: 'GET',
          headers: {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'accept-language': 'es-CO,es-ES;q=0.9,es;q=0.8,en;q=0.7,en-GB;q=0.6,en-US;q=0.5,es-MX;q=0.4',
            'priority': 'u=0, i',
            'sec-ch-ua': '"Not=A?Brand";v="99", "Microsoft Edge";v="151", "Chromium";v="151"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0'
          },
          signal: sessionController.signal
        });
        
        clearTimeout(sessionTimeoutId);
        const sessionCookies = sessionResponse.headers.getSetCookie ? sessionResponse.headers.getSetCookie() : [];
        cookieHeader = sessionCookies.map(c => c.split(';')[0]).join('; ');
      } catch (sessionError: any) {
        clearTimeout(sessionTimeoutId);
        console.warn('[RUI_WARN] Fast session fetch failed or timed out. Continuing to POST.', sessionError.message);
      }

      // 2.b PERFORM ACTUAL POST QUERY EXACTLY AS CURL
      const elapsed = performance.now() - startTime;
      const remainingTime = Math.max(totalTimeout - elapsed, 5000); // At least 5s for the POST

      const postController = new AbortController();
      const postTimeoutId = setTimeout(() => postController.abort(), remainingTime);

      const params = new URLSearchParams();
      params.append('pNumDoc', numeroDocumento);
      params.append('pTipDoc', tipoDocumento);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'accept-language': 'es-CO,es-ES;q=0.9,es;q=0.8,en;q=0.7,en-GB;q=0.6,en-US;q=0.5,es-MX;q=0.4',
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'https://ventanillasocial.dnp.gov.co',
          'priority': 'u=1, i',
          'referer': 'https://ventanillasocial.dnp.gov.co/',
          'sec-ch-ua': '"Not=A?Brand";v="99", "Microsoft Edge";v="151", "Chromium";v="151"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0',
          ...(cookieHeader ? { 'cookie': cookieHeader } : {})
        },
        body: params.toString(),
        signal: postController.signal,
        keepalive: true
      });

      clearTimeout(postTimeoutId);
      status = response.status;
      responseText = await response.text();

      if (!response.ok) {
        // Manejar códigos HTTP específicos de error con respuestas seguras
        let errMessage = 'No fue posible conectar con el servicio RUI';
        let errCode = 'RUI_CONNECTION_ERROR';
        
        if (status === 403 || status === 401) {
          errMessage = 'El servicio rechazó temporalmente la solicitud (Posible bloqueo por WAF/Firewall).';
          errCode = 'RUI_FORBIDDEN';
        } else if (status === 429) {
          errMessage = 'Se alcanzó temporalmente el límite de consultas. Espera unos minutos.';
          errCode = 'RUI_RATE_LIMIT';
        } else if (status >= 500) {
          errMessage = 'El servicio externo no está disponible temporalmente.';
          errCode = 'RUI_SERVER_ERROR';
        }

        return NextResponse.json({ 
          success: false, 
          error: { code: errCode, message: errMessage, details: `HTTP ${status} - ${responseText.substring(0, 100)}` }
        }, { status: status >= 500 ? 502 : status }); // Si es 5xx, devolvemos 502 Bad Gateway
      }
    } catch (fetchError: any) {
      const isTimeout = fetchError.name === 'AbortError';
      const exactError = fetchError.cause?.message || fetchError.message || 'Unknown network error';
      
      console.error('[RUI_NETWORK_ERROR]', exactError);

      if (isTimeout) {
        return NextResponse.json({ 
          success: false, 
          error: { code: 'RUI_TIMEOUT', message: 'El servicio está tardando demasiado en responder. Intenta nuevamente.', details: exactError }
        }, { status: 504 });
      }
      return NextResponse.json({ 
        success: false, 
        error: { code: 'RUI_CONNECTION_ERROR', message: 'No fue posible conectar con el servicio RUI', details: exactError }
      }, { status: 502 });
    }

    const timeMs = performance.now() - startTime;
    
    // Parse response
    let parsedData = null;
    let responseType = 'TEXT';
    try {
      parsedData = JSON.parse(responseText);
      responseType = 'JSON';
    } catch (e) {
      // Manejar como texto si el endpoint no devuelve JSON
      parsedData = { _rawText: responseText.substring(0, 500) }; 
    }

    const inspection = inspectRuiResponse(parsedData);
    
    if (isDebug) {
      console.log('[RUI_DEBUG] Estructura real inspeccionada:', JSON.stringify(inspection.schema, null, 2));
      console.log('[RUI_DEBUG] Cookies obtenidas:', cookieHeader ? 'Sí' : 'No');
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
    return NextResponse.json({ 
      success: false, 
      error: { code: 'RUI_INTERNAL_ERROR', message: 'No fue posible realizar la consulta. Intenta nuevamente.' }
    }, { status: 500 });
  }
}
