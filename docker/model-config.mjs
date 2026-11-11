/** Native Anthropic Messages and OpenAI-compatible (e.g. OpenRouter) transports; never logs keys. */
export function classroomModel(env=process.env){
 const provider=env.MODEL_PROVIDER||'anthropic';
 if(!['anthropic','openai-compatible'].includes(provider))throw Error('MODEL_PROVIDER must be anthropic or openai-compatible');
 const anthropic=provider==='anthropic';
 if(anthropic&&(!env.ANTHROPIC_API_KEY?.trim()||env.ANTHROPIC_API_KEY.includes('<')))throw Error('Fill ANTHROPIC_API_KEY in the local .env before starting with Claude.');
 if(!anthropic&&!env.MODEL_API_KEY?.trim())throw Error('MODEL_API_KEY is required for an OpenAI-compatible API.');
 const id=anthropic?(env.ANTHROPIC_MODEL||'claude-sonnet-5-5'):env.MODEL_ID;
 if(!id)throw Error('MODEL_ID is required for an OpenAI-compatible API.');
 const baseUrl=anthropic?(env.ANTHROPIC_BASE_URL||'https://api.anthropic.com'):env.MODEL_BASE_URL;
 if(!baseUrl)throw Error('MODEL_BASE_URL is required for an OpenAI-compatible API.');
 // Limits are what the runtime budgets against; too small a window makes every call fail with insufficient_output_budget.
 const limit=(value,fallback,min,max)=>{const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;};
 const contextWindow=limit(env.MODEL_CONTEXT_WINDOW,provider==='openai-compatible'?128000:200000,4096,2000000);
 const maxTokens=limit(env.MODEL_MAX_TOKENS,4096,256,64000);
 return {mode:provider,id,primary:'classroom/'+id,provider:{baseUrl,apiKey:anthropic?'${ANTHROPIC_API_KEY}':'${MODEL_API_KEY}',api:anthropic?'anthropic-messages':'openai-completions',...(anthropic?{headers:{'anthropic-version':env.ANTHROPIC_API_VERSION||'2026-10-21',...(env.ANTHROPIC_WORKSPACE_ID?{'anthropic-workspace-id':'${ANTHROPIC_WORKSPACE_ID}'}:{})}}:{}),models:[{id,name:id,reasoning:false,input:['text'],contextWindow,maxTokens}]}};
}
