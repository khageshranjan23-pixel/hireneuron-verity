export const BASE=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8000';
export async function api(path:string,token:string,method='GET',body?:unknown){
 const r=await fetch(BASE+path,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),cache:'no-store'});
 if(!r.ok){let e;try{e=await r.json()}catch{e={detail:'Service unavailable'}}throw new Error(typeof e.detail==='string'?e.detail:JSON.stringify(e.detail))}return r.json();
}
export type Span={id:string;text:string;phase:string;offset:number};
export type Question={id:string;slot:number;text:string;category:string;skill:string;locked:boolean;status:string;spans:Span[];followup:string|null;scores:null|{status:string;scores?:Record<string,number>;evidence?:{span_id:string;quote:string}[];rationale:string;strengths?:string[];gaps?:string[]}};
export type Session={id:string;state:string;current:number;phase:string;pending_skip:boolean;started_at:number|null;question_started_at:number|null;config:{candidate_name:string;job_title:string;skills:string[];duration_minutes:number;answer_seconds:number};questions:Question[];generation:string;events:{id:string;type:string;role:string;severity:string;offset:number;frame_count:number}[];audit:{id:string;target_id:string;score?:number;reason:string;disposition?:string}[];coverage:Record<string,{received_at:number;frames:Record<string,number>}>};
