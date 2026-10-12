// Adapted from OSAC IdentityProvider/CreateWizard/steps/IdpReviewStep.tsx.
import { DescriptionList, DescriptionListGroup, DescriptionListTerm, DescriptionListDescription, Title } from '@patternfly/react-core';
import type { TenantInput } from '~/app/types/tenants';
export default function TenantConfigurationDetails({tenant}: {tenant:TenantInput}) {
  const config=tenant.identityProvider.config;
  const fields=[['Title',tenant.identityProvider.title],['Description',tenant.identityProvider.description],
    ['Client ID',config.clientId],['Client secret reference',config.clientSecretSecret.name],['Issuer',config.issuer],
    ['Authorization URL',config.authorizationUrl],['Token URL',config.tokenUrl],['Default scopes',config.defaultScopes],
    ['User info URL',config.userInfoUrl],['JWKS URL',config.jwksUrl],['Logout URL',config.logoutUrl],
    ['Validate signature',config.validateSignature ? 'Yes' : 'No']];
  return <div data-testid="tenant-configuration-details">
    <Title headingLevel="h2" size="lg">Tenant details</Title>
    <DescriptionList isHorizontal className="pf-v6-u-my-md">
      <DescriptionListGroup><DescriptionListTerm>Name</DescriptionListTerm><DescriptionListDescription>{tenant.name}</DescriptionListDescription></DescriptionListGroup>
      <DescriptionListGroup><DescriptionListTerm>Domains</DescriptionListTerm><DescriptionListDescription>{tenant.domains.join(', ') || '—'}</DescriptionListDescription></DescriptionListGroup>
    </DescriptionList>
    <Title headingLevel="h2" size="lg">Identity provider</Title>
    <DescriptionList isHorizontal className="pf-v6-u-my-md">{fields.map(([label,value])=><DescriptionListGroup key={label}>
      <DescriptionListTerm>{label}</DescriptionListTerm><DescriptionListDescription>{value || '—'}</DescriptionListDescription>
    </DescriptionListGroup>)}</DescriptionList>
  </div>;
}
