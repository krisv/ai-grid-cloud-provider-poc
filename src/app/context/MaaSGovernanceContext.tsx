import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import { useServiceData } from '~/shared/hooks/useServiceData';
const useData = () => {
  const service = getSubscriptionService();
  const [subscriptions,subscriptionsLoaded,subscriptionsError,refreshSubscriptions] = useServiceData(useCallback(()=>service.list(),[service]),[]);
  const [modelRefs,modelRefsLoaded,modelRefsError,refreshModels] = useServiceData(useCallback(()=>service.listModels().then(models=>models.filter(model=>model.availableForSubscriptions)),[service]),[]);
  const refresh = useCallback(()=>{refreshSubscriptions();refreshModels();},[refreshSubscriptions,refreshModels]);
  const overviewLoaded = subscriptionsLoaded && modelRefsLoaded;
  return {subscriptions,modelRefs, subscriptionsLoaded,subscriptionsError,
    overviewLoaded, loaded:overviewLoaded, error:subscriptionsError ?? modelRefsError,refresh};
};
const Context = createContext<ReturnType<typeof useData> | null>(null);
export function MaaSGovernanceProvider({children}: {children:ReactNode}) { const data=useData();return <Context.Provider value={data}>{children}</Context.Provider>; }
export function useMaaSGovernanceContext() { const context=useContext(Context);if (!context) throw new Error('Governance provider missing.');return context; }
