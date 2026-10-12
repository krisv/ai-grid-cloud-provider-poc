import { useCallback, useState } from 'react';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
export const useDeleteSubscription = () => {
  const [isDeleting,setDeleting] = useState(false);
  const [error,setError] = useState<Error>();
  const deleteSubscriptionCallback = useCallback(async (name: string,revision: string) => {
    setDeleting(true);setError(undefined);
    try { await getSubscriptionService().delete(name,revision); return true; }
    catch (error) { setError(error instanceof Error ? error : new Error('Unable to delete subscription.')); return false; }
    finally { setDeleting(false); }
  },[]);
  return {isDeleting,error,deleteSubscriptionCallback};
};
