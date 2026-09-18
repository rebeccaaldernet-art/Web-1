export const UPLOAD_CHUNK_BYTES=8*1024*1024;
export const MAX_FILE_BYTES=UPLOAD_CHUNK_BYTES*10000;
export type UploadSession={id:string;owner:string;batch:string;channel:string;name:string;size:number;type:string;upload_id:string;state:string;created:number};
