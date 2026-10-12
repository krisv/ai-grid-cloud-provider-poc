// Combined adaptation of OSAC TenantCreatePage and IdentityProviderCreateWizard.
// Source commit: 8cb0a227e45cc9b17421b6e79ce493ed370ebd5d. Break-glass flow is omitted.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, FormGroup, FormHelperText, FormSection, HelperText, HelperTextItem, TextInput, Wizard, WizardStep } from '@patternfly/react-core';
import { PlusCircleIcon, MinusCircleIcon } from '@patternfly/react-icons';
import { tenantDetailsSchema, identityProviderSchema, tenantInputSchema } from '../../../../shared/tenant-validation.mjs';
import type { Tenant, TenantInput } from '~/app/types/tenants';
import { getSubscriptionService } from '~/services/subscriptions/configuredService';
import IdentityProviderFields from './IdentityProviderFields';
import TenantConfigurationDetails from './TenantConfigurationDetails';
import TenantWizardFooter from './TenantWizardFooter';
export default function TenantFormWizard({initial}: {initial?:Tenant}) {
  const navigate=useNavigate();const service=getSubscriptionService();
  const [values,setValues]=useState<TenantInput>(initial ? {name:initial.name,domains:initial.domains,identityProvider:initial.identityProvider} : {
    name:'',domains:[],identityProvider:{title:'',description:'',enabled:true,config:{clientId:'',clientSecretSecret:{name:''},
      issuer:'',authorizationUrl:'',tokenUrl:'',defaultScopes:'',userInfoUrl:'',jwksUrl:'',logoutUrl:'',validateSignature:true}},
  });
  const [saving,setSaving]=useState(false);const [error,setError]=useState<string>();const [touched,setTouched]=useState(false);
  const details=tenantDetailsSchema.safeParse({name:values.name,domains:values.domains});
  const idpValid=identityProviderSchema.safeParse(values.identityProvider).success;
  const errors=details.success ? {} : Object.fromEntries(details.error.issues.map(issue=>[issue.path.join('.'),issue.message]));
  const cancel=()=>navigate('/tenants');
  const save=async()=>{
    const input=tenantInputSchema.safeParse(values);if(saving || !input.success)return;
    setSaving(true);setError(undefined);
    try {
      if(initial)await service.updateTenant(initial.name,input.data,initial.revision);else await service.createTenant(input.data);
      navigate('/tenants',{state:{notice:initial ? 'Tenant configuration saved' : 'Tenant and identity provider saved'}});
    } catch(err){setError(err instanceof Error ? err.message : 'The tenant could not be saved.');setSaving(false);}
  };
  return <Wizard className="portal-tenant-wizard" navAriaLabel="Tenant onboarding steps" onClose={cancel}
    footer={<TenantWizardFooter tenantValid={details.success} idpValid={idpValid} saving={saving} error={error} onSave={save} onCancel={cancel} isEdit={Boolean(initial)} />}>
    <WizardStep name="Tenant details" id="tenant-details">
      <Form maxWidth="750px">
        <FormGroup label="Name" fieldId="tenant-name" isRequired>
          <TextInput id="tenant-name" value={values.name} isDisabled={Boolean(initial) || saving} isRequired onBlur={()=>setTouched(true)}
            validated={touched && errors.name ? 'error' : 'default'} onChange={(_,name)=>setValues({...values,name})} />
          <FormHelperText><HelperText><HelperTextItem>Use lowercase letters, numbers, and hyphens.</HelperTextItem></HelperText></FormHelperText>
        </FormGroup>
        <FormSection title="Domains">
          {values.domains.map((domain,index)=><FormGroup key={index} label={`Domain ${index+1}`} fieldId={`tenant-domain-${index}`} isRequired>
            <TextInput id={`tenant-domain-${index}`} value={domain} isRequired onBlur={()=>setTouched(true)}
              validated={touched && errors[`domains.${index}`] ? 'error' : 'default'}
              onChange={(_,text)=>setValues({...values,domains:values.domains.map((old,i)=>i===index ? text : old)})} />
            <Button variant="plain" icon={<MinusCircleIcon />} aria-label={`Remove domain ${index+1}`}
              onClick={()=>setValues({...values,domains:values.domains.filter((_,i)=>i!==index)})} />
          </FormGroup>)}
          <Button variant="link" icon={<PlusCircleIcon />} onClick={()=>setValues({...values,domains:[...values.domains,'']})}>Add domain</Button>
        </FormSection>
        {touched && Object.values(errors).map((message,index)=><HelperText key={index}><HelperTextItem variant="error">{message}</HelperTextItem></HelperText>)}
      </Form>
    </WizardStep>
    <WizardStep name="Identity provider" id="tenant-idp" isDisabled={!details.success || saving}>
      <IdentityProviderFields value={values.identityProvider} onChange={identityProvider=>setValues({...values,identityProvider})} />
    </WizardStep>
    <WizardStep name="Review" id="tenant-review" isDisabled={!details.success || !idpValid || saving}>
      <TenantConfigurationDetails tenant={values} />
    </WizardStep>
  </Wizard>;
}
