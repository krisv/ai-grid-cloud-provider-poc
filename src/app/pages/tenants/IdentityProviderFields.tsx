// Adapted from OSAC IdpGeneralStep.tsx and IdpConfigurationStep.tsx at 8cb0a227e45cc9b17421b6e79ce493ed370ebd5d.
import { Checkbox, Form, FormGroup, FormHelperText, HelperText, HelperTextItem, TextArea, TextInput } from '@patternfly/react-core';
import type { IdentityProviderConfig, TenantInput } from '~/app/types/tenants';
import { identityProviderSchema } from '../../../../shared/tenant-validation.mjs';
import { useState } from 'react';
type Provider=TenantInput['identityProvider'];
const configFields:Array<{key:Exclude<keyof IdentityProviderConfig,'clientSecretSecret'|'validateSignature'>;label:string;required?:boolean}>=[
  {key:'clientId',label:'Client ID',required:true}, {key:'issuer',label:'Issuer',required:true},
  {key:'authorizationUrl',label:'Authorization URL',required:true},{key:'tokenUrl',label:'Token URL',required:true},
  {key:'defaultScopes',label:'Default scopes'},{key:'userInfoUrl',label:'User info URL'},{key:'jwksUrl',label:'JWKS URL'},{key:'logoutUrl',label:'Logout URL'},
];
export default function IdentityProviderFields({value,onChange}: {value:Provider;onChange:(provider:Provider)=>void}) {
  const [touched,setTouched]=useState<Set<string>>(()=>new Set());
  const result=identityProviderSchema.safeParse(value);
  const errors=result.success ? {} : Object.fromEntries(result.error.issues.map(issue=>[issue.path.join('.'),issue.message]));
  const error=(path:string)=>touched.has(path) ? errors[path] : undefined;
  const touch=(path:string)=>setTouched(previous=>new Set([...previous,path]));
  const helper=(message?:string)=><FormHelperText><HelperText><HelperTextItem variant="error">{message}</HelperTextItem></HelperText></FormHelperText>;
  return <Form maxWidth="750px">
    <FormGroup label="Title" fieldId="idp-title"><TextInput id="idp-title" value={value.title} onChange={(_,title)=>onChange({...value,title})} /></FormGroup>
    <FormGroup label="Description" fieldId="idp-description"><TextArea id="idp-description" value={value.description} onChange={(_,description)=>onChange({...value,description})} /></FormGroup>
    <FormGroup label="Client secret reference" fieldId="idp-secret-reference" isRequired>
      <TextInput id="idp-secret-reference" value={value.config.clientSecretSecret.name} isRequired validated={error('config.clientSecretSecret.name') ? 'error' : 'default'}
        onBlur={()=>touch('config.clientSecretSecret.name')} onChange={(_,name)=>onChange({...value,config:{...value.config,clientSecretSecret:{name}}})} />
      <FormHelperText><HelperText><HelperTextItem>Enter the name of the secret containing the OIDC client secret.</HelperTextItem></HelperText></FormHelperText>
      {error('config.clientSecretSecret.name') && helper(error('config.clientSecretSecret.name'))}
    </FormGroup>
    {configFields.map(field=><FormGroup key={field.key} label={field.label} fieldId={`idp-${field.key}`} isRequired={field.required}>
      <TextInput id={`idp-${field.key}`} value={value.config[field.key]} isRequired={field.required} validated={error(`config.${field.key}`) ? 'error' : 'default'}
        onBlur={()=>touch(`config.${field.key}`)} onChange={(_,text)=>onChange({...value,config:{...value.config,[field.key]:text}})} />
      {field.key==='defaultScopes' && <FormHelperText><HelperText><HelperTextItem>Space-separated scopes, for example openid profile email.</HelperTextItem></HelperText></FormHelperText>}
      {error(`config.${field.key}`) && helper(error(`config.${field.key}`))}
    </FormGroup>)}
    <Checkbox id="idp-validate-signature" label="Validate signature" isChecked={value.config.validateSignature}
      onChange={(_,validateSignature)=>onChange({...value,config:{...value.config,validateSignature}})} />
  </Form>;
}
