# Scraper Challenge

## 📋 Descripción del Proyecto
Este proyecto es un scraper web desarrollado con **TypeScript**
utilizando axios y cheerio. 

El objetivo es navegar por el portal de Consulta, utilizar los filtros de busqueda (en mi caso use la fecha) y descargar los PDFs asociados.

El scraper utiliza delay de 2 segundos, se implemento los reintentos con **backoff exponencial** para controlar el error 429 - Too Many Requests.

Al finalizar, los datos estructurados se exportan a un archivo CSV.

---

## 🚀 Requisitos Previos
Antes de ejecutar el proyecto, asegurate de tener instalado
* **Node.js** (v18 o superior recomendado).
* **npm** (gestor de paquetes de Node).

---

## 🛠️ Instalación
Sigue los siguientes pasos para preparar el entorno 

1. Clona este repositorio o descarga el codigo fuente.
2. Abre una terminal en la carpeta raiz del proyecto (`scraper-challenge`).
3. Instala las dependencias necesarias ejecutando:
```bash
   npm install
```

---

## 💻 Ejecución 
El proyecto utiliza `tsx` para ejecutar el codigo TypeScript directamente sin necesidad de un paso previo de compilacion manual.

```bash
npx tsx index.ts
```

--- 
## 📂 Resultados de la ejecución
Una vez que el script finalice, generara los siguientes elementos en la raiz del proyecto:

- Directorio `/pdfs`: Una carpeta con todos los pdfs descargados
- `procesos_extraidos.csv`: Un archivo con los registros procesados
- failed_downloads.log: (Solo si ocurren fallos persistentes) Un registro con los documentos que no pudieron ser descargados tras agotar los intentos.
