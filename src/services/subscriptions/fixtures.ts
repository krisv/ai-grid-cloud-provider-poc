import type { MaaSAuthPolicy, MaaSModelRefSummary, MaaSSubscription } from '~/app/types/subscriptions';
export const models: MaaSModelRefSummary[] = [
  { name: 'granite-3-8b', displayName: 'Granite 3.3 8B Instruct', description: 'Enterprise language model', modelRef: {kind:'LLMInferenceService', name:'granite-3-8b'}, phase:'Ready' },
  { name: 'llama-3-70b', displayName: 'Llama 3.3 70B Instruct', description: 'General purpose language model', modelRef: {kind:'LLMInferenceService', name:'llama-3-70b'}, phase:'Ready' },
  { name: 'granite-research', displayName: 'Granite research endpoint', modelRef: {kind:'LLMInferenceService', name:'granite-research'}, phase:'Pending', reason:'ModelNotReady', statusMessage:'The model endpoint is starting.' },
];
export const subscriptions: MaaSSubscription[] = [
  { name:'engineering', displayName:'Engineering', description:'Production models for the engineering team.', priority:100, revision:'1', phase:'Ready', creationTimestamp:'2026-09-01T09:00:00Z',
    owner:{groups:[{name:'engineering'}]}, modelRefs:[{...models[0], tokenRateLimits:[{limit:100000,window:'1h'},{limit:10000,window:'1m'}],billingRate:{perToken:'0.000002'}}],
    tokenMetadata:{organizationId:'osac',costCenter:'engineering',labels:{environment:'production'}} },
  { name:'data-science', displayName:'Data science', description:'Shared model access for data scientists.', priority:10, revision:'1', phase:'Ready', creationTimestamp:'2026-09-02T09:00:00Z',
    owner:{groups:[{name:'data-scientists'},{name:'platform-admins'}]}, modelRefs:models.slice(0,2).map(m=>({...m,tokenRateLimits:[{limit:50000,window:'1h'}]})) },
  { name:'research', displayName:'Research', description:'Experimental endpoint access.', priority:0, revision:'1', phase:'Degraded', reason:'ModelNotReady', statusMessage:'One referenced model is not ready.', creationTimestamp:'2026-09-03T09:00:00Z',
    owner:{groups:[{name:'research'}]}, modelRefs:[{...models[2],tokenRateLimits:[{limit:1000,window:'1h'}]}] },
];
export const policies: MaaSAuthPolicy[] = subscriptions.map(s => ({name:`${s.name}-policy`, displayName:`${s.displayName} policy`, phase:s.phase,
  subjects:structuredClone(s.owner), modelRefs:s.modelRefs.map(({name})=>({name}))}));
