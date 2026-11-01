type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = { setHeader(name: string, value: string): void; status(code: number): ApiResponse; json(body: unknown): void };
type Turn = { role: 'user' | 'assistant'; text: string };
const GUIDE = [
  'You are ASYLUM Community Recruitment AI support for a Philippine CODM community. Reply naturally in Taglish or the user language, concise and friendly.',
  'You are an informational assistant, not a recruiter. Never approve/reject applications, promise acceptance, invent applicant status, or request passwords, OTPs, screenshots, UID, or private data.',
  'One application per email across Casual and Referral; a new application is allowed only when previous applications for that email are rejected. Accepted, pending, reviewing and waitlisted prevent another application.',
  'Applicants submit details, then Step 1 CODM main account screenshot with ASY tag after IGN. After recruiter approval, Step 2 uploads remaining proofs together: TikTok with ASY tag after IGN, following ASY TikTok, Discord nickname IGN ASY, roster photo, and for referrals conversation proof with referrer.',
  'Recruiters review screenshots and can request replacements or correct details. Use Track Application for real status; do not guess. Membership form and Discord instructions are released at the appropriate approval stages through private application chat.',
  'When account-specific help is needed, direct users to private application chat / recruitment team. Public support AI is not connected to personal application records.',
  'Do not provide external links unless certain. If unsure, say so and refer to recruiters.'
].join('\n');
export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control','no-store');
  if(req.method !== 'POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  const env = (globalThis as typeof globalThis & {process?:{env?:Record<string,string|undefined>}}).process?.env;
  const key = env?.GEMINI_API_KEY;
  if(!key) return res.status(503).json({error:'Gemini API key is missing from this Vercel deployment. Check GEMINI_API_KEY in this project’s Environment Variables.'});
  const input = (req.body ?? {}) as {message?:unknown;history?:unknown};
  if(typeof input.message !== 'string' || !input.message.trim() || input.message.length > 500) return res.status(400).json({error:'Invalid question'});
  const history: Turn[] = Array.isArray(input.history) ? input.history.filter((x:unknown):x is Turn=> !!x && typeof x==='object' && ['user','assistant'].includes((x as Turn).role) && typeof (x as Turn).text==='string').slice(-8).map(x=>({role:x.role,text:x.text.slice(0,500)})) : [];
  const contents = [...history,{role:'user' as const,text:input.message.trim()}].map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:x.text}]}));
  try {
    const modelCandidates = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    let lastStatus = 0;
    for (const model of modelCandidates) {
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(),15000);
      let response: Response;
      try {
        response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
          method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
          body:JSON.stringify({systemInstruction:{parts:[{text:GUIDE}]},contents,generationConfig:{temperature:0.35,maxOutputTokens:1000}}),
          signal:controller.signal
        });
      } finally {clearTimeout(timeout);}
      if (response.status === 404) { lastStatus = 404; continue; }
      if (!response.ok) {
        console.error('Gemini support upstream status',response.status,'model',model);
        const reason=response.status===429?'Gemini API quota or rate limit reached.':response.status===401||response.status===403?'Gemini API key was rejected or lacks permission.':'Gemini service returned an error (HTTP '+response.status+').';
        return res.status(502).json({error:reason});
      }
      const data = await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>} ;
      const answer = data.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();
      if(!answer) return res.status(502).json({error:'AI did not return a reply'});
      return res.status(200).json({answer:answer.slice(0,1800)});
    }
    return res.status(502).json({error:lastStatus===404?'Gemini models returned HTTP 404. Verify the API key project has access to Gemini generateContent models.':'No Gemini model available'});
  } catch(error){console.error('Gemini support request failed',error instanceof Error?error.name:'unknown');return res.status(502).json({error:'AI service unavailable'});}
}
