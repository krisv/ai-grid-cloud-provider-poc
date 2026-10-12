import { useCallback, useEffect, useState } from 'react';
export function useServiceData<T>(request: () => Promise<T>, initial: T, pollInterval = 30000): [T, boolean, Error | undefined, () => void] {
  const [data,setData] = useState(initial);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState<Error>();
  const [generation,setGeneration] = useState(0);
  const refresh = useCallback(()=>setGeneration(v=>v+1),[]);
  useEffect(()=>{
    let active = true;
    const load = async () => {
      try { const value = await request(); if (active) {setData(value);setError(undefined);setLoaded(true);} }
      catch (err) {if (active) {setError(err instanceof Error ? err : new Error('The subscription service is unavailable.'));setLoaded(true);}}
    };
    setLoaded(false); void load();
    const timer = pollInterval ? setInterval(()=>void load(),pollInterval) : undefined;
    return ()=>{active=false;clearInterval(timer);};
  },[request,generation,pollInterval]);
  return [data,loaded,error,refresh];
}
