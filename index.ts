import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// URL base del sitio web a scrapear
const BASE_URL = 'https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/listView.seam'

// Función para crear un retraso (delay) en milisegundos
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// funcion para enviar los parametros de busqueda
function buildSearchPayload(viewState: string, startDate: string, endDate: string): URLSearchParams {
    // Se extrae mes y año (MM/AAAA) 
    const startCurrentDate = startDate.substring(3);
    const endCurrentDate = endDate.substring(3);

    return new URLSearchParams({
        'AJAXREQUEST': '_viewRoot',
        'fPP:numProcesso-inputNumeroProcessoDecoration:numProcesso-inputNumeroProcesso': '',
        'mascaraProcessoReferenciaRadio': 'on',
        'fPP:j_id162:processoReferenciaInput': '',
        'fPP:dnp:nomeParte': '',
        'fPP:j_id180:nomeAdv': '',
        'fPP:j_id189:classeJudicial': '',
        'fPP:j_id189:sgbClasseJudicial_selection': '',
        'tipoMascaraDocumento': 'on',
        'fPP:dpDec:documentoParte': '',
        'fPP:Decoration:numeroOAB': '',
        'fPP:Decoration:j_id223': '',
        'fPP:Decoration:estadoComboOAB': 'org.jboss.seam.ui.NoSelectionConverter.noSelectionValue',
        'fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputDate': startDate, // 📅 Dinámico
        'fPP:dataAutuacaoDecoration:dataAutuacaoInicioInputCurrentDate': startCurrentDate, // 📅 Dinámico (MM/AAAA)
        'fPP:dataAutuacaoDecoration:dataAutuacaoFimInputDate': endDate, // 📅 Dinámico
        'fPP:dataAutuacaoDecoration:dataAutuacaoFimInputCurrentDate': endCurrentDate, // 📅 Dinámico (MM/AAAA)
        'fPP': 'fPP',
        'autoScroll': '',
        'javax.faces.ViewState': viewState,
        'fPP:j_id244': 'fPP:j_id244',
        'AJAX:EVENTS_COUNT': '1'
    });
}

// Interfaz para almacenar los datos de cada proceso
interface ProcessData {
    index: number;
    processNumber: string;
    description: string;
    pdfDownloaded: boolean;
    pdfPath: string;
}

// Funcion para guardar el arreglo de procesos en CSV
function saveToCSV(data: ProcessData[], filePath: string) {
    if (data.length === 0) return;

    // Encabezado
    const headers = ['Index', 'ProcessNumber', 'Description', 'PdfDownloaded', 'PdfPath'];
    
    // Convertir cada objeto a una línea de CSV con comillas escapadas
    const rows = data.map(item => [
        item.index,
        `"${item.processNumber.replace(/"/g, '""')}"`,
        `"${item.description.replace(/"/g, '""')}"`,
        item.pdfDownloaded,
        `"${item.pdfPath.replace(/"/g, '""')}"`
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    console.info(`📊 Datos exportados exitosamente a "${filePath}"`);
}

// funcion para procesar cada registro de la tabla
async function processRow(
    row: cheerio.Cheerio<cheerio.Element>,
    index: number,
    cookieHeader: string,
    folderName: string
): Promise<{ success:boolean; data?: ProcessData }> {
    // Extraer texto quitando espacios
    const rowData = row.text().replace(/\s+/g, ' ').trim();
    console.info('\n📄 Datos extraidos: ', rowData);

    // Buscamos el enlace del detalle
    const onclickAttr = row.find('a[title="Ver Detalhes"]').attr('onclick') || '';
    const urlMatch = onclickAttr.match(/openPopUp\('[^']+','([^']+)'\)/);

    if (!urlMatch || !urlMatch[1]) {
        return { success: true };
    }

    const detailUrl = `https://pjett.trf5.jus.br${urlMatch[1]}`;

    // Definimos el numero de reintentos
    const maxRetries = 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            // 5. Entrar al detalle
            const detailResponse = await axios.get(detailUrl, {
                headers: { 'Cookie': cookieHeader }
            });
            const $detail = cheerio.load(detailResponse.data);

            // Extraer el numero de proceso
            let cleanProcessNumber = `documento_${index}`;
            $detail('.propertyView').each((_, el) => {
                const labelText = $detail(el).find('.name label').text();
                if (labelText.includes('Número Processo')) {
                    // Extraemos el texto y limpiamos espacios o saltos de línea
                    cleanProcessNumber = $detail(el).find('.value').text().replace(/[^0-9.-]/g, '');
                }
            });

            // 6. Rastrear el botón de Imprimir/PDF
            const printButton = $detail('input[value="Imprimir"]');
            let downloaded = false;
            let filePath = '';

            if (printButton.length > 0) {
                const pdfUrlMatch = (printButton.attr('onclick') || '').match(/openPopUp\('[^']+',\s*'([^']+)'\)/);

                if (pdfUrlMatch && pdfUrlMatch[1]) {
                    const pdfUrl = `https://pjett.trf5.jus.br/pjeconsulta/ConsultaPublica/DetalheProcessoConsultaPublica/${pdfUrlMatch[1]}`;

                    // 7. Descargar el PDF
                    const pdfResponse = await axios.get(pdfUrl, {
                        headers: { 'Cookie': cookieHeader },
                        responseType: 'arraybuffer'
                    });

                    // Guardamos con el process number
                    const fileName = `${cleanProcessNumber}.pdf`;
                    filePath = path.join(folderName, fileName);

                    fs.writeFileSync(filePath, pdfResponse.data);
                    console.info(`💾 PDF guardado con éxito como "${fileName}"`);
                    downloaded = true;
                }
            }
            else {
                console.warn('⚠️   No se encontró el botón de imprimir en el detalle del proceso.');
            }

            // Si todo salio bien se retorna true para seguir con la siguiente fila
            return { 
                success: true, 
                data: { 
                    index: index + 1, 
                    processNumber: cleanProcessNumber, 
                    description: rowData, 
                    pdfDownloaded: downloaded, 
                    pdfPath: filePath 
                } 
            };

        } catch (err: any) {
            if (err.response && err.response.status === 429) {
                attempt++;
                if (attempt > maxRetries) {
                    // Registrar documentos que fallaron
                    console.error(`❌ Fallo tras ${maxRetries} intentos. Registrando en el log`);
                    fs.appendFileSync('failed_downloads.log', `Fila ${index} - URL: ${detailUrl}\n`);
                    return { success: true }; // Retornamos true para no detener el scraper, pero registramos el fallo
                }
                
                // Backoff exponencial: 2^attempt * 1000 ms
                const waitTime = Math.pow(2, attempt) * 1000;
                console.warn(`⚠️   Error 429: Demasiadas solicitudes. Reintentando en ${waitTime / 1000}seg... (Intento ${attempt}/${maxRetries})`);
                await delay(waitTime);
            } else {
                console.error('❌ Error al procesar el detalle del proceso:', err.message);
                return { success: true }; // En caso de otro error, continuamos con la siguiente fila
            }
        }
    }

    return { success: true }; // Continuar con la siguiente fila
}

// Funcion principal del scraper
async function runScraper() {
    try {

        console.info('Haciendo peticion a la pagina...');
        const response = await axios.get(BASE_URL);
        console.info('Conexion exitosa! Status:', response.status);

        const $ = cheerio.load(response.data);

        console.info('\nObteniendo titulo de la pagina...');
        const title = $('title').text().trim();
        console.info('Titulo de la pagina: ', title);

        // 1. Extraemos cookies 
        const rawCookies = response.headers['set-cookie'] || [];
        const cookieHeader = rawCookies.map(c => c.split(';')[0]).join('; ');

        const $initial = cheerio.load(response.data);
        const viewState = $initial('input[name="javax.faces.ViewState"]').val() as string;

        console.info('\n✅ Cookies y ViewState obtenidas.');
        console.info('Enviando postback...');

        // 2. Construir el payload con los campos exactos que capturaste
        const startDate = '25/08/2026';
        const endDate = '25/08/2026';

        const payload = buildSearchPayload(viewState, startDate, endDate);

        // 3. Ejecutar la búsqueda enviando las cookies en los headers
        const postResponse = await axios.post(BASE_URL, payload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookieHeader
            }
        });

        // crear carpeta para guardar los PDFs si no existe
        const folderName = 'pdfs';
        if (!fs.existsSync(folderName)) {
            fs.mkdirSync(folderName, { recursive: true });
            console.info(`📁 Carpeta "${folderName}" creada para guardar los PDFs.`);
        }

        const extractedData: ProcessData[] = [];

        // 4. Analizar respuesta y obtener todos los registros.
        const $result = cheerio.load(postResponse.data);
        const rows = $result('tbody tr').toArray();

        console.info(`✅ Recorriendo ${rows.length} registros en la tabla.`);

        //for (let i = 0; i < rows.length; i++) {
        for (let i = 0; i < 5; i++) {
            const row = $result(rows[i]);

            // Llamamos al metodo para procesar la fila
            const result = await processRow(row, i, cookieHeader, folderName);

            if (result.data) {
                extractedData.push(result.data);
            }

            if (!result.success) {
                console.warn('⚠️  Se ha alcanzado el límite de solicitudes. Deteniendo el scraper.');
                break; // Rompemos el bucle si se alcanza el límite
            }

            // Pausa de 2 segundos para evitar sobrecarga al servidor
            console.info('⏳ Esperando 2 segundos...');
            await delay(2000);
        }

        // Exportar los datos procesados a CSV
        saveToCSV(extractedData, 'procesos_extraidos.csv');

        console.info('\n🎉 Procesamiento de Scraping completado con éxito.');
    }
    catch (error) {
        console.error('Error al conectar: ', error);
    }
}

console.info("ℹ️  El scraper se esta ejecutando...");

// Ejecucion de la funcion principal
runScraper();