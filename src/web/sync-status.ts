const messages:Record<string,string>={
 OAUTH_NOT_CONNECTED:'Drive no está conectado. Autoriza la conexión.',
 OAUTH_MISMATCH:'La credencial no corresponde a la conexión aprobada. Requiere revisión.',
 GOOGLE_ACCESS_FAILED:'Google no permitió la lectura o no respondió. Si persiste, reconecta Drive.',
 MASTER_INVALID:'El maestro no está disponible o cambió de tipo. Revisa ubicación y permisos.',
 STRUCTURE_CHANGED:'Cambió la estructura de las hojas necesarias. Revisa el formato del maestro.',
 EMPTY_MASTER:'La lectura no contiene registros válidos. No se sustituyó la versión anterior.',
 SOURCE_CHANGED:'El archivo cambió durante la lectura. Se reintentará en el siguiente ciclo.',
 STORAGE_LIMIT:'Límite preventivo de almacenamiento alcanzado. Revisa retención; no se borrará historia automáticamente.',
 LOG_LIMIT:'El historial de ejecuciones requiere mantenimiento por límite preventivo.',
 FILE_TOO_LARGE:'El archivo supera el tamaño permitido. Requiere revisión.',
 SNAPSHOT_TOO_LARGE:'Los datos procesados superan el tamaño permitido.',
 DOWNLOAD_INVALID:'La descarga llegó incompleta. Se reintentará en el siguiente ciclo.',
 LEASE_LOST:'La ejecución perdió su turno; otro ciclo continuará la revisión.',
 LEASE_EXPIRED:'La ejecución anterior no terminó a tiempo. El servidor recuperó el procesamiento.',
 DATABASE_FAILED:'No se pudo guardar la revisión. Se conserva la última versión publicada.',
 PARSER_FAILED:'No se pudo interpretar el archivo. Revisa el formato del maestro.'
};
export function syncErrorText(code:string|null){return code?(messages[code]??'La revisión no terminó correctamente. Se conserva la última versión válida.') : ''}
export function isStale(checked:string|null,now:number){const time=checked?Date.parse(checked):NaN;return !Number.isFinite(time)||now-time>15*60000}
