// The standalone portal exports domain configuration, not Kubernetes resources.
import { Button, CodeBlock, CodeBlockCode, PageSection, Spinner, Alert } from '@patternfly/react-core';
import { useGetSubscriptionInfo } from '~/app/hooks/useGetSubscriptionInfo';
export default function ConfigurationTab({resourceName}: {resourceName:string;resourceType:string}) {
  const [info,loaded,error] = useGetSubscriptionInfo(resourceName);
  if (error) return <PageSection><Alert isInline variant="danger" title="Unable to load configuration">{error.message}</Alert></PageSection>;
  if (!loaded || !info) return <PageSection><Spinner aria-label="Loading configuration" /></PageSection>;
  const content=JSON.stringify(info.subscription,null,2);
  const download=()=>{const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`${resourceName}.json`;link.click();URL.revokeObjectURL(url);};
  return <PageSection><Button variant="secondary" onClick={download}>Download configuration</Button><CodeBlock className="pf-v6-u-mt-md"><CodeBlockCode>{content}</CodeBlockCode></CodeBlock></PageSection>;
}
